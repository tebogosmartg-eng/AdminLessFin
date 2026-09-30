import type { RuleSource } from '../schema';
import { COMPANY_TYPES, DISCLAIMER, DRAFT_PROVENANCE } from './reference';

export const CORPORATE_CIPC_RULES: RuleSource[] = [
  {
    code: 'ZA.CIPC.ANNUAL_RETURN',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'corporate_cipc',
    industry_code: null,
    authority_code: 'CIPC',
    title: 'CIPC annual return',
    summary: 'File the annual return with CIPC within 30 business days after the anniversary of registration.',
    applies_when: { fact_in: ['entity_type', COMPANY_TYPES] },
    schedule: { type: 'anniversary_business_days', anchor: 'incorporation_date', business_days: 30 },
    evidence: { required: true, source_tables: [] },
    priority: 'high',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Companies Act 71 of 2008 s33; Close Corporations Act 69 of 1984 s15A; CIPC annual return guidance',
      source_url: 'https://www.cipc.co.za',
      notes: 'Due within 30 business days after the anniversary of the date of incorporation or registration.',
    },
    guidance: {
      what_is_this:
        'Every company and close corporation must file an annual return with CIPC each year. It confirms the ' +
        'entity is still trading and keeps its details on the CIPC register current.',
      why_it_matters:
        'CIPC uses annual returns to decide whether an entity is still active. An entity that stops filing is ' +
        'flagged for deregistration, which can freeze its bank accounts and stop it from contracting.',
      how_to_comply: [
        'Log in to CIPC eServices or BizPortal with your customer code.',
        "Check the entity's details on the register and correct anything out of date.",
        'Make sure the beneficial ownership information is filed and current; CIPC may not accept the return without it.',
        'Complete the annual return. The fee depends on the entity type and turnover.',
        'Pay the fee and download the confirmation.',
        'Upload the confirmation here as proof.',
      ],
      documents_needed: [
        'CIPC customer code and password',
        'Registration number',
        'Turnover for the financial year',
        "CIPC's confirmation after filing",
      ],
      if_you_dont:
        'Late filing attracts penalties, and an entity that does not file for two or more years can be ' +
        'deregistered by CIPC.',
      where_to_complete: { label: 'CIPC eServices', url: 'https://www.cipc.co.za' },
      disclaimer: DISCLAIMER,
    },
  },
  {
    code: 'ZA.CIPC.BENEFICIAL_OWNERSHIP',
    version: 1,
    status: 'draft',
    country_code: 'ZA',
    category_code: 'corporate_cipc',
    industry_code: null,
    authority_code: 'CIPC',
    title: 'Beneficial ownership filing',
    summary: 'File who ultimately owns or controls the entity with CIPC, and update it when that changes.',
    applies_when: { fact_in: ['entity_type', ['private_company', 'close_corporation']] },
    schedule: { type: 'once_off' },
    evidence: { required: true, source_tables: [] },
    priority: 'high',
    reminder_offsets: [],
    effective_from: '2025-01-01',
    effective_to: null,
    provenance: {
      ...DRAFT_PROVENANCE,
      source_title: 'Companies Act 71 of 2008 as amended by the General Laws Amendment Act 22 of 2022; CIPC beneficial ownership guidance',
      source_url: 'https://www.cipc.co.za',
      notes: 'Changes must be filed within 10 business days. Reviewer to confirm scope for close corporations and non-profit companies.',
    },
    guidance: {
      what_is_this:
        'Companies and close corporations must file the details of their beneficial owners — the people who ' +
        'ultimately own or control them — with CIPC, and keep them up to date.',
      why_it_matters:
        'The register helps prevent money laundering. CIPC links it to the annual return, so a missing filing ' +
        'can stop the annual return from being accepted.',
      how_to_comply: [
        'Identify every person who holds 5% or more of the shares or members’ interest, directly or indirectly, or who otherwise controls the entity.',
        'Collect their ID or passport details.',
        'File the beneficial ownership information on CIPC eServices or BizPortal.',
        'Update the filing within 10 business days whenever ownership or control changes.',
        'Upload the CIPC confirmation here.',
      ],
      documents_needed: [
        'Securities register or members’ register',
        'ID or passport copies of the beneficial owners',
        'CIPC confirmation of the filing',
      ],
      if_you_dont:
        'CIPC may refuse the annual return and can issue compliance notices and administrative fines.',
      where_to_complete: { label: 'CIPC eServices', url: 'https://www.cipc.co.za' },
      disclaimer: DISCLAIMER,
    },
  },
];
