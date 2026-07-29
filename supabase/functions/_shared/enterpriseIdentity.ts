/**
 * Edge helper — resolve enterprise company identity from efs_company_master_data.
 * G3.6C: ONE source. Do not read companies.name/address/tax_id for identity.
 */
// @ts-nocheck

function str(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

/**
 * @param {import('https://esm.sh/@supabase/supabase-js@2.45.0').SupabaseClient} client
 * @param {string} companyId
 * @returns {Promise<{ name: string, address: string, taxId: string }>}
 */
export async function resolveEnterpriseIdentityEdge(client, companyId) {
  const { data: master, error } = await client
    .from('efs_company_master_data')
    .select('company_profile, addresses, tax_registrations')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    console.warn(JSON.stringify({
      event: 'enterprise_identity_resolve_failed',
      company_id: companyId,
      message: error.message,
    }));
  }

  const profile = master?.company_profile || {};
  const addresses = master?.addresses || {};
  const tax = master?.tax_registrations || {};

  return {
    name:
      str(profile.registered_name) ||
      str(profile.trading_name) ||
      'Your Company',
    address:
      str(addresses.business_address) ||
      str(addresses.registered_office) ||
      str(addresses.physical_address) ||
      str(addresses.postal_address) ||
      '',
    taxId:
      str(tax.income_tax_number) ||
      str(tax.vat_number) ||
      '',
  };
}
