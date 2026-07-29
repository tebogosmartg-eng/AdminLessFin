/**
 * Deeper environment inventory — PostgREST table presence + edge technical messages.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[t.slice(0, eq).trim()] = v;
  }
}

const CANDIDATE_EFS_TABLES = [
  'efs_company_master_data',
  'efs_engagement_general_information',
  'efs_reporting_workspaces',
  'efs_reporting_periods',
  'efs_reporting_entities',
  'efs_framework_packs',
  'efs_framework_bindings',
  'efs_snapshot_versions',
  'efs_statement_instances',
  'efs_statement_lines',
  'efs_publication_packs',
  'efs_publication_records',
  'efs_publication_artifacts',
  'efs_working_papers',
  'efs_review_packs',
  'efs_validation_runs',
  'efs_disclosure_nodes',
  'efs_note_instances',
  'efs_activity_log',
  'efs_canonical_trial_balances',
];

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
  const headers = { apikey: anon, Authorization: `Bearer ${token}` };

  const inventory: Array<{ table: string; status: number; code?: string; message?: string; present: boolean }> = [];
  for (const table of CANDIDATE_EFS_TABLES) {
    const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, { headers });
    const body = await r.json().catch(() => ({}));
    inventory.push({
      table: `public.${table}`,
      status: r.status,
      code: body.code,
      message: body.message,
      present: r.ok || r.status === 200 || (r.status === 206) || (Array.isArray(body)),
    });
    // 200 with [] or content-range 0-0 means present
    if (r.status === 200 || r.status === 206 || (r.status === 404 && body.code !== 'PGRST205')) {
      inventory[inventory.length - 1].present = body.code !== 'PGRST205';
    }
    if (body.code === 'PGRST205') inventory[inventory.length - 1].present = false;
    if (r.ok) inventory[inventory.length - 1].present = true;
  }

  const companyId = (await client.from('company_users').select('company_id').limit(1)).data?.[0]
    ?.company_id;

  async function edge(method: string, payload: Record<string, unknown> = {}) {
    const r = await fetch(`${url}/functions/v1/financial-statements`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, company_id: companyId, ...payload }),
    });
    const body = await r.json().catch(() => ({}));
    return {
      method,
      http_status: r.status,
      code: body.code,
      category: body.category,
      technicalMessage: body.technicalMessage,
      businessMessage: body.businessMessage,
      error: body.error,
      originalCause: body.originalCause?.slice?.(0, 400) ?? body.originalCause,
      deploymentStatus: body.deploymentStatus,
      readiness: body.readiness,
      sample: body.addresses !== undefined ? { addresses: body.addresses, updated_at: body.updated_at } : undefined,
    };
  }

  const edgeDetail = {
    VERIFY_V161_DEPLOYMENT: await edge('VERIFY_V161_DEPLOYMENT'),
    GET_COMPANY_MASTER_DATA: await edge('GET_COMPANY_MASTER_DATA'),
    GET_WORKSPACE_GENERAL_INFORMATION: await edge('GET_WORKSPACE_GENERAL_INFORMATION', {
      workspace_id: '66a7ad84-2eaf-4b9e-8423-89019ba3c6b3',
    }),
  };

  // OpenAPI with auth
  const openapiRes = await fetch(`${url}/rest/v1/`, {
    headers: { ...headers, Accept: 'application/openapi+json' },
  });
  const openapiText = await openapiRes.text();
  let openapiDefs: string[] = [];
  try {
    const oj = JSON.parse(openapiText);
    openapiDefs = oj.definitions ? Object.keys(oj.definitions).filter((k: string) => k.startsWith('efs_')).sort() : [];
  } catch {
    openapiDefs = [];
  }

  const out = {
    at: new Date().toISOString(),
    project_ref: 'zaulhnpohrgqqodvzhxp',
    table_inventory: inventory,
    present_efs_tables: inventory.filter((i) => i.present).map((i) => i.table),
    missing_efs_candidates: inventory.filter((i) => !i.present).map((i) => i.table),
    openapi_efs_tables: openapiDefs,
    openapi_status: openapiRes.status,
    edge_detail: edgeDetail,
  };

  const path = join(
    process.cwd(),
    'docs/financial-statements-certification/V16.1/evidence/environment-inventory-detail.json',
  );
  mkdirSync(join(process.cwd(), 'docs/financial-statements-certification/V16.1/evidence'), {
    recursive: true,
  });
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch(console.error);
