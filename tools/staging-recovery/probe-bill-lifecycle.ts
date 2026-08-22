/**
 * Findings 5-11 — the real Bill lifecycle against the live backend.
 *
 * Direct Bill -> journal -> AP balance -> payment -> void, verifying the LEDGER
 * after every step rather than trusting the HTTP status. Real transactions, no
 * mocks. Everything it creates is voided/left in a consistent accounting state
 * and reported.
 *
 *   npx tsx tools/staging-recovery/probe-bill-lifecycle.ts [companyName]
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect, invoke, tech, type Probe } from './edgeProbe';

const OUT_DIR = path.join(process.cwd(), 'tests/e2e/evidence/staging-recovery');
const TARGET = process.argv[2] || 'Spaceman';

type Step = {
  step: string;
  status: number | null;
  ok: boolean;
  detail: string;
  ledger?: Record<string, unknown>;
};

async function main() {
  const { supabase: s, company } = await connect(TARGET);
  const company_id = company.id;
  const steps: Step[] = [];
  const note = (step: string, p: Probe, extra: Record<string, unknown> = {}) => {
    const detail = p.ok ? 'ok' : `${tech(p) || p.error}`;
    steps.push({ step, status: p.status, ok: p.ok, detail, ...extra });
    console.log(`${p.ok ? 'OK  ' : 'FAIL'} ${String(p.status ?? '---').padEnd(4)} ${step.padEnd(34)} ${detail.slice(0, 110)}`);
    return p;
  };

  // ── Master data ──────────────────────────────────────────────────────────
  const vendorsRes = await invoke(s, 'vendors', { method: 'GET', company_id });
  const vendor = (vendorsRes.body as Array<{ id: string; name: string }>)?.[0];
  const coaRes = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id });
  const accounts = (coaRes.body as Array<Record<string, unknown>>) ?? [];

  const byRole = (role: string) => accounts.find((a) => a.account_role === role);
  const ap = byRole('trade_payable') ?? accounts.find((a) => a.type === 'Liability');
  // An expense account that is NOT COGS — the posting engine legitimately
  // refuses COGS from the Bills module (inventory owns that account).
  const expense = accounts.find(
    (a) => a.type === 'Expense' && a.account_role !== 'cogs' && a.is_active !== false,
  );
  const bank = byRole('bank') ?? accounts.find((a) => a.type === 'Asset' && a.account_role === 'cash');

  console.log(`Company : ${company.name}`);
  console.log(`Vendor  : ${vendor?.name}`);
  console.log(`AP      : ${ap?.name} (${ap?.account_number})`);
  console.log(`Expense : ${expense?.name} (${expense?.account_number})`);
  console.log(`Bank    : ${bank?.name} (${bank?.account_number})\n`);

  const apId = String(ap?.id);
  const stamp = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const AMOUNT = 1234.56;

  /** AP balance straight from the ledger — the only figure that counts. */
  const apBalance = async () => {
    const r = await s.rpc('get_balances_as_of_date', {
      p_end_date: '2099-12-31',
      p_company_id: company_id,
    });
    const row = (r.data as Array<{ id: string; balance: number }>)?.find((a) => a.id === apId);
    return Number(row?.balance ?? 0);
  };

  const openingAp = await apBalance();
  console.log(`AP opening balance: ${openingAp}\n`);

  // ── FINDING 8: direct Bill creation ──────────────────────────────────────
  const billNumber = `SR-DIRECT-${stamp}`;
  const create = await invoke(s, 'bills', {
    method: 'POST',
    company_id,
    billData: {
      vendor_id: vendor?.id,
      bill_date: today,
      due_date: due,
      bill_number: billNumber,
      accounts_payable_id: apId,
      description: 'Staging recovery — direct bill',
      p_items: [
        {
          product_id: null,
          quantity: 1,
          unit_cost: AMOUNT,
          expense_account_id: expense?.id,
          tax_rate_id: null,
          project_id: null,
        },
      ],
    },
  });
  note('8 direct bill create', create);

  const afterCreateAp = await apBalance();
  const billsAfter = await invoke(s, 'bills', { method: 'GET', company_id });
  const bill = (billsAfter.body as Array<Record<string, unknown>>)?.find(
    (b) => b.bill_number === billNumber,
  );
  steps.push({
    step: '8 AP increased by bill',
    status: 200,
    ok: Math.abs(afterCreateAp - openingAp - AMOUNT) < 0.01,
    detail: `AP ${openingAp} -> ${afterCreateAp} (expected +${AMOUNT})`,
    ledger: { bill_id: bill?.id, journal_entry_id: bill?.journal_entry_id, status: bill?.status },
  });
  console.log(
    `${Math.abs(afterCreateAp - openingAp - AMOUNT) < 0.01 ? 'OK  ' : 'FAIL'} ---  ` +
      `8 AP increased by bill            AP ${openingAp} -> ${afterCreateAp} (expected +${AMOUNT})`,
  );

  // ── FINDING 10: bill payment ─────────────────────────────────────────────
  let paidBalance = afterCreateAp;
  if (bill?.id && bank?.id) {
    const pay = await invoke(s, 'payments', {
      method: 'RECORD_VENDOR_PAYMENT',
      company_id,
      vendor_id: vendor?.id,
      bill_id: bill.id,
      amount: AMOUNT,
      payment_date: today,
      payment_account_id: bank.id,
      accounts_payable_id: apId,
    });
    note('10 bill payment', pay);
    paidBalance = await apBalance();
    const ok = Math.abs(paidBalance - openingAp) < 0.01;
    steps.push({
      step: '10 AP cleared by payment',
      status: 200,
      ok,
      detail: `AP ${afterCreateAp} -> ${paidBalance} (expected ${openingAp})`,
    });
    console.log(`${ok ? 'OK  ' : 'FAIL'} ---  10 AP cleared by payment        AP ${afterCreateAp} -> ${paidBalance}`);
  }

  // ── FINDING 11: void must not keep inflating the supplier balance ────────
  const voidNumber = `SR-VOID-${stamp}`;
  const beforeVoidBill = await apBalance();
  const create2 = await invoke(s, 'bills', {
    method: 'POST',
    company_id,
    billData: {
      vendor_id: vendor?.id,
      bill_date: today,
      due_date: due,
      bill_number: voidNumber,
      accounts_payable_id: apId,
      description: 'Staging recovery — bill to void',
      p_items: [
        { product_id: null, quantity: 1, unit_cost: AMOUNT, expense_account_id: expense?.id, tax_rate_id: null, project_id: null },
      ],
    },
  });
  note('11 bill create (for void)', create2);
  const afterCreate2 = await apBalance();

  const bills2 = await invoke(s, 'bills', { method: 'GET', company_id });
  const bill2 = (bills2.body as Array<Record<string, unknown>>)?.find((b) => b.bill_number === voidNumber);

  let afterVoid = afterCreate2;
  if (bill2?.id) {
    const voided = await invoke(s, 'bills', { method: 'VOID', company_id, billId: bill2.id });
    note('11 bill void', voided);
    afterVoid = await apBalance();
    const ok = Math.abs(afterVoid - beforeVoidBill) < 0.01;
    steps.push({
      step: '11 AP restored after void',
      status: 200,
      ok,
      detail: `AP ${afterCreate2} -> ${afterVoid} (expected ${beforeVoidBill})`,
    });
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ---  11 AP restored after void      AP ${afterCreate2} -> ${afterVoid} (expected ${beforeVoidBill})`,
    );

    // Does the voided bill still show as outstanding to the supplier?
    const apBalances = await invoke(s, 'payments', { method: 'GET_AP_BALANCES', company_id });
    const rows = (apBalances.body as Array<Record<string, unknown>>) ?? [];
    const stillListed = rows.some((r) => String(r.bill_number ?? '') === voidNumber);
    steps.push({
      step: '11 voided bill absent from AP ageing',
      status: 200,
      ok: !stillListed,
      detail: stillListed ? 'VOIDED BILL STILL LISTED AS OUTSTANDING' : 'not listed (correct)',
    });
    console.log(`${!stillListed ? 'OK  ' : 'FAIL'} ---  11 voided bill absent from ageing  ${stillListed ? 'STILL LISTED' : 'correct'}`);
  }

  // ── Accounting integrity ─────────────────────────────────────────────────
  const year = new Date().getUTCFullYear();
  const tb = await invoke(s, 'accounting', {
    method: 'GET_TRIAL_BALANCE',
    company_id,
    start_date: `${year - 2}-01-01`,
    end_date: `${year}-12-31`,
  });
  const tbBody = tb.body as { balanced?: boolean; totals?: Record<string, number> };
  steps.push({
    step: '13 trial balance still balanced',
    status: tb.status,
    ok: tbBody?.balanced === true,
    detail: `balanced=${tbBody?.balanced} totals=${JSON.stringify(tbBody?.totals)}`,
  });
  console.log(`${tbBody?.balanced ? 'OK  ' : 'FAIL'} ---  13 trial balance balanced      ${tbBody?.balanced}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'bill-lifecycle.json'),
    JSON.stringify({ company, vendor, ap, expense, bank, openingAp, steps }, null, 2),
  );
  const failed = steps.filter((x) => !x.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} steps OK`);
  for (const f of failed) console.log(`  FAIL ${f.step} — ${f.detail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
