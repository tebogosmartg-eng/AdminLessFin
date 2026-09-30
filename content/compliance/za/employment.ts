import type { RuleSource } from '../schema';
import { DISCLAIMER, DRAFT_PROVENANCE } from './reference';

const DEL_SITE = { label: 'Department of Employment and Labour', url: 'https://www.labour.gov.za' };

/** Employment obligations reference payroll records; they never calculate. */
export const EMPLOYMENT_RULES: RuleSource[] = [
  {
    code: 'ZA.DEL.COIDA_ROE',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'employment',
    industry_code: null,
    authority_code: 'DEL',
    title: 'Compensation Fund return of earnings',
    summary: 'Declare the year’s wages to the Compensation Fund and pay the assessment.',
    applies_when: { fact_eq: ['has_employees', true] },
    schedule: { type: 'annual_fixed_month_day', month: 5, day: 31, adjust: 'previous_business_day', opens_days_before_due: 61 },
    evidence: { required: false, source_tables: [] },
    priority: 'medium',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Compensation for Occupational Injuries and Diseases Act 130 of 1993; Compensation Fund notices',
      source_url: 'https://www.labour.gov.za',
      notes: 'The Fund publishes the filing season each year; it has usually closed on 31 May.',
    },
    guidance: {
      what_is_this:
        'Employers registered with the Compensation Fund submit a return of earnings every year, declaring the ' +
        'wages paid, and pay the assessment. It funds cover for injuries and diseases at work.',
      why_it_matters:
        'Without it you cannot get a letter of good standing, and injured employees’ claims become harder.',
      how_to_comply: [
        'Total the year’s earnings from payroll.',
        'Submit the return of earnings on the Compensation Fund’s online system.',
        'Pay the assessment when it is issued.',
      ],
      documents_needed: ['Annual earnings per employee', 'Compensation Fund registration number'],
      if_you_dont: 'The Fund can impose penalties and estimated assessments, and will not issue a letter of good standing.',
      where_to_complete: DEL_SITE,
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.DEL.COIDA_GOOD_STANDING',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'employment',
    industry_code: null,
    authority_code: 'DEL',
    title: 'Compensation Fund letter of good standing',
    summary: 'Keep a current letter of good standing and renew it before it expires.',
    applies_when: { fact_eq: ['has_employees', true] },
    schedule: { type: 'certificate_expiry', renewal_lead_days: 30, default_term_months: 12 },
    evidence: { required: false, source_tables: [] },
    priority: 'medium',
    reminder_offsets: [30, 7],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Compensation for Occupational Injuries and Diseases Act 130 of 1993',
      source_url: 'https://www.labour.gov.za',
    },
    guidance: {
      what_is_this:
        'A letter of good standing from the Compensation Fund shows you are registered and up to date. Clients ' +
        'and main contractors often require it before they pay you.',
      why_it_matters: 'An expired letter can hold up payments and disqualify you from contracts, especially in construction and government work.',
      how_to_comply: [
        'Make sure the latest return of earnings is submitted and paid.',
        'Request the letter on the Compensation Fund’s online system.',
        'Enter its issue and expiry dates here, and upload a copy.',
      ],
      documents_needed: ['Latest return of earnings and proof of payment'],
      if_you_dont: 'Customers may withhold payment or exclude you from work until you can show a current letter.',
      where_to_complete: DEL_SITE,
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.DEL.EEA2',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'employment',
    industry_code: null,
    authority_code: 'DEL',
    title: 'Employment equity report (EEA2 and EEA4)',
    summary: 'Designated employers submit the annual employment equity report by 15 January.',
    applies_when: { fact_gt: ['employee_count', 49] },
    schedule: { type: 'annual_fixed_month_day', month: 1, day: 15, adjust: 'previous_business_day', opens_days_before_due: 136 },
    evidence: { required: false, source_tables: [] },
    priority: 'medium',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Employment Equity Act 55 of 1998 s21, as amended by Act 4 of 2022',
      source_url: 'https://www.labour.gov.za',
      notes: 'Online submissions close on 15 January. Reviewer to confirm the designated-employer definition in force.',
    },
    guidance: {
      what_is_this:
        'Designated employers — those with 50 or more employees — must report on their employment equity plan ' +
        'every year (EEA2), together with the income differential statement (EEA4).',
      why_it_matters: 'The Department checks the reports against sector targets; missing reports lead to compliance orders and fines.',
      how_to_comply: [
        'Update the workforce profile from employee records.',
        'Consult the employment equity committee on the report.',
        'Submit the EEA2 and EEA4 on the Department’s online system.',
        'Keep the acknowledgement of receipt.',
      ],
      documents_needed: ['Workforce profile by occupational level', 'Employment equity plan', 'Income differentials'],
      if_you_dont: 'The Department can issue compliance orders and fines that increase for repeat failures.',
      where_to_complete: DEL_SITE,
      disclaimer: DISCLAIMER,
    },
  },
];
