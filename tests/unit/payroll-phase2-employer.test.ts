import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  hasForbiddenFileCharacters,
  isValidEmployerReference,
  isValidIncomeTaxNumber,
  isValidSaIdNumber,
  isValidSarsEmail,
  isValidSarsPhone,
  isValidSarsPostalCode,
} from '@/lib/sars/sarsNumbers';
import {
  EMPTY_EMPLOYER_PROFILE,
  normaliseEmployerProfile,
  validateEmployerProfile,
  type EmployerProfile,
} from '@/lib/sars/employerProfile';
import { ETI_SPECIAL_ECONOMIC_ZONES, SIC7_CODES, SIC7_NOT_QUALIFYING_FOR_ETI, isValidSic7Code } from '@/lib/sars/sic7Codes';
import { birthDateFromSaId } from '@/lib/payrollRulesEngine/periodEmployment';

/** The worked examples printed in SARS_PAYE_BRS V25.3.0, Appendix B. */
describe('SARS number checks (BRS Appendix B)', () => {
  it('8.1 income tax number: both BRS examples pass, a changed check digit fails', () => {
    expect(isValidIncomeTaxNumber('0001339050')).toBe(true);
    expect(isValidIncomeTaxNumber('0667056642')).toBe(true);
    expect(isValidIncomeTaxNumber('0667056641')).toBe(false);
    expect(isValidIncomeTaxNumber('7667056642')).toBe(false); // a PAYE-style number is not an income tax number
  });

  it('8.2 PAYE / SDL / UIF references: the BRS example passes for all three', () => {
    expect(isValidEmployerReference('7230767891', 'PAYE')).toBe(true);
    expect(isValidEmployerReference('L230767891', 'SDL')).toBe(true);
    expect(isValidEmployerReference('U230767891', 'UIF')).toBe(true);
    expect(isValidEmployerReference('u230767891', 'UIF')).toBe(true); // case is normalised
    expect(isValidEmployerReference('7230767892', 'PAYE')).toBe(false);
    expect(isValidEmployerReference('L230767891', 'PAYE')).toBe(false);
    expect(isValidEmployerReference('U230767891', 'SDL')).toBe(false);
  });

  it('8.3 ID number: the BRS example passes, and the check agrees with payroll\'s age check', () => {
    expect(isValidSaIdNumber('8001015009087')).toBe(true);
    for (const id of ['8001015009087', '8601015800086', '8601015800083', '9001015800080', '6201155800081', '7502290000084']) {
      expect(isValidSaIdNumber(id), id).toBe(!!birthDateFromSaId(id, '2026-10-09'));
    }
  });

  it('contact and file rules', () => {
    expect(isValidSarsPhone('0211234567')).toBe(true);
    expect(isValidSarsPhone('0027211234567')).toBe(true);
    expect(isValidSarsPhone('+27211234567')).toBe(false);
    expect(isValidSarsPhone('021 123 4567')).toBe(false);
    expect(isValidSarsPhone('021123456')).toBe(false);
    expect(isValidSarsEmail('payroll@example.co.za')).toBe(true);
    for (const bad of ['a..b@x.co', 'a@.co.za', 'a@b', '(a)@b.co', 'a@b@c.co', '.a@b.co', 'a%b@c.co']) {
      expect(isValidSarsEmail(bad), bad).toBe(false);
    }
    expect(isValidSarsPostalCode('0040')).toBe(true);
    expect(isValidSarsPostalCode('0000')).toBe(false);
    expect(isValidSarsPostalCode('40')).toBe(false);
    expect(hasForbiddenFileCharacters('Smith, Jones')).toBe(true);
    expect(hasForbiddenFileCharacters('A|B')).toBe(true);
    expect(hasForbiddenFileCharacters('Smith & Jones')).toBe(false);
  });
});

describe('SIC7 codes (BRS Appendix C–E)', () => {
  it('has the 521 codes of the BRS, unique and in order', () => {
    const codes = SIC7_CODES.map(([code]) => code);
    expect(codes).toHaveLength(521);
    expect(new Set(codes).size).toBe(521);
    expect([...codes].sort()).toEqual(codes);
    expect(SIC7_CODES.every(([code, description]) => /^\d{5}$/.test(code) && description.length > 3)).toBe(true);
    expect(isValidSic7Code('69201')).toBe(true); // accounting and bookkeeping
    expect(isValidSic7Code('69200')).toBe(false);
    expect(SIC7_NOT_QUALIFYING_FOR_ETI.size).toBe(16);
    expect([...SIC7_NOT_QUALIFYING_FOR_ETI].every(isValidSic7Code)).toBe(true);
    expect(ETI_SPECIAL_ECONOMIC_ZONES.map(([code]) => code)).toEqual(['COE', 'DTP', 'EAL', 'MAP', 'SLB', 'RIB']);
  });
});

describe('employer profile (BRS employer record 2010–2083)', () => {
  const valid: EmployerProfile = {
    ...EMPTY_EMPLOYER_PROFILE,
    trading_name: 'Kreston Test Employer',
    paye_reference: '7230767891',
    sdl_reference: 'L230767891',
    uif_reference: 'U230767891',
    contact_first_name: 'Anneke',
    contact_surname: 'Smit',
    contact_business_phone: '0211234567',
    contact_email: 'payroll@example.co.za',
    sic7_code: '69201',
    address_street_number: '12',
    address_street_name: 'Main Road',
    address_city: 'Cape Town',
    address_postal_code: '8001',
  };
  const fields = (profile: EmployerProfile) => validateEmployerProfile(profile).map((e) => e.field);

  it('accepts a complete profile', () => {
    expect(validateEmployerProfile(valid)).toEqual([]);
  });

  it('applies each SARS rule', () => {
    expect(fields({ ...valid, paye_reference: '7230767892' })).toContain('paye_reference');
    expect(fields({ ...valid, paye_reference: '0001339050', sdl_reference: null, uif_reference: null })).toEqual([]); // not PAYE-registered: income tax number
    expect(fields({ ...valid, sdl_reference: 'L230767890' })).toContain('sdl_reference');
    // A valid SDL number whose last 9 digits differ from the PAYE number.
    expect(fields({ ...valid, sdl_reference: 'L667056640' })).toEqual(expect.arrayContaining(['sdl_reference']));
    expect(fields({ ...valid, contact_business_phone: null })).toContain('contact_business_phone');
    expect(fields({ ...valid, contact_business_phone: null, contact_cell_phone: '0821234567' })).toEqual([]);
    expect(fields({ ...valid, sic7_code: '12345' })).toContain('sic7_code');
    expect(fields({ ...valid, address_postal_code: '0000' })).toContain('address_postal_code');
    expect(fields({ ...valid, address_city: null })).toContain('address_city');
    expect(fields({ ...valid, address_city: null, address_suburb: 'Gardens' })).toEqual([]);
    expect(fields({ ...valid, trading_name: 'Smith, Jones and Co' })).toContain('trading_name');
    expect(fields({ ...valid, address_street_name: 'A very long street name beyond 26' })).toContain('address_street_name');
    expect(fields({ ...valid, contact_first_name: 'Anneke2' })).toContain('contact_first_name');
  });

  it('normalises what users type', () => {
    const profile = normaliseEmployerProfile({
      ...valid, paye_reference: ' 7230 767 891 ', sdl_reference: 'l230767891', uif_reference: '',
      contact_business_phone: '(021) 123-4567', address_country: 'za', contact_position: '  ',
    });
    expect(profile).toMatchObject({
      paye_reference: '7230767891', sdl_reference: 'L230767891', uif_reference: null,
      contact_business_phone: '0211234567', address_country: 'ZA', contact_position: null,
    });
    expect(validateEmployerProfile(profile)).toEqual([]);
  });
});

describe('client and server copies', () => {
  it('are identical apart from Deno import extensions', () => {
    for (const file of ['sarsNumbers.ts', 'sic7Codes.ts', 'employerProfile.ts']) {
      const client = readFileSync(`src/lib/sars/${file}`, 'utf8').replace(/\r\n/g, '\n');
      const server = readFileSync(`supabase/functions/_shared/sars/${file}`, 'utf8').replace(/\r\n/g, '\n')
        .replace(/(from '\.{1,2}\/[^']+)\.ts'/g, "$1'");
      expect(server, file).toBe(client);
    }
  });
});
