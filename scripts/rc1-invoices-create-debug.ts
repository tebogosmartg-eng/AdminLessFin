/**
 * RC1 — Capture invoice CREATE error body from live edge function.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const url = process.env.VITE_SUPABASE_URL!;
const anon = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon);

async function main() {
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (authErr) throw authErr;
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('No access token');

  const sessRes = await fetch(`${url}/functions/v1/user-session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'GET_SESSION' }),
  });
  const session = await sessRes.json();
  const companyId = session?.activeCompany?.id;
  console.log('company', companyId, 'status', sessRes.status);

  const coaRes = await fetch(`${url}/functions/v1/chart-of-accounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'GET_ALL', company_id: companyId }),
  });
  const coaRaw = await coaRes.json();
  const accounts: { id: string; name: string }[] = Array.isArray(coaRaw)
    ? coaRaw
    : Array.isArray(coaRaw?.accounts)
      ? coaRaw.accounts
      : Array.isArray(coaRaw?.data)
        ? coaRaw.data
        : [];
  console.log('coaShape', { status: coaRes.status, keys: coaRaw && typeof coaRaw === 'object' ? Object.keys(coaRaw) : typeof coaRaw, count: accounts.length });
  const ar = accounts.find((a) => /receivable|debtors/i.test(a.name));
  const income = accounts.find((a) => /revenue|sales|income/i.test(a.name));

  const custRes = await fetch(`${url}/functions/v1/customers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'GET_ALL', company_id: companyId }),
  });
  const custRaw = await custRes.json();
  const customers = Array.isArray(custRaw) ? custRaw : Array.isArray(custRaw?.customers) ? custRaw.customers : [];
  const customerId = customers?.[0]?.id;

  const stamp = Date.now();
  const body = {
    method: 'CREATE_WITH_TIMESHEETS',
    company_id: companyId,
    invoiceData: {
      p_customer_id: customerId,
      p_invoice_date: '2026-07-28',
      p_due_date: '2026-08-28',
      p_invoice_number: `RC1-${stamp}`,
      p_ar_account_id: ar?.id,
      p_inventory_asset_account_id: null,
      p_tax_payable_account_id: null,
      p_description: `RC1 smoke ${stamp}`,
      p_items: [{ product_id: null, quantity: 1, unit_price: 250, income_account_id: income?.id, tax_rate_id: null }],
      notes: 'RC1',
    },
    timesheetIds: [],
  };

  const createRes = await fetch(`${url}/functions/v1/invoices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const createText = await createRes.text();
  const nextRes = await fetch(`${url}/functions/v1/invoices`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'GET_NEXT_INVOICE_NUMBER', company_id: companyId }),
  });
  const nextText = await nextRes.text();

  const evidence = {
    timestamp: new Date().toISOString(),
    user: auth.user?.email,
    companyId,
    accounts: { ar: ar?.id, arName: ar?.name, income: income?.id, incomeName: income?.name },
    customerId,
    create: { status: createRes.status, body: createText },
    getNext: { status: nextRes.status, body: nextText },
  };
  writeFileSync(resolve(process.cwd(), 'docs/rc1/evidence/invoices-create-error.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  process.exit(createRes.ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
