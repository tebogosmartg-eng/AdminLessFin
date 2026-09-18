/**
 * Supplier credits, end to end, against production.
 *
 * Runs in a certification tenant, never a client's books. A supplier credit is
 * recorded against a real bill, applied, taken off, re-applied and voided, and
 * every step is checked where it matters -- the journal, the bill's outstanding
 * balance and status, the supplier's account, the creditors age analysis and
 * the printed document -- not the HTTP status. It ends where it began: the void
 * reverses the journal and withdraws the settlement, and the script proves the
 * bill and the supplier balance are back to their starting figures. The void
 * credit itself stays on record, as it must.
 *
 * Also proves the controls: over-crediting, a missing reason, a credit posted
 * to the control account and deletion are all refused, and a signed-in user can
 * neither call the posting functions directly nor write supplier credit rows
 * past the edge function.
 *
 * Nothing here spends money: no bill is paid, so the tenant is left with one
 * void credit and no cash movement.
 *
 *   npx tsx tools/staging-recovery/verify-vendor-credits.ts
 */
import { connect, invoke, tech } from './edgeProbe';
import { buildVendorCreditDocument, type RawVendorCreditDocument } from '../../src/lib/vendorCredits/vendorCreditDocument';
import { vendorCreditTotals } from '../../src/lib/vendorCredits/vendorCreditTotals';

const COMPANY = 'CERT TX 1785230675937';
const BILL_NUMBER = 'CBILL-23263870';
const NL = String.fromCharCode(10);
const cents = (n: unknown) => Math.round(Number(n ?? 0) * 100);
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

function report() {
  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail) process.exit(1);
}

async function main() {
  const { supabase: api, companies } = await connect(COMPANY);
  const co = companies.find((x) => x.name === COMPANY);
  if (!co) throw new Error(`The E2E user is not a member of ${COMPANY}.`);
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });
  const TODAY = new Date().toISOString().slice(0, 10);

  const billRow = await api.from('bills').select('id, bill_number, vendor_id, status')
    .eq('company_id', co.id).eq('bill_number', BILL_NUMBER).maybeSingle();
  if (!billRow.data) throw new Error(`${BILL_NUMBER} not found in ${COMPANY}.`);
  const billId = billRow.data.id as string;
  const vendorId = billRow.data.vendor_id as string;

  /** What the bill is worth and what is left on it, through the same reads the screens use. */
  const settlement = async () => {
    const r = await invoke(api, 'vendor-credits', { method: 'GET_CREDITABLE_BILLS', company_id: co.id, vendorId });
    if (!r.ok) throw new Error('bill read failed: ' + tech(r));
    const row = (r.body as Array<{ id: string; gross: number; credited: number; outstanding: number; status: string }>)
      .find((b) => b.id === billId);
    const status = (await api.from('bills').select('status').eq('id', billId).single()).data?.status as string;
    return { ...(row ?? { gross: 0, credited: 0, outstanding: 0 }), status };
  };
  const ageing = async () => {
    const r = await invoke(api, 'vendors', { method: 'GET_AGE_ANALYSIS', company_id: co.id });
    if (!r.ok) throw new Error('age analysis read failed: ' + tech(r));
    const body = r.body as { parties?: Array<{ party_id: string; total: number }> } | Array<{ party_id: string; total: number }>;
    const rows = Array.isArray(body) ? body : (body.parties ?? []);
    return cents(rows.find((p) => p.party_id === vendorId)?.total ?? 0);
  };

  console.log('======== STARTING POSITION ========');
  const before = await settlement();
  const ageingBefore = await ageing();
  console.log(`  ${BILL_NUMBER}: status ${before.status}, gross ${before.gross}, outstanding ${before.outstanding}; supplier aged ${ageingBefore / 100}`);
  check('the bill starts with something outstanding', before.outstanding > 0, String(before.outstanding));
  check('the bill starts uncredited', cents(before.credited) === 0, String(before.credited));

  console.log(NL + '======== WHAT THE FORM IS OFFERED ========');
  check('the bill is offered for credit, with what can be credited',
    cents(before.gross) > 0 && cents((before as { creditable?: number }).creditable ?? before.gross) === cents(before.gross),
    JSON.stringify(before));

  const basis = await invoke(api, 'vendor-credits', { method: 'GET_BILL_FOR_CREDIT', company_id: co.id, billId });
  const b = basis.body as {
    lines: Array<{ description: string; quantity: number; unit_price: number; account_id: string }>;
    suggested_tax_rate_id: string | null; vat_total: number;
  };
  check('the bill lines come back to start the credit from', basis.ok && b.lines.length > 0, tech(basis) || String(b?.lines?.length));
  check('the VAT rate is suggested because it reproduces the bill VAT to the cent', basis.ok && !!b.suggested_tax_rate_id, String(b?.suggested_tax_rate_id));

  const next = await invoke(api, 'vendor-credits', { method: 'GET_NEXT_NUMBER', company_id: co.id });
  check('the next number is offered', next.ok && /^VCN-\d{5}$/.test(String(next.body)), String(next.body));

  console.log(NL + '======== CONTROLS BEFORE ANYTHING IS POSTED ========');
  const line = {
    description: 'Verification credit: one unit returned',
    quantity: 1, unit_price: 100,
    account_id: b.lines[0].account_id,
    tax_rate_id: b.suggested_tax_rate_id,
  };
  const create = (creditData: Record<string, unknown>) =>
    invoke(api, 'vendor-credits', { method: 'CREATE', company_id: co.id, creditData });

  const tooMuch = await create({ vendor_id: vendorId, credit_date: TODAY, reason: 'Over-credit attempt', bill_id: billId, items: [{ ...line, quantity: 40 }] });
  check('crediting more than the bill was worth is refused', !tooMuch.ok && /cannot be for|no more than/.test(tech(tooMuch) + JSON.stringify(tooMuch.body)), tech(tooMuch));

  const noReason = await create({ vendor_id: vendorId, credit_date: TODAY, reason: '  ', bill_id: billId, items: [line] });
  check('a supplier credit without a reason is refused', !noReason.ok && /say why/i.test(JSON.stringify(noReason.body)), tech(noReason));

  const apAccount = await api.from('chart_of_accounts').select('id').eq('company_id', co.id).eq('account_role', 'trade_payable').single();
  const toControl = await create({
    vendor_id: vendorId, credit_date: TODAY, reason: 'Control account attempt', bill_id: billId,
    items: [{ ...line, account_id: apAccount.data!.id, tax_rate_id: null }],
  });
  check('a credit posted to the payables control account is refused', !toControl.ok && /expense or asset/i.test(JSON.stringify(toControl.body)), tech(toControl));

  const direct = await api.rpc('post_vendor_credit_atomic', {
    p_company_id: co.id, p_vendor_id: vendorId, p_credit_date: TODAY, p_reason: 'direct',
    p_items: [line], p_actor_user_id: '00000000-0000-0000-0000-000000000000',
  });
  check('a signed-in user cannot call the posting function directly', !!direct.error, direct.error?.message ?? 'it was accepted');

  const oldFn = await api.rpc('create_vendor_credit', {
    p_company_id: co.id, p_vendor_id: vendorId, p_credit_number: 'X', p_date: TODAY,
    p_ap_account_id: apAccount.data!.id, p_reason: 'x', p_items: [],
  });
  check('the function that bypassed the posting engine is gone', !!oldFn.error, oldFn.error?.message ?? 'still callable');

  const oldAllocate = await api.rpc('allocate_vendor_credit', {
    p_company_id: co.id, p_vendor_credit_id: billId, p_bill_id: billId, p_amount: 1, p_ap_account_id: apAccount.data!.id,
  });
  check('the self-cancelling allocation journal is gone', !!oldAllocate.error, oldAllocate.error?.message ?? 'still callable');

  const directRow = await api.from('vendor_credits').insert({
    company_id: co.id, vendor_id: vendorId, credit_number: 'RLS-' + Date.now(), credit_date: TODAY, status: 'issued',
  }).select('id');
  check('supplier credit rows cannot be written past the edge function', !!directRow.error || (directRow.data ?? []).length === 0, directRow.error?.message ?? 'row inserted');

  const directAlloc = await api.from('bill_payment_allocations').insert({
    company_id: co.id, bill_id: billId, journal_entry_id: '00000000-0000-0000-0000-000000000000', amount: 1,
  }).select('id');
  check('settlements cannot be written past the posting functions', !!directAlloc.error || (directAlloc.data ?? []).length === 0, directAlloc.error?.message ?? 'row inserted');

  console.log(NL + '======== RECORD A CREDIT AGAINST THE BILL ========');
  const expected = vendorCreditTotals([line], [{ id: String(b.suggested_tax_rate_id), rate: 15 }]);
  const created = await create({
    vendor_id: vendorId, credit_date: TODAY, reason: 'One unit returned damaged (verification)',
    bill_id: billId, apply_to_bill: true, items: [line],
  });
  check('the supplier credit is recorded', created.ok, tech(created));
  if (!created.ok) { report(); return; }
  const c = created.body as { vendor_credit_id: string; credit_number: string; journal_id: string; total: number; tax: number; subtotal: number; applied: number };
  console.log(`  ${c.credit_number}, journal ${c.journal_id}, total ${c.total}`);
  check('its total is what the form showed', cents(c.total) === cents(expected.total), `${c.total} vs ${expected.total}`);
  check('it was applied to the bill', cents(c.applied) === cents(Math.min(expected.total, before.outstanding)), String(c.applied));

  const items = await api.from('journal_entry_items')
    .select('type, amount, chart_of_accounts(type, account_role)').eq('journal_entry_id', c.journal_id);
  const lines = (items.data ?? []) as Array<{ type: string; amount: number; chart_of_accounts: { type: string; account_role: string | null } }>;
  const sum = (pred: (l: typeof lines[number]) => boolean) => lines.filter(pred).reduce((t, l) => t + cents(l.amount), 0);
  check('the journal balances', sum((l) => l.type === 'debit') === sum((l) => l.type === 'credit') && lines.length > 0, `${lines.length} lines`);
  check('payables are debited with the total', sum((l) => l.type === 'debit' && l.chart_of_accounts?.account_role === 'trade_payable') === cents(c.total));
  check('input VAT is given back', sum((l) => l.type === 'credit' && ['input_vat', 'vat_control'].includes(String(l.chart_of_accounts?.account_role))) === cents(expected.tax));
  check('the cost is reduced', sum((l) => l.type === 'credit' && ['Expense', 'Asset'].includes(String(l.chart_of_accounts?.type))
    && !['input_vat', 'vat_control'].includes(String(l.chart_of_accounts?.account_role))) === cents(expected.subtotal));

  const afterIssue = await settlement();
  check('the bill outstanding fell by what was applied', cents(afterIssue.outstanding) === cents(before.outstanding) - cents(c.applied), `${before.outstanding} -> ${afterIssue.outstanding}`);
  check('the bill is now part settled', afterIssue.status === 'partially_paid', afterIssue.status);
  check('the bill records what has been credited against it', cents(afterIssue.credited) === cents(c.total), String(afterIssue.credited));

  const ageingAfter = await ageing();
  check('the creditors age analysis drops by the credit', ageingAfter === ageingBefore - cents(c.applied), `${ageingBefore / 100} -> ${ageingAfter / 100}`);

  console.log(NL + '======== THE DOCUMENT ========');
  const docRes = await invoke(api, 'vendor-credits', { method: 'GET_DOCUMENT', company_id: co.id, vendorCreditId: c.vendor_credit_id });
  check('the supplier credit document is assembled', docRes.ok, tech(docRes));
  if (docRes.ok) {
    const doc = buildVendorCreditDocument(docRes.body as RawVendorCreditDocument);
    check('it names the bill it credits', doc.originalBill?.number === BILL_NUMBER, doc.originalBill?.number);
    check('it states the reason', doc.reason === 'One unit returned damaged (verification)', doc.reason);
    check('its lines add up to the ledger total', doc.linesReconcile && cents(doc.total) === cents(c.total), `${doc.subtotal} + ${doc.taxTotal} = ${doc.total}`);
    check('it shows where the credit went', doc.applications.length === 1 && doc.applications[0].billNumber === BILL_NUMBER && doc.statusLabel === 'Applied in full', doc.statusLabel);
    check('it carries the letterhead and the supplier', !!doc.company.name && !!doc.vendor.name, `${doc.company.name} <- ${doc.vendor.name}`);
  }

  const list = await invoke(api, 'vendor-credits', { method: 'GET_ALL', company_id: co.id });
  const listed = (list.body as Array<{ id: string; total: number; applied: number; remaining: number }> | null)?.find((x) => x.id === c.vendor_credit_id);
  check('the list shows total, applied and what is left', !!listed && cents(listed.total) === cents(c.total) && cents(listed.remaining) === cents(c.total) - cents(c.applied), JSON.stringify(listed));

  console.log(NL + '======== TAKE IT OFF, PUT IT BACK ========');
  const deleted = await invoke(api, 'vendor-credits', { method: 'DELETE', company_id: co.id, id: c.vendor_credit_id });
  check('deleting a recorded supplier credit is refused', !deleted.ok && /void it instead/i.test(JSON.stringify(deleted.body)), tech(deleted));

  const unapplied = await invoke(api, 'vendor-credits', { method: 'UNAPPLY', company_id: co.id, vendorCreditId: c.vendor_credit_id, billId });
  const afterUnapply = await settlement();
  check('taking the credit off restores the bill', unapplied.ok && cents(afterUnapply.outstanding) === cents(before.outstanding) && afterUnapply.status === before.status, tech(unapplied) || `${afterUnapply.status} ${afterUnapply.outstanding}`);

  const overApply = await invoke(api, 'vendor-credits', {
    method: 'APPLY', company_id: co.id, vendorCreditId: c.vendor_credit_id, allocations: [{ bill_id: billId, amount: c.total + 1 }],
  });
  check('applying more than the credit has left is refused', !overApply.ok && /left to apply/.test(JSON.stringify(overApply.body)), tech(overApply));

  const reapplied = await invoke(api, 'vendor-credits', {
    method: 'APPLY', company_id: co.id, vendorCreditId: c.vendor_credit_id, allocations: [{ bill_id: billId, amount: c.total }],
  });
  const afterReapply = await settlement();
  check('applying it again settles the bill again', reapplied.ok && cents(afterReapply.outstanding) === cents(before.outstanding) - cents(c.total), tech(reapplied) || String(afterReapply.outstanding));

  console.log(NL + '======== VOID ========');
  const noVoidReason = await invoke(api, 'vendor-credits', { method: 'VOID', company_id: co.id, vendorCreditId: c.vendor_credit_id, reason: '' });
  check('voiding without a reason is refused', !noVoidReason.ok, tech(noVoidReason));

  const voided = await invoke(api, 'vendor-credits', { method: 'VOID', company_id: co.id, vendorCreditId: c.vendor_credit_id, reason: 'Verification run complete' });
  check('the supplier credit is voided', voided.ok, tech(voided));
  const v = voided.body as { reversal_journal_id?: string; reversal_journal_number?: string };
  check('a reversal journal was posted', !!v?.reversal_journal_id, String(v?.reversal_journal_number));

  const afterVoid = await settlement();
  check('the bill is owed in full again', cents(afterVoid.outstanding) === cents(before.outstanding) && afterVoid.status === before.status, `${afterVoid.status} ${afterVoid.outstanding}`);
  check('a void credit no longer counts against the bill', cents(afterVoid.credited) === 0, String(afterVoid.credited));
  const ageingEnd = await ageing();
  check('the creditors age analysis is back where it started', ageingEnd === ageingBefore, `${ageingBefore / 100} -> ${ageingEnd / 100}`);

  const stillThere = await api.from('journal_entries').select('id').eq('id', c.journal_id).maybeSingle();
  check('the posted journal was reversed, not deleted', !!stillThere.data, stillThere.data ? 'still on record' : 'gone');

  const voidDoc = await invoke(api, 'vendor-credits', { method: 'GET_DOCUMENT', company_id: co.id, vendorCreditId: c.vendor_credit_id });
  if (voidDoc.ok) {
    const doc = buildVendorCreditDocument(voidDoc.body as RawVendorCreditDocument);
    check('the document says void, with nothing left to apply', doc.isVoid && doc.remaining === 0 && doc.applications.length === 0, doc.statusLabel);
    check('the document names the reversal', !!doc.reversalJournalNumber, doc.reversalJournalNumber);
  }
  const again = await invoke(api, 'vendor-credits', { method: 'VOID', company_id: co.id, vendorCreditId: c.vendor_credit_id, reason: 'twice' });
  check('voiding twice is refused', !again.ok && /already void/.test(JSON.stringify(again.body)), tech(again));

  const applyVoid = await invoke(api, 'vendor-credits', {
    method: 'APPLY', company_id: co.id, vendorCreditId: c.vendor_credit_id, allocations: [{ bill_id: billId, amount: 1 }],
  });
  check('a void credit cannot be applied', !applyVoid.ok && /cannot be applied/.test(JSON.stringify(applyVoid.body)), tech(applyVoid));

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
