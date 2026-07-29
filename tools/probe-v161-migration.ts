import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildLegacyHydratedMasterRow,
  isMasterDataEmpty,
  needsLegacyHydration,
} from '../src/lib/financialStatements/masterData/legacyHydration';

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
  const workspaceId = '66a7ad84-2eaf-4b9e-8423-89019ba3c6b3';
  const headers = { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` };

  async function efs(method: string, payload: Record<string, unknown> = {}) {
    const r = await fetch(`${url}/functions/v1/financial-statements`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method, company_id: companyId, ...payload }),
    });
    return r.json();
  }

  const gi = await efs('GET_WORKSPACE_GENERAL_INFORMATION', { workspace_id: workspaceId });
  const masterBefore = await efs('GET_COMPANY_MASTER_DATA');
  const masterAfterGi = await efs('GET_COMPANY_MASTER_DATA');

  const masterRow = masterBefore as Record<string, unknown>;
  const needs = needsLegacyHydration(masterRow as never, gi as never);
  const built = buildLegacyHydratedMasterRow(companyId, masterRow as never, gi as never);

  console.log(
    JSON.stringify(
      {
        master_empty: isMasterDataEmpty(masterBefore as never),
        needs_legacy_hydration: needs,
        built_row_addresses: built?.addresses,
        migration_marker_before: masterBefore?.legacy_migration_completed_at,
        migration_marker_after: masterAfterGi?.legacy_migration_completed_at,
        master_addresses_before: masterBefore?.addresses,
        master_addresses_after: masterAfterGi?.addresses,
        gi_registered_office: gi?.registered_office,
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
