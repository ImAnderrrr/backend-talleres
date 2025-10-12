// Carnet DTO utilities: normalization and validation

/**
 * Normalize carnet for consistent comparisons.
 * - Trim spaces
 * - Uppercase
 * @param {string} c
 * @returns {string}
 */
function normalizeCarnet(c = '') {
  return String(c || '').trim().toUpperCase();
}

/**
 * Canonical key for uniqueness checks (case- and hyphen-insensitive)
 * Example: 0904-22-12345 -> 09042212345
 * @param {string} c
 */
function carnetKey(c = '') {
  return normalizeCarnet(c).replace(/-/g, '');
}

/**
 * Validate allowed carnet formats:
 * - XXXX-XX-XXXX
 * - XXXX-XX-XXXXX
 * @param {string} c
 * @returns {{valid: boolean, message?: string}}
 */
function validateCarnetFormat(c = '') {
  const v = normalizeCarnet(c);
  const re = /^\d{4}-\d{2}-(\d{4}|\d{5})$/;
  if (!re.test(v)) {
    return { valid: false, message: 'Formato de carné inválido. Usa 0000-00-0000 o 0000-00-00000.' };
  }
  return { valid: true };
}

module.exports = { normalizeCarnet, carnetKey, validateCarnetFormat };
