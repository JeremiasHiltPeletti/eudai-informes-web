/**
 * Construcción, paginación e impresión del informe.
 *
 * El documento se arma dentro de un iframe a partir de `report-template.html`.
 * Los datos entran **siempre** por `textContent`, nunca por `innerHTML` ni por
 * sustitución de cadenas: un nombre con `<`, `&` o `$&` no puede romper el
 * documento ni inyectar marcado, que es justo lo que sí ocurría al reemplazar
 * los `<%= %>` con expresiones regulares.
 *
 * La paginación es la otra diferencia de fondo: el contenido se reparte en
 * tantas hojas como haga falta en lugar de recortarse al llegar al borde de la
 * tarjeta. En un informe clínico, perder texto en silencio no es una opción.
 */

import { formatDate } from './format.js';

/** La plantilla vive en la raíz de la app; este módulo, en `js/`. */
const TEMPLATE_URL = new URL('../report-template.html', import.meta.url);

/** Tope de seguridad por si una medición imposible impidiera avanzar. */
const MAX_PAGES = 80;

/** Encogido que todavía pasa inadvertido; más abajo conviene partir en dos líneas. */
const SOFT_FIT = 0.85;

/** Factor mínimo absoluto: por debajo, el dato dejaría de leerse en el impreso. */
const MIN_FIT = 0.62;

/** @type {Promise<string>|null} */
let templateRequest = null;

/**
 * Descarga la plantilla una sola vez por sesión.
 *
 * @returns {Promise<string>}
 */
function getTemplate() {
  templateRequest ??= fetch(TEMPLATE_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`No se pudo cargar la plantilla del informe (HTTP ${response.status}).`);
      }
      return response.text();
    })
    .catch((error) => {
      // El fallo no se guarda en caché: si se guardara, un corte momentáneo de
      // red dejaría la generación de informes rota hasta recargar la página,
      // porque toda llamada posterior recibiría la misma promesa rechazada.
      templateRequest = null;
      throw error;
    });
  return templateRequest;
}

/**
 * Valores tal como se imprimen. Las fechas pasan de ISO al formato argentino;
 * el resto va literal.
 *
 * @param {Record<string, string>} data
 * @returns {Record<string, string>}
 */
function toPrintable(data) {
  return {
    ...data,
    fecha: formatDate(data.fecha),
    fecha_nacimiento: formatDate(data.fecha_nacimiento),
  };
}

/**
 * Renderiza un informe completo dentro de un iframe.
 *
 * @param {HTMLIFrameElement} frame Marco destino (visible u oculto).
 * @param {Record<string, string>} data Datos ya validados.
 * @returns {Promise<{ pages: number, width: number, height: number }>}
 */
export async function renderReport(frame, data) {
  const html = await getTemplate();
  await loadIntoFrame(frame, html);

  const doc = frame.contentDocument;
  if (!doc) throw new Error('El marco del informe no está disponible.');

  // El marco tiene que estar maquetado. Dentro de un contenedor con
  // `display: none` el documento del iframe no calcula alturas: todas las
  // medidas dan cero, la paginación cree que el texto entra siempre y el
  // informe sale recortado sin ningún error visible. Mejor fallar acá.
  if (!frame.clientWidth) {
    throw new Error(
      'El marco del informe debe estar visible o fuera de pantalla (no display:none) para poder paginar.',
    );
  }

  fillSlots(doc, toPrintable(data));

  // Medir antes de que carguen tipografías e imágenes daría una paginación
  // equivocada: el texto se recompone al llegar la fuente definitiva.
  await waitForAssets(doc);

  const pages = paginate(doc, data.contenido ?? '');
  numberPages(doc);
  fitValues(doc);

  const firstPage = doc.querySelector('.page');
  return {
    pages,
    width: firstPage?.offsetWidth ?? 794,
    height: doc.documentElement.scrollHeight,
  };
}

/**
 * Abre el diálogo de impresión del navegador con el documento del iframe.
 * Se imprime el marco, no la app: no hay ventana emergente que bloquear ni
 * `document.write`, y lo que se ve en la vista previa es exactamente lo que
 * sale por la impresora o el "Guardar como PDF".
 *
 * @param {HTMLIFrameElement} frame
 */
export function printReport(frame) {
  const view = frame.contentWindow;
  if (!view) throw new Error('El informe todavía no está listo para imprimir.');
  view.focus();
  view.print();
}

/* -- Internos ------------------------------------------------------------- */

/**
 * Escribe el HTML en el iframe y espera a que termine de cargar.
 *
 * Se usa `srcdoc`: el documento resultante es del mismo origen (se puede
 * medir y paginar) y hereda la CSP de la página, así que la plantilla sigue
 * sin poder ejecutar scripts ni traer recursos externos.
 *
 * @param {HTMLIFrameElement} frame
 * @param {string} html
 * @returns {Promise<void>}
 */
function loadIntoFrame(frame, html) {
  return new Promise((resolve, reject) => {
    const onLoad = () => {
      frame.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      frame.removeEventListener('load', onLoad);
      reject(new Error('No se pudo preparar el documento del informe.'));
    };

    frame.addEventListener('load', onLoad, { once: true });
    frame.addEventListener('error', onError, { once: true });
    frame.srcdoc = html;
  });
}

/**
 * Vuelca los datos en los huecos de la plantilla.
 *
 * @param {Document} doc
 * @param {Record<string, string>} data
 */
function fillSlots(doc, data) {
  for (const slot of doc.querySelectorAll('[data-slot]')) {
    const key = slot.dataset.slot;
    // Los huecos de paginación los completa `numberPages`.
    if (key === 'page-number' || key === 'content-title') continue;
    slot.textContent = data[key] ?? '';
  }
}

/**
 * Tipografías que hay que tener cargadas antes de medir, con un texto de
 * muestra que cubre los subconjuntos que usa el español.
 */
const FONT_PROBES = Object.freeze([
  '400 13px "Inter var"',
  '600 21px "Montserrat var"',
]);

const FONT_SAMPLE = 'AaEeIiOoUu áéíóúñÁÉÍÓÚÑ 0123456789';

/**
 * Espera a que tipografías e imágenes estén listas, para que las medidas de
 * la paginación sean las definitivas.
 *
 * Las fuentes se piden explícitamente en vez de confiar sólo en
 * `fonts.ready`: esa promesa se resuelve con lo que el documento usa *en ese
 * momento*, y las hojas de conclusiones —las únicas que usan la tipografía de
 * cuerpo— todavía no existen cuando se llama. Sin esto se pagina midiendo con
 * la fuente de reserva y el texto desborda al llegar la definitiva.
 *
 * @param {Document} doc
 * @returns {Promise<void>}
 */
async function waitForAssets(doc) {
  const pending = [];

  if (doc.fonts) {
    for (const probe of FONT_PROBES) {
      pending.push(doc.fonts.load(probe, FONT_SAMPLE).catch(() => {}));
    }
  }

  for (const image of doc.images) {
    if (image.complete) continue;
    pending.push(
      new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        // Una decorativa que falle no debe dejar el informe colgado.
        image.addEventListener('error', resolve, { once: true });
      }),
    );
  }

  await Promise.all(pending);

  // Una vez pedidas, `ready` garantiza que ya se aplicaron al layout.
  if (doc.fonts?.ready) await doc.fonts.ready.catch(() => {});
}

/**
 * Reparte el contenido en hojas de conclusiones hasta que no queda texto.
 *
 * @param {Document} doc
 * @param {string} text
 * @returns {number} Total de páginas del documento.
 */
function paginate(doc, text) {
  const template = doc.getElementById('content-page');
  if (!template) return doc.querySelectorAll('.page').length;

  let remaining = text.trim();
  let sheets = 0;

  do {
    const page = /** @type {HTMLElement} */ (
      doc.importNode(template.content, true).firstElementChild
    );
    doc.body.append(page);
    sheets += 1;

    const box = /** @type {HTMLElement} */ (page.querySelector('.content-body'));
    const { head, tail } = splitToFit(box, remaining);
    box.textContent = head;
    remaining = tail;

    if (sheets > 1) {
      const title = page.querySelector('[data-slot="content-title"]');
      if (title) title.textContent = 'CONCLUSIONES (CONT.)';
    }
  } while (remaining && sheets < MAX_PAGES);

  if (remaining) {
    // Inalcanzable con los topes del esquema, pero si alguna vez se llegara
    // acá es preferible fallar a la vista que entregar un informe al que le
    // falta texto sin que nadie lo note.
    throw new Error('El informe es demasiado extenso para paginarlo.');
  }

  return doc.querySelectorAll('.page').length;
}

/**
 * Mayor cantidad de piezas que entra en la caja, por búsqueda binaria.
 *
 * La altura crece de forma monótona con la cantidad de piezas, así que basta
 * con buscar el prefijo más largo que no desborde: unas 15 mediciones en vez
 * de miles.
 *
 * @param {HTMLElement} box Caja de alto fijo y `overflow: hidden`.
 * @param {(count: number) => string} render Texto formado por las primeras N piezas.
 * @param {number} total
 * @returns {number} 0 si no entra ni la primera pieza.
 */
function largestPrefixThatFits(box, render, total) {
  let low = 1;
  let high = total;
  let best = 0;

  while (low <= high) {
    const middle = (low + high) >> 1;
    box.textContent = render(middle);
    if (box.scrollHeight <= box.clientHeight) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return best;
}

/**
 * Corta un texto por la última palabra que entra en la caja.
 *
 * Si ni la primera palabra entra —un enlace larguísimo, un código pegado, un
 * texto sin espacios— se corta por carácter. Sin ese respaldo, esa palabra se
 * quedaba sola en la hoja y todo lo que sobraba se perdía sin aviso, que es
 * justamente lo que esta paginación existe para evitar.
 *
 * @param {HTMLElement} box
 * @param {string} text
 * @returns {{ head: string, tail: string }}
 */
function splitToFit(box, text) {
  box.textContent = text;
  if (box.scrollHeight <= box.clientHeight) return { head: text, tail: '' };

  const tokens = text.split(/(\s+)/u);
  const words = largestPrefixThatFits(box, (n) => tokens.slice(0, n).join(''), tokens.length);

  if (words > 0) {
    return {
      head: tokens.slice(0, words).join('').trimEnd(),
      tail: tokens.slice(words).join('').replace(/^\s+/u, ''),
    };
  }

  // Se parte por punto de código, no por unidad UTF-16: cortar a la mitad un
  // emoji o un carácter fuera del plano básico dejaría basura en el impreso.
  const chars = [...text];
  const cut = Math.max(1, largestPrefixThatFits(box, (n) => chars.slice(0, n).join(''), chars.length));

  return { head: chars.slice(0, cut).join(''), tail: chars.slice(cut).join('') };
}

/**
 * Numera las hojas. La portada no lleva número, así que el hueco simplemente
 * no existe en esa página.
 *
 * @param {Document} doc
 */
function numberPages(doc) {
  const pages = doc.querySelectorAll('.page');
  pages.forEach((page, index) => {
    const badge = page.querySelector('[data-slot="page-number"]');
    if (badge) badge.textContent = String(index + 1);
  });
}

/**
 * ¿Entra el valor en su caja?
 *
 * @param {Element} value
 * @param {Element} box
 * @param {boolean} wrapped Si ya se repartió en dos líneas, lo que importa es el alto.
 * @returns {boolean}
 */
function fitsInBox(value, box, wrapped) {
  return wrapped
    ? box.scrollHeight <= box.clientHeight + 1
    : value.scrollWidth <= box.clientWidth + 1;
}

/**
 * Acomoda los datos que no entran en su línea, sin recortarlos nunca.
 *
 * El orden va del ajuste que menos se nota al que más: primero se achica un
 * poco la letra; si aun así no entra, se reparte en dos líneas; y sólo si
 * tampoco así entra, se sigue achicando. Los topes de longitud del esquema
 * están calculados para que ese último caso no llegue a darse.
 *
 * @param {Document} doc
 */
function fitValues(doc) {
  for (const value of doc.querySelectorAll('[data-fit]')) {
    // En la portada la caja es la línea subrayada; en la ficha, el valor mismo.
    const box = value.closest('.cover-field__line') ?? value;
    let scale = 1;
    let wrapped = false;

    while (!fitsInBox(value, box, wrapped)) {
      if (!wrapped && scale <= SOFT_FIT) {
        wrapped = true;
        box.classList.add('is-wrapped');
        value.classList.add('is-wrapped');
        continue;
      }
      const next = Number((scale - 0.04).toFixed(2));
      if (next < MIN_FIT) break;

      scale = next;
      // El factor se fija en la caja, no en el valor: así lo heredan tanto el
      // cuerpo de la letra como el alto máximo de las dos líneas.
      box.style.setProperty('--fit', String(scale));
    }
  }
}
