/**
 * The invoice document, end to end, against production.
 *
 * Posts a real invoice with two lines and VAT, then checks the three things
 * the printed document has always got wrong: that a line remembers what it
 * said, that only revenue reaches the invoice, and that the total is the
 * receivable rather than the sum of the debits. It also re-checks that the
 * posting engine still balances, because this change touched the engine's own
 * line insert and that guarantee must be proved rather than assumed.
 */
import { connect, invoke, tech } from './edgeProbe';
import { buildInvoiceDocument } from '../../src/lib/invoices/invoiceDocument';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
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
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });
  const stamp = Date.now();

  const coa = await api.from('chart_of_accounts')
    .select('id, account_number, name, type, account_role, tax_treatment, is_active')
    .eq('company_id', co.id);
  const rows = coa.data ?? [];
  const ar = rows.find((a) => a.account_role === 'trade_receivable')!;
  const income = rows.find((a) => a.type === 'Income' && a.is_active !== false)!;
  const vatAccount = rows.find((a) => a.account_role === 'output_vat' || a.tax_treatment === 'output_vat');
  const vatRate = await api.from('tax_rates').select('id, name, rate')
    .eq('company_id', co.id).eq('is_default', true).maybeSingle();

  const cust = await api.from('customers').select('id, name').eq('company_id', co.id)
    .ilike('name', 'Meat and Veg').maybeSingle();
  if (!cust.data) throw new Error('Expected customer not found.');

  const invNumber = 'DOC-' + stamp;
  const items: Array<Record<string, unknown>> = [
    { description: 'Design of the Q3 brand refresh', quantity: 12, unit_price: 950, income_account_id: income.id },
    { description: 'Print management', quantity: 1, unit_price: 2400, income_account_id: income.id },
  ];
  const taxed = !!(vatAccount && vatRate.data);
  if (taxed) items[0].tax_rate_id = vatRate.data!.id;

  console.log('======== POSTING AN INVOICE WITH REAL LINES ========');
  const created = await invoke(api, 'invoices', {
    method: 'CREATE_WITH_TIMESHEETS',
    company_id: co.id,
    invoiceData: {
      customer_id: cust.data.id,
      invoice_date: '2026-09-16',
      due_date: '2026-10-16',
      invoice_number: invNumber,
      accounts_receivable_id: ar.id,
      tax_payable_account_id: vatAccount?.id ?? null,
      description: 'Invoice document probe ' + stamp,
      p_items: items,
    },
    timesheetIds: [],
  });
  check('the invoice posted', created.ok, created.ok ? invNumber : tech(created));
  if (!created.ok) { report(); return; }

  const invRow = await api.from('invoices').select('id').eq('company_id', co.id)
    .eq('invoice_number', invNumber).maybeSingle();
  const invoiceId = invRow.data!.id as string;

  console.log(NL + '======== THE JOURNAL STILL BALANCES ========');
  const je = await api.from('invoices')
    .select('journal_entries!journal_entry_id(journal_number, journal_entry_items(amount, type, description, quantity, unit_price))')
    .eq('id', invoiceId).maybeSingle();
  const journalRaw = (je.data as Record<string, any>)?.journal_entries;
  const journal = Array.isArray(journalRaw) ? journalRaw[0] : journalRaw;
  const jeItems = (journal?.journal_entry_items ?? []) as Array<Record<string, any>>;
  const debits = jeItems.filter((i) => i.type === 'debit').reduce((t, i) => t + c(i.amount), 0);
  const credits = jeItems.filter((i) => i.type === 'credit').reduce((t, i) => t + c(i.amount), 0);
  check('debits equal credits', debits === credits, debits + ' vs ' + credits);
  check('the posting engine gave it a journal number', !!journal?.journal_number, String(journal?.journal_number));

  console.log(NL + '======== THE LINE REMEMBERS WHAT IT SAID ========');
  const described = jeItems.filter((i) => i.description);
  check('both revenue lines kept their description', described.length === 2,
    described.map((i) => i.description).join(' | '));
  const brand = jeItems.find((i) => i.description === 'Design of the Q3 brand refresh');
  check('it kept the quantity', c(brand?.quantity) === 1200, String(brand?.quantity));
  check('it kept the unit price', c(brand?.unit_price) === 95000, String(brand?.unit_price));
  check('the receivable line carries no invented description',
    jeItems.some((i) => i.type === 'debit' && !i.description));

  console.log(NL + '======== THE DOCUMENT ========');
  const docRes = await invoke(api, 'invoices', { method: 'GET_DOCUMENT', company_id: co.id, invoiceId });
  check('GET_DOCUMENT answered', docRes.ok, docRes.ok ? '' : tech(docRes));
  if (!docRes.ok) { report(); return; }

  const model = buildInvoiceDocument(docRes.body as any);
  const descriptions = model.lines.map((l) => l.description).join(' | ');
  check('it names what was sold, not the ledger account',
    descriptions === 'Design of the Q3 brand refresh | Print management', descriptions);
  check('the quantity and unit price are shown',
    model.lines[0]?.quantity === 12 && model.lines[0]?.unitPrice === 950,
    model.lines[0]?.quantity + ' x ' + model.lines[0]?.unitPrice);
  check('a quantity of one is not printed', model.lines[1]?.quantity === null);
  check('the subtotal is the revenue', c(model.subtotal) === c(12 * 950 + 2400), String(model.subtotal));

  const expectedVat = taxed ? Math.round(12 * 950 * Number(vatRate.data!.rate)) : 0;
  check('the tax is broken out', c(model.taxTotal) === expectedVat, model.taxTotal + ' expected ' + expectedVat / 100);
  check('the total is the receivable', c(model.total) === c(model.subtotal) + c(model.taxTotal), String(model.total));
  check('the lines reconcile to the total', model.linesReconcile);
  check('nothing has been received yet', c(model.amountDue) === c(model.total), String(model.amountDue));

  console.log(NL + '======== IDENTITY, LOGO AND BANKING ========');
  check('the company is named', !!model.company.name && model.company.name !== 'Your Company', model.company.name);
  check('a logo is available to print', !!model.company.logoUrl, String(model.company.logoUrl).slice(0, 62));
  check('the customer is addressed', model.customer.name === cust.data.name, model.customer.name);
  if (model.banking) {
    check('the default bank account was found', true, model.banking.accountName);
    check('the payment reference is the invoice number', model.banking.reference === invNumber);
    console.log('    banking details complete: ' + String(!model.banking.incomplete));
  } else {
    console.log('    no default bank account on this company; the panel says so rather than being omitted');
  }

  console.log(NL + '======== A PART PAYMENT SHOWS ON THE DOCUMENT ========');
  const cash = rows.find((a) => a.type === 'Asset' && /bank|cash/i.test(String(a.name)));
  if (cash) {
    const paid = await invoke(api, 'payments', {
      method: 'RECORD_CUSTOMER_RECEIPT', company_id: co.id, customerId: cust.data.id,
      amount: 1000, payment_date: '2026-09-16', deposit_account_id: cash.id,
      allocations: [{ invoice_id: invoiceId, amount: 1000 }],
      idempotency_key: 'docprobe:' + stamp,
    });
    if (paid.ok) {
      const after = await invoke(api, 'invoices', { method: 'GET_DOCUMENT', company_id: co.id, invoiceId });
      const m2 = buildInvoiceDocument(after.body as any);
      check('the document shows what was received', c(m2.amountPaid) === 100000, String(m2.amountPaid));
      check('and what is still due', c(m2.amountDue) === c(m2.total) - 100000, String(m2.amountDue));
      check('the status reads as part paid', m2.statusLabel === 'Part paid', m2.statusLabel);
      check('the total did not move', c(m2.total) === c(model.total), String(m2.total));
    } else {
      check('the receipt posted', false, tech(paid));
    }
  } else {
    console.log('    no cash account found; skipped');
  }

  console.log(NL + '======== AN INVOICE POSTED BEFORE THIS CHANGE ========');
  const old = await api.from('invoices').select('id, invoice_number')
    .eq('company_id', co.id).lt('invoice_date', '2026-09-16')
    .not('journal_entry_id', 'is', null)
    .order('invoice_date', { ascending: true }).limit(1);
  const oldInv = (old.data ?? [])[0];
  if (oldInv) {
    const oldDoc = await invoke(api, 'invoices', { method: 'GET_DOCUMENT', company_id: co.id, invoiceId: oldInv.id });
    if (oldDoc.ok) {
      const m = buildInvoiceDocument(oldDoc.body as any);
      check('it still produces a document', true, String(oldInv.invoice_number));
      check('its lines fall back to the account name rather than going blank',
        m.lines.length > 0 && m.lines.every((l) => l.description.trim().length > 0),
        m.lines.map((l) => l.description).join(' | ').slice(0, 70));
      check('its total is still stated', c(m.total) > 0, String(m.total));
    } else {
      check('it still produces a document', false, tech(oldDoc));
    }
  }

  console.log(NL + '======== TENANT ISOLATION ========');
  const other = companies.find((x) => x.id !== co.id);
  if (other) {
    const cross = await invoke(api, 'invoices', { method: 'GET_DOCUMENT', company_id: other.id, invoiceId });
    check('another company cannot fetch this invoice document', !cross.ok, 'status ' + cross.status);
  }

  report();
  console.log('test invoice: ' + invNumber);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
