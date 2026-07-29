/**
 * RC1 — Extended live invoices workflow verification.
 * Exercises GET_NEXT, CREATE (post), GET_ONE, PUT (draft notes), VOID against production.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const line of raw.split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch { /* optional */ }
  }
}
loadEnv();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function invoke(fn: string, body: Record<string, unknown>) {
  const started = Date.now();
  const res = await supabase.functions.invoke(fn, { body });
  return {
    ok: !res.error,
    ms: Date.now() - started,
    error: res.error?.message ?? null,
    data: res.data,
  };
}

async function main() {
  const out: Record<string, unknown> = { timestamp: new Date().toISOString() };
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (authErr) throw authErr;
  out.auth = auth.user?.email;

  const sess = await invoke('user-session', { method: 'GET_SESSION' });
  const companyId = (sess.data as { activeCompany?: { id: string } })?.activeCompany?.id;
  out.companyId = companyId;
  if (!companyId) throw new Error('No active company');

  // Accounts needed for posting
  const coa = await invoke('chart-of-accounts', { method: 'GET_ALL', company_id: companyId });
  const accounts = (coa.data as { id: string; name: string; type?: string }[]) ?? [];
  const ar = accounts.find((a) => /receivable|debtors/i.test(a.name)) ?? accounts[0];
  const income = accounts.find((a) => /revenue|sales|income/i.test(a.name)) ?? accounts[1];
  out.accounts = { ar: ar?.id, income: income?.id };

  const customers = await invoke('customers', { method: 'GET_ALL', company_id: companyId });
  const customerId = (customers.data as { id: string }[])?.[0]?.id;
  out.customerId = customerId;

  const nextNum = await invoke('invoices', { method: 'GET_NEXT_INVOICE_NUMBER', company_id: companyId });
  out.GET_NEXT_INVOICE_NUMBER = nextNum;

  const stamp = Date.now();
  const invoiceNumber = `RC1-${stamp}`;
  const create = await invoke('invoices', {
    method: 'CREATE_WITH_TIMESHEETS',
    company_id: companyId,
    invoiceData: {
      p_customer_id: customerId,
      p_invoice_date: '2026-07-28',
      p_due_date: '2026-08-28',
      p_invoice_number: invoiceNumber,
      p_ar_account_id: ar?.id,
      p_inventory_asset_account_id: null,
      p_tax_payable_account_id: null,
      p_description: `RC1 smoke invoice ${stamp}`,
      p_items: [
        {
          product_id: null,
          quantity: 1,
          unit_price: 250,
          income_account_id: income?.id,
          tax_rate_id: null,
        },
      ],
      notes: 'RC1 production smoke',
    },
    timesheetIds: [],
  });
  out.CREATE = create;
  const invoiceId = (create.data as { id?: string })?.id ?? create.data;

  let getOne = null;
  let put = null;
  let voidRes = null;
  if (invoiceId && typeof invoiceId === 'string') {
    getOne = await invoke('invoices', { method: 'GET_ONE', company_id: companyId, invoiceId });
    put = await invoke('invoices', {
      method: 'PUT',
      company_id: companyId,
      invoiceId,
      invoiceData: { notes: `RC1 updated ${stamp}` },
    });
    voidRes = await invoke('invoices', { method: 'VOID', company_id: companyId, invoiceId });
  }
  out.GET_ONE = getOne;
  out.PUT = put;
  out.VOID = voidRes;

  const steps = ['GET_NEXT_INVOICE_NUMBER', 'CREATE', 'GET_ONE', 'PUT', 'VOID'] as const;
  const failed = steps.filter((s) => {
    const v = out[s] as { ok?: boolean } | null;
    return !v || v.ok !== true;
  });
  out.summary = { passed: failed.length === 0, failed };

  writeFileSync(
    resolve(process.cwd(), 'docs/rc1/evidence/invoices-api-smoke.json'),
    JSON.stringify(out, null, 2),
  );
  console.log(JSON.stringify({ summary: out.summary, invoiceNumber, invoiceId, next: nextNum.data, createOk: create.ok, createErr: create.error }, null, 2));
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
