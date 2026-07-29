/**
 * Step 6 — Re-run acquisition only on Spaceman (known-good company).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  const env: Record<string, string> = {};
  for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    const k = t.slice(0, eq).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD });
const token = (await sb.auth.getSession()).data.session!.access_token;
const companyId = '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752';
const tag = `EAM-ACQ-RETRY-${Date.now()}`;
const code = `AST-2026-R${String(Date.now()).slice(-6)}`;

const { data: accts } = await sb.functions.invoke('chart-of-accounts', {
  body: { method: 'GET', company_id: companyId },
});
const accounts = accts as { id: string; type: string; name: string }[];
const assetAcct = accounts.find((a) => a.type === 'Asset' && /fixed|equipment|bank/i.test(a.name))?.id || accounts.find((a) => a.type === 'Asset')?.id;
const paymentAcct =
  accounts.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name))?.id ||
  accounts.find((a) => a.type === 'Liability')?.id;
const expenseAcct = accounts.find((a) => a.type === 'Expense')?.id;
const { data: cats } = await sb.functions.invoke('asset-categories', {
  body: { method: 'GET', company_id: companyId },
});
const categoryId = (cats as { id: string }[])[0]?.id;

const body = {
  method: 'POST',
  company_id: companyId,
  assetData: {
    asset_code: code,
    description: tag,
    category_id: categoryId,
    purchase_date: '2026-01-20',
    purchase_cost: 25000,
    asset_account_id: assetAcct,
    payment_account_id: paymentAcct,
    depreciation_method: 'straight-line',
    useful_life_years: 5,
    residual_value: 0,
    accumulated_depreciation_account_id: assetAcct,
    depreciation_expense_account_id: expenseAcct,
  },
};

const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/fixed-assets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, apikey: env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();

let journalOk = false;
let registerOk = false;
if (res.ok) {
  const assetId = JSON.parse(text).id;
  const { data: entries } = await sb
    .from('journal_entries')
    .select('id, description, journal_entry_items(type, amount, account_id)')
    .eq('company_id', companyId)
    .ilike('description', `%${tag}%`)
    .limit(1);
  journalOk = !!(entries && entries.length > 0);
  const all = await sb.functions.invoke('fixed-assets', { body: { method: 'GET_ALL', company_id: companyId } });
  registerOk = ((all.data as { id: string; description?: string; asset_code?: string }[]) || []).some(
    (a) => a.id === assetId || a.description === tag || a.asset_code === code,
  );
}

console.log(
  JSON.stringify(
    {
      step6: res.ok && journalOk && registerOk ? 'PASS' : 'FAIL',
      httpStatus: res.status,
      responseBody: text,
      assetCode: code,
      journalOk,
      registerOk,
    },
    null,
    2,
  ),
);
