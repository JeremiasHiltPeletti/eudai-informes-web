/**
 * Validación de un informe.
 *
 * Reglas puras, sin DOM ni globals del navegador: el mismo módulo sirve para
 * validar en el cliente y —si en algún momento hay backend— para volver a
 * validar del lado del servidor, que es donde la validación realmente cuenta.
 * Nada de lo que llega acá se considera confiable: ni el formulario, ni el
 * `localStorage`, ni un JSON importado.
 */

import { FIELDS, FIELD_NAMES, MIN_DATE, MAX_AGE } from './schema.js';
import { sanitizeText, sanitizeDate } from './sanitize.js';
import { todayISO, calcAge } from './format.js';

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok
 * @property {Record<string, string>} data   Valores saneados, campo a campo.
 * @property {Record<string, string>} errors Mensaje por campo que falló.
 */

/**
 * Sanea un valor según el tipo declarado en el esquema.
 *
 * @param {string} name
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeField(name, raw) {
  const spec = FIELDS[name];
  if (!spec) return '';

  if (spec.type === 'date') return sanitizeDate(raw);

  return sanitizeText(raw, {
    multiline: Boolean(spec.multiline),
    maxLength: spec.maxLength,
  });
}

/**
 * Valida un campo aislado (sin reglas cruzadas entre campos).
 *
 * @param {string} name
 * @param {unknown} raw
 * @returns {{ value: string, error: string }} `error` vacío si es válido.
 */
export function validateField(name, raw) {
  const spec = FIELDS[name];
  if (!spec) return { value: '', error: 'Campo desconocido.' };

  const value = sanitizeField(name, raw);

  if (!value) {
    return spec.required
      ? { value, error: `${spec.label} es obligatorio.` }
      : { value, error: '' };
  }

  if (spec.options && !spec.options.includes(value)) {
    return { value, error: `Elegí una opción válida de ${spec.label.toLowerCase()}.` };
  }

  if (spec.minLength && value.length < spec.minLength) {
    return {
      value,
      error: `${spec.label} necesita al menos ${spec.minLength} caracteres.`,
    };
  }

  if (value.length > spec.maxLength) {
    return {
      value,
      error: `${spec.label} admite hasta ${spec.maxLength} caracteres.`,
    };
  }

  if (spec.type === 'date') {
    if (value < MIN_DATE) {
      return { value, error: `${spec.label} es anterior a ${MIN_DATE}.` };
    }
    if (value > todayISO()) {
      return { value, error: `${spec.label} no puede ser futura.` };
    }
  }

  if (spec.pattern && !spec.pattern.test(value)) {
    return { value, error: spec.patternMessage ?? `${spec.label} tiene un formato inválido.` };
  }

  if (name === 'edad') {
    const years = Number.parseInt(value, 10);
    if (Number.isNaN(years) || years > MAX_AGE) {
      return { value, error: `La edad debe estar entre 0 y ${MAX_AGE}.` };
    }
  }

  return { value, error: '' };
}

/**
 * Valida un informe completo, incluidas las reglas que cruzan campos.
 *
 * @param {Record<string, unknown>} raw Datos crudos (FormData, JSON, lo que sea).
 * @returns {ValidationResult}
 */
export function validateReport(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  /** @type {Record<string, string>} */
  const data = {};
  /** @type {Record<string, string>} */
  const errors = {};

  // Se recorre el esquema, no las claves recibidas: cualquier campo extra que
  // venga en el objeto de entrada se descarta en silencio.
  for (const name of FIELD_NAMES) {
    const { value, error } = validateField(name, source[name]);
    data[name] = value;
    if (error) errors[name] = error;
  }

  // --- Reglas cruzadas ----------------------------------------------------

  if (data.fecha_nacimiento && data.fecha && data.fecha_nacimiento > data.fecha) {
    errors.fecha_nacimiento = 'El nacimiento no puede ser posterior a la fecha del informe.';
  }

  if (data.fecha_nacimiento && data.edad && !errors.edad && !errors.fecha_nacimiento) {
    const expected = calcAge(data.fecha_nacimiento, data.fecha || todayISO());
    const declared = Number.parseInt(data.edad, 10);
    // Un año de tolerancia: es normal anotar la edad "a cumplir" en el año.
    if (expected !== null && Math.abs(expected - declared) > 1) {
      errors.edad = `La edad no coincide con la fecha de nacimiento (serían ${expected} años).`;
    }
  }

  return { ok: Object.keys(errors).length === 0, data, errors };
}
