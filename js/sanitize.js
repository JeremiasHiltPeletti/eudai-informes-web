/**
 * Normalización y saneamiento de entrada.
 *
 * Se aplica *antes* de validar y antes de guardar, nunca sólo al pintar.
 * La app jamás inserta datos del usuario como HTML (todo va por
 * `textContent`), así que esto no es la única defensa contra XSS: es la capa
 * que garantiza que lo que se guarda y se imprime sea texto limpio,
 * predecible y sin caracteres invisibles.
 */

/**
 * Construye una clase de caracteres a partir de rangos de code points.
 * Se declaran por número en vez de pegar los caracteres literales: así el
 * código fuente sigue siendo legible y auditable, sin bytes invisibles.
 *
 * @param {ReadonlyArray<readonly [number, number]>} ranges
 * @returns {RegExp}
 */
function charClass(ranges) {
  const esc = (cp) => `\\u${cp.toString(16).padStart(4, '0')}`;
  const body = ranges
    .map(([from, to]) => (from === to ? esc(from) : `${esc(from)}-${esc(to)}`))
    .join('');
  return new RegExp(`[${body}]`, 'gu');
}

/** Controles C0/C1, salvo tabulación (09) y salto de línea (0A). */
const CONTROL_RE = charClass([
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
]);

/**
 * Invisibles que sirven para falsificar texto: zero-width, separadores de
 * línea Unicode, marcas y anulaciones de dirección bidi, y el BOM. Un nombre
 * con un override bidi puede llegar a leerse al revés en el PDF impreso.
 */
const INVISIBLE_RE = charClass([
  [0x200b, 0x200f], // zero-width space … right-to-left mark
  [0x2028, 0x2029], // line / paragraph separator
  [0x202a, 0x202e], // embedding y override bidi
  [0x2060, 0x2064], // word joiner e invisibles matemáticos
  [0x2066, 0x206f], // isolates y deprecated formatting
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
]);

/**
 * Sanea un valor de texto de una sola línea o multilínea.
 *
 * @param {unknown} raw Valor crudo (se acepta cualquier cosa y se coacciona).
 * @param {object} [options]
 * @param {boolean} [options.multiline=false] Conserva saltos de línea.
 * @param {number}  [options.maxLength=Infinity] Tope duro de longitud.
 * @returns {string} Texto saneado y recortado.
 */
export function sanitizeText(raw, options = {}) {
  const { multiline = false, maxLength = Infinity } = options;

  if (raw === null || raw === undefined) return '';

  // Sólo se aceptan primitivas: un objeto o un array acá es un error de
  // programación o un JSON manipulado, y devolver '' es más seguro que
  // arrastrar un "[object Object]" hasta el PDF.
  const type = typeof raw;
  if (type !== 'string' && type !== 'number' && type !== 'boolean') return '';

  // NFC: la "á" compuesta y la descompuesta deben guardarse igual; si no, las
  // comparaciones y los conteos de longitud dan resultados distintos.
  let value = String(raw).normalize('NFC').replace(INVISIBLE_RE, '');

  if (multiline) {
    value = value
      .replace(/\r\n?/gu, '\n')
      .replace(CONTROL_RE, '')
      // Espacios finales por línea, y como mucho una línea en blanco seguida.
      .replace(/[ \t]+$/gmu, '')
      .replace(/\n{3,}/gu, '\n\n');
  } else {
    value = value
      .replace(/[\t\n]/gu, ' ')
      .replace(CONTROL_RE, '')
      .replace(/\s{2,}/gu, ' ');
  }

  value = value.trim();

  if (value.length > maxLength) {
    value = value.slice(0, maxLength).trim();
  }

  return value;
}

/**
 * Sanea una fecha en formato `AAAA-MM-DD` (el que emiten los `input[type=date]`).
 * Cualquier otra forma se descarta: no se intenta adivinar.
 *
 * @param {unknown} raw
 * @returns {string} La fecha ISO, o '' si no es una fecha de calendario real.
 */
export function sanitizeDate(raw) {
  const value = sanitizeText(raw, { maxLength: 10 });
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1) return '';
  if (day > daysInMonth(year, month)) return '';

  return value;
}

/**
 * Días de un mes, contemplando años bisiestos.
 *
 * @param {number} year
 * @param {number} month 1-12
 * @returns {number}
 */
export function daysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
