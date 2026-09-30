/**
 * South Africa — reference data for the compliance content.
 */
import type { AuthoritySource, CategorySource, HolidaySource, IndustrySource } from '../schema';

export const ZA_AUTHORITIES: AuthoritySource[] = [
  { code: 'CIPC', name: 'Companies and Intellectual Property Commission', country_code: 'ZA', website: 'https://www.cipc.co.za' },
  { code: 'SARS', name: 'South African Revenue Service', country_code: 'ZA', website: 'https://www.sars.gov.za' },
  { code: 'DEL', name: 'Department of Employment and Labour (incl. the Compensation Fund)', country_code: 'ZA', website: 'https://www.labour.gov.za' },
  { code: 'INFOREG', name: 'Information Regulator', country_code: 'ZA', website: 'https://inforegulator.org.za' },
  { code: 'BBBEE', name: 'B-BBEE Commission', country_code: 'ZA', website: 'https://www.bbbeecommission.co.za' },
  { code: 'PSIRA', name: 'Private Security Industry Regulatory Authority', country_code: 'ZA', website: 'https://www.psira.co.za' },
  { code: 'MUNICIPALITY', name: 'Local municipality (environmental health)', country_code: 'ZA', website: 'https://www.health.gov.za' },
  { code: 'CIDB', name: 'Construction Industry Development Board', country_code: 'ZA', website: 'https://www.cidb.org.za' },
  { code: 'DBE', name: 'Department of Basic Education', country_code: 'ZA', website: 'https://www.education.gov.za' },
];

export const CATEGORIES: CategorySource[] = [
  { code: 'corporate_cipc', name: 'Corporate & CIPC', sort_order: 10 },
  { code: 'tax_sars', name: 'Tax & SARS', sort_order: 20 },
  { code: 'employment', name: 'Employment', sort_order: 30 },
  { code: 'information_privacy', name: 'Information & Privacy', sort_order: 40 },
  { code: 'bbbee', name: 'B-BBEE', sort_order: 50 },
  { code: 'general_governance', name: 'General Governance', sort_order: 60 },
  { code: 'industry_activities', name: 'Industry & Activities', sort_order: 70 },
];

/** Industries are data: adding one never adds routes or components. */
export const INDUSTRIES: IndustrySource[] = [
  { code: 'general', name: 'General business', active: true },
  { code: 'retail_wholesale', name: 'Retail and wholesale', active: true },
  { code: 'hospitality_food', name: 'Hospitality and food', active: true },
  { code: 'transport_logistics', name: 'Transport and logistics', active: true },
  { code: 'construction', name: 'Construction', active: true },
  { code: 'security_services', name: 'Security services', active: true },
  { code: 'childcare_education', name: 'Childcare and education', active: true },
  { code: 'professional_services', name: 'Professional services', active: true },
  { code: 'manufacturing', name: 'Manufacturing', active: true },
  { code: 'agriculture', name: 'Agriculture', active: true },
  { code: 'healthcare', name: 'Healthcare', active: true },
  { code: 'technology', name: 'Technology', active: true },
  { code: 'other', name: 'Other', active: true },
];

/**
 * Public holidays under the Public Holidays Act 36 of 1994. A holiday that
 * falls on a Sunday is observed on the Monday. Easter dates are cross-checked
 * against the Gregorian computus in tests/unit/compliance-content.test.ts.
 * Holidays the President declares ad hoc (for example election days) are NOT
 * here: add them as soon as they are gazetted.
 */
export const ZA_PUBLIC_HOLIDAYS: HolidaySource[] = [
  ['2025-01-01', "New Year's Day"],
  ['2025-03-21', 'Human Rights Day'],
  ['2025-04-18', 'Good Friday'],
  ['2025-04-21', 'Family Day'],
  ['2025-04-27', 'Freedom Day'],
  ['2025-04-28', 'Freedom Day (observed)'],
  ['2025-05-01', "Workers' Day"],
  ['2025-06-16', 'Youth Day'],
  ['2025-08-09', "National Women's Day"],
  ['2025-09-24', 'Heritage Day'],
  ['2025-12-16', 'Day of Reconciliation'],
  ['2025-12-25', 'Christmas Day'],
  ['2025-12-26', 'Day of Goodwill'],
  ['2026-01-01', "New Year's Day"],
  ['2026-03-21', 'Human Rights Day'],
  ['2026-04-03', 'Good Friday'],
  ['2026-04-06', 'Family Day'],
  ['2026-04-27', 'Freedom Day'],
  ['2026-05-01', "Workers' Day"],
  ['2026-06-16', 'Youth Day'],
  ['2026-08-09', "National Women's Day"],
  ['2026-08-10', "National Women's Day (observed)"],
  ['2026-09-24', 'Heritage Day'],
  ['2026-12-16', 'Day of Reconciliation'],
  ['2026-12-25', 'Christmas Day'],
  ['2026-12-26', 'Day of Goodwill'],
  ['2027-01-01', "New Year's Day"],
  ['2027-03-21', 'Human Rights Day'],
  ['2027-03-22', 'Human Rights Day (observed)'],
  ['2027-03-26', 'Good Friday'],
  ['2027-03-29', 'Family Day'],
  ['2027-04-27', 'Freedom Day'],
  ['2027-05-01', "Workers' Day"],
  ['2027-06-16', 'Youth Day'],
  ['2027-08-09', "National Women's Day"],
  ['2027-09-24', 'Heritage Day'],
  ['2027-12-16', 'Day of Reconciliation'],
  ['2027-12-25', 'Christmas Day'],
  ['2027-12-26', 'Day of Goodwill'],
  ['2027-12-27', 'Day of Goodwill (observed)'],
  ['2028-01-01', "New Year's Day"],
  ['2028-03-21', 'Human Rights Day'],
  ['2028-04-14', 'Good Friday'],
  ['2028-04-17', 'Family Day'],
  ['2028-04-27', 'Freedom Day'],
  ['2028-05-01', "Workers' Day"],
  ['2028-06-16', 'Youth Day'],
  ['2028-08-09', "National Women's Day"],
  ['2028-09-24', 'Heritage Day'],
  ['2028-09-25', 'Heritage Day (observed)'],
  ['2028-12-16', 'Day of Reconciliation'],
  ['2028-12-25', 'Christmas Day'],
  ['2028-12-26', 'Day of Goodwill'],
  ['2029-01-01', "New Year's Day"],
  ['2029-03-21', 'Human Rights Day'],
  ['2029-03-30', 'Good Friday'],
  ['2029-04-02', 'Family Day'],
  ['2029-04-27', 'Freedom Day'],
  ['2029-05-01', "Workers' Day"],
  ['2029-06-16', 'Youth Day'],
  ['2029-08-09', "National Women's Day"],
  ['2029-09-24', 'Heritage Day'],
  ['2029-12-16', 'Day of Reconciliation'],
  ['2029-12-17', 'Day of Reconciliation (observed)'],
  ['2029-12-25', 'Christmas Day'],
  ['2029-12-26', 'Day of Goodwill'],
  ['2030-01-01', "New Year's Day"],
  ['2030-03-21', 'Human Rights Day'],
  ['2030-04-19', 'Good Friday'],
  ['2030-04-22', 'Family Day'],
  ['2030-04-27', 'Freedom Day'],
  ['2030-05-01', "Workers' Day"],
  ['2030-06-16', 'Youth Day'],
  ['2030-06-17', 'Youth Day (observed)'],
  ['2030-08-09', "National Women's Day"],
  ['2030-09-24', 'Heritage Day'],
  ['2030-12-16', 'Day of Reconciliation'],
  ['2030-12-25', 'Christmas Day'],
  ['2030-12-26', 'Day of Goodwill'],
];

export const DISCLAIMER =
  'This is general, educational information to help you plan. It is not legal or tax advice and may not cover ' +
  'your circumstances. AdminLess does not file anything with any authority on your behalf. Confirm your ' +
  'obligations with a qualified professional.';

/** Every draft awaits a named reviewer (plan section 20, open decision). */
export const DRAFT_PROVENANCE = {
  retrieved_on: '2026-09-30',
  reviewed_by: null,
  last_reviewed: null,
  review_due: '2027-03-31',
} as const;

export const COMPANY_TYPES = ['private_company', 'public_company', 'close_corporation', 'non_profit_company'];
export const TAXED_COMPANY_TYPES = ['private_company', 'public_company', 'close_corporation'];
