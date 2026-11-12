/**
 * Que el teclado del celular no tape lo que se escribe.
 *
 * iOS lleva el campo a la vista al enfocarlo, pero no siempre lo deja por
 * encima del teclado y, sobre todo, no acompaña al cursor cuando el área de
 * texto crece mientras se escribe (`field-sizing: content`): las líneas nuevas
 * quedaban debajo del teclado. Acá se mide el área que de verdad se ve
 * (`visualViewport`) y, si el campo —o en un área de texto, la línea del
 * cursor— queda fuera, se corre la página lo justo.
 */

/** Aire entre lo que se escribe y el borde del teclado o de la cabecera. */
const MARGIN = 16;

/** Lo mínimo que tiene que tapar algo para considerarlo un teclado. */
const KEYBOARD_MIN = 120;

/** Propiedades que definen cómo se reparte el texto en líneas. */
const MIRRORED = [
  'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
  'wordSpacing', 'textIndent', 'textTransform', 'tabSize',
];

/**
 * Posición vertical (en la ventana) de la línea donde está el cursor, medida
 * con una copia invisible del área de texto.
 * @param {HTMLTextAreaElement} area
 * @returns {{ top: number, bottom: number }}
 */
function caretLine(area) {
  const style = globalThis.getComputedStyle(area);
  const mirror = document.createElement('div');
  for (const prop of MIRRORED) mirror.style[prop] = style[prop];
  mirror.style.position = 'absolute';
  mirror.style.insetBlockStart = '0';
  mirror.style.insetInlineStart = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = area.value.slice(0, area.selectionEnd ?? area.value.length);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.append(marker);
  document.body.append(mirror);
  const offset = marker.offsetTop - area.scrollTop;
  const height = marker.offsetHeight;
  mirror.remove();

  const top = area.getBoundingClientRect().top + offset;
  return { top, bottom: top + height };
}

/**
 * @param {HTMLFormElement} form
 * @param {HTMLElement} header Cabecera fija, que tapa la parte de arriba.
 */
export function keepTypingVisible(form, header) {
  const viewport = globalThis.visualViewport;
  if (!viewport) return;

  const reveal = () => {
    const field = document.activeElement;
    if (!(field instanceof globalThis.HTMLElement) || !form.contains(field)) return;
    if (!field.matches('input, textarea, select')) return;

    // Teclado abierto: lo que tapa se agrega al final de la página como
    // espacio, para que incluso el último campo se pueda subir por encima.
    const covered = Math.max(0, globalThis.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(covered)}px`);

    // Sin teclado en pantalla (escritorio, o con un teclado físico) no hay
    // nada que corregir, y no se le mueve la página a quien está scrolleando.
    if (covered < KEYBOARD_MIN) return;

    const visibleTop = Math.max(viewport.offsetTop, header.getBoundingClientRect().bottom) + MARGIN;
    const visibleBottom = viewport.offsetTop + viewport.height - MARGIN;

    // Un campo entero, si entra; un área de texto más alta que lo visible,
    // sólo la línea donde se está escribiendo.
    const box = field.getBoundingClientRect();
    const target =
      field instanceof globalThis.HTMLTextAreaElement && box.height > visibleBottom - visibleTop
        ? caretLine(field)
        : box;

    let delta = 0;
    if (target.bottom > visibleBottom) delta = target.bottom - visibleBottom;
    else if (target.top < visibleTop) delta = target.top - visibleTop;
    if (Math.abs(delta) >= 1) globalThis.scrollBy({ top: delta, behavior: 'instant' });
  };

  let frame = 0;
  const revealSoon = () => {
    globalThis.cancelAnimationFrame(frame);
    frame = globalThis.requestAnimationFrame(reveal);
  };

  // El teclado aparece (o cambia de alto) después del foco: se mira de nuevo
  // cuando el área visible cambia, y por las dudas un instante después.
  viewport.addEventListener('resize', revealSoon);
  form.addEventListener('focusin', () => {
    revealSoon();
    globalThis.setTimeout(revealSoon, 350);
  });
  form.addEventListener('input', (event) => {
    if (event.target instanceof globalThis.HTMLTextAreaElement) revealSoon();
  });
  form.addEventListener('focusout', () => {
    globalThis.setTimeout(() => {
      if (!form.contains(document.activeElement)) {
        document.documentElement.style.setProperty('--keyboard-inset', '0px');
      }
    }, 100);
  });
}
