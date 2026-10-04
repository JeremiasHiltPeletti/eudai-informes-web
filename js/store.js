/**
 * Persistencia de informes en el navegador.
 *
 * Los informes viven en `localStorage`, igual que en la versión original.
 * Eso implica dos cosas que la interfaz dice explícitamente: los datos no
 * salen del dispositivo (bien para la confidencialidad) y no hay copia de
 * respaldo automática (por eso existen exportar e importar).
 *
 * Todo lo que sale de aquí pasa por el saneador antes de volver a la app: el
 * almacenamiento del navegador es editable por quien tenga la consola abierta,
 * así que se trata como entrada no confiable, no como una base de datos.
 */

import { FIELD_NAMES } from './schema.js';
import { sanitizeField } from './validate.js';
import { sanitizeText } from './sanitize.js';

const STORAGE_KEY = 'eudai.informes.v1';
const DRAFT_KEY = 'eudai.borrador.v1';
const LEGACY_KEY = 'reports';
const SCHEMA_VERSION = 1;

/** Tope de informes por importación, para no colgar la pestaña con un archivo ajeno. */
const MAX_IMPORT = 5000;

/** Error de almacenamiento con una causa que la interfaz puede traducir. */
export class StorageError extends Error {
  /**
   * @param {'quota'|'unavailable'|'corrupt'|'format'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
  }
}

/**
 * `localStorage` lanza al leerlo en algunos navegadores (modo privado antiguo,
 * cookies de terceros bloqueadas, políticas de empresa). Si no está
 * disponible se usa un respaldo en memoria: la sesión funciona igual, pero
 * `isPersistent()` devuelve false y la app avisa.
 */
const backend = (() => {
  try {
    const probe = '__eudai_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return { store: globalThis.localStorage, persistent: true };
  } catch {
    const memory = new Map();
    return {
      persistent: false,
      store: {
        getItem: (k) => (memory.has(k) ? memory.get(k) : null),
        setItem: (k, v) => memory.set(k, String(v)),
        removeItem: (k) => memory.delete(k),
      },
    };
  }
})();

/** @returns {boolean} true si los datos sobreviven al cierre del navegador. */
export function isPersistent() {
  return backend.persistent;
}

/**
 * Identificador único y ordenable en el tiempo: prefijo temporal en base 36
 * más un sufijo aleatorio, para que dos informes creados en el mismo
 * milisegundo no puedan colisionar (lo que sí pasaba usando `Date.now()`).
 *
 * @returns {string}
 */
function newId() {
  const time = Date.now().toString(36);
  const random =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return `${time}-${random}`;
}

/**
 * Normaliza un registro cualquiera al formato del informe.
 *
 * @param {unknown} raw
 * @returns {Record<string, string>|null} null si no hay nada aprovechable.
 */
function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  /** @type {Record<string, string>} */
  const record = {};
  for (const name of FIELD_NAMES) {
    record[name] = sanitizeField(name, /** @type {any} */ (raw)[name]);
  }

  // Un informe sin paciente ni contenido no es recuperable: se descarta.
  if (!record.paciente && !record.contenido) return null;

  record.id = sanitizeText(/** @type {any} */ (raw).id, { maxLength: 64 }) || newId();
  record.created_at = isoOrNow(/** @type {any} */ (raw).created_at);
  record.updated_at = isoOrNow(/** @type {any} */ (raw).updated_at ?? record.created_at);

  return record;
}

/**
 * @param {unknown} value
 * @returns {string} Marca temporal ISO válida, o la de ahora.
 */
function isoOrNow(value) {
  const text = sanitizeText(value, { maxLength: 32 });
  const time = Date.parse(text);
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
}

/**
 * Lee el archivo completo desde el almacenamiento, tolerando datos corruptos.
 *
 * @returns {Record<string, string>[]} Informes válidos, del más nuevo al más viejo.
 */
export function listReports() {
  const reports = readAll();
  return reports.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * @param {string} id
 * @returns {Record<string, string>|undefined}
 */
export function getReport(id) {
  return readAll().find((report) => report.id === id);
}

/**
 * Guarda un informe nuevo.
 *
 * @param {Record<string, string>} data Datos ya validados.
 * @returns {Record<string, string>} El informe guardado, con id y fechas.
 * @throws {StorageError} Si el almacenamiento está lleno.
 */
export function saveReport(data) {
  const now = new Date().toISOString();
  const record = { ...data, id: newId(), created_at: now, updated_at: now };
  writeAll([record, ...readAll()]);
  return record;
}

/**
 * @param {string} id
 * @returns {boolean} true si había algo que borrar.
 */
export function deleteReport(id) {
  const reports = readAll();
  const remaining = reports.filter((report) => report.id !== id);
  if (remaining.length === reports.length) return false;
  writeAll(remaining);
  return true;
}

/** Borra todos los informes. */
export function clearReports() {
  writeAll([]);
}

/* -- Borrador en curso ----------------------------------------------------
   Guarda lo que se está escribiendo para que un cierre accidental de la
   pestaña no se lleve media hora de redacción. */

/** @param {Record<string, string>} data */
export function saveDraft(data) {
  try {
    backend.store.setItem(DRAFT_KEY, JSON.stringify({ v: SCHEMA_VERSION, data }));
  } catch {
    // Un borrador que no se puede guardar no debe interrumpir la escritura.
  }
}

/** @returns {Record<string, string>|null} */
export function loadDraft() {
  const parsed = parseJson(backend.store.getItem(DRAFT_KEY));
  if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;

  /** @type {Record<string, string>} */
  const draft = {};
  let filled = 0;
  for (const name of FIELD_NAMES) {
    draft[name] = sanitizeField(name, parsed.data[name]);
    if (draft[name]) filled += 1;
  }
  // Un borrador con sólo la fecha y los desplegables por defecto no cuenta.
  return filled > 3 ? draft : null;
}

/** Descarta el borrador en curso. */
export function clearDraft() {
  backend.store.removeItem(DRAFT_KEY);
}

/* -- Copia de respaldo ---------------------------------------------------- */

/**
 * Serializa todos los informes para descargarlos como archivo.
 *
 * @returns {string} JSON con sangría, listo para guardar.
 */
export function exportReports() {
  return JSON.stringify(
    {
      app: 'eudai-informes',
      version: SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      reports: readAll(),
    },
    null,
    2,
  );
}

/**
 * Importa una copia de respaldo y la fusiona con lo que ya hay.
 * Los informes cuyo id ya existe se omiten, así reimportar el mismo archivo
 * dos veces no duplica nada.
 *
 * @param {string} json Contenido del archivo.
 * @returns {{ imported: number, skipped: number }}
 * @throws {StorageError} Si el archivo no tiene el formato esperado.
 */
export function importReports(json) {
  const parsed = parseJson(json);
  if (!parsed || typeof parsed !== 'object') {
    throw new StorageError('format', 'El archivo no es un JSON válido.');
  }

  const incoming = Array.isArray(parsed) ? parsed : parsed.reports;
  if (!Array.isArray(incoming)) {
    throw new StorageError('format', 'El archivo no contiene una lista de informes.');
  }

  if (incoming.length > MAX_IMPORT) {
    throw new StorageError(
      'format',
      `El archivo trae más de ${MAX_IMPORT} informes: revisá que sea una copia de esta app.`,
    );
  }

  const existing = readAll();
  const knownIds = new Set(existing.map((report) => report.id));
  const added = [];
  let skipped = 0;

  for (const candidate of incoming) {
    const record = normalizeRecord(candidate);
    if (!record || knownIds.has(record.id)) {
      skipped += 1;
      continue;
    }
    knownIds.add(record.id);
    added.push(record);
  }

  if (added.length > 0) writeAll([...added, ...existing]);
  return { imported: added.length, skipped };
}

/* -- Internos ------------------------------------------------------------- */

/**
 * @param {string|null} text
 * @returns {any}
 */
function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Lee y normaliza el archivo, migrando el formato anterior si hace falta.
 *
 * @returns {Record<string, string>[]}
 */
function readAll() {
  const parsed = parseJson(backend.store.getItem(STORAGE_KEY));

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.reports)) {
    return parsed.reports.map(normalizeRecord).filter(Boolean);
  }

  return migrateLegacy();
}

/**
 * Migra los informes guardados por la versión anterior bajo la clave `reports`
 * (un array plano, sin versión). Se conserva el original hasta que la
 * migración se escribe con éxito.
 *
 * @returns {Record<string, string>[]}
 */
function migrateLegacy() {
  const legacy = parseJson(backend.store.getItem(LEGACY_KEY));
  if (!Array.isArray(legacy) || legacy.length === 0) return [];

  const migrated = legacy.map(normalizeRecord).filter(Boolean);
  if (migrated.length === 0) return [];

  try {
    writeAll(migrated);
    backend.store.removeItem(LEGACY_KEY);
  } catch {
    // Si no se puede escribir, se devuelve igual lo migrado en memoria para
    // que el historial no aparezca vacío; se reintentará la próxima vez.
  }
  return migrated;
}

/**
 * @param {Record<string, string>[]} reports
 * @throws {StorageError}
 */
function writeAll(reports) {
  const payload = JSON.stringify({ version: SCHEMA_VERSION, reports });
  try {
    backend.store.setItem(STORAGE_KEY, payload);
  } catch (error) {
    const isQuota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

    throw new StorageError(
      isQuota ? 'quota' : 'unavailable',
      isQuota
        ? 'No queda espacio en el navegador. Exportá una copia y borrá informes antiguos.'
        : 'No se pudo guardar en este navegador.',
    );
  }
}
