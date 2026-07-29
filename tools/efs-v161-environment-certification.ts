/**
 * V16.1 — Environment certification probe (read-only evidence).
 * Run: npx tsx tools/efs-v161-environment-certification.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[t.slice(0, eq).trim()] = v;
  }
}

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_ANON_KEY!;
  const projectRef = url.match(/https:\/\/([^.]+)/)?.[1] ?? 'unknown';

  const client = createClient(url, anon, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (signIn.error || !signIn.data.session) throw new Error(signIn.error?.message || 'auth failed');
  const token = signIn.data.session.access_token;
  const headers = {
    apikey: anon,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // OpenAPI schema inventory
  const openapiRes = await fetch(`${url}/rest/v1/`, { headers });
  const openapi = await openapiRes.json();
  const definitions = openapi?.definitions ? Object.keys(openapi.definitions).sort() : [];
  const efsTables = definitions.filter((t: string) => t.startsWith('efs_'));
  const hasMaster = definitions.includes('efs_company_master_data');

  // Direct probe
  const probeRes = await fetch(
    `${url}/rest/v1/efs_company_master_data?select=*&limit=1`,
    { headers },
  );
  const probeText = await probeRes.text();
  let probeBody: unknown;
  try {
    probeBody = JSON.parse(probeText);
  } catch {
    probeBody = probeText;
  }

  // Column probe if table exists
  let columnProbe: unknown = null;
  if (probeRes.ok) {
    const cols =
      'id,company_id,company_profile,addresses,tax_registrations,directors,governance,officers,principal_bankers,created_at,updated_at,legacy_migration_completed_at';
    const colRes = await fetch(
      `${url}/rest/v1/efs_company_master_data?select=${cols}&limit=1`,
      { headers },
    );
    columnProbe = { status: colRes.status, body: await colRes.json().catch(() => null) };
  }

  // Edge function probe
  const edgeMethods = [
    'VERIFY_V161_DEPLOYMENT',
    'GET_COMPANY_MASTER_DATA',
    'GET_FINANCIAL_STATEMENTS_HOME',
  ];
  const companyId = (
    await client.from('company_users').select('company_id').limit(1)
  ).data?.[0]?.company_id;

  const edgeResults: Record<string, unknown> = {};
  for (const method of edgeMethods) {
    const r = await fetch(`${url}/functions/v1/financial-statements`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method, company_id: companyId }),
    });
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
    edgeResults[method] = {
      http_status: r.status,
      code: (body as { code?: string })?.code,
      error: (body as { error?: string })?.error,
      deploymentStatus: (body as { deploymentStatus?: string })?.deploymentStatus,
      readiness: (body as { readiness?: string })?.readiness,
      edgeFunctionVersion: (body as { edgeFunctionVersion?: string })?.edgeFunctionVersion,
      has_empty_addresses:
        body &&
        typeof body === 'object' &&
        'addresses' in body &&
        JSON.stringify((body as { addresses?: unknown }).addresses) === '{}',
      keys:
        body && typeof body === 'object' && !Array.isArray(body)
          ? Object.keys(body as object).slice(0, 20)
          : null,
    };
  }

  // Local migration inventory
  const migDir = join(process.cwd(), 'supabase', 'migrations');
  const localMigrations = readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const v161Migrations = localMigrations.filter((f) => f.includes('v161') || f.includes('16_1') || f.includes('161'));

  const evidence = {
    certifiedAt: new Date().toISOString(),
    version: '16.1',
    project: {
      url,
      ref: projectRef,
      linked_name: 'Smart Accounting',
    },
    openapi: {
      http_status: openapiRes.status,
      definition_count: definitions.length,
      efs_table_count: efsTables.length,
      efs_tables: efsTables,
      efs_company_master_data_in_schema: hasMaster,
    },
    table_probe: {
      http_status: probeRes.status,
      body: probeBody,
    },
    column_probe: columnProbe,
    edge: edgeResults,
    local_migrations: {
      total: localMigrations.length,
      v161: v161Migrations,
      expected: [
        '20260721120000_efs_v161_company_master_data.sql',
        '20260721130000_efs_v161_legacy_master_data_migration.sql',
      ],
      expected_present_locally: [
        '20260721120000_efs_v161_company_master_data.sql',
        '20260721130000_efs_v161_legacy_master_data_migration.sql',
      ].map((f) => ({
        file: f,
        exists: localMigrations.includes(f),
      })),
    },
  };

  const outDir = join(
    process.cwd(),
    'docs',
    'financial-statements-certification',
    'V16.1',
    'evidence',
  );
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'environment-certification-evidence.json');
  writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`\nEvidence: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
