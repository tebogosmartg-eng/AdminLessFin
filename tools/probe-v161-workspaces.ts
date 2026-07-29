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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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
  const headers = { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` };

  const { data: workspaces } = await client
    .from('efs_reporting_workspaces')
    .select('id, name, updated_at')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });

  console.log('Workspaces:', JSON.stringify(workspaces, null, 2));

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
    console.log('\n', ws.name, ws.id);
    console.log('  registered_office:', gi?.registered_office ? 'YES' : 'NO', gi?.updated_at);
    console.log('  registered_name:', gi?.registered_name);
  }

  const masterR = await fetch(`${url}/functions/v1/financial-statements`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method: 'GET_COMPANY_MASTER_DATA', company_id: companyId }),
  });
  console.log('\nMaster after GET:', JSON.stringify(await masterR.json(), null, 2));
}

main().catch(console.error);
