/**
 * Piezas de interfaz reutilizables: avisos, confirmaciones y descargas.
 *
 * Reemplazan a `alert()` y `confirm()`, que bloquean el hilo, no se pueden
 * estilar, y en el móvil aparecen como un diálogo del navegador ajeno a la
 * app. El diálogo usa el elemento nativo `<dialog>`, que ya trae foco
 * atrapado, cierre con Escape y devolución del foco al elemento anterior.
 */

const TOAST_MS = 3200;

const toast = document.querySelector('[data-toast]');
const toastMessage = document.querySelector('[data-toast-message]');
const dialog = /** @type {HTMLDialogElement|null} */ (document.querySelector('[data-dialog]'));
const dialogTitle = document.querySelector('[data-dialog-title]');
const dialogBody = document.querySelector('[data-dialog-body]');
const dialogConfirm = document.querySelector('[data-dialog-confirm]');

/** @type {number|undefined} */
let toastTimer;

/**
 * Muestra un aviso breve.
 *
 * @param {string} message
 * @param {'success'|'error'} [tone='success']
 */
export function notify(message, tone = 'success') {
  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;
  toast.dataset.tone = tone;
  toast.dataset.open = 'true';

  globalThis.clearTimeout(toastTimer);
  toastTimer = globalThis.setTimeout(() => {
    toast.dataset.open = 'false';
  }, TOAST_MS);
}

/**
 * Pide confirmación al usuario.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.body
 * @param {string} [options.confirmLabel='Confirmar']
 * @returns {Promise<boolean>} true si confirmó.
 */
export function confirmAction({ title, body, confirmLabel = 'Confirmar' }) {
  // Sin soporte de <dialog> (navegadores muy viejos) se cae al confirm nativo
  // antes que dejar la acción sin ninguna barrera.
  if (!dialog || typeof dialog.showModal !== 'function') {
    return Promise.resolve(globalThis.confirm(`${title}\n\n${body}`));
  }

  if (dialogTitle) dialogTitle.textContent = title;
  if (dialogBody) dialogBody.textContent = body;
  if (dialogConfirm) dialogConfirm.textContent = confirmLabel;

  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => resolve(dialog.returnValue === 'confirm'),
      { once: true },
    );
    dialog.returnValue = 'cancel';
    dialog.showModal();
  });
}

/**
 * Descarga un texto como archivo.
 *
 * @param {string} filename
 * @param {string} content
 * @param {string} [type='application/json']
 */
export function downloadText(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Se revoca en la siguiente vuelta del bucle de eventos: si se revoca antes,
  // Safari cancela la descarga que acaba de empezar.
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Lee un archivo de texto elegido por el usuario.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readTextFile(file) {
  return file.text();
}

/**
 * Ejecuta una función como mucho una vez por cuadro de animación.
 * Se usa para el reescalado de la vista previa al cambiar el tamaño.
 *
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @returns {(...args: Parameters<F>) => void}
 */
export function onNextFrame(fn) {
  let scheduled = false;
  return (...args) => {
    if (scheduled) return;
    scheduled = true;
    globalThis.requestAnimationFrame(() => {
      scheduled = false;
      fn(...args);
    });
  };
}

/**
 * Retrasa la ejecución hasta que pasen `wait` ms sin nuevas llamadas.
 * Se usa para el autoguardado del borrador y la búsqueda del historial.
 *
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} wait
 * @returns {(...args: Parameters<F>) => void}
 */
export function debounce(fn, wait) {
  /** @type {number|undefined} */
  let timer;

  const run = (...args) => {
    globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => fn(...args), wait);
  };

  /** Cancela una ejecución pendiente (p. ej. al vaciar el formulario). */
  run.cancel = () => globalThis.clearTimeout(timer);

  return run;
}
