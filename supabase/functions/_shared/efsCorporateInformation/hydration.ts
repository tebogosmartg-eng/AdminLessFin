/**
 * V16.1 — Edge hydration for company master data → engagement general information.
 */

type MasterRow = {
  company_profile?: Record<string, unknown>;
  addresses?: Record<string, unknown>;
  tax_registrations?: Record<string, unknown>;
  directors?: unknown[];
  governance?: Record<string, unknown>;
  officers?: Array<{ role?: string; name?: string }>;
  principal_bankers?: unknown[];
} | null;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function hydrateWorkspaceFromMasterData(
  engagement: Record<string, unknown> | null,
  master: MasterRow,
): Record<string, unknown> {
  const base = { ...(engagement || {}) };
  if (!master) return base;

  const profile = master.company_profile || {};
  const addresses = master.addresses || {};
  const tax = master.tax_registrations || {};
  const governance = master.governance || {};

  return {
    ...base,
    registered_name: str(profile.registered_name) ?? base.registered_name,
    trading_name: str(profile.trading_name) ?? base.trading_name,
    registration_number: str(profile.registration_number) ?? base.registration_number,
    nature_of_business: str(profile.nature_of_business) ?? base.nature_of_business,
    country_of_incorporation: str(profile.country_of_incorporation) ?? base.country_of_incorporation,
    entity_type: str(profile.entity_type) ?? base.entity_type,
    registered_office: str(addresses.registered_office) ?? base.registered_office,
    business_address: str(addresses.business_address) ?? base.business_address,
    postal_address: str(addresses.postal_address) ?? base.postal_address,
    physical_address: str(addresses.physical_address) ?? base.physical_address,
    website: str(addresses.website) ?? base.website,
    email: str(addresses.email) ?? base.email,
    telephone: str(addresses.telephone) ?? base.telephone,
    contact_information:
      str(addresses.telephone) ?? str(addresses.email) ?? base.contact_information,
    vat_number: str(tax.vat_number) ?? base.vat_number,
    income_tax_number: str(tax.income_tax_number) ?? base.income_tax_number,
    paye_number: str(tax.paye_number) ?? base.paye_number,
    sdl_number: str(tax.sdl_number) ?? base.sdl_number,
    uif_number: str(tax.uif_number) ?? base.uif_number,
    custom_tax_registrations:
      Array.isArray(tax.custom_tax_registrations) && tax.custom_tax_registrations.length
        ? tax.custom_tax_registrations
        : base.custom_tax_registrations,
    company_secretary: str(governance.company_secretary) ?? base.company_secretary,
    auditor: str(governance.auditor) ?? base.auditor,
    independent_reviewer: str(governance.independent_reviewer) ?? base.independent_reviewer,
    accounting_officer: str(governance.accounting_officer) ?? base.accounting_officer,
    directors: Array.isArray(master.directors) && master.directors.length
      ? master.directors
      : base.directors,
    principal_bankers:
      Array.isArray(master.principal_bankers) && master.principal_bankers.length
        ? master.principal_bankers
        : base.principal_bankers,
    prepared_by:
      master.officers?.find((o) => o.role === 'preparer')?.name ?? base.prepared_by,
    reviewed_by:
      master.officers?.find((o) => o.role === 'reviewer')?.name ?? base.reviewed_by,
    partner:
      master.officers?.find((o) => o.role === 'partner')?.name ?? base.partner ?? base.approved_by,
    approved_by:
      master.officers?.find((o) => o.role === 'partner')?.name ?? base.approved_by,
  };
}

export const MASTER_DATA_MODULE_COLUMNS = [
  'company_profile',
  'addresses',
  'tax_registrations',
  'directors',
  'governance',
  'officers',
  'principal_bankers',
] as const;

export type MasterDataModuleColumn = (typeof MASTER_DATA_MODULE_COLUMNS)[number];

export function emptyMasterDataRow(companyId: string) {
  /**
   * Insert scaffolding only — permitted after schema verification succeeds.
   * Must never be returned as a fallback when the table is missing.
   */
  return {
    company_id: companyId,
    company_profile: {},
    addresses: {},
    tax_registrations: {},
    directors: [],
    governance: {},
    officers: [],
    principal_bankers: [],
    updated_at: new Date().toISOString(),
  };
}
