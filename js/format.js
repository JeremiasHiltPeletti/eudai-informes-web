/**
 * Formateo y presentación.
 *
 * Todas las fechas se manejan como cadenas `AAAA-MM-DD` y se formatean
 * partiendo la cadena, sin construir un `Date`. Es a propósito: `new Date('2024-01-15')`
 * se interpreta como medianoche UTC y, al oeste de Greenwich, se imprime como
 * 14/01/2024. Al no crear el objeto, el error de un día no puede ocurrir.
 */

/** Partículas que en español van en minúscula dentro de un nombre propio. */
const LOWERCASE_PARTICLES = new Set([
  'de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos',
  'van', 'von', 'di', 'della', 'el',
]);

/** Siglas de obras sociales que se escriben enteras en mayúscula. */
const ACRONYMS = new Set([
  'OSDE', 'PAMI', 'IOMA', 'OSECAC', 'OSPE', 'OSDEPYM', 'OSFATUN', 'UPCN',
  'UOM', 'IPS', 'IAPOS', 'IOSFA', 'OSEP', 'DOSUBA', 'OBSBA', 'OSUTHGRA',
  'OSPRERA', 'OSPACA', 'OSMATA', 'SWISS', 'AMFFA', 'ASE', 'OSPIA',
]);

/** Especialidades cuya matrícula lleva el prefijo "M. P.". */
const LICENSE_PREFIXED = new Set(['Kinesiología', 'Nutrición']);

/**
 * Fecha de hoy en la zona horaria del usuario, como `AAAA-MM-DD`.
 *
 * @returns {string}
 */
export function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Convierte `AAAA-MM-DD` al formato argentino `DD/MM/AAAA`.
 *
 * @param {string} iso
 * @returns {string} '' si la entrada no tiene la forma esperada.
 */
export function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(iso ?? ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/**
 * Fecha larga para la interfaz (no para el impreso), p. ej. "15 de enero de 2024".
 *
 * @param {string} iso
 * @returns {string}
 */
export function formatDateLong(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(iso ?? ''));
  if (!match) return '';
  // Se fija el mediodía para que ningún cambio de huso mueva el día.
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long' }).format(date);
}

/**
 * Edad cumplida entre dos fechas ISO.
 *
 * @param {string} birthISO Fecha de nacimiento.
 * @param {string} [refISO] Fecha de referencia; por defecto, hoy.
 * @returns {number|null} null si las fechas no son usables o el orden es imposible.
 */
export function calcAge(birthISO, refISO = todayISO()) {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(birthISO ?? ''));
  const ref = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(refISO ?? ''));
  if (!birth || !ref) return null;

  let age = Number(ref[1]) - Number(birth[1]);
  const monthDiff = Number(ref[2]) - Number(birth[2]);
  const dayDiff = Number(ref[3]) - Number(birth[3]);
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;

  return age >= 0 && age <= 130 ? age : null;
}

/**
 * Capitaliza un nombre propio respetando partículas y guiones internos.
 * "juan de la cruz garcía-lópez" → "Juan de la Cruz García-López".
 *
 * @param {string} value
 * @returns {string}
 */
export function titleCase(value) {
  const words = String(value ?? '').toLocaleLowerCase('es-AR').split(/\s+/u);

  return words
    .map((word, index) => {
      if (!word) return word;
      if (index > 0 && LOWERCASE_PARTICLES.has(word)) return word;
      // Cada tramo separado por guion o apóstrofo se capitaliza por su cuenta.
      return word.replace(/(^|[-'’])(\p{L})/gu, (_, sep, letter) =>
        sep + letter.toLocaleUpperCase('es-AR'),
      );
    })
    .join(' ')
    .trim();
}

/**
 * Capitaliza el nombre de una obra social dejando las siglas en mayúscula.
 *
 * @param {string} value
 * @returns {string}
 */
export function formatInsurer(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/u)
    .map((word, index) => {
      if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      if (index > 0 && LOWERCASE_PARTICLES.has(word.toLocaleLowerCase('es-AR'))) {
        return word.toLocaleLowerCase('es-AR');
      }
      return titleCase(word);
    })
    .join(' ')
    .trim();
}

/**
 * Agrupa un DNI en miles con puntos. Acepta cualquier cosa y se queda con los dígitos.
 *
 * @param {string} value
 * @returns {string}
 */
export function formatDni(value) {
  const digits = String(value ?? '').replace(/\D/gu, '').slice(0, 12);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/gu, '.');
}

/**
 * Da formato a un teléfono argentino de 10 dígitos; si no lo es, sólo separa
 * los últimos cuatro. Nunca descarta dígitos.
 *
 * @param {string} value
 * @returns {string}
 */
export function formatPhone(value) {
  const digits = String(value ?? '').replace(/\D/gu, '');
  if (digits.length === 10) {
    // Área de 2 dígitos (AMBA) o de 3 para el resto del país.
    return digits.startsWith('11')
      ? digits.replace(/(\d{2})(\d{4})(\d{4})/u, '$1 $2-$3')
      : digits.replace(/(\d{3})(\d{3})(\d{4})/u, '$1 $2-$3');
  }
  if (digits.length >= 7) return `${digits.slice(0, -4)}-${digits.slice(-4)}`;
  return digits;
}

/**
 * Normaliza la matrícula: para kinesiología y nutrición antepone "M. P." si el
 * profesional no lo escribió (o lo escribió de otra forma).
 *
 * @param {string} value
 * @param {string} especialidad
 * @returns {string}
 */
export function formatLicense(value, especialidad) {
  const raw = String(value ?? '').trim();
  if (!raw || !LICENSE_PREFIXED.has(especialidad)) return raw;

  const withoutPrefix = raw.replace(/^m\.?\s*p\.?\s*/iu, '').trim();
  return withoutPrefix ? `M. P. ${withoutPrefix}` : raw;
}

/**
 * Formatea un número con separador de miles en es-AR.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  return new Intl.NumberFormat('es-AR').format(value);
}
