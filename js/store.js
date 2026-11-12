/**
 * Persistencia en el navegador.
 *
 * La app **no guarda informes**. El archivo del informe es el PDF que se
 * descarga y se envía; guardar además una copia en el navegador significaba
 * acumular datos de salud en cada equipo donde se abrió la app, sin que
 * aportara nada al flujo real de trabajo.
 *
 * Lo único que se guarda es el borrador en curso: el formulario que se está
 * escribiendo, para que cerrar la pestaña por accidente no se lleve el
 * trabajo. Se sobrescribe a cada rato y se borra al generar el informe, así
 * que nunca hay más de un informe a medio escribir en el almacenamiento.
 */

import { FIELD_NAMES } from './schema.js';
import { sanitizeField } from './validate.js';

const DRAFT_KEY = 'eudai.borrador.v1';

/**
 * Claves de versiones anteriores, cuando la app sí guardaba un historial.
 * Se borran al arrancar: quitar la pantalla que los mostraba sin borrar los
 * datos dejaría informes de pacientes dormidos en el navegador, invisibles y
 * fuera del alcance del usuario, que es peor que tenerlos a la vista.
 */
const OBSOLETE_KEYS = ['eudai.informes.v1', 'reports'];

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

/** @returns {boolean} true si el borrador sobrevive al cierre del navegador. */
export function isPersistent() {
  return backend.persistent;
}

/**
 * Borra los informes que hayan quedado guardados por versiones anteriores.
 * Se ejecuta una sola vez, al cargar el módulo.
 *
 * @returns {number} Cuántas claves obsoletas había.
 */
function purgeStoredReports() {
  let found = 0;
  for (const key of OBSOLETE_KEYS) {
    try {
      if (backend.store.getItem(key) !== null) {
        backend.store.removeItem(key);
        found += 1;
      }
    } catch {
      // Un almacenamiento que no deja ni leer tampoco tiene nada que purgar.
    }
  }
  return found;
}

/** Informes de versiones anteriores que se borraron al abrir la app. */
export const purgedReportStores = purgeStoredReports();

/* -- Borrador en curso ----------------------------------------------------
   Guarda lo que se está escribiendo para que un cierre accidental de la
   pestaña no se lleve media hora de redacción. */

/** @param {Record<string, string>} data */
export function saveDraft(data) {
  try {
    backend.store.setItem(DRAFT_KEY, JSON.stringify({ v: 1, data }));
  } catch {
    // Un borrador que no se puede guardar no debe interrumpir la escritura.
  }
}

/** @returns {Record<string, string>|null} */
export function loadDraft() {
  let parsed;
  try {
    parsed = JSON.parse(backend.store.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;

  /** @type {Record<string, string>} */
  const draft = {};
  for (const name of FIELD_NAMES) {
    // Lo guardado es tan poco confiable como lo que se tipea: se sanea igual.
    draft[name] = sanitizeField(name, parsed.data[name]);
  }
  // Si lo guardado difiere de un formulario recién abierto lo decide quien
  // conoce los valores por defecto (la fecha de hoy, el primer desplegable).
  return draft;
}

/** Descarta el borrador en curso. */
export function clearDraft() {
  try {
    backend.store.removeItem(DRAFT_KEY);
  } catch {
    // Nada que hacer: en la próxima escritura se sobrescribe.
  }
}
