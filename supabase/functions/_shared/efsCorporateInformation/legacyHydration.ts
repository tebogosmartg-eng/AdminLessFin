/**
 * V16.1 — Edge legacy engagement → company master data hydration.
 */

type MasterRow = {
  company_profile?: Record<string, unknown>;
  addresses?: Record<string, unknown>;
  tax_registrations?: Record<string, unknown>;
  directors?: unknown[];
  governance?: Record<string, unknown>;
  officers?: Array<{ role?: string; name?: string }>;
  principal_bankers?: unknown[];
  legacy_migration_completed_at?: string | null;
} | null;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function hasModuleData(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return !!value.trim();
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasModuleData);
  }
  return false;
}

export function isMasterDataEmpty(master: MasterRow): boolean {
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

export const ENGAGEMENT_ONLY_FIELDS = [
  "financial_year_end",
  "comparative_period",
  "functional_currency",
  "reporting_currency",
  "approval_date",
  "authorisation_date",
  "issue_date",
  "reporting_framework",
  "engagement_type",
  "compilation_engagement",
  "share_information",
] as const;

function extractOfficers(engagement: Record<string, unknown> | null) {
  if (!engagement) return [];
  const officers: Array<{ role: string; name: string }> = [];
  const preparer = str(engagement.prepared_by);
  const reviewer = str(engagement.reviewed_by);
  const partner = str(engagement.partner) ?? str(engagement.approved_by);
  if (preparer) officers.push({ role: "preparer", name: preparer });
  if (reviewer) officers.push({ role: "reviewer", name: reviewer });
  if (partner) officers.push({ role: "partner", name: partner });
  return officers;
}

export function extractMasterDataFromEngagement(engagement: Record<string, unknown> | null) {
  return {
    company_profile: {
      registered_name: str(engagement?.registered_name),
      trading_name: str(engagement?.trading_name),
      registration_number: str(engagement?.registration_number),
      nature_of_business: str(engagement?.nature_of_business),
      country_of_incorporation: str(engagement?.country_of_incorporation),
      entity_type: str(engagement?.entity_type),
    },
    addresses: {
      registered_office: str(engagement?.registered_office),
      business_address: str(engagement?.business_address),
      postal_address: str(engagement?.postal_address),
      physical_address: str(engagement?.physical_address),
      website: str(engagement?.website),
      email: str(engagement?.email) ?? str(engagement?.contact_information),
      telephone: str(engagement?.telephone),
    },
    tax_registrations: {
      vat_number: str(engagement?.vat_number),
      income_tax_number: str(engagement?.income_tax_number),
      paye_number: str(engagement?.paye_number),
      sdl_number: str(engagement?.sdl_number),
      uif_number: str(engagement?.uif_number),
      custom_tax_registrations: Array.isArray(engagement?.custom_tax_registrations)
        ? engagement.custom_tax_registrations
        : [],
    },
    directors: Array.isArray(engagement?.directors) ? engagement.directors : [],
    governance: {
      company_secretary: str(engagement?.company_secretary),
      auditor: str(engagement?.auditor),
      independent_reviewer: str(engagement?.independent_reviewer),
      accounting_officer: str(engagement?.accounting_officer),
    },
    officers: extractOfficers(engagement),
    principal_bankers: Array.isArray(engagement?.principal_bankers)
      ? engagement.principal_bankers
      : [],
  };
}

function engagementHasMigratableData(engagement: Record<string, unknown> | null): boolean {
  if (!engagement) return false;
  const extracted = extractMasterDataFromEngagement(engagement);
  return !isMasterDataEmpty(extracted);
}

export function needsLegacyHydration(
  master: MasterRow,
  engagement: Record<string, unknown> | null,
): boolean {
  if (master?.legacy_migration_completed_at) return false;
  if (!isMasterDataEmpty(master)) return false;
  return engagementHasMigratableData(engagement);
}

export function buildLegacyHydratedMasterRow(
  companyId: string,
  master: MasterRow,
  engagement: Record<string, unknown> | null,
) {
  if (!needsLegacyHydration(master, engagement)) return null;

  const extracted = extractMasterDataFromEngagement(engagement);
  const now = new Date().toISOString();

  return {
    company_id: companyId,
    ...extracted,
    legacy_migration_completed_at: now,
    updated_at: now,
  };
}

export function stripLegacyMasterFieldsFromEngagement(info: Record<string, unknown>) {
  const engagementOnly: Record<string, unknown> = {};
  for (const key of ENGAGEMENT_ONLY_FIELDS) {
    if (key in info) engagementOnly[key] = info[key];
  }
  return engagementOnly;
}
