/**
 * The receipt engine, end to end, against production.
 *
 * Creates a real invoice in a test company and then exercises the whole
 * lifecycle: part settlement, over-allocation, full settlement, an idempotent
 * replay, a payment with nothing to settle, and the guards that stop a receipt
 * being credited to the wrong account. The failure paths matter more than the
 * happy one — a payment engine that only works when used correctly is what
 * this is replacing.
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

const stamp = Date.now();

type Account = {
  id: string; account_number: number; name: string;
  type: string; account_role: string | null; is_active: boolean | null;
};

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');

  let target: { id: string; name: string } | null = null;
  let ar: Account | undefined;
  let bank: Account | undefined;
  let income: Account | undefined;

  for (const co of companies) {
    const coa = await s.from('chart_of_accounts')
      .select('id, account_number, name, type, account_role, is_active')
      .eq('company_id', co.id);
    const rows = (coa.data ?? []) as Account[];
    const a = rows.find((x) => x.account_role === 'trade_receivable' && x.is_active !== false);
    const b = rows.find((x) => x.type === 'Asset' && x.account_role !== 'trade_receivable'
      && /bank|cash/i.test(String(x.name)) && x.is_active !== false);
    const i = rows.find((x) => x.type === 'Income' && x.is_active !== false);
    if (a && b && i) { target = co; ar = a; bank = b; income = i; break; }
  }
  if (!target || !ar || !bank || !income) throw new Error('No company with AR + bank + income accounts.');
  console.log('company: ' + target.name);
  console.log('  AR    : ' + ar.account_number + ' ' + ar.name);
  console.log('  bank  : ' + bank.account_number + ' ' + bank.name);
  console.log('  income: ' + income.account_number + ' ' + income.name);

  const cust = await s.from('customers').select('id, name').eq('company_id', target.id).limit(1).maybeSingle();
  if (!cust.data) throw new Error('No customer in that company.');
  const customerId = cust.data.id as string;
  console.log('  customer: ' + cust.data.name);

  const invNumber = 'ALLOC-' + stamp;
  const created = await invoke(s, 'invoices', {
    method: 'CREATE_WITH_TIMESHEETS', company_id: target.id,
    invoiceData: {
      customer_id: customerId,
      invoice_date: '2026-09-04', due_date: '2026-09-04',
      invoice_number: invNumber,
      accounts_receivable_id: ar.id,
      description: 'Allocation engine test ' + stamp,
      p_items: [{ description: 'Test line', quantity: 1, unit_price: 1000, income_account_id: income.id }],
    },
    timesheetIds: [],
  });
  if (!created.ok) throw new Error('Invoice create failed: ' + tech(created));
  const invRow = await s.from('invoices').select('id, status').eq('company_id', target.id)
    .eq('invoice_number', invNumber).maybeSingle();
  const invoiceId = invRow.data!.id as string;
  console.log(NL + 'invoice ' + invNumber + ' created, status ' + invRow.data!.status);

  const openOf = async () => {
    const r = await invoke(s, 'payments', {
      method: 'GET_CUSTOMER_OPEN_INVOICES', company_id: target!.id, customerId,
    });
    if (!r.ok) throw new Error('GET_CUSTOMER_OPEN_INVOICES failed: ' + tech(r) + ' :: ' + JSON.stringify(r.body).slice(0, 300));
    const list = (r.body as Array<{ id: string; outstanding: number }>) ?? [];
    if (!Array.isArray(list)) throw new Error('expected a list, got ' + JSON.stringify(r.body).slice(0, 300));
    return list.find((x) => x.id === invoiceId);
  };
  const statusOf = async () => {
    const r = await s.from('invoices').select('status').eq('id', invoiceId).maybeSingle();
    return String(r.data?.status);
  };

  console.log(NL + '======== IT STARTS FULLY OUTSTANDING ========');
  check('outstanding is the full 1000', c((await openOf())?.outstanding) === 100000,
    String((await openOf())?.outstanding));

  console.log(NL + '======== PART SETTLEMENT ========');
  const r1 = await invoke(s, 'payments', {
    method: 'RECORD_CUSTOMER_RECEIPT', company_id: target.id, customerId,
    payment_date: '2026-09-04', deposit_account_id: bank.id, amount: 400,
    allocations: [{ invoice_id: invoiceId, amount: 400 }],
    description: 'Part payment ' + stamp, idempotency_key: 'test:receipt:a:' + stamp,
  });
  check('400 is accepted', r1.ok, r1.ok ? '' : tech(r1));
  const b1 = r1.body as { allocated: number; unallocated: number; posting_status: string; journal_number: string };
  check('all 400 is allocated', c(b1?.allocated) === 40000, String(b1?.allocated));
  check('nothing left on account', c(b1?.unallocated) === 0, String(b1?.unallocated));
  const st1 = await statusOf();
  check('the invoice is now partially paid', st1 === 'partially_paid', st1);
  check('600 remains outstanding', c((await openOf())?.outstanding) === 60000,
    String((await openOf())?.outstanding));

  console.log(NL + '======== OVER-ALLOCATION IS REFUSED ========');
  const over = await invoke(s, 'payments', {
    method: 'RECORD_CUSTOMER_RECEIPT', company_id: target.id, customerId,
    payment_date: '2026-09-04', deposit_account_id: bank.id, amount: 700,
    allocations: [{ invoice_id: invoiceId, amount: 700 }],
    idempotency_key: 'test:receipt:over:' + stamp,
  });
  check('700 against a 600 balance is refused', !over.ok, tech(over).slice(0, 110));
  check('and the invoice is untouched', c((await openOf())?.outstanding) === 60000);

  console.log(NL + '======== IDEMPOTENT REPLAY ========');
  const replay = await invoke(s, 'payments', {
    method: 'RECORD_CUSTOMER_RECEIPT', company_id: target.id, customerId,
    payment_date: '2026-09-04', deposit_account_id: bank.id, amount: 400,
    allocations: [{ invoice_id: invoiceId, amount: 400 }],
    idempotency_key: 'test:receipt:a:' + stamp,
  });
  const rb = replay.body as { posting_status: string; journal_number: string };
  check('the retry is reported as a duplicate', replay.ok && rb?.posting_status === 'duplicate',
    String(rb?.posting_status));
  check('it returns the original journal', rb?.journal_number === b1?.journal_number,
    rb?.journal_number + ' vs ' + b1?.journal_number);
  check('and does not settle the invoice twice', c((await openOf())?.outstanding) === 60000,
    String((await openOf())?.outstanding));

  console.log(NL + '======== NO ALLOCATION GIVEN: OLDEST INVOICE FIRST ========');
  const oldestBefore = await invoke(s, 'payments', {
    method: 'GET_CUSTOMER_OPEN_INVOICES', company_id: target.id, customerId,
  });
  const oldest = ((oldestBefore.body as Array<{ id: string; invoice_number: string; invoice_date: string }>) ?? [])[0];
  const r2 = await invoke(s, 'payments', {
    method: 'RECORD_CUSTOMER_RECEIPT', company_id: target.id, customerId,
    payment_date: '2026-09-04', deposit_account_id: bank.id, amount: 50,
    idempotency_key: 'test:receipt:b:' + stamp,
  });
  check('a receipt with no allocations is accepted', r2.ok, r2.ok ? '' : tech(r2));
  const b2 = r2.body as { allocated: number; allocations: Array<{ invoice_id: string; invoice_number: string }> };
  check('it went to the OLDEST open invoice, not the newest',
    b2?.allocations?.[0]?.invoice_id === oldest?.id,
    'applied to ' + b2?.allocations?.[0]?.invoice_number + ', oldest is ' + oldest?.invoice_number);
  check('the newer test invoice was left alone', c((await openOf())?.outstanding) === 60000,
    String((await openOf())?.outstanding));

  console.log(NL + '======== SETTLING THE REST EXPLICITLY ========');
  const r2b = await invoke(s, 'payments', {
    method: 'RECORD_CUSTOMER_RECEIPT', company_id: target.id, customerId,
    payment_date: '2026-09-04', deposit_account_id: bank.id, amount: 600,
    allocations: [{ invoice_id: invoiceId, amount: 600 }],
    idempotency_key: 'test:receipt:b2:' + stamp,
  });
  check('the final 600 is accepted', r2b.ok, r2b.ok ? '' : tech(r2b));
  const stFinal = await statusOf();
  check('the invoice is now paid', stFinal === 'paid', stFinal);
  const nowOpen = await openOf();
  check('and it is no longer outstanding', !nowOpen, nowOpen ? String(nowOpen.outstanding) : 'not listed');

  console.log(NL + '======== AN EMPTY ALLOCATION LIST LEAVES IT ON ACCOUNT ========');
  const r3 = await invoke(s, 'payments', {
    method: 'RECORD_CUSTOMER_RECEIPT', company_id: target.id, customerId,
    payment_date: '2026-09-04', deposit_account_id: bank.id, amount: 250,
    allocations: [], idempotency_key: 'test:receipt:c:' + stamp,
  });
  check('it posts', r3.ok, r3.ok ? '' : tech(r3));
  if (r3.ok) {
    const b3 = r3.body as { allocated: number; unallocated: number };
    check('nothing is allocated and the whole 250 is reported as on account',
      c(b3.allocated) === 0 && c(b3.unallocated) === 25000,
      'allocated ' + b3.allocated + ', on account ' + b3.unallocated);
  }

  console.log(NL + '======== THE ACCOUNT GUARDS ========');
  const intoAr = await invoke(s, 'payments', {
    method: 'RECORD_CUSTOMER_RECEIPT', company_id: target.id, customerId,
    payment_date: '2026-09-04', deposit_account_id: ar.id, amount: 10,
    idempotency_key: 'test:receipt:d:' + stamp,
  });
  check('depositing a receipt into the debtors control is refused', !intoAr.ok, tech(intoAr).slice(0, 100));

  const wrongAr = await invoke(s, 'payments', {
    method: 'RECORD_CUSTOMER_RECEIPT', company_id: target.id, customerId,
    payment_date: '2026-09-04', deposit_account_id: bank.id, amount: 10,
    accounts_receivable_id: income.id, idempotency_key: 'test:receipt:e:' + stamp,
  });
  check('crediting something that is not the control account is refused', !wrongAr.ok, tech(wrongAr).slice(0, 100));

  const otherCompany = companies.find((x) => x.id !== target!.id);
  if (otherCompany) {
    const crossed = await invoke(s, 'payments', {
      method: 'RECORD_CUSTOMER_RECEIPT', company_id: otherCompany.id, customerId,
      payment_date: '2026-09-04', deposit_account_id: bank.id, amount: 10,
      idempotency_key: 'test:receipt:f:' + stamp,
    });
    check('a customer from another company is refused', !crossed.ok, tech(crossed).slice(0, 100));
  }

  console.log(NL + '======== THE AGE ANALYSIS AGREES ========');
  const age = await invoke(s, 'customers', {
    method: 'GET_AGE_ANALYSIS', company_id: target.id, as_of: '2026-09-04',
  });
  if (age.ok) {
    const rec = (age.body as { reconciliation: { variance: number; reconciles: boolean } }).reconciliation;
    check('the debtors age analysis still reconciles', rec.reconciles, 'variance ' + rec.variance);
  } else {
    check('the debtors age analysis still reconciles', false, tech(age));
  }

  console.log(NL + '======== THE PER-INVOICE ROUTE GOES THROUGH THE SAME ENGINE ========');
  const inv2Number = 'ALLOC2-' + stamp;
  const created2 = await invoke(s, 'invoices', {
    method: 'CREATE_WITH_TIMESHEETS', company_id: target.id,
    invoiceData: {
      customer_id: customerId, invoice_date: '2026-09-04', due_date: '2026-09-04',
      invoice_number: inv2Number, accounts_receivable_id: ar.id,
      description: 'Per-invoice route test ' + stamp,
      p_items: [{ description: 'Line', quantity: 1, unit_price: 300, income_account_id: income.id }],
    },
    timesheetIds: [],
  });
  check('a second invoice is created', created2.ok, created2.ok ? '' : tech(created2));
  const inv2 = await s.from('invoices').select('id').eq('company_id', target.id)
    .eq('invoice_number', inv2Number).maybeSingle();
  const invoice2Id = inv2.data!.id as string;

  const legacy = await invoke(s, 'payments', {
    method: 'RECORD_INVOICE_PAYMENT', company_id: target.id,
    invoice_id: invoice2Id, payment_date: '2026-09-04',
    asset_account_id: bank.id, ar_account_id: ar.id, amount: 120,
  });
  check('RECORD_INVOICE_PAYMENT still works', legacy.ok, legacy.ok ? '' : tech(legacy));
  const alloc2 = await s.from('invoice_payment_allocations').select('amount').eq('invoice_id', invoice2Id);
  const alloc2Total = (alloc2.data ?? []).reduce((t, a) => t + c(a.amount), 0);
  check('it now writes an allocation too', alloc2Total === 12000, String(alloc2Total / 100));
  const st2 = await s.from('invoices').select('status').eq('id', invoice2Id).maybeSingle();
  check('and derives partially_paid rather than only ever paid',
    String(st2.data?.status) === 'partially_paid', String(st2.data?.status));

  const legacyOver = await invoke(s, 'payments', {
    method: 'RECORD_INVOICE_PAYMENT', company_id: target.id,
    invoice_id: invoice2Id, payment_date: '2026-09-04',
    asset_account_id: bank.id, ar_account_id: ar.id, amount: 500,
  });
  check('over-paying through the old route is refused too', !legacyOver.ok, tech(legacyOver).slice(0, 100));

  const otherCo = companies.find((x) => x.id !== target!.id);
  if (otherCo) {
    const crossPay = await invoke(s, 'payments', {
      method: 'RECORD_INVOICE_PAYMENT', company_id: otherCo.id,
      invoice_id: invoice2Id, payment_date: '2026-09-04',
      asset_account_id: bank.id, ar_account_id: ar.id, amount: 10,
    });
    check('paying an invoice that belongs to another company is refused',
      !crossPay.ok, tech(crossPay).slice(0, 90));
  }

  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  console.log('test invoice: ' + invNumber);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
