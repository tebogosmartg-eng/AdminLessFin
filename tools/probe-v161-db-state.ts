import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  const content = readFileSync(join(process.cwd(), '.env'), 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[trimmed.slice(0, eq).trim()] = val;
  }
}

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  const token = signIn.data.session!.access_token;
  const companyId = '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';
  const workspaceId = '12606f93-a8bf-4b98-b42e-5c8e5fa4c54a';
  const headers = {
    'Content-Type': 'application/json',
    apikey: anon,
    Authorization: `Bearer ${token}`,
  };

  async function efs(method: string, payload: Record<string, unknown> = {}) {
    const r = await fetch(`${url}/functions/v1/financial-statements`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method, company_id: companyId, ...payload }),
    });
    return r.json();
  }

  const master = await efs('GET_COMPANY_MASTER_DATA');
  const gi = await efs('GET_WORKSPACE_GENERAL_INFORMATION', { workspace_id: workspaceId });
  const { data: legacy } = await client
    .from('efs_engagement_general_information')
    .select(
      'registered_office,business_address,postal_address,telephone,auditor,company_secretary,prepared_by,registration_number,vat_number,directors,principal_bankers,registered_name',
    )
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const { data: masterRow } = await client
    .from('efs_company_master_data')
    .select('company_id,legacy_migration_completed_at,addresses,governance,company_profile,tax_registrations,officers,directors,principal_bankers')
    .eq('company_id', companyId)
    .maybeSingle();

  console.log(
    JSON.stringify(
      {
        master_api: master,
        gi_api: {
          registered_office: gi?.registered_office,
          business_address: gi?.business_address,
          registration_number: gi?.registration_number,
          auditor: gi?.auditor,
          prepared_by: gi?.prepared_by,
        },
        legacy_row: legacy,
        master_row: masterRow,
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
