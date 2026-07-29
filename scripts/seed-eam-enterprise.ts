/**
 * EAM V16.4 — Enterprise seed (non-production only).
 * Usage: EAM_SEED_ALLOW=true EAM_SEED_SIZE=100 npx tsx scripts/seed-eam-enterprise.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const SIZES = new Set([10, 100, 1000, 10000]);

function loadEnv() {
  try {
    const content = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

function assertSeedAllowed() {
  if (process.env.EAM_SEED_ALLOW !== 'true') {
    throw new Error('Set EAM_SEED_ALLOW=true to run enterprise asset seed.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed blocked in NODE_ENV=production.');
  }
  const url = (process.env.VITE_SUPABASE_URL || '').toLowerCase();
  if (url.includes('prod') && process.env.EAM_SEED_OVERRIDE !== 'I_ACCEPT_PROD_RISK') {
    throw new Error('Seed blocked: URL looks like production. Set EAM_SEED_OVERRIDE=I_ACCEPT_PROD_RISK to override.');
  }
}

async function invokeAssets(
  sb: SupabaseClient,
  companyId: string,
  method: string,
  extra: Record<string, unknown> = {},
) {
  const { data, error } = await sb.functions.invoke('fixed-assets', {
    body: { method, company_id: companyId, ...extra },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as { error: string }).error));
  }
  return data;
}

async function getAccounts(sb: SupabaseClient, companyId: string) {
  const { data, error } = await sb.functions.invoke('chart-of-accounts', {
    body: { method: 'GET', company_id: companyId },
  });
  if (error) throw new Error(error.message);
  return (data as { id: string; type: string; name: string }[]) || [];
}

async function ensureCategory(
  sb: SupabaseClient,
  companyId: string,
  accounts: { id: string; type: string }[],
) {
  const assetAcct = accounts.find((a) => a.type === 'Asset')?.id;
  const expAcct = accounts.find((a) => a.type === 'Expense')?.id;
  const { data: existing } = await sb.functions.invoke('asset-categories', {
    body: { method: 'GET', company_id: companyId },
  });
  const list = (existing as { id: string; name: string }[]) || [];
  const hit = list.find((c) => c.name === 'EAM Seed IT Equipment');
  if (hit) return hit.id;
  const { data, error } = await sb.functions.invoke('asset-categories', {
    body: {
      method: 'POST',
      company_id: companyId,
      categoryData: {
        name: 'EAM Seed IT Equipment',
        useful_life_years: 5,
        residual_value_pct: 0,
        depreciation_method: 'straight-line',
        gl_asset_account_id: assetAcct,
        accumulated_depreciation_account_id: assetAcct,
        depreciation_expense_account_id: expAcct,
        capitalisation_threshold: 1000,
        component_accounting_enabled: false,
        default_verification_frequency_months: 12,
      },
    },
  });
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

const DEPTS = ['Finance', 'Operations', 'IT', 'HR'];
const LOCS = ['Head Office', 'Warehouse A', 'Branch North'];
const CUSTODIANS = ['QA Seed User', 'Asset Custodian A', 'Asset Custodian B'];

async function main() {
  loadEnv();
  assertSeedAllowed();
  const size = Number(process.env.EAM_SEED_SIZE || '100');
  if (!SIZES.has(size)) {
    throw new Error(`EAM_SEED_SIZE must be one of ${[...SIZES].join(', ')}`);
  }

  const url = process.env.VITE_SUPABASE_URL!;
  const key = process.env.VITE_SUPABASE_ANON_KEY!;
  const email = process.env.E2E_EMAIL!;
  const pass = process.env.E2E_PASSWORD!;
  if (!url || !key || !email || !pass) {
    throw new Error('Need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL, E2E_PASSWORD');
  }

  const sb = createClient(url, key);
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password: pass });
  if (authErr) throw authErr;

  const { data: members } = await sb.from('company_users').select('company_id').limit(1);
  const companyId = members?.[0]?.company_id;
  if (!companyId) throw new Error('No company membership');

  const accounts = await getAccounts(sb, companyId);
  const assetAcct = accounts.find((a) => a.type === 'Asset')?.id;
  const paymentAcct =
    accounts.find((a) => a.type === 'Asset' && a.name.toLowerCase().includes('bank'))?.id ||
    accounts.find((a) => a.type === 'Asset')?.id;
  const expAcct = accounts.find((a) => a.type === 'Expense')?.id;
  if (!assetAcct || !paymentAcct) throw new Error('Need asset and payment accounts in chart');

  const categoryId = await ensureCategory(sb, companyId, accounts);
  const batch = 25;
  let created = 0;
  const t0 = performance.now();

  for (let i = 0; i < size; i += batch) {
    const chunk = Math.min(batch, size - i);
    await Promise.all(
      Array.from({ length: chunk }, async (_, j) => {
        const n = i + j;
        await invokeAssets(sb, companyId, 'POST', {
          assetData: {
            description: `EAM Seed Asset ${n + 1}`,
            category_id: categoryId,
            purchase_date: '2026-01-15',
            purchase_cost: 25000 + (n % 50) * 100,
            location: LOCS[n % LOCS.length],
            department: DEPTS[n % DEPTS.length],
            custodian_name: CUSTODIANS[n % CUSTODIANS.length],
            asset_account_id: assetAcct,
            payment_account_id: paymentAcct,
            depreciation_method: 'straight-line',
            useful_life_years: 5,
            residual_value: 0,
            accumulated_depreciation_account_id: assetAcct,
            depreciation_expense_account_id: expAcct,
            status: 'active',
          },
        });
      }),
    );
    created += chunk;
    console.log(`Seeded ${created}/${size} assets…`);
  }

  const ms = performance.now() - t0;
  console.log(
    JSON.stringify(
      {
        ok: true,
        companyId,
        size,
        created,
        elapsedMs: Math.round(ms),
        categoryId,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
