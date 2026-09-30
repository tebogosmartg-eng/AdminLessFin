import type { RuleSource } from '../schema';
import { DISCLAIMER, DRAFT_PROVENANCE } from './reference';

/**
 * Activity pack (plan Phase 7). Keyed on what the business does (the
 * questionnaire's activity answers) rather than on a single industry, so a
 * restaurant that also delivers, or a builder that also runs security, gets
 * every rule that fits. Adding a rule here is content only.
 */
export const ACTIVITY_RULES: RuleSource[] = [
  {
    code: 'ZA.PSIRA.BUSINESS_REGISTRATION',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'industry_activities',
    industry_code: null,
    authority_code: 'PSIRA',
    title: 'PSIRA registration (security business)',
    summary: 'A security business and its officers must be registered with PSIRA and keep the registration current.',
    applies_when: { fact_eq: ['activity_security', true] },
    schedule: { type: 'certificate_expiry', renewal_lead_days: 60, default_term_months: 12 },
    evidence: { required: false, source_tables: [] },
    priority: 'high',
    reminder_offsets: [60, 30, 7],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Private Security Industry Regulation Act 56 of 2001',
      source_url: 'https://www.psira.co.za',
      notes: 'Reviewer to confirm the renewal cycle and annual-fee dates that apply to business registrations.',
    },
    guidance: {
      what_is_this:
        'Anyone who provides security services for reward — the business and every security officer — must be ' +
        'registered with the Private Security Industry Regulatory Authority (PSIRA).',
      why_it_matters:
        'Providing security services while unregistered is a criminal offence, and clients are not allowed to ' +
        'contract an unregistered provider.',
      how_to_comply: [
        'Register the business and its directors with PSIRA.',
        'Make sure every security officer you employ is registered at the right grade.',
        'Pay the annual fees and keep the registration certificate current.',
        'Enter the certificate dates here and upload a copy.',
      ],
      documents_needed: ['PSIRA business registration certificate', 'Proof of annual fee payment'],
      if_you_dont: 'PSIRA can suspend or withdraw the registration, and operating without it is a criminal offence.',
      where_to_complete: { label: 'PSIRA', url: 'https://www.psira.co.za' },
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.HEALTH.CERTIFICATE_OF_ACCEPTABILITY',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'industry_activities',
    industry_code: null,
    authority_code: 'MUNICIPALITY',
    title: 'Certificate of Acceptability (food premises)',
    summary: 'Premises where food is prepared, handled or sold need a Certificate of Acceptability from the municipality.',
    applies_when: { fact_eq: ['activity_food', true] },
    schedule: { type: 'once_off' },
    evidence: { required: true, source_tables: [] },
    priority: 'high',
    reminder_offsets: [],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Regulations Governing General Hygiene Requirements for Food Premises (R638 of 22 June 2018)',
      source_url: 'https://www.health.gov.za',
      notes: 'Issued per premises and person in charge; a new certificate is needed when either changes.',
    },
    guidance: {
      what_is_this:
        'Every food premises must hold a Certificate of Acceptability, issued by the municipal environmental ' +
        'health practitioner after an inspection.',
      why_it_matters:
        'Operating food premises without one is an offence, and the municipality can close the premises.',
      how_to_comply: [
        'Apply to the municipal environmental health office for each food premises.',
        'Prepare for the inspection: hygiene, storage, water, waste and staff facilities.',
        'Display the certificate on the premises once issued.',
        'Apply again when the premises or the person in charge changes.',
        'Upload the certificate here.',
      ],
      documents_needed: ['Application form', 'Floor plan of the premises', 'The issued certificate'],
      if_you_dont: 'The municipality can issue fines or close the premises until a certificate is issued.',
      where_to_complete: { label: 'Your municipality (environmental health)', url: 'https://www.health.gov.za' },
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.CIDB.CONTRACTOR_REGISTRATION',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'industry_activities',
    industry_code: null,
    authority_code: 'CIDB',
    title: 'CIDB contractor registration',
    summary: 'Contractors tendering for public-sector construction work must hold a current CIDB grading.',
    applies_when: { fact_eq: ['activity_construction', true] },
    schedule: { type: 'certificate_expiry', renewal_lead_days: 90, default_term_months: 36 },
    evidence: { required: false, source_tables: [] },
    priority: 'medium',
    reminder_offsets: [60, 30, 7],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Construction Industry Development Board Act 38 of 2000 and Regulations',
      source_url: 'https://www.cidb.org.za',
      notes: 'Registration is renewed every three years with an annual update; reviewer to confirm.',
    },
    guidance: {
      what_is_this:
        'The Construction Industry Development Board grades contractors by the size and type of work they can ' +
        'do. Public-sector clients may only award construction work to registered contractors.',
      why_it_matters:
        'Without a current grading you cannot tender for, or be awarded, public-sector construction work.',
      how_to_comply: [
        'Register on the CIDB register of contractors in the right class of works.',
        'Keep the annual update and fees current.',
        'Renew before the registration expires.',
        'Enter the registration dates here and upload the certificate.',
      ],
      documents_needed: ['CIDB registration certificate', 'Financial and works-capability records for grading'],
      if_you_dont: 'A lapsed registration disqualifies you from public-sector tenders and awards.',
      where_to_complete: { label: 'CIDB', url: 'https://www.cidb.org.za' },
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.EDU.ECD_REGISTRATION',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'industry_activities',
    industry_code: null,
    authority_code: 'DBE',
    title: 'Early childhood development registration',
    summary: 'A partial-care facility or early childhood programme for children must be registered.',
    applies_when: { fact_eq: ['activity_childcare', true] },
    schedule: { type: 'certificate_expiry', renewal_lead_days: 90, default_term_months: 60 },
    evidence: { required: false, source_tables: [] },
    priority: 'high',
    reminder_offsets: [60, 30, 7],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Children’s Act 38 of 2005, Chapters 5 and 6',
      source_url: 'https://www.education.gov.za',
      notes: 'The ECD function moved from Social Development to Basic Education in 2022; reviewer to confirm the registration term.',
    },
    guidance: {
      what_is_this:
        'Facilities that care for more than six young children away from their parents, and early childhood ' +
        'development programmes, must be registered under the Children’s Act.',
      why_it_matters:
        'Registration is a legal requirement and a condition for subsidies; the premises also need municipal ' +
        'health and zoning approval.',
      how_to_comply: [
        'Apply to the provincial education department for registration of the facility and programme.',
        'Obtain the municipal health and zoning approvals it requires.',
        'Renew before the registration expires.',
        'Enter the registration dates here and upload the certificate.',
      ],
      documents_needed: ['Registration certificate', 'Municipal health and zoning approvals', 'Staff police clearances'],
      if_you_dont: 'Operating unregistered is an offence and the facility can be closed.',
      where_to_complete: { label: 'Department of Basic Education', url: 'https://www.education.gov.za' },
      disclaimer: DISCLAIMER,
    },
  },
];
