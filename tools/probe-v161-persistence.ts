/**
 * V16.1 Persistence Investigation — prove why ensureLegacyMasterDataMigration does not persist.
 * Focus: UPSERT → Immediate SELECT only.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  buildLegacyHydratedMasterRow,
  needsLegacyHydration,
  isMasterDataEmpty,
} from '../src/lib/financialStatements/masterData/legacyHydration';

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

const COMPANY_ID = '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';
const WORKSPACE_ID = '66a7ad84-2eaf-4b9e-8423-89019ba3c6b3';

async function main() {
  loadEnv();
  const url = process.env.VITE_SUPABASE_URL!;
  const anon = process.env.VITE_SUPABASE_ANON_KEY!;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (signIn.error || !signIn.data.session) throw new Error(signIn.error?.message || 'auth failed');
  const token = signIn.data.session.access_token;
  const headers = {
    'Content-Type': 'application/json',
    apikey: anon,
    Authorization: `Bearer ${token}`,
    Prefer: 'return=representation',
  };

  const evidence: Record<string, unknown> = {
    company_id: COMPANY_ID,
    workspace_id: WORKSPACE_ID,
    project_url: url,
    steps: [] as unknown[],
  };

  function step(name: string, data: unknown) {
    (evidence.steps as unknown[]).push({ name, at: new Date().toISOString(), data });
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(data, null, 2));
  }

  // STEP A: Direct PostgREST SELECT before any write
  const selBefore = await fetch(
    `${url}/rest/v1/efs_company_master_data?company_id=eq.${COMPANY_ID}&select=*`,
    { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
  );
  const selBeforeBody = await selBefore.text();
  step('1. IMMEDIATE SELECT before (PostgREST)', {
    http_status: selBefore.status,
    content_range: selBefore.headers.get('content-range'),
    body: tryJson(selBeforeBody),
  });

  // STEP B: OpenAPI / column probe — try select legacy_migration_completed_at
  const colProbe = await fetch(
    `${url}/rest/v1/efs_company_master_data?company_id=eq.${COMPANY_ID}&select=legacy_migration_completed_at`,
    { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
  );
  const colProbeBody = await colProbe.text();
  step('2. COLUMN PROBE legacy_migration_completed_at', {
    http_status: colProbe.status,
    body: tryJson(colProbeBody),
  });

  // STEP C: Load engagement via edge (triggers ensureLegacyMasterDataMigration)
  const giRes = await fetch(`${url}/functions/v1/financial-statements`, {
    method: 'POST',
    headers: { ...headers, Prefer: undefined as unknown as string },
    body: JSON.stringify({
      method: 'GET_WORKSPACE_GENERAL_INFORMATION',
      company_id: COMPANY_ID,
      workspace_id: WORKSPACE_ID,
    }),
  });
  const gi = await giRes.json();
  step('3. GET_WORKSPACE_GENERAL_INFORMATION (triggers migration path)', {
    http_status: giRes.status,
    registered_office: gi?.registered_office,
    registration_number: gi?.registration_number,
  });

  // STEP D: Build expected UPSERT payload locally (same as edge)
  const { data: masterClientRows, error: masterClientErr } = await client
    .from('efs_company_master_data')
    .select('*')
    .eq('company_id', COMPANY_ID)
    .maybeSingle();
  step('4. Client SELECT master (authenticated role)', {
    error: masterClientErr,
    row: masterClientRows,
    is_empty: isMasterDataEmpty(masterClientRows as never),
    needs_hydration: needsLegacyHydration(masterClientRows as never, gi as never),
  });

  const expectedPayload = buildLegacyHydratedMasterRow(
    COMPANY_ID,
    masterClientRows as never,
    gi as never,
  );
  step('5. Expected UPSERT payload (buildLegacyHydratedMasterRow)', expectedPayload);

  // STEP E: Attempt UPSERT as authenticated user (same RLS path as mutate policy)
  // This isolates: does PostgREST accept the payload / columns?
  if (expectedPayload) {
    const upsertRes = await fetch(`${url}/rest/v1/efs_company_master_data?on_conflict=company_id`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(expectedPayload),
    });
    const upsertBody = await upsertRes.text();
    step('6. AUTHENTICATED UPSERT (PostgREST) — same SQL surface as edge', {
      http_status: upsertRes.status,
      prefer: upsertRes.headers.get('preference-applied'),
      content_range: upsertRes.headers.get('content-range'),
      body: tryJson(upsertBody),
    });

    // STEP F: Immediate SELECT after UPSERT
    const selAfter = await fetch(
      `${url}/rest/v1/efs_company_master_data?company_id=eq.${COMPANY_ID}&select=*`,
      { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
    );
    const selAfterBody = await selAfter.text();
    step('7. IMMEDIATE SELECT after UPSERT', {
      http_status: selAfter.status,
      content_range: selAfter.headers.get('content-range'),
      body: tryJson(selAfterBody),
    });
  } else {
    step('6. SKIP UPSERT', { reason: 'buildLegacyHydratedMasterRow returned null — migration not needed or blocked' });
  }

  // STEP G: Call GET_COMPANY_MASTER_DATA edge (also runs ensureLegacyMasterDataMigration)
  const masterEdge = await fetch(`${url}/functions/v1/financial-statements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ method: 'GET_COMPANY_MASTER_DATA', company_id: COMPANY_ID }),
  });
  const masterEdgeBody = await masterEdge.json();
  step('8. GET_COMPANY_MASTER_DATA edge response', {
    http_status: masterEdge.status,
    body: masterEdgeBody,
  });

  // STEP H: Try UPSERT WITHOUT legacy_migration_completed_at (column may be missing)
  const payloadWithoutMarker = expectedPayload
    ? Object.fromEntries(
        Object.entries(expectedPayload).filter(([k]) => k !== 'legacy_migration_completed_at'),
      )
    : null;
  if (payloadWithoutMarker) {
    const upsert2 = await fetch(`${url}/rest/v1/efs_company_master_data?on_conflict=company_id`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payloadWithoutMarker),
    });
    const upsert2Body = await upsert2.text();
    step('9. UPSERT without legacy_migration_completed_at', {
      http_status: upsert2.status,
      body: tryJson(upsert2Body),
    });

    const sel2 = await fetch(
      `${url}/rest/v1/efs_company_master_data?company_id=eq.${COMPANY_ID}&select=*`,
      { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
    );
    step('10. SELECT after UPSERT without marker', {
      http_status: sel2.status,
      body: tryJson(await sel2.text()),
    });
  }

  // STEP I: OpenAPI columns for table
  const openapi = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  const openapiJson = await openapi.json();
  const defs = openapiJson?.definitions?.efs_company_master_data;
  step('11. PostgREST OpenAPI columns for efs_company_master_data', {
    properties: defs?.properties ? Object.keys(defs.properties) : null,
    required: defs?.required ?? null,
  });

  mkdirSync(join(process.cwd(), 'docs', 'financial-statements-certification', 'V16.1', 'evidence'), {
    recursive: true,
  });
  const out = join(
    process.cwd(),
    'docs',
    'financial-statements-certification',
    'V16.1',
    'evidence',
    'persistence-investigation.json',
  );
  writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(`\nEvidence written: ${out}`);
}

function tryJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
