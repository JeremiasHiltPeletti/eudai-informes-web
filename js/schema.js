/**
 * Esquema de datos del informe: única fuente de verdad.
 *
 * Este módulo no toca el DOM ni el navegador a propósito. `validate.js` y
 * `sanitize.js` sólo dependen de él, así que el mismo trío puede ejecutarse
 * sin cambios en un backend (Node, Netlify Function, Worker) el día que los
 * informes dejen de vivir sólo en el dispositivo. Los atributos del HTML
 * (`required`, `maxlength`, `min`, `max`) reflejan estas reglas para dar
 * validación nativa, pero la palabra final la tiene siempre este esquema.
 */

/** Tipos de informe admitidos. */
export const TIPOS_INFORME = Object.freeze([
  'Informe inicial',
  'Evolución',
  'Alta kinésica',
  'Solicitud de sesiones',
  'Informe para obra social',
]);

/** Especialidades del consultorio. */
export const ESPECIALIDADES = Object.freeze([
  'Kinesiología',
  'Nutrición',
  'Estimulación Visual',
  'Podología',
  'Cosmiatría',
]);

/** Fecha mínima aceptada en cualquier campo de fecha. */
export const MIN_DATE = '1900-01-01';

/* Patrones -----------------------------------------------------------------
   Se usan `\p{L}` y `\p{M}` (con el flag `u`) para no romper acentos, la ñ ni
   los apellidos con diacríticos, que un `[A-Za-z]` descartaría. */

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.\-]*$/u;
const DNI_RE = /^\d{1,3}(?:\.?\d{3}){1,3}$/u;
const PHONE_RE = /^[\d\s+()\-.]{6,}$/u;
const MEMBER_RE = /^[\p{L}\p{N}\s/\-.]+$/u;
const LICENSE_RE = /^[\p{L}\p{N}\s.º°\-/]+$/u;
const AGE_RE = /^\d{1,3}(?:\s*(?:años?|a))?$/iu;

/**
 * Definición de cada campo.
 *
 * @typedef {object} FieldSpec
 * @property {string}   label      Etiqueta legible (se usa en los mensajes).
 * @property {'text'|'date'|'select'|'textarea'} type
 * @property {boolean}  required
 * @property {number}   maxLength  Tope duro; el sanitizador recorta ahí.
 * @property {number}  [minLength]
 * @property {RegExp}  [pattern]
 * @property {readonly string[]} [options] Valores válidos para `select`.
 * @property {boolean} [multiline] Conserva saltos de línea al sanitizar.
 * @property {string}  [patternMessage] Mensaje si falla `pattern`.
 */

/** @type {Readonly<Record<string, FieldSpec>>} */
export const FIELDS = Object.freeze({
  fecha: {
    label: 'Fecha',
    type: 'date',
    required: true,
    maxLength: 10,
  },
  paciente: {
    label: 'Nombre y apellido del paciente',
    type: 'text',
    required: true,
    minLength: 2,
    maxLength: 80,
    pattern: NAME_RE,
    patternMessage: 'Usá sólo letras, espacios, apóstrofos y guiones.',
  },
  dni: {
    label: 'DNI',
    type: 'text',
    required: false,
    maxLength: 13,
    pattern: DNI_RE,
    patternMessage: 'Ingresá entre 4 y 12 dígitos (ej. 34.555.222).',
  },
  fecha_nacimiento: {
    label: 'Fecha de nacimiento',
    type: 'date',
    required: false,
    maxLength: 10,
  },
  edad: {
    label: 'Edad',
    type: 'text',
    required: false,
    maxLength: 12,
    pattern: AGE_RE,
    patternMessage: 'Ingresá un número de 0 a 120 (ej. 45).',
  },
  obra_social: {
    label: 'Obra social / prepaga',
    type: 'text',
    required: false,
    maxLength: 60,
  },
  numero_afiliado: {
    label: 'Número de afiliado',
    type: 'text',
    required: false,
    maxLength: 40,
    pattern: MEMBER_RE,
    patternMessage: 'Usá letras, números, barras y guiones.',
  },
  telefono: {
    label: 'Teléfono',
    type: 'text',
    required: false,
    maxLength: 25,
    pattern: PHONE_RE,
    patternMessage: 'Ingresá al menos 6 dígitos (ej. 11 1234-5678).',
  },
  domicilio: {
    label: 'Domicilio',
    type: 'text',
    required: false,
    maxLength: 120,
  },
  diagnostico_medico: {
    label: 'Diagnóstico médico',
    type: 'text',
    required: false,
    maxLength: 160,
  },
  tipo_informe: {
    label: 'Tipo de informe',
    type: 'select',
    required: true,
    maxLength: 40,
    options: TIPOS_INFORME,
  },
  contenido: {
    label: 'Contenido del informe',
    type: 'textarea',
    required: true,
    multiline: true,
    minLength: 10,
    maxLength: 20000,
  },
  profesional_responsable: {
    label: 'Profesional responsable',
    type: 'text',
    required: true,
    minLength: 2,
    maxLength: 80,
    pattern: NAME_RE,
    patternMessage: 'Usá sólo letras, espacios, apóstrofos y guiones.',
  },
  matricula: {
    label: 'Matrícula profesional',
    type: 'text',
    required: true,
    minLength: 2,
    maxLength: 30,
    pattern: LICENSE_RE,
    patternMessage: 'Usá letras, números, puntos y guiones (ej. M. P. 1536).',
  },
  especialidad: {
    label: 'Especialidad',
    type: 'select',
    required: true,
    maxLength: 40,
    options: ESPECIALIDADES,
  },
});

/** Nombres de campo en el orden en que se muestran y se guardan. */
export const FIELD_NAMES = Object.freeze(Object.keys(FIELDS));

/** Edad máxima admitida (años). */
export const MAX_AGE = 120;
