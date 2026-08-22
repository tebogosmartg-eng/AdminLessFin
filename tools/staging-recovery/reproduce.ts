/**
 * Phase 1 — reproduce every staging finding against the live backend and record
 * the exact failure layer. Read-only by default: every probe here is a GET/list
 * or a deliberately invalid call. Transactional probes live in separate scripts.
 *
 *   npx tsx tools/staging-recovery/reproduce.ts [companyName]
 *
 * Writes tests/e2e/evidence/staging-recovery/reproduce.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery');
const TARGET_COMPANY = process.argv[2] || 'Spaceman';

export type Probe = {
  finding: string;
  fn: string;
  method: string;
  status: number | null;
  ok: boolean;
  body: unknown;
  error: string | null;
};

/**
 * supabase-js collapses every non-2xx into "Edge Function returned a non-2xx
 * status code" and hides the body on `error.context`. Every diagnosis in this
 * exercise depends on that body, so unwrap it.
 */
export async function invoke(
  s: SupabaseClient,
  fn: string,
  body: Record<string, unknown>,
): Promise<Omit<Probe, 'finding'>> {
  const r = await s.functions.invoke(fn, { body });
  if (!r.error) {
    return { fn, method: String(body.method ?? ''), status: 200, ok: true, body: r.data, error: null };
  }
  const ctx = (r.error as { context?: unknown }).context;
  let status: number | null = null;
  let payload: unknown = null;
  if (ctx instanceof Response) {
    status = ctx.status;
    const text = await ctx.clone().text().catch(() => '');
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  return {
    fn,
    method: String(body.method ?? ''),
    status,
    ok: false,
    body: payload,
    error: r.error.message,
  };
}

function summarise(p: Probe): string {
  const detail = p.ok
    ? Array.isArray(p.body)
      ? `${p.body.length} rows`
      : typeof p.body === 'object' && p.body
        ? Object.keys(p.body as object).slice(0, 6).join(',')
        : String(p.body)
    : JSON.stringify(p.body).slice(0, 190);
  return `${p.ok ? 'OK  ' : `FAIL`} ${String(p.status ?? '---').padEnd(4)} ${p.fn}.${p.method.padEnd(22)} ${detail}`;
}

async function main() {
  const env = loadE2EEnv();
  const s = createClient(env.supabaseUrl, env.supabaseAnonKey);
  await s.auth.signInWithPassword({ email: env.email, password: env.password });

  const sess = await s.functions.invoke('user-session', { body: { method: 'GET' } });
  const companies = (sess.data?.companies ?? []) as Array<{ id: string; name: string }>;
  const company =
    companies.find((c) => c.name === TARGET_COMPANY) ??
    companies.find((c) => c.name.includes(TARGET_COMPANY)) ??
    companies[0];
  const company_id = company.id;
  console.log(`Company: ${company.name} (${company_id})\n`);

  const probes: Probe[] = [];
  const run = async (finding: string, fn: string, body: Record<string, unknown>) => {
    const p = { finding, ...(await invoke(s, fn, { ...body, company_id })) };
    probes.push(p);
    console.log(`[${finding.padEnd(28)}] ${summarise(p)}`);
    return p;
  };

  const year = new Date().getUTCFullYear();
  const period = { start_date: `${year - 1}-01-01`, end_date: `${year}-12-31` };

  console.log('── QUOTATIONS (1,2,3) ──');
  await run('1-3 quotes list', 'quotes', { method: 'GET_ALL' });

  console.log('\n── PRODUCTS (4) ──');
  const products = await run('4 products list', 'products', { method: 'GET' });

  console.log('\n── PURCHASING / BILLS (5-11) ──');
  const bills = await run('5-9 bills list', 'bills', { method: 'GET' });
  await run('5-9 purchase orders', 'purchase-orders', { method: 'GET_ALL' });
  await run('10 AP balances', 'payments', { method: 'GET_AP_BALANCES' });
  await run('11 vendors list', 'vendors', { method: 'GET' });

  console.log('\n── BANKING (12-15) ──');
  await run('12 bank accounts', 'banking', { method: 'GET_BANK_ACCOUNTS' });
  await run('13 bank transactions', 'banking', { method: 'GET_TRANSACTIONS' });
  await run('14 statement lines', 'banking', { method: 'GET_STATEMENT_LINES' });
  await run('15 recon transactions', 'accounting', { method: 'GET_RECONCILIATION_TRANSACTIONS', ...period });

  console.log('\n── AUDIT (16) ──');
  await run('16 audit logs', 'audit-logs', { method: 'GET' });

  console.log('\n── SUPPLIER STATEMENTS (17,18) ──');
  await run('17-18 vendor details', 'vendors', { method: 'GET_DETAILS' });

  console.log('\n── ACCOUNTING (19,20) ──');
  await run('19 general ledger', 'accounting', { method: 'GET_ENTERPRISE_LEDGER', ...period });
  await run('20 account activity', 'accounting', { method: 'GET_ACCOUNT_ACTIVITY_WORKSPACE', ...period });
  await run('19-20 journal entries', 'journal-entries', { method: 'GET' });

  console.log('\n── FINANCIAL STATEMENTS (21) ──');
  await run('21 trial balance', 'accounting', { method: 'GET_TRIAL_BALANCE', ...period });
  await run('21 financial health', 'accounting', { method: 'GET_FINANCIAL_HEALTH', ...period });
  await run('21 reports comparative BS', 'reports', { method: 'GET_COMPARATIVE_BS', ...period });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'reproduce.json'),
    JSON.stringify({ company, captured_at: new Date().toISOString(), probes }, null, 2),
  );

  const failed = probes.filter((p) => !p.ok);
  console.log(`\n${probes.length - failed.length}/${probes.length} OK · ${failed.length} FAILING`);
  for (const f of failed) console.log(`  FAIL ${f.finding} — ${f.fn}.${f.method} → ${f.status}`);
  console.log(`\n→ ${path.join(OUT_DIR, 'reproduce.json')}`);
  console.log(`sample product: ${JSON.stringify((products.body as unknown[])?.[0] ?? null).slice(0, 300)}`);
  console.log(`sample bill: ${JSON.stringify((bills.body as unknown[])?.[0] ?? null).slice(0, 400)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
