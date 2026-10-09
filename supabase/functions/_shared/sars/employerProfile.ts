/**
 * Employer details that SARS needs on the EMP201 and the EMP501 reconciliation
 * (employer record codes 2010–2083 in SARS_PAYE_BRS - PAYE Employer Reconciliation
 * V25.3.0). The same validation runs in the browser and in the payroll function.
 *
 * The copies in src/lib and supabase/functions/_shared must stay identical (a unit test compares them).
 */

import {
  hasForbiddenFileCharacters,
  isValidEmployerReference,
  isValidIncomeTaxNumber,
  isValidSarsEmail,
  isValidSarsPhone,
  isValidSarsPostalCode,
} from './sarsNumbers.ts';
import { isValidSic7Code } from './sic7Codes.ts';

export type EmployerProfile = {
  trading_name: string;
  paye_reference: string;
  sdl_reference: string | null;
  uif_reference: string | null;
  contact_first_name: string;
  contact_surname: string;
  contact_position: string | null;
  contact_business_phone: string | null;
  contact_cell_phone: string | null;
  contact_fax: string | null;
  contact_email: string | null;
  diplomatic_indemnity: boolean;
  sic7_code: string;
  address_unit_number: string | null;
  address_complex: string | null;
  address_street_number: string | null;
  address_street_name: string;
  address_suburb: string | null;
  address_city: string | null;
  address_postal_code: string;
  address_country: string;
};

export type EmployerProfileError = { field: keyof EmployerProfile; message: string };

export const EMPTY_EMPLOYER_PROFILE: EmployerProfile = {
  trading_name: '',
  paye_reference: '',
  sdl_reference: null,
  uif_reference: null,
  contact_first_name: '',
  contact_surname: '',
  contact_position: null,
  contact_business_phone: null,
  contact_cell_phone: null,
  contact_fax: null,
  contact_email: null,
  diplomatic_indemnity: false,
  sic7_code: '',
  address_unit_number: null,
  address_complex: null,
  address_street_number: null,
  address_street_name: '',
  address_suburb: null,
  address_city: null,
  address_postal_code: '',
  address_country: 'ZA',
};

/** Maximum lengths from the BRS file layout. */
const MAX_LENGTH: Partial<Record<keyof EmployerProfile, number>> = {
  trading_name: 90,
  contact_first_name: 50,
  contact_surname: 50,
  contact_position: 50,
  contact_email: 70,
  address_unit_number: 8,
  address_complex: 26,
  address_street_number: 8,
  address_street_name: 26,
  address_suburb: 33,
  address_city: 21,
};

const text = (value: string | null | undefined) => (value ?? '').trim();

/** Trims every text field and turns blanks into null for optional fields. */
export function normaliseEmployerProfile(input: Partial<Record<keyof EmployerProfile, unknown>>): EmployerProfile {
  const out = { ...EMPTY_EMPLOYER_PROFILE };
  for (const key of Object.keys(EMPTY_EMPLOYER_PROFILE) as Array<keyof EmployerProfile>) {
    const value = input[key];
    if (key === 'diplomatic_indemnity') {
      out.diplomatic_indemnity = value === true;
      continue;
    }
    const trimmed = typeof value === 'string' ? value.trim() : '';
    const required = (EMPTY_EMPLOYER_PROFILE[key] as unknown) === '';
    (out as Record<string, unknown>)[key] = trimmed || (required ? '' : null);
  }
  out.paye_reference = out.paye_reference.replace(/\s/g, '');
  out.sdl_reference = out.sdl_reference ? out.sdl_reference.replace(/\s/g, '').toUpperCase() : null;
  out.uif_reference = out.uif_reference ? out.uif_reference.replace(/\s/g, '').toUpperCase() : null;
  for (const phone of ['contact_business_phone', 'contact_cell_phone', 'contact_fax'] as const) {
    if (out[phone]) out[phone] = out[phone]!.replace(/[\s()-]/g, '');
  }
  out.address_country = (out.address_country || 'ZA').toUpperCase();
  return out;
}

/** Every SARS rule for the employer record. An empty list means the profile can be filed. */
export function validateEmployerProfile(profile: EmployerProfile): EmployerProfileError[] {
  const errors: EmployerProfileError[] = [];
  const add = (field: keyof EmployerProfile, message: string) => errors.push({ field, message });

  if (!text(profile.trading_name)) add('trading_name', 'Trading or other name is required.');

  const paye = text(profile.paye_reference);
  const payeRegistered = paye.startsWith('7');
  if (!paye) {
    add('paye_reference', 'PAYE reference number is required.');
  } else if (payeRegistered ? !isValidEmployerReference(paye, 'PAYE') : !isValidIncomeTaxNumber(paye)) {
    add('paye_reference', 'Not a valid PAYE reference: 10 digits starting with 7 (or, if not registered for PAYE, the income tax number), with a valid SARS check digit.');
  }

  const sdl = text(profile.sdl_reference);
  const uif = text(profile.uif_reference);
  if (sdl && !isValidEmployerReference(sdl, 'SDL')) {
    add('sdl_reference', 'Not a valid SDL reference: L followed by 9 digits, with a valid SARS check digit.');
  }
  if (uif && !isValidEmployerReference(uif, 'UIF')) {
    add('uif_reference', 'Not a valid UIF reference: U followed by 9 digits (the number issued by SARS, not the UIF), with a valid SARS check digit.');
  }
  if (payeRegistered && paye.length === 10) {
    if (sdl && sdl.slice(1) !== paye.slice(1)) add('sdl_reference', 'The last 9 digits of the SDL reference must match the PAYE reference.');
    if (uif && uif.slice(1) !== paye.slice(1)) add('uif_reference', 'The last 9 digits of the UIF reference must match the PAYE reference.');
  }
  if (sdl && uif && sdl.slice(1) !== uif.slice(1)) add('uif_reference', 'The last 9 digits of the SDL and UIF references must match.');

  if (!text(profile.contact_first_name)) add('contact_first_name', 'Contact first name is required.');
  if (!text(profile.contact_surname)) add('contact_surname', 'Contact surname is required.');
  for (const field of ['contact_first_name', 'contact_surname', 'contact_position'] as const) {
    if (/\d/.test(text(profile[field]))) add(field, 'Letters only.');
  }

  const business = text(profile.contact_business_phone);
  const cell = text(profile.contact_cell_phone);
  if (!business && !cell) add('contact_business_phone', 'Give a business telephone or cell number.');
  const phoneMessage = 'Digits only, at least 10, starting with 0 (international numbers with 00).';
  if (business && !isValidSarsPhone(business)) add('contact_business_phone', phoneMessage);
  if (cell && !isValidSarsPhone(cell)) add('contact_cell_phone', phoneMessage);
  if (text(profile.contact_fax) && !isValidSarsPhone(text(profile.contact_fax))) add('contact_fax', phoneMessage);
  if (text(profile.contact_email) && !isValidSarsEmail(text(profile.contact_email))) {
    add('contact_email', 'Not an e-mail address SARS accepts (one @, a domain with a dot, no brackets, \\, |, % or repeated symbols).');
  }

  if (!isValidSic7Code(text(profile.sic7_code))) add('sic7_code', 'Choose the SIC7 industry code from the SARS list.');

  if (!text(profile.address_street_name)) add('address_street_name', 'Street or farm name is required.');
  if (!text(profile.address_suburb) && !text(profile.address_city)) add('address_city', 'Give the suburb / district or the city / town.');
  if (!isValidSarsPostalCode(text(profile.address_postal_code))) add('address_postal_code', 'Postal code must be 4 digits and not 0000.');
  if (!/^[A-Z]{2}$/.test(text(profile.address_country))) add('address_country', 'Use the 2-letter country code (ZA).');

  for (const [field, max] of Object.entries(MAX_LENGTH) as Array<[keyof EmployerProfile, number]>) {
    const value = profile[field];
    if (typeof value === 'string' && value.trim().length > max) add(field, `At most ${max} characters.`);
  }
  for (const field of Object.keys(profile) as Array<keyof EmployerProfile>) {
    const value = profile[field];
    if (typeof value === 'string' && hasForbiddenFileCharacters(value)) add(field, 'SARS files cannot contain a comma or a pipe (|).');
  }

  return errors;
}
