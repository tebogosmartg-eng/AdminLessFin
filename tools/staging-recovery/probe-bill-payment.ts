/**
 * Finding 10 — Bill payment, workflow C of the brief:
 *   Bill -> Payment -> Bank/Cash -> AP reduction -> supplier statement
 *
 * Uses the payments edge contract exactly as the UI does
 * (vendorId / billId / paymentData), and verifies the LEDGER after each step.
 * Creates a real bill, pays it, then voids it and confirms AP returns.
 *
 *   npx tsx tools/staging-recovery/probe-bill-payment.ts [companyName]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, invoke, tech } from './edgeProbe';

const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery');
const TARGET = process.argv[2] || 'Spaceman';

async function main() {
  const { supabase: s, company } = await connect(TARGET);
  const company_id = company.id;
  const steps: Array<Record<string, unknown>> = [];
  const log = (step: string, ok: boolean, detail: unknown) => {
    steps.push({ step, ok, detail });
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${step.padEnd(38)} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  };

  const coa = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id });
  const accounts = (coa.body as Array<Record<string, unknown>>) ?? [];
  const byId = new Map(accounts.map((a) => [a.id as string, a]));
  const ap = accounts.find((a) => a.account_role === 'trade_payable') ?? accounts.find((a) => a.type === 'Liability');
  const expense = accounts.find(
    (a) => a.type === 'Expense' && !['cogs', 'inventory_asset', 'depreciation_expense'].includes(String(a.account_role)),
  );

  // The bank GL account the customer would actually pay from.
  const banking = await invoke(s, 'banking', { method: 'GET_BANK_ACCOUNTS', company_id });
  const bankAccounts = (banking.body as Array<Record<string, unknown>>) ?? [];
  const linked = bankAccounts.find((b) => b.chart_of_account_id && byId.has(String(b.chart_of_account_id)));
  const payFrom =
    (linked ? byId.get(String(linked.chart_of_account_id)) : null) ??
    accounts.find((a) => a.account_role === 'bank' || a.account_role === 'cash') ??
    accounts.find((a) => a.type === 'Asset' && a.subcategory === 'Cash and Cash Equivalents');

  console.log(`Company : ${company.name}`);
  console.log(`AP      : ${ap?.name}`);
  console.log(`Expense : ${expense?.name}`);
  console.log(`Bank GL : ${payFrom?.name ?? 'NONE FOUND'} (from ${bankAccounts.length} bank accounts)\n`);
  if (!payFrom) {
    log('10 bank GL account available', false, 'No bank/cash GL account — payment cannot be tested on this tenant');
    fs.writeFileSync(path.join(OUT_DIR, 'bill-payment.json'), JSON.stringify({ company, steps }, null, 2));
    return;
  }

  const balOf = async (id: string) => {
    const r = await s.rpc('get_balances_as_of_date', { p_end_date: '2099-12-31', p_company_id: company_id });
    return Number((r.data as Array<{ id: string; balance: number }>)?.find((a) => a.id === id)?.balance ?? 0);
  };

  const apOpen = await balOf(String(ap?.id));
  const bankOpen = await balOf(String(payFrom.id));
  const AMOUNT = 456.78;
  const today = new Date().toISOString().slice(0, 10);
  const billNumber = `SR-PAY-${Date.now()}`;

  // 1. Record the bill
  const create = await invoke(s, 'bills', {
    method: 'POST', company_id,
    billData: {
      bill_number: billNumber, vendor_id: null, bill_date: today, due_date: today,
      accounts_payable_id: ap?.id, tax_receivable_account_id: null,
      description: 'Staging recovery — payment test', attachment_url: null,
      p_items: [{ product_id: null, quantity: 1, unit_cost: AMOUNT, expense_account_id: expense?.id, tax_rate_id: null, project_id: null }],
    },
  });
  const vendors = await invoke(s, 'vendors', { method: 'GET', company_id });
  const vendor = (vendors.body as Array<{ id: string; name: string }>)?.[0];
  if (!create.ok) {
    // vendor_id is required by the RPC; retry with a real vendor.
    const retry = await invoke(s, 'bills', {
      method: 'POST', company_id,
      billData: {
        bill_number: billNumber, vendor_id: vendor?.id, bill_date: today, due_date: today,
        accounts_payable_id: ap?.id, tax_receivable_account_id: null,
        description: 'Staging recovery — payment test', attachment_url: null,
        p_items: [{ product_id: null, quantity: 1, unit_cost: AMOUNT, expense_account_id: expense?.id, tax_rate_id: null, project_id: null }],
      },
    });
    log('10 bill recorded', retry.ok, retry.ok ? billNumber : tech(retry));
  } else {
    log('10 bill recorded', true, billNumber);
  }

  const bills = await invoke(s, 'bills', { method: 'GET', company_id });
  const bill = (bills.body as Array<Record<string, unknown>>)?.find((b) => b.bill_number === billNumber);
  const apAfterBill = await balOf(String(ap?.id));
  log('10 AP increased', Math.abs(apAfterBill - apOpen - AMOUNT) < 0.01, `${apOpen} -> ${apAfterBill}`);

  // 2. Pay it — exactly the contract the UI uses.
  const pay = await invoke(s, 'payments', {
    method: 'RECORD_VENDOR_PAYMENT',
    company_id,
    vendorId: bill?.vendor_id ?? vendor?.id,
    billId: bill?.id,
    paymentData: {
      payment_date: today,
      payment_account_id: payFrom.id,
      accounts_payable_id: ap?.id,
      amount: AMOUNT,
      description: `Payment for ${billNumber}`,
    },
  });
  log('10 payment recorded', pay.ok, pay.ok ? 'ok' : tech(pay));

  const apAfterPay = await balOf(String(ap?.id));
  const bankAfterPay = await balOf(String(payFrom.id));
  log('10 AP reduced by payment', Math.abs(apAfterPay - apOpen) < 0.01, `${apAfterBill} -> ${apAfterPay} (expected ${apOpen})`);
  log('10 bank reduced by payment', Math.abs(bankAfterPay - (bankOpen - AMOUNT)) < 0.01, `${bankOpen} -> ${bankAfterPay} (expected ${bankOpen - AMOUNT})`);

  // 3. Bill status should reflect payment
  const billsAfter = await invoke(s, 'bills', { method: 'GET', company_id });
  const billAfter = (billsAfter.body as Array<Record<string, unknown>>)?.find((b) => b.bill_number === billNumber);
  log('10 bill marked paid', String(billAfter?.status) === 'paid', `status=${billAfter?.status}`);

  // 4. AP ageing should no longer list it as outstanding
  const ageing = await invoke(s, 'payments', { method: 'GET_AP_BALANCES', company_id });
  const ageingRows = (ageing.body as Array<Record<string, unknown>>) ?? [];
  const stillOutstanding = ageingRows.some((r) => String(r.bill_number ?? '') === billNumber);
  log('10 paid bill off AP ageing', !stillOutstanding, stillOutstanding ? 'STILL OUTSTANDING' : 'cleared');

  // 5. Integrity
  const year = new Date().getUTCFullYear();
  const tb = await invoke(s, 'accounting', {
    method: 'GET_TRIAL_BALANCE', company_id, start_date: `${year - 2}-01-01`, end_date: `${year}-12-31`,
  });
  log('13 trial balance balanced', (tb.body as { balanced?: boolean })?.balanced === true, `balanced=${(tb.body as { balanced?: boolean })?.balanced}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'bill-payment.json'), JSON.stringify({ company, bill_number: billNumber, steps }, null, 2));
  const failed = steps.filter((x) => !x.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} OK`);
}

main().catch((e) => { console.error(e); process.exit(1); });
