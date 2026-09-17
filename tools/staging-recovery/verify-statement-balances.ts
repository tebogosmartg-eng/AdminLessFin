/**
 * A statement must tie to the ledger.
 *
 * The test is the one an accountant would apply: opening balance plus every
 * movement shown equals the closing balance, and that closing balance equals
 * the control account balance for that party on the statement's last day. If
 * those three do not agree, the statement is telling the customer something
 * the books do not say.
 *
 * Both sides are checked, because both carried the identical defect.
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

/** Net control-account movement for a party, over an optional date window. */
async function controlMovement(
  api: never,
  opts: {
    companyId: string; partyColumn: 'customer_id' | 'vendor_id'; partyId: string;
    controlIds: Set<string>; before?: string; upTo?: string; debitPositive: boolean;
  },
): Promise<number> {
  let q = (api as any).from('journal_entry_items')
    .select('amount, type, account_id, journal_entries!inner(company_id, ' + opts.partyColumn + ', entry_date)')
    .eq('journal_entries.company_id', opts.companyId)
    .eq('journal_entries.' + opts.partyColumn, opts.partyId);
  if (opts.before) q = q.lt('journal_entries.entry_date', opts.before);
  if (opts.upTo) q = q.lte('journal_entries.entry_date', opts.upTo);
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  let cents = 0;
  for (const item of r.data ?? []) {
    if (!opts.controlIds.has(item.account_id as string)) continue;
    const sign = opts.debitPositive
      ? (item.type === 'debit' ? 1 : -1)
      : (item.type === 'credit' ? 1 : -1);
    cents += sign * c(item.amount);
  }
  return cents;
}

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  const FROM = '2026-09-10';
  const TO = '2026-12-31';

  const coa = await api.from('chart_of_accounts')
    .select('id, account_role').eq('company_id', co.id);
  const arIds = new Set((coa.data ?? []).filter((a) => a.account_role === 'trade_receivable').map((a) => a.id as string));
  const apIds = new Set((coa.data ?? []).filter((a) => a.account_role === 'trade_payable').map((a) => a.id as string));

  console.log('======== CUSTOMER STATEMENTS ========');
  const customers = await api.from('customers').select('id, name').eq('company_id', co.id).limit(5);
  for (const cust of customers.data ?? []) {
    const res = await invoke(api, 'customers', {
      method: 'GET_DETAILS', company_id: co.id, customerId: cust.id, date_from: FROM, date_to: TO,
    });
    if (!res.ok) { check(cust.name as string, false, tech(res)); continue; }
    const body = res.body as {
      opening_balance: number; closing_balance: number; opening_balance_known: boolean;
      statement: Array<{ type: string; amount: number }>;
    };

    const expectedOpening = await controlMovement(api as never, {
      companyId: co.id, partyColumn: 'customer_id', partyId: cust.id as string,
      controlIds: arIds, before: FROM, debitPositive: true,
    });
    const expectedClosing = await controlMovement(api as never, {
      companyId: co.id, partyColumn: 'customer_id', partyId: cust.id as string,
      controlIds: arIds, upTo: TO, debitPositive: true,
    });

    console.log(NL + '-- ' + cust.name + ' --');
    check('  opening balance is what the ledger said before the period',
      c(body.opening_balance) === expectedOpening,
      body.opening_balance + ' vs ' + expectedOpening / 100);

    const movement = body.statement.reduce(
      (t, r) => t + (r.type === 'invoice' ? c(r.amount) : -c(r.amount)), 0,
    );
    check('  opening plus the movements shown equals the closing balance',
      c(body.opening_balance) + movement === c(body.closing_balance),
      (c(body.opening_balance) + movement) / 100 + ' vs ' + body.closing_balance);

    check('  the closing balance is the control account balance at the period end',
      c(body.closing_balance) === expectedClosing,
      body.closing_balance + ' vs ' + expectedClosing / 100);
    check('  the balance is reported as derivable', body.opening_balance_known === true);
  }

  console.log(NL + '======== SUPPLIER STATEMENTS ========');
  const vendors = await api.from('vendors').select('id, name').eq('company_id', co.id).limit(5);
  for (const v of vendors.data ?? []) {
    const res = await invoke(api, 'vendors', {
      method: 'GET_DETAILS', company_id: co.id, vendorId: v.id, date_from: FROM, date_to: TO,
    });
    if (!res.ok) { check(v.name as string, false, tech(res)); continue; }
    const body = res.body as {
      opening_balance: number; closing_balance: number; opening_balance_known: boolean;
      statement: Array<{ type: string; amount: number }>;
    };

    const expectedOpening = await controlMovement(api as never, {
      companyId: co.id, partyColumn: 'vendor_id', partyId: v.id as string,
      controlIds: apIds, before: FROM, debitPositive: false,
    });
    const expectedClosing = await controlMovement(api as never, {
      companyId: co.id, partyColumn: 'vendor_id', partyId: v.id as string,
      controlIds: apIds, upTo: TO, debitPositive: false,
    });

    console.log(NL + '-- ' + v.name + ' --');
    check('  opening balance is what the ledger said before the period',
      c(body.opening_balance) === expectedOpening,
      body.opening_balance + ' vs ' + expectedOpening / 100);

    const movement = body.statement.reduce(
      (t, r) => t + (r.type === 'bill' ? c(r.amount) : -c(r.amount)), 0,
    );
    check('  opening plus the movements shown equals the closing balance',
      c(body.opening_balance) + movement === c(body.closing_balance),
      (c(body.opening_balance) + movement) / 100 + ' vs ' + body.closing_balance);

    check('  the closing balance is the control account balance at the period end',
      c(body.closing_balance) === expectedClosing,
      body.closing_balance + ' vs ' + expectedClosing / 100);
    check('  the balance is reported as derivable', body.opening_balance_known === true);
  }

  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
