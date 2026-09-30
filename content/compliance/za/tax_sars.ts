import type { RuleSource } from '../schema';
import { DISCLAIMER, DRAFT_PROVENANCE, TAXED_COMPANY_TYPES } from './reference';

const SARS_EFILING = { label: 'SARS eFiling', url: 'https://www.sarsefiling.co.za' };

export const TAX_SARS_RULES: RuleSource[] = [
  {
    code: 'ZA.SARS.VAT201',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'tax_sars',
    industry_code: null,
    authority_code: 'SARS',
    title: 'VAT return (VAT201)',
    summary: 'Submit the VAT201 and pay VAT for every tax period.',
    applies_when: { fact_eq: ['vat_status', 'registered'] },
    schedule: { type: 'periodic', frequency: 'from_vat_filing_frequency', due_day: 25, adjust: 'previous_business_day' },
    evidence: { required: false, source_tables: [] },
    priority: 'high',
    reminder_offsets: [7, 3, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Value-Added Tax Act 89 of 1991 s28; SARS VAT guidance',
      source_url: 'https://www.sars.gov.za',
      notes:
        'Manual returns are due on the 25th of the month after the period; eFiling returns on the last business ' +
        'day of that month. This rule uses the earlier date, moved back to the previous business day.',
    },
    guidance: {
      what_is_this:
        'VAT vendors must submit a VAT201 return and pay any VAT due for every tax period. SARS set your tax ' +
        'period (monthly or every two months) when you registered.',
      why_it_matters:
        'VAT is money collected on behalf of SARS. Late returns and payments are penalised quickly and interest ' +
        'runs until the debt is paid.',
      how_to_comply: [
        'Reconcile the VAT on sales and on purchases for the period; the Sales Tax Report helps.',
        'Complete the VAT201 on SARS eFiling.',
        'Submit and pay by the due date shown here.',
        'Keep the submission confirmation and proof of payment.',
      ],
      documents_needed: ['Sales and purchase records for the period', 'Valid tax invoices for input VAT claimed'],
      if_you_dont:
        'SARS charges a 10% late-payment penalty plus interest, and administrative penalties for returns that ' +
        'are not submitted.',
      where_to_complete: SARS_EFILING,
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.SARS.EMP201',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'tax_sars',
    industry_code: null,
    authority_code: 'SARS',
    title: 'Monthly employer declaration (EMP201)',
    summary: 'Declare and pay PAYE, UIF and SDL by the 7th of the following month.',
    applies_when: { fact_eq: ['has_employees', true] },
    schedule: { type: 'periodic', frequency: 'monthly', due_day: 7, adjust: 'previous_business_day' },
    evidence: { required: false, source_tables: ['statutory_returns'] },
    priority: 'high',
    reminder_offsets: [7, 3, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Income Tax Act 58 of 1962, Fourth Schedule para 2; SARS EMP201 guidance',
      source_url: 'https://www.sars.gov.za',
      notes: 'Applies to employers registered for PAYE. If the 7th is not a business day, payment is due on the last business day before it.',
    },
    guidance: {
      what_is_this:
        "Employers must declare and pay the PAYE, UIF and SDL deducted from employees' pay every month, using " +
        'the EMP201 return.',
      why_it_matters:
        'These amounts belong to SARS and the funds they finance. Late payment is penalised every month it happens.',
      how_to_comply: [
        "Finalise the month's payroll run.",
        'Generate the EMP201 in Payroll → Statutory Returns; AdminLess calculates it, this module never does.',
        'Submit it on SARS eFiling and pay by the due date shown here.',
        'Link the finalised statutory return here as proof.',
      ],
      documents_needed: ['Finalised payroll for the month', 'EMP201 from Statutory Returns', 'Proof of payment'],
      if_you_dont: 'SARS charges a 10% penalty plus interest on late payments.',
      where_to_complete: SARS_EFILING,
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.SARS.EMP501_INTERIM',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'tax_sars',
    industry_code: null,
    authority_code: 'SARS',
    title: 'Interim employer reconciliation (EMP501)',
    summary: 'Reconcile the first six months of the tax year (March to August) by 31 October.',
    applies_when: { fact_eq: ['has_employees', true] },
    schedule: { type: 'annual_fixed_month_day', month: 10, day: 31, adjust: 'previous_business_day', opens_days_before_due: 60 },
    evidence: { required: false, source_tables: ['statutory_returns'] },
    priority: 'high',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'SARS Employer Reconciliation guidance (EMP501)',
      source_url: 'https://www.sars.gov.za',
      notes: 'SARS announces each filing season; confirm the dates every year.',
    },
    guidance: {
      what_is_this:
        'Twice a year employers reconcile what they declared on the EMP201s with what they paid and with the ' +
        'IRP5/IT3(a) certificates. The interim reconciliation covers March to August.',
      why_it_matters:
        'Differences found now are cheaper to fix than at year end, and SARS uses the reconciliation to check ' +
        'the tax certificates employees rely on.',
      how_to_comply: [
        'Make sure every EMP201 for March to August is submitted and paid.',
        'Generate the reconciliation and tax certificates from payroll.',
        'Submit the EMP501 through e@syFile or eFiling.',
        'Keep the submission confirmation.',
      ],
      documents_needed: ['EMP201s and payments for the period', 'IRP5/IT3(a) certificates'],
      if_you_dont: 'SARS can impose administrative penalties for late or incomplete reconciliations.',
      where_to_complete: SARS_EFILING,
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.SARS.EMP501_ANNUAL',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'tax_sars',
    industry_code: null,
    authority_code: 'SARS',
    title: 'Annual employer reconciliation (EMP501)',
    summary: 'Reconcile the full tax year (March to February) and issue IRP5s by 31 May.',
    applies_when: { fact_eq: ['has_employees', true] },
    schedule: { type: 'annual_fixed_month_day', month: 5, day: 31, adjust: 'previous_business_day', opens_days_before_due: 61 },
    evidence: { required: false, source_tables: ['statutory_returns'] },
    priority: 'high',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'SARS Employer Reconciliation guidance (EMP501)',
      source_url: 'https://www.sars.gov.za',
      notes: 'SARS announces each filing season; confirm the dates every year.',
    },
    guidance: {
      what_is_this:
        'The annual reconciliation covers the whole tax year from March to February. Employees receive their ' +
        'IRP5/IT3(a) certificates from it and use them for their own tax returns.',
      why_it_matters:
        'Employees cannot file correct personal returns without their certificates, and SARS penalises late ' +
        'or inaccurate reconciliations.',
      how_to_comply: [
        'Make sure every EMP201 for the tax year is submitted and paid.',
        'Generate the reconciliation and tax certificates from payroll.',
        'Submit the EMP501 through e@syFile or eFiling and give employees their certificates.',
        'Keep the submission confirmation.',
      ],
      documents_needed: ['EMP201s and payments for the tax year', 'IRP5/IT3(a) certificates'],
      if_you_dont: 'SARS can impose administrative penalties of up to 10% of the year’s employees’ tax.',
      where_to_complete: SARS_EFILING,
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.SARS.ITR14',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'tax_sars',
    industry_code: null,
    authority_code: 'SARS',
    title: 'Company income tax return (ITR14)',
    summary: 'Submit the income tax return within 12 months after the financial year ends.',
    applies_when: { fact_in: ['entity_type', TAXED_COMPANY_TYPES] },
    schedule: { type: 'months_after_year_end', months: 12, adjust: 'none', opens_days_before_due: 365 },
    evidence: { required: false, source_tables: [] },
    priority: 'high',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Income Tax Act 58 of 1962; SARS ITR14 guidance',
      source_url: 'https://www.sars.gov.za',
    },
    guidance: {
      what_is_this:
        'Companies and close corporations submit an income tax return (ITR14) for every year of assessment, ' +
        'with their financial statements. It is due within 12 months after the financial year ends.',
      why_it_matters:
        'The return settles the year’s tax. Outstanding returns block tax clearance, which many customers ' +
        'and all government tenders require.',
      how_to_comply: [
        'Finalise the annual financial statements.',
        'Complete the ITR14 on SARS eFiling, including the tax computation.',
        'Submit it and pay any balance owed.',
        'Keep the assessment when SARS issues it.',
      ],
      documents_needed: ['Annual financial statements', 'Tax computation', 'Supporting schedules'],
      if_you_dont: 'SARS charges administrative penalties every month a return is outstanding, plus interest on unpaid tax.',
      where_to_complete: SARS_EFILING,
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.SARS.PROVISIONAL_TAX_FIRST',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'tax_sars',
    industry_code: null,
    authority_code: 'SARS',
    title: 'Provisional tax — first payment (IRP6)',
    summary: 'Estimate the year’s tax and pay the first half by the end of the sixth month of the year.',
    applies_when: { fact_in: ['entity_type', TAXED_COMPANY_TYPES] },
    schedule: { type: 'months_after_year_end', months: -6, adjust: 'previous_business_day', opens_days_before_due: 90 },
    evidence: { required: false, source_tables: [] },
    priority: 'high',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Income Tax Act 58 of 1962, Fourth Schedule para 21; SARS provisional tax guidance',
      source_url: 'https://www.sars.gov.za',
    },
    guidance: {
      what_is_this:
        'Companies pay income tax in advance through provisional tax. The first payment, with an IRP6 return, ' +
        'is due within six months after the start of the financial year.',
      why_it_matters: 'Paying in advance spreads the tax over the year. Missing or under-estimating it attracts penalties.',
      how_to_comply: [
        'Estimate the taxable income for the year.',
        'Complete the IRP6 on SARS eFiling.',
        'Pay half of the estimated tax by the due date shown here.',
      ],
      documents_needed: ['Management accounts to date', 'Estimate of the year’s taxable income'],
      if_you_dont: 'SARS charges a 10% late-payment penalty plus interest.',
      where_to_complete: SARS_EFILING,
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.SARS.PROVISIONAL_TAX_SECOND',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'tax_sars',
    industry_code: null,
    authority_code: 'SARS',
    title: 'Provisional tax — second payment (IRP6)',
    summary: 'Pay the balance of the estimated tax by the last day of the financial year.',
    applies_when: { fact_in: ['entity_type', TAXED_COMPANY_TYPES] },
    schedule: { type: 'months_after_year_end', months: 0, adjust: 'previous_business_day', opens_days_before_due: 90 },
    evidence: { required: false, source_tables: [] },
    priority: 'high',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Income Tax Act 58 of 1962, Fourth Schedule para 23; SARS provisional tax guidance',
      source_url: 'https://www.sars.gov.za',
    },
    guidance: {
      what_is_this:
        'The second provisional tax payment, with an IRP6 return, is due by the last day of the financial ' +
        'year. It brings the tax paid up to the full estimate for the year.',
      why_it_matters:
        'SARS penalises an estimate that is too low as well as a payment that is late, so this one matters most.',
      how_to_comply: [
        'Update the estimate of the year’s taxable income with the latest figures.',
        'Complete the IRP6 on SARS eFiling.',
        'Pay the balance by the due date shown here.',
      ],
      documents_needed: ['Management accounts for the year', 'First-period IRP6'],
      if_you_dont: 'SARS charges a 10% late-payment penalty, interest, and an under-estimation penalty.',
      where_to_complete: SARS_EFILING,
      disclaimer: DISCLAIMER,
    },
  },
];
