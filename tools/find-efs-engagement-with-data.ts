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

  const { data: memberships } = await client.from('company_users').select('company_id, companies(name)').limit(20);
  console.log('Memberships:', JSON.stringify(memberships, null, 2));

  const headers = {
    'Content-Type': 'application/json',
    apikey: anon,
    Authorization: `Bearer ${token}`,
  };

  for (const m of memberships || []) {
    const companyId = m.company_id;
    const { data: workspaces } = await client
      .from('efs_reporting_workspaces')
      .select('id, name, updated_at')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(5);

    for (const ws of workspaces || []) {
      const r = await fetch(`${url}/functions/v1/financial-statements`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          method: 'GET_WORKSPACE_GENERAL_INFORMATION',
          company_id: companyId,
          workspace_id: ws.id,
        }),
      });
      const gi = await r.json();
      const masterR = await fetch(`${url}/functions/v1/financial-statements`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          method: 'GET_COMPANY_MASTER_DATA',
          company_id: companyId,
        }),
      });
      const master = await masterR.json();
      const hasGi =
        gi?.registered_office ||
        gi?.registration_number ||
        gi?.auditor ||
        gi?.registered_name;
      const hasMaster =
        master?.addresses?.registered_office ||
        master?.company_profile?.registration_number ||
        master?.governance?.auditor ||
        master?.legacy_migration_completed_at;
      if (hasGi || hasMaster) {
        console.log('\n--- CANDIDATE ---');
        console.log(JSON.stringify({ companyId, workspace: ws, hasGi, hasMaster, gi, master_sample: {
          migration: master?.legacy_migration_completed_at,
          registered_office: master?.addresses?.registered_office || gi?.registered_office,
          registration_number: master?.company_profile?.registration_number || gi?.registration_number,
        }}, null, 2));
      }
    }
  }
}

main().catch(console.error);
