/**
 * V16.1 — Legacy engagement → company master data hydration.
 *
 * When company master data is empty, automatically populate from the legacy
 * engagement general information row. Executes once per company (idempotent).
 */
import type { CompanyMasterData, OfficerMasterEntry } from './types';
import { emptyCompanyMasterData } from './types';

type EngagementRow = Record<string, unknown> | null;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function hasModuleData(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return !!value.trim();
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasModuleData);
  }
  return false;
}

/** True when every master data module is empty. */
export function isMasterDataEmpty(master: CompanyMasterData | null | undefined): boolean {
  if (!master) return true;
  return (
    !hasModuleData(master.company_profile) &&
    !hasModuleData(master.addresses) &&
    !hasModuleData(master.tax_registrations) &&
    !hasModuleData(master.directors) &&
    !hasModuleData(master.governance) &&
    !hasModuleData(master.officers) &&
    !hasModuleData(master.principal_bankers)
  );
}

/** Engagement fields that remain on the engagement row (not master data). */
export const ENGAGEMENT_ONLY_FIELDS = [
  'financial_year_end',
  'comparative_period',
  'functional_currency',
  'reporting_currency',
  'approval_date',
  'authorisation_date',
  'issue_date',
  'reporting_framework',
  'engagement_type',
  'compilation_engagement',
  'share_information',
] as const;

/** Master-data fields stored on engagement row but deprecated for writes. */
export const LEGACY_MASTER_DATA_FIELDS = [
  'registered_name',
  'trading_name',
  'registration_number',
  'nature_of_business',
  'country_of_incorporation',
  'entity_type',
  'registered_office',
  'business_address',
  'postal_address',
  'physical_address',
  'website',
  'email',
  'telephone',
  'contact_information',
  'vat_number',
  'income_tax_number',
  'paye_number',
  'sdl_number',
  'uif_number',
  'custom_tax_registrations',
  'company_secretary',
  'auditor',
  'independent_reviewer',
  'accounting_officer',
  'directors',
  'principal_bankers',
  'prepared_by',
  'reviewed_by',
  'partner',
  'approved_by',
] as const;

function extractOfficers(engagement: EngagementRow): OfficerMasterEntry[] {
  if (!engagement) return [];
  const officers: OfficerMasterEntry[] = [];
  const preparer = str(engagement.prepared_by);
  const reviewer = str(engagement.reviewed_by);
  const partner = str(engagement.partner) ?? str(engagement.approved_by);
  if (preparer) officers.push({ role: 'preparer', name: preparer });
  if (reviewer) officers.push({ role: 'reviewer', name: reviewer });
  if (partner) officers.push({ role: 'partner', name: partner });
  return officers;
}

/** Extract company master data modules from a legacy engagement row. */
export function extractMasterDataFromEngagement(
  engagement: EngagementRow,
): Omit<CompanyMasterData, 'id' | 'company_id' | 'updated_at'> {
  const base = emptyCompanyMasterData();
  if (!engagement) return base;

  return {
    company_profile: {
      registered_name: str(engagement.registered_name),
      trading_name: str(engagement.trading_name),
      registration_number: str(engagement.registration_number),
      nature_of_business: str(engagement.nature_of_business),
      country_of_incorporation: str(engagement.country_of_incorporation),
      entity_type: str(engagement.entity_type),
    },
    addresses: {
      registered_office: str(engagement.registered_office),
      business_address: str(engagement.business_address),
      postal_address: str(engagement.postal_address),
      physical_address: str(engagement.physical_address),
      website: str(engagement.website),
      email: str(engagement.email) ?? str(engagement.contact_information),
      telephone: str(engagement.telephone),
    },
    tax_registrations: {
      vat_number: str(engagement.vat_number),
      income_tax_number: str(engagement.income_tax_number),
      paye_number: str(engagement.paye_number),
      sdl_number: str(engagement.sdl_number),
      uif_number: str(engagement.uif_number),
      custom_tax_registrations: Array.isArray(engagement.custom_tax_registrations)
        ? (engagement.custom_tax_registrations as CompanyMasterData['tax_registrations']['custom_tax_registrations'])
        : [],
    },
    directors: Array.isArray(engagement.directors)
      ? (engagement.directors as CompanyMasterData['directors'])
      : [],
    governance: {
      company_secretary: str(engagement.company_secretary),
      auditor: str(engagement.auditor),
      independent_reviewer: str(engagement.independent_reviewer),
      accounting_officer: str(engagement.accounting_officer),
    },
    officers: extractOfficers(engagement),
    principal_bankers: Array.isArray(engagement.principal_bankers)
      ? (engagement.principal_bankers as CompanyMasterData['principal_bankers'])
      : [],
  };
}

function engagementHasMigratableData(engagement: EngagementRow): boolean {
  if (!engagement) return false;
  const extracted = extractMasterDataFromEngagement(engagement);
  return !isMasterDataEmpty(extracted);
}

export type MasterDataRowWithMigration = CompanyMasterData & {
  legacy_migration_completed_at?: string | null;
};

/** Whether legacy hydration should run for this company master row. */
export function needsLegacyHydration(
  master: MasterDataRowWithMigration | null | undefined,
  engagement: EngagementRow,
): boolean {
  if (master?.legacy_migration_completed_at) return false;
  if (!isMasterDataEmpty(master)) return false;
  return engagementHasMigratableData(engagement);
}

/**
 * Build hydrated master data row from legacy engagement.
 * Idempotent: returns null when migration is not required.
 */
export function buildLegacyHydratedMasterRow(
  companyId: string,
  master: MasterDataRowWithMigration | null | undefined,
  engagement: EngagementRow,
): (MasterDataRowWithMigration & { company_id: string }) | null {
  if (!needsLegacyHydration(master, engagement)) return null;

  const extracted = extractMasterDataFromEngagement(engagement);
  const now = new Date().toISOString();

  return {
    company_id: companyId,
    company_profile: extracted.company_profile,
    addresses: extracted.addresses,
    tax_registrations: extracted.tax_registrations,
    directors: extracted.directors,
    governance: extracted.governance,
    officers: extracted.officers,
    principal_bankers: extracted.principal_bankers,
    legacy_migration_completed_at: now,
    updated_at: now,
  };
}

/** Strip deprecated master-data fields from an engagement upsert payload. */
export function stripLegacyMasterFieldsFromEngagement(
  info: Record<string, unknown>,
): Record<string, unknown> {
  const engagementOnly: Record<string, unknown> = {};
  for (const key of ENGAGEMENT_ONLY_FIELDS) {
    if (key in info) engagementOnly[key] = info[key];
  }
  return engagementOnly;
}
