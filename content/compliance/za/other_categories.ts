import type { RuleSource } from '../schema';
import { COMPANY_TYPES, DISCLAIMER, DRAFT_PROVENANCE } from './reference';

export const INFORMATION_PRIVACY_RULES: RuleSource[] = [
  {
    code: 'ZA.INFOREG.INFORMATION_OFFICER',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'information_privacy',
    industry_code: null,
    authority_code: 'INFOREG',
    title: 'Register the Information Officer',
    summary: 'Register the person responsible for personal information with the Information Regulator.',
    applies_when: { fact_present: 'entity_type' },
    schedule: { type: 'once_off' },
    evidence: { required: true, source_tables: [] },
    priority: 'medium',
    reminder_offsets: [],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Protection of Personal Information Act 4 of 2013 s55–56; Information Regulator guidance',
      source_url: 'https://inforegulator.org.za',
    },
    guidance: {
      what_is_this:
        'Every organisation that processes personal information — including employee and customer details — ' +
        'has an Information Officer, by default the head of the business, who must be registered with the ' +
        'Information Regulator.',
      why_it_matters:
        'The Information Officer answers for how personal information is protected. Registration is the ' +
        'starting point the Regulator checks first.',
      how_to_comply: [
        'Confirm who the Information Officer is, and any deputies.',
        'Register them on the Information Regulator’s eServices portal.',
        'Upload the registration confirmation here.',
      ],
      documents_needed: ['Information Officer’s contact details', 'Registration confirmation'],
      if_you_dont: 'The Regulator can issue enforcement notices, and serious POPIA failures carry fines.',
      where_to_complete: { label: 'Information Regulator', url: 'https://inforegulator.org.za' },
      disclaimer: DISCLAIMER,
    },
  },
];

export const BBBEE_RULES: RuleSource[] = [
  {
    code: 'ZA.BBBEE.CERTIFICATE',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'bbbee',
    industry_code: null,
    authority_code: 'BBBEE',
    title: 'B-BBEE certificate or sworn affidavit',
    summary: 'Keep a current B-BBEE certificate or affidavit; each is valid for 12 months.',
    applies_when: { fact_present: 'entity_type' },
    schedule: { type: 'certificate_expiry', renewal_lead_days: 60, default_term_months: 12 },
    evidence: { required: false, source_tables: [] },
    priority: 'low',
    reminder_offsets: [30, 7],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Broad-Based Black Economic Empowerment Act 53 of 2003; Codes of Good Practice',
      source_url: 'https://www.bbbeecommission.co.za',
    },
    guidance: {
      what_is_this:
        'A B-BBEE certificate or sworn affidavit records your B-BBEE status level and is valid for 12 months. ' +
        'Smaller businesses can usually use a sworn affidavit instead of a verification certificate.',
      why_it_matters:
        'Most private businesses are not required to have one by law, but customers, tenders and government ' +
        'contracts often ask for it. If you do not need one, mark this not applicable.',
      how_to_comply: [
        'Check whether your turnover allows a sworn affidavit or needs a verification agency.',
        'Obtain the affidavit or certificate.',
        'Enter its issue and expiry dates here, and upload a copy.',
      ],
      documents_needed: ['Turnover for the latest financial year', 'Ownership details'],
      if_you_dont: 'You may score lower or be excluded when customers and tenders evaluate suppliers.',
      where_to_complete: { label: 'B-BBEE Commission', url: 'https://www.bbbeecommission.co.za' },
      disclaimer: DISCLAIMER,
    },
  },
];

export const GENERAL_GOVERNANCE_RULES: RuleSource[] = [
  {
    code: 'ZA.CIPC.ANNUAL_FINANCIAL_STATEMENTS',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'general_governance',
    industry_code: null,
    authority_code: 'CIPC',
    title: 'Prepare annual financial statements',
    summary: 'Prepare the annual financial statements within six months after the financial year ends.',
    applies_when: { fact_in: ['entity_type', COMPANY_TYPES] },
    schedule: { type: 'months_after_year_end', months: 6, adjust: 'none', opens_days_before_due: 183 },
    evidence: { required: false, source_tables: [] },
    priority: 'high',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Companies Act 71 of 2008 s30; Close Corporations Act 69 of 1984 s58',
      source_url: 'https://www.cipc.co.za',
    },
    guidance: {
      what_is_this:
        'Companies must prepare annual financial statements within six months after the end of each financial ' +
        'year. Close corporations have the same deadline under the Close Corporations Act.',
      why_it_matters:
        'The statements are needed for the tax return, for lenders and investors, and — depending on the ' +
        'public interest score — must be audited or independently reviewed.',
      how_to_comply: [
        'Close the financial year in Accounting and resolve any readiness issues.',
        'Prepare the statements in Annual Financial Statements.',
        'Arrange the audit or independent review if your public interest score requires one.',
        'Have the directors or members approve and sign the statements.',
      ],
      documents_needed: ['Closed trial balance', 'Supporting schedules', 'Approval by the directors or members'],
      if_you_dont: 'Directors can be held liable, and late statements delay the tax return and any funding.',
      where_to_complete: { label: 'CIPC', url: 'https://www.cipc.co.za' },
      disclaimer: DISCLAIMER,
    },
  },
];
