/**
 * Credit notes, end to end, against production.
 *
 * Runs in a certification tenant, never a client's books. A credit note is
 * issued against a real invoice, applied, taken off, re-applied and voided, and
 * every step is checked where it matters -- the journal, the invoice's
 * outstanding balance and status, the customer's statement, and the document
 * the customer would receive -- not the HTTP status. It ends where it began:
 * the void reverses the journal and withdraws the settlement, and the script
 * proves the invoice and the customer balance are back to their starting
 * figures. The void credit note itself stays on record, as it must.
 *
 * Also proves the controls: over-crediting, a missing reason and deletion are
 * refused, and a signed-in user can neither call the posting functions
 * directly nor write credit note rows past the edge function.
 *
 *   npx tsx tools/staging-recovery/verify-credit-notes.ts
 */
import { connect, invoke, tech } from './edgeProbe';
import { buildCreditNoteDocument, type RawCreditNoteDocument } from '../../src/lib/creditNotes/creditNoteDocument';
import { buildInvoiceDocument, settlementProgress, type RawInvoiceDocument } from '../../src/lib/invoices/invoiceDocument';
import { creditNoteTotals } from '../../src/lib/creditNotes/creditNoteTotals';

const COMPANY = 'CERT TX 1785230987178';
const INVOICE_NUMBER = 'INV-00001';
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

  const inv = await api.from('invoices').select('id, invoice_number, customer_id, status')
    .eq('company_id', co.id).eq('invoice_number', INVOICE_NUMBER).maybeSingle();
  if (!inv.data) throw new Error(`${INVOICE_NUMBER} not found in ${COMPANY}.`);
  const invoiceId = inv.data.id as string;
  const customerId = inv.data.customer_id as string;

  const settlement = async () => {
    const r = await invoke(api, 'payments', { method: 'GET_INVOICE_SETTLEMENT', company_id: co.id, invoice_id: invoiceId });
    if (!r.ok) throw new Error('settlement read failed: ' + tech(r));
    return r.body as { status: string; gross: number; allocated: number; outstanding: number };
  };
  const statement = async () => {
    const r = await invoke(api, 'customers', {
      method: 'GET_DETAILS', company_id: co.id, customerId, date_from: '2026-01-01', date_to: '2026-12-31',
    });
    if (!r.ok) throw new Error('statement read failed: ' + tech(r));
    return r.body as { closing_balance: number; statement: Array<Record<string, unknown>> };
  };

  console.log('======== STARTING POSITION ========');
  const before = await settlement();
  const statementBefore = await statement();
  console.log(`  ${INVOICE_NUMBER}: status ${before.status}, gross ${before.gross}, outstanding ${before.outstanding}; customer closing ${statementBefore.closing_balance}`);
  check('the invoice starts with something outstanding', before.outstanding > 0, String(before.outstanding));

  console.log(NL + '======== WHAT THE FORM IS OFFERED ========');
  const creditable = await invoke(api, 'credit-notes', { method: 'GET_CREDITABLE_INVOICES', company_id: co.id, customerId });
  const row = (creditable.body as Array<{ id: string; creditable: number; gross: number }> | null)?.find((r) => r.id === invoiceId);
  check('the invoice is offered for credit, with what can be credited', creditable.ok && !!row && cents(row.creditable) === cents(before.gross), tech(creditable) || JSON.stringify(row));

  const basis = await invoke(api, 'credit-notes', { method: 'GET_INVOICE_FOR_CREDIT', company_id: co.id, invoiceId });
  const b = basis.body as {
    lines: Array<{ description: string; quantity: number; unit_price: number; account_id: string }>;
    suggested_tax_rate_id: string | null; vat_total: number;
  };
  check('the invoice lines come back to start the credit from', basis.ok && b.lines.length > 0, tech(basis) || String(b?.lines?.length));
  check('the VAT rate is suggested because it reproduces the invoice VAT to the cent', basis.ok && !!b.suggested_tax_rate_id, String(b?.suggested_tax_rate_id));

  const next = await invoke(api, 'credit-notes', { method: 'GET_NEXT_NUMBER', company_id: co.id });
  check('the next number is offered', next.ok && /^CN-\d{5}$/.test(String(next.body)), String(next.body));

  console.log(NL + '======== CONTROLS BEFORE ANYTHING IS POSTED ========');
  const line = { description: 'Verification credit: two units returned', quantity: 2, unit_price: 100, account_id: b.lines[0].account_id, tax_rate_id: b.suggested_tax_rate_id };
  const tooMuch = await invoke(api, 'credit-notes', {
    method: 'CREATE', company_id: co.id,
    creditNoteData: { customer_id: customerId, credit_note_date: TODAY, reason: 'Over-credit attempt', invoice_id: invoiceId, items: [{ ...line, quantity: 20 }] },
  });
  check('crediting more than the invoice was worth is refused', !tooMuch.ok && /cannot be for|no more than/.test(tech(tooMuch) + JSON.stringify(tooMuch.body)), tech(tooMuch));

  const noReason = await invoke(api, 'credit-notes', {
    method: 'CREATE', company_id: co.id,
    creditNoteData: { customer_id: customerId, credit_note_date: TODAY, reason: '  ', invoice_id: invoiceId, items: [line] },
  });
  check('a credit note without a reason is refused', !noReason.ok && /say why/.test(JSON.stringify(noReason.body)), tech(noReason));

  const direct = await api.rpc('post_credit_note_atomic', {
    p_company_id: co.id, p_customer_id: customerId, p_credit_note_date: TODAY, p_reason: 'direct',
    p_items: [line], p_actor_user_id: '00000000-0000-0000-0000-000000000000',
  });
  check('a signed-in user cannot call the posting function directly', !!direct.error, direct.error?.message ?? 'it was accepted');

  const oldFn = await api.rpc('create_credit_note', {
    p_company_id: co.id, p_customer_id: customerId, p_credit_note_number: 'X', p_date: TODAY,
    p_ar_account_id: b.lines[0].account_id, p_tax_account_id: null, p_reason: 'x', p_items: [],
  });
  check('the function that bypassed the posting engine is gone', !!oldFn.error, oldFn.error?.message ?? 'still callable');

  const directRow = await api.from('credit_notes').insert({
    company_id: co.id, customer_id: customerId, credit_note_number: 'RLS-' + Date.now(), credit_note_date: TODAY, status: 'issued',
  }).select('id');
  check('credit note rows cannot be written past the edge function', !!directRow.error || (directRow.data ?? []).length === 0, directRow.error?.message ?? 'row inserted');

  console.log(NL + '======== ISSUE A CREDIT NOTE AGAINST THE INVOICE ========');
  const expected = creditNoteTotals([line], [{ id: String(b.suggested_tax_rate_id), rate: 15 }]);
  const created = await invoke(api, 'credit-notes', {
    method: 'CREATE', company_id: co.id,
    creditNoteData: {
      customer_id: customerId, credit_note_date: TODAY, reason: 'Two units returned damaged (verification)',
      invoice_id: invoiceId, apply_to_invoice: true, items: [line],
    },
  });
  check('the credit note is issued', created.ok, tech(created));
  if (!created.ok) { report(); return; }
  const c = created.body as { credit_note_id: string; credit_note_number: string; journal_id: string; total: number; tax: number; applied: number };
  console.log(`  ${c.credit_note_number}, journal ${c.journal_id}, total ${c.total}`);
  check('its total is what the form showed', cents(c.total) === cents(expected.total), `${c.total} vs ${expected.total}`);
  check('it was applied to the invoice', cents(c.applied) === cents(Math.min(expected.total, before.outstanding)), String(c.applied));

  const items = await api.from('journal_entry_items')
    .select('type, amount, chart_of_accounts(type, account_role)').eq('journal_entry_id', c.journal_id);
  const lines = (items.data ?? []) as Array<{ type: string; amount: number; chart_of_accounts: { type: string; account_role: string | null } }>;
  const sum = (pred: (l: typeof lines[number]) => boolean) => lines.filter(pred).reduce((t, l) => t + cents(l.amount), 0);
  check('the journal balances', sum((l) => l.type === 'debit') === sum((l) => l.type === 'credit') && lines.length > 0, `${lines.length} lines`);
  check('receivables are credited with the total', sum((l) => l.type === 'credit' && l.chart_of_accounts?.account_role === 'trade_receivable') === cents(c.total));
  check('output VAT is reversed', sum((l) => l.type === 'debit' && ['output_vat', 'vat_control'].includes(String(l.chart_of_accounts?.account_role))) === cents(expected.tax));
  check('revenue is reduced', sum((l) => l.type === 'debit' && l.chart_of_accounts?.type === 'Income') === cents(expected.subtotal));

  const afterIssue = await settlement();
  check('the invoice outstanding fell by what was applied', cents(afterIssue.outstanding) === cents(before.outstanding) - cents(c.applied), `${before.outstanding} -> ${afterIssue.outstanding}`);
  check('the invoice is now part settled', afterIssue.status === 'partially_paid', afterIssue.status);

  const statementAfter = await statement();
  const cnRow = statementAfter.statement.find((r) => r.credit_note_number === c.credit_note_number);
  check('the statement lists the credit note under its own number', !!cnRow && cnRow.type === 'payment' && cents(cnRow.amount) === cents(c.total), JSON.stringify(cnRow));
  check('the customer balance fell by the credit', cents(statementAfter.closing_balance) === cents(statementBefore.closing_balance) - cents(c.total), `${statementBefore.closing_balance} -> ${statementAfter.closing_balance}`);

  console.log(NL + '======== THE DOCUMENTS ========');
  const docRes = await invoke(api, 'credit-notes', { method: 'GET_DOCUMENT', company_id: co.id, creditNoteId: c.credit_note_id });
  check('the credit note document is assembled', docRes.ok, tech(docRes));
  if (docRes.ok) {
    const doc = buildCreditNoteDocument(docRes.body as RawCreditNoteDocument);
    check('it names the invoice it credits', doc.originalInvoice?.number === INVOICE_NUMBER, doc.originalInvoice?.number);
    check('it states the reason', doc.reason === 'Two units returned damaged (verification)', doc.reason);
    check('its lines add up to the ledger total', doc.linesReconcile && cents(doc.total) === cents(c.total), `${doc.subtotal} + ${doc.taxTotal} = ${doc.total}`);
    check('it shows where the credit went', doc.applications.length === 1 && doc.applications[0].invoiceNumber === INVOICE_NUMBER && doc.statusLabel === 'Applied in full', doc.statusLabel);
    check('it carries the letterhead and the customer', !!doc.company.name && !!doc.customer.name, `${doc.company.name} -> ${doc.customer.name}`);
  }

  const invDoc = await invoke(api, 'invoices', { method: 'GET_DOCUMENT', company_id: co.id, invoiceId });
  if (invDoc.ok) {
    const m = buildInvoiceDocument(invDoc.body as RawInvoiceDocument);
    check('the invoice prints the credit as a credit, not as money received', cents(m.amountCredited) === cents(c.applied) && m.amountPaid === 0, `credited ${m.amountCredited}, received ${m.amountPaid}`);
    check('the invoice names the credit note', m.creditNotes.some((x) => x.number === c.credit_note_number), JSON.stringify(m.creditNotes));
    check('the invoice progress line says credited', /credited/.test(String(settlementProgress(m))), String(settlementProgress(m)));
  } else {
    check('the invoice document is assembled', false, tech(invDoc));
  }

  const list = await invoke(api, 'credit-notes', { method: 'GET_ALL', company_id: co.id });
  const listed = (list.body as Array<{ id: string; total: number; applied: number; remaining: number }> | null)?.find((x) => x.id === c.credit_note_id);
  check('the list shows total, applied and what is left', !!listed && cents(listed.total) === cents(c.total) && cents(listed.remaining) === cents(c.total) - cents(c.applied), JSON.stringify(listed));

  console.log(NL + '======== TAKE IT OFF, PUT IT BACK ========');
  const deleted = await invoke(api, 'credit-notes', { method: 'DELETE', company_id: co.id, id: c.credit_note_id });
  check('deleting an issued credit note is refused', !deleted.ok && /void it instead/i.test(JSON.stringify(deleted.body)), tech(deleted));

  const unapplied = await invoke(api, 'credit-notes', { method: 'UNAPPLY', company_id: co.id, creditNoteId: c.credit_note_id, invoiceId });
  const afterUnapply = await settlement();
  check('taking the credit off restores the invoice', unapplied.ok && cents(afterUnapply.outstanding) === cents(before.outstanding) && afterUnapply.status === before.status, tech(unapplied) || `${afterUnapply.status} ${afterUnapply.outstanding}`);

  const overApply = await invoke(api, 'credit-notes', {
    method: 'APPLY', company_id: co.id, creditNoteId: c.credit_note_id, allocations: [{ invoice_id: invoiceId, amount: c.total + 1 }],
  });
  check('applying more than the credit has left is refused', !overApply.ok && /left to apply/.test(JSON.stringify(overApply.body)), tech(overApply));

  const reapplied = await invoke(api, 'credit-notes', {
    method: 'APPLY', company_id: co.id, creditNoteId: c.credit_note_id, allocations: [{ invoice_id: invoiceId, amount: c.total }],
  });
  const afterReapply = await settlement();
  check('applying it again settles the invoice again', reapplied.ok && cents(afterReapply.outstanding) === cents(before.outstanding) - cents(c.total), tech(reapplied) || String(afterReapply.outstanding));

  console.log(NL + '======== VOID ========');
  const noVoidReason = await invoke(api, 'credit-notes', { method: 'VOID', company_id: co.id, creditNoteId: c.credit_note_id, reason: '' });
  check('voiding without a reason is refused', !noVoidReason.ok, tech(noVoidReason));

  const voided = await invoke(api, 'credit-notes', { method: 'VOID', company_id: co.id, creditNoteId: c.credit_note_id, reason: 'Verification run complete' });
  check('the credit note is voided', voided.ok, tech(voided));
  const v = voided.body as { reversal_journal_id?: string; reversal_journal_number?: string };
  check('a reversal journal was posted', !!v?.reversal_journal_id, String(v?.reversal_journal_number));

  const afterVoid = await settlement();
  check('the invoice is owed in full again', cents(afterVoid.outstanding) === cents(before.outstanding) && afterVoid.status === before.status, `${afterVoid.status} ${afterVoid.outstanding}`);
  const statementEnd = await statement();
  check('the customer balance is back where it started', cents(statementEnd.closing_balance) === cents(statementBefore.closing_balance), `${statementBefore.closing_balance} -> ${statementEnd.closing_balance}`);

  const voidDoc = await invoke(api, 'credit-notes', { method: 'GET_DOCUMENT', company_id: co.id, creditNoteId: c.credit_note_id });
  if (voidDoc.ok) {
    const doc = buildCreditNoteDocument(voidDoc.body as RawCreditNoteDocument);
    check('the document says void, with nothing left to apply', doc.isVoid && doc.remaining === 0 && doc.applications.length === 0, doc.statusLabel);
    check('the document names the reversal', !!doc.reversalJournalNumber, doc.reversalJournalNumber);
  }
  const again = await invoke(api, 'credit-notes', { method: 'VOID', company_id: co.id, creditNoteId: c.credit_note_id, reason: 'twice' });
  check('voiding twice is refused', !again.ok && /already void/.test(JSON.stringify(again.body)), tech(again));

  report();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
