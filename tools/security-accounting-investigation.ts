/**
 * Security + Accounting investigation — Sprint 1 blocker resolution.
 * Outputs evidence to docs/ux/evidence/security-accounting-investigation.json
 */
import fs from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    values[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return values;
}

const env = loadEnv();
const CERT_COMPANY = 'be3855e9-d11c-48a8-8c39-10e12a0ff2df';
const EAM_COMPANY = env.EAM_CERT_COMPANY_ID || '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';

async function login(email: string, password: string) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message ?? 'login failed');
  return sb;
}

async function memberships(sb: ReturnType<typeof createClient>) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  const { data } = await sb.from('company_users').select('company_id, role, companies(name)').eq('user_id', user.id);
  return data ?? [];
}

async function scanTables(sb: ReturnType<typeof createClient>, allowedCompanyIds: Set<string>) {
  const tables = [
    'companies', 'chart_of_accounts', 'journal_entries', 'journal_entry_items',
    'customers', 'vendors', 'invoices', 'invoice_items', 'bills', 'bill_items',
    'employees', 'bank_accounts', 'payroll_runs',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const t of tables) {
    try {
      const { data, error } = await sb.from(t).select('company_id').limit(1000);
      if (error) {
        out[t] = { error: error.message, leaked: 0, total: 0 };
        continue;
      }
      const rows = data ?? [];
      const leaked = rows.filter((r) => {
        const cid = (r as { company_id?: string }).company_id;
        return cid && !allowedCompanyIds.has(cid);
      });
      out[t] = { total: rows.length, leaked: leaked.length, leakedCompanyIds: [...new Set(leaked.map((r) => (r as { company_id: string }).company_id))] };
    } catch (e) {
      out[t] = { error: String(e) };
    }
  }
  return out;
}

async function investigateAccounting(sb: ReturnType<typeof createClient>, companyId: string) {
  const fyStart = '2026-07-01';
  const fyEnd = new Date().toISOString().slice(0, 10);
  const prior = '2026-06-30';

  const { data: report, error } = await sb.functions.invoke('reports', {
    body: { company_id: companyId, start_date: fyStart, end_date: fyEnd, prior_date: prior },
  });
  if (error) throw error;

  const balances = report?.balancesAsOf ?? [];
  const activity = report?.periodActivity ?? [];

  const income = activity.filter((a: { type?: string }) => a.type === 'Income').reduce((s: number, a: { net_movement?: number }) => s + (a.net_movement ?? 0), 0);
  const expenses = activity.filter((a: { type?: string }) => a.type === 'Expense' || a.type === 'Cost of Goods Sold').reduce((s: number, a: { net_movement?: number }) => s + Math.abs(a.net_movement ?? 0), 0);
  const netIncome = Math.round((income - expenses) * 100) / 100;

  const assets = balances.filter((a: { type?: string }) => a.type === 'Asset').reduce((s: number, a: { balance?: number }) => s + (a.balance ?? 0), 0);
  const liabilities = balances.filter((a: { type?: string }) => a.type === 'Liability').reduce((s: number, a: { balance?: number }) => s + Math.abs(a.balance ?? 0), 0);
  const equityAccounts = balances.filter((a: { type?: string }) => a.type === 'Equity');
  const equity = equityAccounts.reduce((s: number, a: { balance?: number }) => s + (a.balance ?? 0), 0);
  const equationDiff = Math.round((assets - (liabilities + equity + netIncome)) * 100) / 100;

  const tb = await sb.functions.invoke('accounting', {
    body: { method: 'GET_TRIAL_BALANCE', company_id: companyId, start_date: fyStart, end_date: fyEnd },
  });

  return {
    companyId,
    income,
    expenses,
    netIncome,
    assets,
    liabilities,
    equity,
    equationDiff,
    equityAccounts,
    assetAccounts: balances.filter((a: { type?: string }) => a.type === 'Asset'),
    liabilityAccounts: balances.filter((a: { type?: string }) => a.type === 'Liability'),
    trialBalance: tb.data,
    tbError: tb.error?.message,
  };
}

async function main() {
  const sb = await login(env.E2E_EMAIL, env.E2E_PASSWORD);
  const mems = await memberships(sb);
  const allowed = new Set(mems.map((m) => m.company_id));

  const legacyScan = await scanTables(sb, new Set([CERT_COMPANY]));
  const correctScan = await scanTables(sb, allowed);

  const accounting = await investigateAccounting(sb, CERT_COMPANY);

  const evidence = {
    at: new Date().toISOString(),
    e2eUser: { email: env.E2E_EMAIL, memberships: mems, membershipCount: mems.length },
    rls: {
      legacyCertHarnessInterpretation: legacyScan,
      authorizedMembershipInterpretation: correctScan,
      trueCrossTenantLeaks: Object.fromEntries(
        Object.entries(correctScan).map(([k, v]) => [k, (v as { leaked?: number }).leaked ?? 'n/a']),
      ),
    },
    accounting,
  };

  const out = join(process.cwd(), 'docs/ux/evidence/security-accounting-investigation.json');
  fs.mkdirSync(join(process.cwd(), 'docs/ux/evidence'), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
