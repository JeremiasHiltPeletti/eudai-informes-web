/**
 * Punto de entrada: enrutado, formulario, historial y vista previa.
 *
 * Este módulo sólo orquesta. La validación vive en `validate.js`, la
 * persistencia en `store.js` y el documento en `report.js`, así que cada pieza
 * se puede leer —y cambiar— por separado.
 */

import { FIELD_NAMES } from './schema.js';
import { validateReport, validateField } from './validate.js';
import * as store from './store.js';
import { renderReport, mountForPrint } from './report.js';
import { notify, confirmAction, onNextFrame, debounce } from './ui.js';
import { keepTypingVisible } from './keyboard.js';
import {
  todayISO,
  formatDni,
  formatPhone,
  formatInsurer,
  formatLicense,
  titleCase,
  calcAge,
} from './format.js';

/* -- Referencias al DOM ---------------------------------------------------- */

const form = /** @type {HTMLFormElement} */ (document.getElementById('report-form'));
const submitButton = document.querySelector('[data-submit]');
const submitLabel = document.querySelector('[data-submit-label]');
const charCount = document.querySelector('[data-char-count]');

const previewStage = document.querySelector('[data-preview-stage]');
const previewFrame = /** @type {HTMLIFrameElement} */ (document.querySelector('[data-preview-frame]'));
const previewStatus = document.querySelector('[data-preview-status]');
const printButton = document.querySelector('[data-print]');
const printRoot = document.querySelector('[data-print-root]');

/* -- Estado ---------------------------------------------------------------- */

/** Informe que se está viendo en la vista previa. Vive sólo en memoria. */
let currentReport = null;

/**
 * Si ya se pidió la descarga del informe en pantalla.
 *
 * Registra que el usuario apretó «Descargar PDF», no que el archivo haya
 * terminado de guardarse: el navegador no avisa si el diálogo de impresión se
 * canceló. Alcanza para no insistir con la advertencia a quien ya descargó.
 */
let downloaded = false;

/** Medidas del documento renderizado, para reescalar la vista previa. */
let previewMetrics = { width: 794, height: 1123, pages: 1 };

/** Si el usuario escribió la edad a mano, el cálculo automático no la pisa. */
let ageEditedByHand = false;

/** Campos ya validados una vez: sólo esos muestran error mientras se escribe. */
const touchedFields = new Set();

/* -- Enrutado -------------------------------------------------------------- */

/* La vista actual no va en la dirección (antes era `#/nuevo`, etc.) sino en
   el estado del historial de la pestaña (`history.state.view`):
   - una recarga conserva ese estado: se vuelve a la misma vista;
   - una pestaña nueva, o entrar escribiendo la dirección, no lo tiene: se
     abre siempre el inicio. Con la ruta en la dirección, Chrome autocompletaba
     `…/#/nuevo` y se entraba directo al formulario;
   - Atrás y Adelante siguen pasando de una vista a otra (`popstate`);
   - la dirección no cambia nunca durante la carga: hacerlo dejaba la cabecera
     tapada por la barra de Chrome en iOS. */
const ROUTES = Object.freeze({
  home: 'view-home',
  form: 'view-form',
  preview: 'view-preview',
});

/** Rutas viejas en la dirección (marcadores, autocompletado del navegador). */
const LEGACY_HASHES = Object.freeze({ '#/': 'home', '#/nuevo': 'form', '#/vista-previa': 'preview' });

/** Vista guardada en el historial de esta pestaña, o el inicio. */
function currentView() {
  const view = globalThis.history.state?.view;
  return Object.keys(ROUTES).includes(view) ? view : 'home';
}

/** Si ya se mostró alguna vista (la primera no lleva transición). */
let hasRouted = false;

/** Muestra la vista guardada en el historial. */
function renderRoute() {
  let view = currentView();

  // La vista previa depende de un informe en memoria: tras recargar no hay
  // nada que mostrar, y se vuelve al formulario (con el borrador).
  if (view === 'preview' && !currentReport) {
    view = 'form';
    globalThis.history.replaceState({ view }, '');
  }

  // La transición es sólo para cuando se navega: en la carga inicial la vista
  // aparece ya en su lugar, sin ningún movimiento.
  for (const [name, id] of Object.entries(ROUTES)) {
    const section = document.getElementById(id);
    section.hidden = name !== view;
    section.classList.toggle('is-entering', hasRouted && name === view);
  }
  const isFirstRender = !hasRouted;
  hasRouted = true;

  // `boot.js` adelantó qué vista mostrar en el primer pintado; desde acá manda
  // el router.
  delete document.documentElement.dataset.boot;

  if (view === 'form') {
    prepareForm();
    refreshDateLimits();
  }

  // Al navegar se empieza arriba. En la carga inicial no se toca el scroll:
  // la posición la repone el navegador (en una recarga, la que tenía). Mover
  // el scroll por código mientras la página carga dejaba, en Chrome para iOS,
  // la cabecera tapada por la barra del navegador.
  if (!isFirstRender) globalThis.scrollTo({ top: 0, behavior: 'instant' });

  // Sin recarga de página el lector de pantalla no anuncia nada por su cuenta:
  // se mueve el foco al título de la vista para que lea dónde quedó. En la
  // carga inicial no hace falta: el lector ya lee la página desde el principio.
  const heading = document.getElementById(ROUTES[view]).querySelector('h1');
  if (heading && !isFirstRender) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

/**
 * Pasa a otra vista con una entrada nueva en el historial (Atrás vuelve).
 * La dirección queda limpia: se le quita cualquier `#/…` viejo.
 * @param {keyof typeof ROUTES} view
 */
function goTo(view) {
  const url = globalThis.location.pathname + globalThis.location.search;
  if (currentView() === view && !globalThis.location.hash) {
    renderRoute();
    return;
  }
  globalThis.history.pushState({ view }, '', url);
  renderRoute();
}

// Los enlaces internos conservan su `href="#/…"` (se pueden abrir y leer como
// enlaces), pero navegan por el historial en vez de cambiar la dirección.
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof globalThis.Element ? event.target.closest('a[href^="#/"]') : null;
  const view = link && LEGACY_HASHES[link.getAttribute('href')];
  if (!view) return;
  event.preventDefault();
  goTo(view);
});

/* -- Formulario ------------------------------------------------------------ */

/** Deja el formulario listo: fecha de hoy y borrador recuperado, si existe. */
/**
 * Si un borrador tiene algo que el usuario haya cargado o cambiado. Cualquier
 * campo cuenta, también una fecha sola: antes se exigían varios campos y un
 * borrador con sólo la fecha se perdía al recargar.
 * @param {Record<string, string>} draft
 */
function differsFromBlank(draft) {
  return FIELD_NAMES.some((name) => {
    const control = form.elements[name];
    if (!draft[name] || !control) return false;
    if (name === 'fecha') return draft[name] !== todayISO();
    // Un desplegable vale por defecto su primera opción.
    if (control.tagName === 'SELECT') return draft[name] !== control.options[0]?.value;
    return true;
  });
}

/**
 * Guarda a qué altura estaba el formulario, para que `restore.js` la reponga
 * antes del primer pintado en una recarga. El navegador también la repone,
 * pero recién al terminar de cargar: en el celular se veía la página arriba
 * y después el salto hasta donde estaba.
 */
function saveScrollForReload() {
  try {
    const y = currentView() === 'form' ? Math.round(globalThis.scrollY) : 0;
    globalThis.sessionStorage.setItem('eudai.scroll', String(y));
  } catch {
    // Sin almacenamiento de sesión, la repone el navegador al terminar.
  }
}

/** Marca, por pestaña, de que el borrador ya se mostró en ella. */
const SEEN_KEY = 'eudai.borrador.visto';

/**
 * Si esta pestaña ya tenía el borrador a la vista: una recarga, o volver al
 * formulario en la misma pestaña. (No se usa el tipo de navegación de
 * `performance`: el «Volver a cargar» del menú de Chrome en iOS no siempre
 * se informa como recarga.)
 */
function draftAlreadySeen() {
  try {
    return globalThis.sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markDraftSeen() {
  try {
    globalThis.sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Sin almacenamiento de sesión, el aviso se repite: no es grave.
  }
}

function prepareForm() {
  if (form.dataset.ready === 'true') return;
  form.dataset.ready = 'true';

  const draft = store.loadDraft();
  if (draft && differsFromBlank(draft)) {
    for (const name of FIELD_NAMES) {
      if (form.elements[name] && draft[name]) form.elements[name].value = draft[name];
    }
    ageEditedByHand = Boolean(draft.edad);
    // Al recargar, lo cargado vuelve a estar donde estaba: no hace falta
    // avisarlo (y el aviso, al aparecer, se sentía como algo moviéndose).
    if (!draftAlreadySeen()) notify('Recuperamos el borrador que habías empezado.');
  } else {
    // `restore.js` pudo haber copiado un borrador sin nada propio (sólo la
    // fecha de otro día, por ejemplo): se vuelve a un formulario en blanco.
    form.reset();
  }

  if (!form.elements.fecha.value) form.elements.fecha.value = todayISO();
  markDraftSeen();
  updateCharCount();
}

/**
 * Refresca el tope de los selectores de fecha. Se llama al entrar al
 * formulario, no una sola vez al cargar: una pestaña abierta desde ayer
 * seguiría ofreciendo el día de ayer como máximo.
 */
function refreshDateLimits() {
  const today = todayISO();
  form.elements.fecha.max = today;
  form.elements.fecha_nacimiento.max = today;
}

/** Vacía el formulario y lo devuelve al estado inicial. */
function resetForm() {
  // Un autoguardado pendiente volvería a escribir el borrador recién borrado.
  saveDraftSoon.cancel();
  form.reset();
  form.elements.fecha.value = todayISO();
  ageEditedByHand = false;
  touchedFields.clear();
  for (const name of FIELD_NAMES) setFieldError(name, '');
  updateCharCount();
  store.clearDraft();
}

/** @returns {Record<string, string>} Valores crudos del formulario. */
function readForm() {
  const values = {};
  for (const name of FIELD_NAMES) {
    values[name] = form.elements[name]?.value ?? '';
  }
  return values;
}

/**
 * Pinta (o borra) el error de un campo.
 *
 * @param {string} name
 * @param {string} message Cadena vacía para limpiar.
 */
function setFieldError(name, message) {
  const wrapper = form.querySelector(`[data-field="${name}"]`);
  const control = form.elements[name];
  if (!wrapper || !control) return;

  wrapper.classList.toggle('field--invalid', Boolean(message));
  control.setAttribute('aria-invalid', message ? 'true' : 'false');
  const slot = wrapper.querySelector('.field__error');
  if (slot) slot.textContent = message;
}

/** Actualiza el contador de caracteres del contenido. */
function updateCharCount() {
  if (!charCount) return;
  const control = form.elements.contenido;
  const used = control.value.length;
  const max = Number(control.maxLength);

  charCount.textContent = `${used.toLocaleString('es-AR')} caracteres`;
  charCount.classList.toggle('char-count--warn', used > max * 0.95);
}

/** Recalcula la edad a partir de la fecha de nacimiento. */
function syncAge() {
  if (ageEditedByHand) return;
  const years = calcAge(form.elements.fecha_nacimiento.value, form.elements.fecha.value || todayISO());
  form.elements.edad.value = years === null ? '' : String(years);
}

/** Cómo se normaliza cada campo al salir de él. */
const FORMATTERS = Object.freeze({
  paciente: titleCase,
  profesional_responsable: titleCase,
  obra_social: formatInsurer,
  telefono: formatPhone,
  dni: formatDni,
  matricula: (value) => formatLicense(value, form.elements.especialidad.value),
});

/** Normaliza el valor de un campo al salir de él. */
function formatOnBlur(name) {
  const control = form.elements[name];
  if (!control || !control.value) return;

  const format = FORMATTERS[name];
  if (format) control.value = format(control.value);
}

/**
 * Reformatea un campo mientras se escribe sin mandar el cursor al final.
 *
 * Al reasignar `value` el navegador coloca el cursor al final, así que
 * corregir un dígito en el medio de un DNI obligaba a volver a posicionarse a
 * mano. Se cuenta cuántos dígitos había antes del cursor y se lo devuelve
 * después de ese mismo dígito.
 *
 * @param {HTMLInputElement} control
 * @param {(value: string) => string} format
 */
function reformatKeepingCaret(control, format) {
  const caret = control.selectionStart ?? control.value.length;
  const digitsBefore = (control.value.slice(0, caret).match(/\d/gu) ?? []).length;

  control.value = format(control.value);

  let seen = 0;
  let position = digitsBefore === 0 ? 0 : control.value.length;
  for (let i = 0; i < control.value.length && digitsBefore > 0; i += 1) {
    if (/\d/u.test(control.value[i])) seen += 1;
    if (seen === digitsBefore) {
      position = i + 1;
      break;
    }
  }
  control.setSelectionRange(position, position);
}

const saveDraftSoon = debounce(() => store.saveDraft(readForm()), 600);

/** Valida y guarda el informe, y abre la vista previa. */
async function submitForm() {
  const { ok, data, errors } = validateReport(readForm());

  // Los valores saneados vuelven al formulario: lo que se ve es lo que se guarda.
  for (const name of FIELD_NAMES) {
    if (form.elements[name] && form.elements[name].value !== data[name]) {
      form.elements[name].value = data[name];
    }
    touchedFields.add(name);
    setFieldError(name, errors[name] ?? '');
  }

  if (!ok) {
    const firstInvalid = FIELD_NAMES.find((name) => errors[name]);
    form.elements[firstInvalid]?.focus();
    notify('Revisá los campos marcados en rojo.', 'error');
    return;
  }

  setBusy(true);
  try {
    // El informe vive sólo en memoria: no se guarda nada. El formulario y el
    // borrador se conservan hasta que se descargue el PDF, para poder volver,
    // corregir y regenerar sin tener que cargar todo de nuevo.
    currentReport = data;
    downloaded = false;

    // Primero se muestra la vista y recién después se renderiza: el documento
    // se pagina midiendo alturas reales, y eso exige que el iframe esté
    // efectivamente maquetado, no oculto con `display: none`.
    goTo('preview');
    await showPreview(data);
  } catch (error) {
    notify(
      error instanceof Error ? error.message : 'No se pudo generar el informe.',
      'error',
    );
    goTo('form');
  } finally {
    setBusy(false);
  }
}

/** @param {boolean} busy */
function setBusy(busy) {
  if (submitButton) submitButton.disabled = busy;
  if (submitLabel) submitLabel.textContent = busy ? 'Generando…' : 'Generar informe';
}

/* -- Vista previa ---------------------------------------------------------- */

/**
 * Renderiza un informe en el iframe de vista previa y lo ajusta al ancho.
 *
 * @param {Record<string, string>} data
 */
async function showPreview(data) {
  // Hasta que el documento no está armado y paginado, imprimir sacaría el
  // informe anterior o uno a medio paginar. En una historia clínica, imprimir
  // el informe de otro paciente no es un detalle.
  printButton.disabled = true;
  if (previewStatus) previewStatus.textContent = 'Armando el documento…';

  try {
    previewMetrics = await renderReport(previewFrame, data);
    scalePreview();

    // La copia para imprimir se prepara ahora y no al apretar el botón: así
    // `window.print()` se llama dentro del mismo gesto del usuario, que es lo
    // que Safari exige para abrir el diálogo sin trabas.
    await mountForPrint(previewFrame, printRoot);

    const { pages } = previewMetrics;
    if (previewStatus) {
      previewStatus.textContent = `${pages} ${pages === 1 ? 'página' : 'páginas'} · A4`;
    }
    printButton.disabled = false;
  } catch (error) {
    if (previewStatus) previewStatus.textContent = 'No se pudo armar el documento.';
    throw error;
  }
}

/**
 * Ajusta el documento (794 px de ancho) al espacio disponible.
 * El alto del hueco se calcula con el alto real del documento, en vez de
 * darlo por sentado: así el número de páginas no queda cableado en el CSS.
 */
function scalePreview() {
  if (!previewStage || !previewMetrics.width) return;

  const available = previewStage.clientWidth;
  if (!available) return; // la vista está oculta: no hay nada que escalar todavía

  const scale = Math.min(1, available / previewMetrics.width);

  previewStage.style.setProperty('--preview-width', `${previewMetrics.width}px`);
  previewStage.style.setProperty('--preview-scale', String(scale));
  previewStage.style.height = `${previewMetrics.height * scale}px`;
  previewFrame.style.height = `${previewMetrics.height}px`;
}

/**
 * Abre la impresión del informe que está en la vista previa.
 *
 * Descargar es el final del trabajo: el formulario y el borrador se vacían,
 * porque lo que había que conservar ya está en el PDF.
 */
function print() {
  try {
    globalThis.print();
    downloaded = true;
    resetForm();
  } catch (error) {
    notify(error instanceof Error ? error.message : 'No se pudo abrir la impresión.', 'error');
  }
}

/* -- Eventos --------------------------------------------------------------- */

form.addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm();
});

form.addEventListener('input', (event) => {
  const control = event.target;
  const name = control.name;
  if (!FIELD_NAMES.includes(name)) return;

  if (name === 'contenido') updateCharCount();
  if (name === 'edad') ageEditedByHand = control.value.trim() !== '';
  if (name === 'dni') reformatKeepingCaret(control, formatDni);

  // Mientras se corrige, el error se va apenas el valor pasa a ser válido.
  if (touchedFields.has(name)) {
    const { error } = validateField(name, control.value);
    setFieldError(name, error);
  }

  saveDraftSoon();
});

form.addEventListener(
  'blur',
  (event) => {
    const name = event.target.name;
    if (!FIELD_NAMES.includes(name)) return;

    formatOnBlur(name);
    if (name === 'fecha_nacimiento' || name === 'fecha') syncAge();

    touchedFields.add(name);
    setFieldError(name, validateField(name, event.target.value).error);
    saveDraftSoon();
  },
  true, // en captura: los eventos de foco no burbujean
);

form.addEventListener('change', (event) => {
  if (event.target.name === 'especialidad') formatOnBlur('matricula');
  if (event.target.name === 'fecha_nacimiento') syncAge();
  // Un selector de fecha o un desplegable se eligen de una vez: se guarda ya.
  saveDraftSoon();
  saveDraftSoon.flush();
});

// Lo último que se escribió no espera al autoguardado si la página se recarga,
// se cierra o pasa a segundo plano (en el celular, cambiar de app).
globalThis.addEventListener('pagehide', () => {
  saveDraftSoon.flush();
  saveScrollForReload();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveDraftSoon.flush();
});

document.querySelector('[data-clear]').addEventListener('click', async () => {
  const confirmed = await confirmAction({
    title: '¿Limpiar el formulario?',
    body: 'Se borra todo lo que escribiste, incluido el borrador guardado.',
    confirmLabel: 'Limpiar',
  });
  if (!confirmed) return;
  resetForm();
  notify('Formulario vacío.');
});

/**
 * ¿Puede salir de la vista previa?
 *
 * Sin historial, el PDF es la única copia del informe. Si todavía no se
 * descargó conviene avisarlo, aunque lo cargado en el formulario siga a salvo
 * como borrador.
 *
 * @returns {Promise<boolean>}
 */
async function canLeavePreview() {
  if (downloaded || !currentReport) return true;
  return confirmAction({
    title: '¿Salir sin descargar el PDF?',
    body: 'El informe no queda guardado: para enviarlo hay que descargarlo. Lo que cargaste en el formulario se conserva como borrador.',
    confirmLabel: 'Salir igual',
  });
}

document.querySelector('[data-preview-back]').addEventListener('click', async () => {
  if (await canLeavePreview()) goTo('form');
});

// El logo es la otra salida de la vista previa, así que pasa por el mismo aviso.
// (Escucha en captura: corre antes que el manejador general de enlaces.)
document.querySelector('.brand').addEventListener(
  'click',
  async (event) => {
    if (document.getElementById('view-preview').hidden) return;
    event.preventDefault();
    if (await canLeavePreview()) goTo('home');
  },
  true,
);

printButton.addEventListener('click', () => {
  if (currentReport) print();
});

// Atrás y Adelante. (Sin un manejador de `hashchange`: al volver a una entrada
// vieja con `#/nuevo` en la dirección, ese evento también se dispara y
// reabría el formulario en lugar de respetar el historial.)
globalThis.addEventListener('popstate', renderRoute);

// El contenedor cambia de ancho por más motivos que un resize de ventana
// (rotación, aparición de la barra de scroll, zoom del navegador).
if (previewStage && 'ResizeObserver' in globalThis) {
  new ResizeObserver(onNextFrame(scalePreview)).observe(previewStage);
} else {
  globalThis.addEventListener('resize', onNextFrame(scalePreview));
}

/* -- Arranque -------------------------------------------------------------- */

if (!store.isPersistent()) {
  const text = document.querySelector('[data-privacy-text]');
  if (text) {
    text.textContent =
      'Este navegador tiene el almacenamiento bloqueado: no se puede guardar el borrador mientras escribís. Descargá el PDF antes de cerrar la pestaña, porque es la única copia del informe.';
  }
}

keepTypingVisible(form, document.querySelector('.site-header'));

// La dirección no se toca durante la carga (ver arriba, en «Enrutado»): un
// `#/nuevo` viejo que haya traído el autocompletado se ignora y se abre el
// inicio; se limpia recién cuando se navega.
renderRoute();
