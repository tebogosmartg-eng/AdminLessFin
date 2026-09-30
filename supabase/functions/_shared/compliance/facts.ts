/**
 * Fact derivation: questionnaire answers plus what other modules already
 * hold, turned into the closed fact set the rules read.
 *
 * Pure. The edge function does the reads (counts and single rows only) and
 * hands the raw values here. Nothing is ever written back to master data.
 * Where the company's records answer a question, the records win and the
 * question is not asked.
 */
import { isIsoDate, isLastDayOfMonth } from './dates.ts';
import type { ComplianceFacts, EntityType, VatFilingFrequency } from './types.ts';
import { ENTITY_TYPES, VAT_FILING_FREQUENCIES } from './types.ts';

export const QUESTIONNAIRE_VERSION = 1;

export type ComplianceAnswers = {
  entity_type?: EntityType | null;
  incorporation_date?: string | null;
  industry_code?: string | null;
  activity_transport?: boolean | null;
  activity_food?: boolean | null;
  activity_security?: boolean | null;
  activity_construction?: boolean | null;
  activity_childcare?: boolean | null;
  processes_personal_information?: boolean | null;
  has_premises?: boolean | null;
  vat_status?: 'registered' | 'not_registered' | 'not_sure' | null;
  vat_filing_frequency?: VatFilingFrequency | 'not_sure' | null;
  has_employees?: boolean | null;
  employee_count?: number | null;
};

export type RawCompanyRecords = {
  registration_number: string | null;
  vat_number: string | null;
  master_entity_type: string | null;
  nature_of_business: string | null;
  address_on_file: string | null;
  paye_number: string | null;
  active_employee_count: number;
  has_payroll_runs: boolean;
  financial_year_end_date: string | null;
};

const text = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
};

export function deriveFacts(answers: ComplianceAnswers, raw: RawCompanyRecords): ComplianceFacts {
  const incorporation = isIsoDate(answers.incorporation_date) ? answers.incorporation_date : null;

  let vat_status: ComplianceFacts['vat_status'] = null;
  if (text(raw.vat_number)) vat_status = 'registered';
  else if (answers.vat_status === 'registered' || answers.vat_status === 'not_registered') vat_status = answers.vat_status;

  const vat_filing_frequency =
    vat_status === 'registered' &&
    answers.vat_filing_frequency &&
    (VAT_FILING_FREQUENCIES as readonly string[]).includes(answers.vat_filing_frequency)
      ? (answers.vat_filing_frequency as VatFilingFrequency)
      : null;

  const employeesOnRecord = raw.active_employee_count > 0 || raw.has_payroll_runs;
  const has_employees = employeesOnRecord ? true : answers.has_employees ?? null;
  let employee_count: number | null = null;
  if (raw.active_employee_count > 0) employee_count = raw.active_employee_count;
  else if (typeof answers.employee_count === 'number' && answers.employee_count >= 0) employee_count = answers.employee_count;
  else if (has_employees === false) employee_count = 0;

  let financial_year_end: ComplianceFacts['financial_year_end'] = null;
  if (isIsoDate(raw.financial_year_end_date)) {
    const [, m, d] = raw.financial_year_end_date.split('-').map(Number);
    // Day 31 means "month end": it clamps to 28/29 February every year.
    financial_year_end = { month: m, day: isLastDayOfMonth(raw.financial_year_end_date) ? 31 : d };
  }

  return {
    entity_type: answers.entity_type ?? null,
    industry_code: text(answers.industry_code),
    incorporation_date: incorporation,
    incorporation_date_known: incorporation ? true : null,
    has_registration_number: text(raw.registration_number) ? true : null,
    vat_status,
    vat_filing_frequency,
    has_employees,
    employee_count,
    has_premises: text(raw.address_on_file) ? true : answers.has_premises ?? null,
    activity_transport: answers.activity_transport ?? null,
    activity_food: answers.activity_food ?? null,
    activity_security: answers.activity_security ?? null,
    activity_construction: answers.activity_construction ?? null,
    activity_childcare: answers.activity_childcare ?? null,
    processes_personal_information: answers.processes_personal_information ?? null,
    financial_year_end,
  };
}

/** What the questionnaire can show as "already on file" instead of asking. */
export function onFile(raw: RawCompanyRecords) {
  return {
    registration_number: text(raw.registration_number),
    vat_number: text(raw.vat_number),
    master_entity_type: text(raw.master_entity_type),
    nature_of_business: text(raw.nature_of_business),
    address_on_file: text(raw.address_on_file),
    paye_number: text(raw.paye_number),
    active_employee_count: raw.active_employee_count,
    has_payroll_runs: raw.has_payroll_runs,
    financial_year_end_date: isIsoDate(raw.financial_year_end_date) ? raw.financial_year_end_date : null,
  };
}

/** Places where a saved answer disagrees with the company's records. */
export function answerConflicts(answers: ComplianceAnswers, raw: RawCompanyRecords) {
  const out: Array<{ field: string; answer: unknown; on_file: unknown; settings_module: string }> = [];
  if (text(raw.vat_number) && answers.vat_status === 'not_registered') {
    out.push({ field: 'vat_status', answer: 'not_registered', on_file: raw.vat_number, settings_module: 'tax_registrations' });
  }
  if ((raw.active_employee_count > 0 || raw.has_payroll_runs) && answers.has_employees === false) {
    out.push({ field: 'has_employees', answer: false, on_file: raw.active_employee_count, settings_module: 'payroll' });
  }
  if (text(raw.address_on_file) && answers.has_premises === false) {
    out.push({ field: 'has_premises', answer: false, on_file: raw.address_on_file, settings_module: 'addresses' });
  }
  return out;
}

const BOOLEAN_FIELDS = [
  'activity_transport',
  'activity_food',
  'activity_security',
  'activity_construction',
  'activity_childcare',
  'processes_personal_information',
  'has_premises',
  'has_employees',
] as const;

/**
 * Server-side validation of submitted answers. The browser validates too,
 * but only this decides what is stored. Unknown keys are dropped.
 * `complete` requires every always-asked question to be answered.
 */
export function validateAnswers(
  input: unknown,
  opts: { complete: boolean; industryCodes: string[]; today: string },
): ComplianceAnswers {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Answers must be an object.');
  }
  const src = input as Record<string, unknown>;
  const out: ComplianceAnswers = {};

  if (src.entity_type !== undefined && src.entity_type !== null) {
    if (!(ENTITY_TYPES as readonly string[]).includes(String(src.entity_type))) {
      throw new Error('Choose a business type from the list.');
    }
    out.entity_type = src.entity_type as EntityType;
  }
  if (src.incorporation_date !== undefined && src.incorporation_date !== null && src.incorporation_date !== '') {
    if (!isIsoDate(src.incorporation_date)) throw new Error('The registration date is not a valid date.');
    if (src.incorporation_date > opts.today) throw new Error('The registration date cannot be in the future.');
    if (src.incorporation_date < '1900-01-01') throw new Error('The registration date is too far in the past.');
    out.incorporation_date = src.incorporation_date;
  }
  if (src.industry_code !== undefined && src.industry_code !== null) {
    if (!opts.industryCodes.includes(String(src.industry_code))) throw new Error('Choose an industry from the list.');
    out.industry_code = String(src.industry_code);
  }
  for (const f of BOOLEAN_FIELDS) {
    const v = src[f];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'boolean') throw new Error(`Answer "${f}" must be yes or no.`);
    out[f] = v;
  }
  if (src.vat_status !== undefined && src.vat_status !== null) {
    if (!['registered', 'not_registered', 'not_sure'].includes(String(src.vat_status))) {
      throw new Error('Choose a VAT status from the list.');
    }
    out.vat_status = src.vat_status as ComplianceAnswers['vat_status'];
  }
  if (src.vat_filing_frequency !== undefined && src.vat_filing_frequency !== null) {
    if (![...VAT_FILING_FREQUENCIES, 'not_sure'].includes(String(src.vat_filing_frequency))) {
      throw new Error('Choose a VAT filing frequency from the list.');
    }
    out.vat_filing_frequency = src.vat_filing_frequency as ComplianceAnswers['vat_filing_frequency'];
  }
  if (src.employee_count !== undefined && src.employee_count !== null && src.employee_count !== '') {
    const n = Number(src.employee_count);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new Error('The number of employees must be a whole number.');
    out.employee_count = n;
  }

  if (opts.complete) {
    const required: Array<keyof ComplianceAnswers> = [
      'entity_type',
      'industry_code',
      'activity_transport',
      'activity_food',
      'activity_security',
      'activity_construction',
      'activity_childcare',
      'processes_personal_information',
    ];
    const gaps = required.filter((k) => out[k] === undefined || out[k] === null);
    if (gaps.length) throw new Error(`Some questions are still unanswered: ${gaps.join(', ')}.`);
  }
  return out;
}
