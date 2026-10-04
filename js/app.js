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
import { renderReport, printReport } from './report.js';
import { notify, confirmAction, downloadText, onNextFrame, debounce } from './ui.js';
import {
  todayISO,
  formatDate,
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

const historyList = document.querySelector('[data-history-list]');
const historyStatus = document.querySelector('[data-history-status]');
const historySearch = /** @type {HTMLInputElement} */ (document.querySelector('[data-history-search]'));
const historyItemTemplate = /** @type {HTMLTemplateElement} */ (document.querySelector('[data-history-item]'));
const historyEmptyTemplate = /** @type {HTMLTemplateElement} */ (document.querySelector('[data-history-empty]'));
const homeCount = document.querySelector('[data-home-count]');

const previewStage = document.querySelector('[data-preview-stage]');
const previewFrame = /** @type {HTMLIFrameElement} */ (document.querySelector('[data-preview-frame]'));
const previewStatus = document.querySelector('[data-preview-status]');
const printButton = document.querySelector('[data-print]');
const printFrame = /** @type {HTMLIFrameElement} */ (document.querySelector('[data-print-frame]'));

const importInput = /** @type {HTMLInputElement} */ (document.querySelector('[data-import-input]'));

/* -- Estado ---------------------------------------------------------------- */

/** Informe que se está viendo en la vista previa. */
let currentReport = null;

/** Medidas del documento renderizado, para reescalar la vista previa. */
let previewMetrics = { width: 794, height: 1123, pages: 1 };

/** Si el usuario escribió la edad a mano, el cálculo automático no la pisa. */
let ageEditedByHand = false;

/** Campos ya validados una vez: sólo esos muestran error mientras se escribe. */
const touchedFields = new Set();

/* -- Enrutado -------------------------------------------------------------- */

const ROUTES = Object.freeze({
  '#/': 'view-home',
  '#/nuevo': 'view-form',
  '#/historial': 'view-history',
  '#/vista-previa': 'view-preview',
});

const DEFAULT_ROUTE = '#/';

/** Muestra la vista que corresponde al hash actual. */
function renderRoute() {
  const hash = ROUTES[globalThis.location.hash] ? globalThis.location.hash : DEFAULT_ROUTE;

  // La vista previa depende de un informe en memoria: si se llega por un
  // enlace directo o tras recargar, no hay nada que mostrar.
  if (hash === '#/vista-previa' && !currentReport) {
    globalThis.location.replace(DEFAULT_ROUTE);
    return;
  }

  for (const [route, id] of Object.entries(ROUTES)) {
    document.getElementById(id).hidden = route !== hash;
  }

  if (hash === '#/nuevo') {
    prepareForm();
    refreshDateLimits();
  }
  if (hash === '#/historial') renderHistory();
  if (hash === '#/') updateHomeCount();

  globalThis.scrollTo({ top: 0, behavior: 'instant' });

  // Sin recarga de página el lector de pantalla no anuncia nada por su cuenta:
  // se mueve el foco al título de la vista para que lea dónde quedó.
  const heading = document.getElementById(ROUTES[hash]).querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

/** @param {string} hash */
function goTo(hash) {
  if (globalThis.location.hash === hash) renderRoute();
  else globalThis.location.hash = hash;
}

/* -- Formulario ------------------------------------------------------------ */

/** Deja el formulario listo: fecha de hoy y borrador recuperado, si existe. */
function prepareForm() {
  if (form.dataset.ready === 'true') return;
  form.dataset.ready = 'true';

  const draft = store.loadDraft();
  if (draft) {
    for (const name of FIELD_NAMES) {
      if (form.elements[name] && draft[name]) form.elements[name].value = draft[name];
    }
    ageEditedByHand = Boolean(draft.edad);
    notify('Recuperamos el borrador que habías empezado.');
  }

  if (!form.elements.fecha.value) form.elements.fecha.value = todayISO();
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
    const saved = store.saveReport(data);
    currentReport = saved;

    // El formulario se vacía apenas el informe queda guardado, y antes de
    // armar la vista previa: si se limpiara después, un fallo al renderizar
    // dejaría los datos del paciente anterior cargados y el informe siguiente
    // podría enviarse con el nombre equivocado. Lo que se muestra sale de
    // `saved`, no del formulario, así que vaciarlo acá no afecta nada.
    resetForm();

    // Primero se muestra la vista y recién después se renderiza: el documento
    // se pagina midiendo alturas reales, y eso exige que el iframe esté
    // efectivamente maquetado, no oculto con `display: none`.
    goTo('#/vista-previa');
    await showPreview(saved);

    notify('Informe guardado. Ya podés descargarlo en PDF.');
  } catch (error) {
    if (error instanceof store.StorageError) {
      notify(error.message, 'error');
      return;
    }
    // El informe ya está guardado: lo que falló es la vista previa. Se manda al
    // historial, desde donde se puede descargar igual, en vez de dejar a la
    // vista un marco vacío.
    notify('El informe se guardó, pero no se pudo mostrar la vista previa.', 'error');
    goTo('#/historial');
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
 * Imprime un informe. Desde la vista previa reutiliza el marco visible;
 * desde el historial usa el marco oculto, que se renderiza al momento.
 *
 * @param {Record<string, string>} data
 * @param {HTMLIFrameElement} frame
 */
async function print(data, frame) {
  try {
    if (frame === printFrame) await renderReport(frame, data);
    printReport(frame);
  } catch (error) {
    notify(error instanceof Error ? error.message : 'No se pudo abrir la impresión.', 'error');
  }
}

/* -- Historial ------------------------------------------------------------- */

/**
 * Quita acentos y mayúsculas para que "Perez" encuentre a "Pérez".
 *
 * @param {string} value
 * @returns {string}
 */
function foldText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Dibuja el historial aplicando el filtro de búsqueda. */
function renderHistory() {
  if (!historyList) return;

  const query = foldText(historySearch?.value ?? '').trim();
  const all = store.listReports();
  const reports = query
    ? all.filter((report) =>
        foldText(
          `${report.paciente} ${report.tipo_informe} ${report.especialidad} ${report.profesional_responsable}`,
        ).includes(query),
      )
    : all;

  historyList.replaceChildren();

  if (reports.length === 0) {
    const empty = historyEmptyTemplate.content.cloneNode(true);
    const isFiltered = all.length > 0;
    empty.querySelector('[data-empty-title]').textContent = isFiltered
      ? 'Sin resultados'
      : 'Todavía no hay informes';
    empty.querySelector('[data-empty-body]').textContent = isFiltered
      ? 'Probá con otro nombre, tipo de informe o especialidad.'
      : 'Los informes que generes van a aparecer acá.';
    historyList.append(empty);
  } else {
    for (const report of reports) {
      historyList.append(buildHistoryItem(report));
    }
  }

  if (historyStatus) {
    historyStatus.textContent = `${reports.length} de ${all.length} informes`;
  }
  updateHomeCount(all.length);
}

/**
 * Construye una fila del historial clonando la plantilla.
 * Todo dato del informe entra por `textContent`, nunca por `innerHTML`.
 *
 * @param {Record<string, string>} report
 * @returns {DocumentFragment}
 */
function buildHistoryItem(report) {
  const item = historyItemTemplate.content.cloneNode(true);

  item.querySelector('[data-name]').textContent = report.paciente || 'Sin nombre';
  item.querySelector('[data-type]').textContent = report.tipo_informe || 'Informe';
  item.querySelector('[data-specialty]').textContent = report.especialidad || '—';
  item.querySelector('[data-date]').textContent = formatDate(report.fecha) || '—';

  const pdfButton = item.querySelector('[data-action="print"]');
  pdfButton.dataset.id = report.id;
  pdfButton.setAttribute('aria-label', `Descargar el PDF de ${report.paciente}`);

  const deleteButton = item.querySelector('[data-action="delete"]');
  deleteButton.dataset.id = report.id;
  deleteButton.setAttribute('aria-label', `Eliminar el informe de ${report.paciente}`);

  return item;
}

/**
 * Muestra la cantidad de informes guardados en el botón de inicio.
 *
 * @param {number} [total] Cantidad ya conocida; si no se pasa, se relee.
 *   Leerla implica parsear y sanear todo el almacenamiento, y el historial ya
 *   la tiene calculada cada vez que se dibuja.
 */
function updateHomeCount(total = store.listReports().length) {
  if (!homeCount) return;
  homeCount.textContent = total > 0 ? `(${total})` : '';
  homeCount.hidden = total === 0;
}

/** Descarga una copia de respaldo de todos los informes. */
function exportBackup() {
  const total = store.listReports().length;
  if (total === 0) {
    notify('Todavía no hay informes para exportar.', 'error');
    return;
  }
  downloadText(`eudai-informes-${todayISO()}.json`, store.exportReports());
  notify(`Copia de ${total} ${total === 1 ? 'informe' : 'informes'} descargada.`);
}

/**
 * Importa una copia de respaldo.
 *
 * @param {File} file
 */
async function importBackup(file) {
  // Un archivo de decenas de MB congela la pestaña mientras se parsea. Una
  // copia real de esta app pesa kilobytes: si llega algo así, es otra cosa.
  const MAX_BYTES = 8 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    notify('El archivo es demasiado grande para ser una copia de informes.', 'error');
    return;
  }

  try {
    const { imported, skipped } = store.importReports(await file.text());
    renderHistory();
    notify(
      imported === 0
        ? 'El archivo no traía informes nuevos: ya estaban todos.'
        : `Se importaron ${imported} informes${skipped ? ` (${skipped} ya estaban)` : ''}.`,
    );
  } catch (error) {
    notify(
      error instanceof store.StorageError ? error.message : 'No se pudo leer el archivo.',
      'error',
    );
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

document.querySelector('[data-preview-back]').addEventListener('click', () => {
  goTo('#/');
});

printButton.addEventListener('click', () => {
  if (currentReport) print(currentReport, previewFrame);
});

historyList?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const report = store.getReport(button.dataset.id);
  if (!report) {
    notify('Ese informe ya no está disponible.', 'error');
    renderHistory();
    return;
  }

  if (button.dataset.action === 'print') {
    await print(report, printFrame);
    return;
  }

  const confirmed = await confirmAction({
    title: '¿Eliminar el informe?',
    body: `Se borra el informe de ${report.paciente} de forma permanente. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar',
  });
  if (!confirmed) return;

  store.deleteReport(report.id);
  renderHistory();
  notify('Informe eliminado.');
});

historySearch?.addEventListener('input', debounce(renderHistory, 150));

document.querySelector('[data-export]').addEventListener('click', exportBackup);

document.querySelector('[data-import]').addEventListener('click', () => importInput.click());

importInput.addEventListener('change', () => {
  const [file] = importInput.files ?? [];
  if (file) importBackup(file);
  importInput.value = ''; // permite reimportar el mismo archivo
});

globalThis.addEventListener('hashchange', renderRoute);

// Con la app abierta en dos pestañas, guardar o borrar en una dejaba el
// historial de la otra mostrando datos viejos hasta recargar.
globalThis.addEventListener('storage', (event) => {
  if (event.key !== null && !event.key.startsWith('eudai.informes')) return;
  if (!document.getElementById('view-history').hidden) renderHistory();
  updateHomeCount();
});

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
      'Este navegador tiene el almacenamiento bloqueado: los informes van a existir sólo mientras la pestaña esté abierta. Descargá el PDF antes de cerrarla.';
  }
}

if (!ROUTES[globalThis.location.hash]) globalThis.location.replace(DEFAULT_ROUTE);
renderRoute();
