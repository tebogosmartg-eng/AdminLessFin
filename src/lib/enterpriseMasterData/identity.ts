/**
 * Enterprise Master Data — Company Identity resolution (G3.6C Consumer Unification).
 *
 * ONE source: efs_company_master_data via getCompanyMasterData.
 * Consumers must NOT read companies.name / address / tax_id for identity.
 */
import { getCompanyMasterData } from '@/lib/financialStatements/masterData';
import type { CompanyMasterData } from '@/lib/financialStatements/masterData';

export type EnterpriseIdentity = {
  companyId: string;
  /** Legal / registered name for documents, emails, PDFs. */
  name: string;
  tradingName: string | null;
  /** Primary postal/business address for commercial documents. */
  address: string;
  /** Primary tax identifier (income tax, else VAT). */
  taxId: string;
  /** Company email used as Reply-To / From on outbound mail. */
  email: string;
  registrationNumber: string | null;
  vatNumber: string | null;
};

function str(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

/** Pure projection: master row → enterprise identity (no secondary store). */
export function identityFromMaster(
  companyId: string,
  master: CompanyMasterData | null | undefined,
): EnterpriseIdentity {
  const profile = master?.company_profile || {};
  const addresses = master?.addresses || {};
  const tax = master?.tax_registrations || {};

  const name =
    str(profile.registered_name) ||
    str(profile.trading_name) ||
    '';

  const address =
    str(addresses.business_address) ||
    str(addresses.registered_office) ||
    str(addresses.physical_address) ||
    str(addresses.postal_address) ||
    '';

  const taxId =
    str(tax.income_tax_number) ||
    str(tax.vat_number) ||
    '';

  return {
    companyId,
    name,
    tradingName: str(profile.trading_name) || null,
    address,
    taxId,
    email: str(addresses.email),
    registrationNumber: str(profile.registration_number) || null,
    vatNumber: str(tax.vat_number) || null,
  };
}

/** Authoritative async resolve — single persistence path. */
export async function resolveEnterpriseIdentity(companyId: string): Promise<EnterpriseIdentity> {
  const master = await getCompanyMasterData(companyId);
  return identityFromMaster(companyId, master);
}

/** Shape compatible with legacy InvoicePreview / QuotePreview `company` prop. */
export function identityAsCompanyProp(identity: EnterpriseIdentity): {
  id: string;
  name: string;
  address: string;
  tax_id: string;
  email: string;
  logo_url?: string | null;
} {
  return {
    id: identity.companyId,
    name: identity.name || 'Your Company',
    address: identity.address || '',
    tax_id: identity.taxId || '',
    email: identity.email || '',
  };
}
