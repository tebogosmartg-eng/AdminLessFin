/**
 * Probe financial-statements edge for 500 errors (V16.1 incident).
 * Run: npx tsx scripts/probe-efs-500.ts
 */
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

async function probe(
  url: string,
  anon: string,
  token: string,
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
) {
  const body = { method, company_id: companyId, ...payload };
  const res = await fetch(`${url}/functions/v1/financial-statements`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 800);
  }
  return { method, status: res.status, body: parsed };
}

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!url || !anon || !email || !password) {
    throw new Error('Missing VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, or E2E_PASSWORD');
  }

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    throw new Error(`signin failed: ${signIn.error?.message}`);
  }
  const token = signIn.data.session.access_token;

  const { data: memberships, error: memErr } = await client
    .from('company_users')
    .select('company_id')
    .limit(5);
  if (memErr) throw memErr;
  const companyId = memberships?.[0]?.company_id;
  if (!companyId) throw new Error('No company membership for E2E user');

  const { data: workspaces } = await client
    .from('efs_reporting_workspaces')
    .select('id')
    .eq('company_id', companyId)
    .limit(1);
  const workspaceId = workspaces?.[0]?.id ?? null;

  console.log(JSON.stringify({ companyId, workspaceId }, null, 2));

  const methods: Array<[string, Record<string, unknown>?]> = [
    ['LIST_FRAMEWORK_PACKS'],
    ['GET_COMPANY_MASTER_DATA'],
    ['GET_WORKSPACE_GENERAL_INFORMATION', { workspace_id: workspaceId }],
    ['GET_WORKSPACE_DASHBOARD', { workspace_id: workspaceId }],
    ['ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR'],
    ['GET_VALIDATION_DASHBOARD', { workspace_id: workspaceId }],
    ['RUN_VALIDATION', { workspace_id: workspaceId }],
  ];

  for (const [method, payload] of methods) {
    if (payload?.workspace_id == null && method.includes('WORKSPACE')) {
      console.log(JSON.stringify({ method, status: 'SKIP', reason: 'no workspace' }));
      continue;
    }
    const result = await probe(url, anon, token, companyId, method, payload ?? {});
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
