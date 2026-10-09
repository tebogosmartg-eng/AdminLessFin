/**
 * SARS number and contact validations, as specified in SARS_PAYE_BRS - PAYE Employer
 * Reconciliation V25.3.0, Appendix B and the file layout rules. e@syFile rejects a
 * reconciliation that fails any of these, so the app applies the same rules on entry.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\s/g, '');
}

/**
 * BRS 8.1/8.2 modulus 10: digits 1, 3, 5, 7, 9 are doubled (a two-digit result has its
 * digits added), digits 2, 4, 6, 8 are added; the 10th digit must be (10 − last digit
 * of the total), or 0 when the total ends in 0.
 */
function modulus10CheckDigit(nineDigits: string): number {
  let total = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(nineDigits[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d = Math.floor(d / 10) + (d % 10);
    }
    total += d;
  }
  const last = total % 10;
  return last === 0 ? 0 : 10 - last;
}

/** BRS 8.1: a 10-digit income tax reference starting with 0, 1, 2, 3 or 9, with a valid check digit. */
export function isValidIncomeTaxNumber(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  if (!/^[01239]\d{9}$/.test(digits)) return false;
  return modulus10CheckDigit(digits.slice(0, 9)) === Number(digits[9]);
}

/**
 * BRS 8.2: PAYE (7 + 9 digits), SDL (L + 9 digits) or UIF (U + 9 digits) reference.
 * The first character is replaced with 4 before the modulus 10 check.
 */
export function isValidEmployerReference(value: string | null | undefined, kind: 'PAYE' | 'SDL' | 'UIF'): boolean {
  const ref = digitsOnly(value).toUpperCase();
  const pattern = kind === 'PAYE' ? /^7\d{9}$/ : kind === 'SDL' ? /^L\d{9}$/ : /^U\d{9}$/;
  if (!pattern.test(ref)) return false;
  return modulus10CheckDigit(`4${ref.slice(1, 9)}`) === Number(ref[9]);
}

/**
 * BRS 8.3 modulus 13 (the Luhn check) on a 13-digit South African ID number, which
 * must also start with a real date of birth (YYMMDD).
 */
export function isValidSaIdNumber(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  if (!/^\d{13}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let d = Number(digits[12 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  if (sum % 10 !== 0) return false;
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const date = new Date(Date.UTC(2000 + Number(digits.slice(0, 2)), mm - 1, dd));
  return date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd;
}

/** True for a 13-digit value that is not a valid SA ID (other values are passports and not checked). */
export function isInvalidSaIdNumber(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  return /^\d{13}$/.test(digits) && !isValidSaIdNumber(digits);
}

/** BRS telephone rule: digits only, at least 10, national numbers start with 0 (international with 00). */
export function isValidSarsPhone(value: string | null | undefined): boolean {
  const v = value ?? '';
  return /^0\d{9,14}$/.test(v);
}

/** BRS e-mail rule (code 2027 / 3136). */
export function isValidSarsEmail(value: string | null | undefined): boolean {
  const v = value ?? '';
  if (!v || v.length > 70) return false;
  if (/[()\\|%]/.test(v)) return false;
  const special = /[^A-Za-z0-9]/;
  if (special.test(v[0]) || special.test(v[v.length - 1])) return false;
  if (/[^A-Za-z0-9]{2,}/.test(v)) return false;
  const parts = v.split('@');
  if (parts.length !== 2) return false;
  const [, domain] = parts;
  return domain.includes('.') && !domain.startsWith('.');
}

/** BRS 4-digit postal code that is not 0000. */
export function isValidSarsPostalCode(value: string | null | undefined): boolean {
  return /^\d{4}$/.test(value ?? '') && value !== '0000';
}

/** BRS rule (h): no value in the file may contain a comma or a pipe. */
export function hasForbiddenFileCharacters(value: string | null | undefined): boolean {
  return /[,|]/.test(value ?? '');
}
