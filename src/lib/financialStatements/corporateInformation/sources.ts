/**
 * V16.1 — Corporate Information Source Adapters.
 *
 * Each adapter reads from a single enterprise module. The provider composes; it never owns data.
 * Future modules register via the source registry without modifying the provider.
 */
import type { EfsWorkspaceGeneralInformation } from '../api';
import { formatLongDate } from '../publication/afsProfessionalPdf';
import { determineLevelOfAssurance } from './levelOfAssurance';
import { formatSingleValue } from './formatting';
import type {
  AddressEntry,
  CorporateInformationContext,
  CorporateInformationField,
  CorporateInformationSlice,
  CorporateInformationSourceId,
  DirectorClassification,
  DirectorEntry,
  GovernanceEntry,
  PrincipalBanker,
  TaxRegistration,
} from './types';

export interface CorporateInformationSource {
  sourceId: CorporateInformationSourceId;
  read(ctx: CorporateInformationContext): CorporateInformationSlice;
}

function field<T>(
  value: T,
  metadata: CorporateInformationField<T>['metadata'],
  source: CorporateInformationSourceId,
  formatted?: string | null,
): CorporateInformationField<T> {
  const display =
    formatted !== undefined
      ? formatted
      : typeof value === 'string'
        ? formatSingleValue(value)
        : value != null
          ? String(value)
          : null;
  return { value, metadata, source, formatted: display };
}

function parseDirectorClassifications(
  raw: Record<string, unknown>,
): DirectorClassification[] {
  const out: DirectorClassification[] = [];
  if (raw.executive === true || raw.is_executive === true) out.push('executive');
  if (raw.non_executive === true || raw.is_non_executive === true) out.push('non_executive');
  if (raw.independent === true || raw.is_independent === true) out.push('independent');
  if (raw.chairperson === true || raw.is_chairperson === true) out.push('chairperson');
  const role = String(raw.role ?? '').toLowerCase();
  if (role.includes('chair')) out.push('chairperson');
  if (role.includes('independent')) out.push('independent');
  if (role.includes('non-executive') || role.includes('non executive')) out.push('non_executive');
  if (role.includes('executive') && !role.includes('non')) out.push('executive');
  return [...new Set(out)];
}

function isDirectorActive(
  director: { appointment_date?: string | null; resignation_date?: string | null },
  periodStart: string | null,
  periodEnd: string | null,
): boolean {
  const appointed = director.appointment_date || null;
  const resigned = director.resignation_date || null;
  if (periodEnd && appointed && appointed > periodEnd) return false;
  if (periodStart && resigned && resigned < periodStart) return false;
  return true;
}

function entity(ctx: CorporateInformationContext): EfsWorkspaceGeneralInformation | null {
  return ctx.model.entity;
}

/** Company Profile source — entity identity from company records. */
export const companyProfileSource: CorporateInformationSource = {
  sourceId: 'company_profile',
  read(ctx) {
    const e = entity(ctx);
    return {
      entityIdentity: {
        registeredName: field(e?.registered_name ?? null, 'required', 'company_profile'),
        tradingName: field(e?.trading_name ?? null, 'optional', 'company_profile'),
        registrationNumber: field(e?.registration_number ?? null, 'required', 'company_profile'),
        natureOfBusiness: field(e?.nature_of_business ?? null, 'optional', 'company_profile'),
        countryOfIncorporation: field(
          (e as { country_of_incorporation?: string | null })?.country_of_incorporation ?? null,
          'optional',
          'company_profile',
        ),
        entityType: field(
          (e as { entity_type?: string | null })?.entity_type ?? null,
          'optional',
          'company_profile',
        ),
        reportingFramework: field(e?.reporting_framework ?? null, 'derived', 'company_profile'),
      },
    };
  },
};

/** Governance source — officers and professional appointments. */
export const governanceSource: CorporateInformationSource = {
  sourceId: 'governance',
  read(ctx) {
    const e = entity(ctx);
    const governance: GovernanceEntry[] = [];
    const push = (role: GovernanceEntry['role'], name: string | null | undefined) => {
      const v = formatSingleValue(name);
      if (v) governance.push({ role, name: v, source: 'governance' });
    };
    push('company_secretary', e?.company_secretary);
    push('auditor', e?.auditor);
    push(
      'independent_reviewer',
      (e as { independent_reviewer?: string | null })?.independent_reviewer,
    );
    push(
      'accounting_officer',
      (e as { accounting_officer?: string | null })?.accounting_officer,
    );
    return { governance };
  },
};

/** Director Register source — board composition with period filtering. */
export const directorRegisterSource: CorporateInformationSource = {
  sourceId: 'director_register',
  read(ctx) {
    const e = entity(ctx);
    const directors: DirectorEntry[] = (e?.directors || [])
      .map((d): DirectorEntry | null => {
        const raw = d as Record<string, unknown>;
        const name = formatSingleValue(String(raw.name ?? '')) || '';
        if (!name) return null;
        const active = isDirectorActive(
          {
            appointment_date: raw.appointment_date as string | null,
            resignation_date: raw.resignation_date as string | null,
          },
          ctx.reportingPeriodStart,
          ctx.reportingPeriodEnd,
        );
        return {
          name,
          role: formatSingleValue(String(raw.role ?? '')),
          appointmentDate: formatSingleValue(String(raw.appointment_date ?? '')),
          resignationDate: formatSingleValue(String(raw.resignation_date ?? '')),
          classifications: parseDirectorClassifications(raw),
          active,
          source: 'director_register' as const,
        };
      })
      .filter((d): d is DirectorEntry => d !== null);
    return { directors };
  },
};

/** Officer Register source — preparer, reviewer, partner from engagement. */
export const officerRegisterSource: CorporateInformationSource = {
  sourceId: 'officer_register',
  read(ctx) {
    const e = entity(ctx);
    const governance: GovernanceEntry[] = [];
    const push = (role: GovernanceEntry['role'], name: string | null | undefined) => {
      const v = formatSingleValue(name);
      if (v) governance.push({ role, name: v, source: 'officer_register' });
    };
    push('preparer', e?.prepared_by);
    push('reviewer', e?.reviewed_by);
    push('partner', (e as { partner?: string | null })?.partner ?? e?.approved_by);
    push('authorised_representative', e?.company_secretary);
    return { governance };
  },
};

/** Address Repository source — all entity addresses and contact details. */
export const addressRepositorySource: CorporateInformationSource = {
  sourceId: 'address_repository',
  read(ctx) {
    const e = entity(ctx);
    const addresses: AddressEntry[] = [];
    const push = (kind: AddressEntry['kind'], value: string | null | undefined) => {
      const v = formatSingleValue(value);
      if (v) addresses.push({ kind, value: v, source: 'address_repository' });
    };
    push('registered_office', e?.registered_office);
    push('business_address', e?.business_address);
    push('postal_address', e?.postal_address);
    push(
      'physical_address',
      (e as { physical_address?: string | null })?.physical_address,
    );
    const contact = formatSingleValue(e?.contact_information);
    if (contact) {
      if (contact.includes('@')) {
        push('email', contact);
      } else if (/^\+?\d[\d\s()-]{6,}$/.test(contact)) {
        push('telephone', contact);
      } else if (/^https?:\/\//i.test(contact) || contact.includes('www.')) {
        push('website', contact);
      } else {
        push('telephone', contact);
      }
    }
    push('website', (e as { website?: string | null })?.website);
    push('email', (e as { email?: string | null })?.email);
    push('telephone', (e as { telephone?: string | null })?.telephone);
    return { addresses };
  },
};

/** Tax Configuration source — applicable tax registrations only. */
export const taxConfigurationSource: CorporateInformationSource = {
  sourceId: 'tax_configuration',
  read(ctx) {
    const e = entity(ctx);
    const taxRegistrations: TaxRegistration[] = [];
    const push = (kind: string, label: string, number: string | null | undefined) => {
      const v = formatSingleValue(number);
      if (v) taxRegistrations.push({ kind, label, number: v, applicable: true, source: 'tax_configuration' });
    };
    push('vat', 'VAT Number', e?.vat_number);
    push('income_tax', 'Income Tax Number', e?.income_tax_number);
    push('paye', 'PAYE Number', (e as { paye_number?: string | null })?.paye_number);
    push('sdl', 'SDL Number', (e as { sdl_number?: string | null })?.sdl_number);
    push('uif', 'UIF Number', (e as { uif_number?: string | null })?.uif_number);
    const custom = (e as { custom_tax_registrations?: Array<{ label?: string; number?: string }> })
      ?.custom_tax_registrations;
    for (const reg of custom || []) {
      const label = formatSingleValue(reg.label) || 'Tax Registration';
      const number = formatSingleValue(reg.number);
      if (number) {
        taxRegistrations.push({
          kind: `custom_${label.toLowerCase().replace(/\s+/g, '_')}`,
          label,
          number,
          applicable: true,
          source: 'tax_configuration',
        });
      }
    }
    return { taxRegistrations };
  },
};

/** Financial Configuration source — currencies and framework. */
export const financialConfigurationSource: CorporateInformationSource = {
  sourceId: 'financial_configuration',
  read(ctx) {
    const e = entity(ctx);
    const m = ctx.model;
    return {
      entityIdentity: {
        reportingFramework: field(
          e?.reporting_framework ?? m.frameworkLabel ?? null,
          'required',
          'financial_configuration',
        ),
      },
      engagement: {
        functionalCurrency: field(
          e?.functional_currency ?? e?.reporting_currency ?? 'ZAR',
          'required',
          'financial_configuration',
        ),
      },
    };
  },
};

/** Engagement source — reporting period and team. */
export const engagementSource: CorporateInformationSource = {
  sourceId: 'engagement',
  read(ctx) {
    const e = entity(ctx);
    const m = ctx.model;
    const end = m.period?.end_date ?? null;
    const start = m.period?.start_date ?? null;
    // Derive from calendar dates / year_code — never prefer frozen slash labels.
    const periodLabel =
      m.period?.period_key ||
      (start && end ? `${start} – ${end}` : null) ||
      null;
    const comparative =
      e?.comparative_period ??
      (m.period as { comparative_label?: string })?.comparative_label ??
      null;
    return {
      engagement: {
        reportingPeriod: field(periodLabel, 'required', 'engagement'),
        comparativePeriod: field(comparative, 'optional', 'engagement'),
        reportingCurrency: field(e?.reporting_currency ?? 'ZAR', 'required', 'engagement'),
        preparedBy: field(e?.prepared_by ?? null, 'optional', 'engagement'),
        reviewedBy: field(e?.reviewed_by ?? null, 'optional', 'engagement'),
        partner: field(
          (e as { partner?: string | null })?.partner ?? e?.approved_by ?? null,
          'optional',
          'engagement',
        ),
      },
      levelOfAssurance: determineLevelOfAssurance(e),
    };
  },
};

/** Approval Workflow source — sign-off dates. */
export const approvalWorkflowSource: CorporateInformationSource = {
  sourceId: 'approval_workflow',
  read(ctx) {
    const e = entity(ctx);
    const approvalFormatted = e?.approval_date ? formatLongDate(e.approval_date) : null;
    const authFormatted = e?.authorisation_date ? formatLongDate(e.authorisation_date) : null;
    const issueRaw =
      (e as { issue_date?: string | null })?.issue_date ??
      e?.authorisation_date ??
      e?.approval_date ??
      null;
    const issueFormatted = issueRaw ? formatLongDate(issueRaw) : null;
    return {
      engagement: {
        approvalDate: field(e?.approval_date ?? null, 'conditional', 'approval_workflow', approvalFormatted),
        authorisationDate: field(
          e?.authorisation_date ?? null,
          'conditional',
          'approval_workflow',
          authFormatted,
        ),
        issueDate: field(issueRaw, 'derived', 'approval_workflow', issueFormatted),
      },
    };
  },
};

/** Principal Bankers Repository source — active bankers only. */
export const principalBankersSource: CorporateInformationSource = {
  sourceId: 'principal_bankers_repository',
  read(ctx) {
    const e = entity(ctx);
    const principalBankers: PrincipalBanker[] = (e?.principal_bankers || [])
      .map((b): PrincipalBanker | null => {
        const raw = b as Record<string, unknown>;
        const bankName = formatSingleValue(String(raw.name ?? raw.bank_name ?? ''));
        if (!bankName) return null;
        const inactive = raw.active === false || raw.inactive === true;
        return {
          bankName,
          branch: formatSingleValue(String(raw.branch ?? '')),
          branchCode: formatSingleValue(String(raw.branch_code ?? '')),
          accountType: formatSingleValue(String(raw.account_type ?? '')),
          swift: formatSingleValue(String(raw.swift ?? '')),
          iban: formatSingleValue(String(raw.iban ?? '')),
          active: !inactive,
          source: 'principal_bankers_repository' as const,
        };
      })
      .filter((b): b is PrincipalBanker => b !== null);
    return { principalBankers };
  },
};

/** Default source registry — extensible via registerCorporateInformationSource(). */
const SOURCE_REGISTRY: CorporateInformationSource[] = [
  companyProfileSource,
  governanceSource,
  directorRegisterSource,
  officerRegisterSource,
  addressRepositorySource,
  taxConfigurationSource,
  financialConfigurationSource,
  engagementSource,
  approvalWorkflowSource,
  principalBankersSource,
];

const customSources: CorporateInformationSource[] = [];

export function registerCorporateInformationSource(source: CorporateInformationSource): void {
  customSources.push(source);
}

export function getCorporateInformationSources(): CorporateInformationSource[] {
  return [...SOURCE_REGISTRY, ...customSources];
}

export function buildCorporateInformationContext(model: {
  entity: EfsWorkspaceGeneralInformation | null;
  period: { start_date?: string; end_date?: string; label?: string } | null;
}): CorporateInformationContext {
  return {
    model: model as CorporateInformationContext['model'],
    reportingPeriodStart: model.period?.start_date ?? null,
    reportingPeriodEnd: model.period?.end_date ?? null,
  };
}
