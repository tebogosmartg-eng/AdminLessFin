/**
 * Phase 1 reconnaissance: which staging company is actually usable, and what
 * data does each already hold? Read-only.
 *
 *   npx tsx tools/staging-recovery/survey-companies.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery');

async function count(s: SupabaseClient, fn: string, body: Record<string, unknown>) {
  const r = await s.functions.invoke(fn, { body });
  if (r.error) return `ERR:${r.error.message.slice(0, 60)}`;
  const d = r.data as unknown;
  if (Array.isArray(d)) return d.length;
  if (d && typeof d === 'object') {
    for (const k of ['data', 'rows', 'items', 'bills', 'quotes', 'transactions']) {
      const v = (d as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v.length;
    }
    return Object.keys(d).length ? 'obj' : 0;
  }
  return 0;
}

async function main() {
  const env = loadE2EEnv();
  const s = createClient(env.supabaseUrl, env.supabaseAnonKey);
  await s.auth.signInWithPassword({ email: env.email, password: env.password });
  const sess = await s.functions.invoke('user-session', { body: { method: 'GET' } });
  const companies = (sess.data?.companies ?? []) as Array<{ id: string; name: string }>;

  const rows: Array<Record<string, unknown>> = [];
  for (const c of companies) {
    const status = await s.functions.invoke('accounting-setup', {
      body: { method: 'GET_STATUS', company_id: c.id },
    });
    const v = (status.data as { validation?: Record<string, unknown>; status?: string }) ?? {};
    const row = {
      id: c.id,
      name: c.name,
      status: v.status ?? 'unknown',
      ready: v.validation?.activeFinancialYear === true &&
        v.validation?.mandatoryControlAccounts === true &&
        v.validation?.taxConfigurationExists === true,
      errors: (v.validation?.errors as string[] | undefined)?.length ?? 0,
      firstErrors: ((v.validation?.errors as string[]) ?? []).slice(0, 3),
      accounts: v.validation?.accountCount ?? 0,
      vendors: await count(s, 'vendors', { method: 'GET', company_id: c.id }),
      customers: await count(s, 'customers', { method: 'GET', company_id: c.id }),
      bills: await count(s, 'bills', { method: 'GET', company_id: c.id }),
      quotes: await count(s, 'quotes', { method: 'GET', company_id: c.id }),
      products: await count(s, 'products', { method: 'GET', company_id: c.id }),
    };
    rows.push(row);
    console.log(
      `${String(row.name).slice(0, 34).padEnd(34)} ${String(row.status).padEnd(12)} ` +
        `acct=${String(row.accounts).padStart(3)} vend=${String(row.vendors).padStart(3)} ` +
        `cust=${String(row.customers).padStart(3)} bills=${String(row.bills).padStart(3)} ` +
        `quotes=${String(row.quotes).padStart(3)} prod=${String(row.products).padStart(3)} err=${row.errors}`,
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'company-survey.json'), JSON.stringify(rows, null, 2));
  console.log(`\nactive: ${sess.data?.activeCompany?.name} (${sess.data?.activeCompany?.id})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
