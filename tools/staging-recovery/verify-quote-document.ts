/**
 * The quotation document, end to end, against production.
 *
 * The check that matters is the VAT one: a quote captured with a tax rate must
 * quote the tax, and the invoice raised from that quote must come to the same
 * number. Everything else on a quotation is worth less than a customer
 * accepting one price and being billed another.
 */
import { connect, invoke, tech } from './edgeProbe';
import { buildQuoteDocument, quoteTotals } from '../../src/lib/quotes/quoteDocument';

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
  const TODAY = new Date().toISOString().slice(0, 10);

  const coa = await api.from('chart_of_accounts')
    .select('id, name, type, account_role, tax_treatment, is_active').eq('company_id', co.id);
  const rows = coa.data ?? [];
  const income = rows.find((a) => a.type === 'Income' && a.is_active !== false)!;
  const ar = rows.find((a) => a.account_role === 'trade_receivable')!;
  const vatAccount = rows.find((a) => a.account_role === 'output_vat' || a.tax_treatment === 'output_vat');
  const vatRate = await api.from('tax_rates').select('id, name, rate')
    .eq('company_id', co.id).eq('is_default', true).maybeSingle();
  if (!vatRate.data) throw new Error('No default tax rate on this company.');
  const cust = await api.from('customers').select('id, name').eq('company_id', co.id)
    .ilike('name', 'Kudzanai').maybeSingle();
  if (!cust.data) throw new Error('Expected customer not found.');

  const rate = Number(vatRate.data.rate);
  const quoteNumber = 'QDOC-' + stamp;

  console.log('======== A QUOTE WITH VAT ON IT ========');
  const created = await invoke(api, 'quotes', {
    method: 'POST', company_id: co.id,
    quoteData: {
      customer_id: cust.data.id,
      quote_number: quoteNumber,
      quote_date: TODAY,
      expiry_date: '2026-12-31',
      status: 'sent',
      description: 'Brand refresh, two phases',
      terms: 'Fifty per cent deposit on acceptance.',
      items: [
        { description: 'Design of the Q3 brand refresh', quantity: 12, unit_price: 950, income_account_id: income.id, tax_rate_id: vatRate.data.id },
        { description: 'Print management', quantity: 1, unit_price: 2400, income_account_id: income.id, tax_rate_id: null },
      ],
    },
  });
  check('the quote saved', created.ok, created.ok ? quoteNumber : tech(created));
  if (!created.ok) { report(); return; }
  const quoteId = (created.body as { id: string }).id;

  console.log(NL + '======== THE DOCUMENT ========');
  const docRes = await invoke(api, 'quotes', { method: 'GET_DOCUMENT', company_id: co.id, quoteId });
  check('GET_DOCUMENT answered', docRes.ok, docRes.ok ? '' : tech(docRes));
  if (!docRes.ok) { report(); return; }

  const model = buildQuoteDocument(docRes.body as never, { today: TODAY });
  const expectedSubtotal = 12 * 950 + 2400;
  const expectedVat = Math.round(12 * 950 * rate) / 100;

  check('it names what was quoted',
    model.lines.map((l) => l.description).join(' | ') === 'Design of the Q3 brand refresh | Print management',
    model.lines.map((l) => l.description).join(' | '));
  check('the subtotal is the goods', c(model.subtotal) === c(expectedSubtotal), String(model.subtotal));
  check('the VAT that was captured is quoted', c(model.taxTotal) === c(expectedVat),
    model.taxTotal + ' expected ' + expectedVat);
  check('the total includes it', c(model.total) === c(expectedSubtotal) + c(expectedVat), String(model.total));
  check('the untaxed line is not taxed', c(model.lines[1].taxAmount) === 0, String(model.lines[1].taxAmount));
  check('the scope is printed', model.scope === 'Brand refresh, two phases', model.scope);
  check('the terms are printed', model.terms === 'Fifty per cent deposit on acceptance.', model.terms);
  check('it is not expired', model.isExpired === false, 'valid until ' + model.expiryDate);
  check('it says how long the price holds', (model.daysUntilExpiry ?? 0) > 0, String(model.daysUntilExpiry));
  check('the company is named', !!model.company.name && model.company.name !== 'Your Company', model.company.name);
  check('a logo is available to print', !!model.company.logoUrl);
  check('the customer is addressed', model.customer.name === cust.data.name, model.customer.name);
  check('the deposit reference is the quote number', model.banking?.reference === quoteNumber,
    String(model.banking?.reference));
  check('it has not been invoiced yet', model.convertedTo === null);

  console.log(NL + '======== THE LIST AGREES WITH THE DOCUMENT ========');
  const listRes = await invoke(api, 'quotes', { method: 'GET_ALL', company_id: co.id });
  if (listRes.ok) {
    const mine = ((listRes.body as Array<Record<string, any>>) ?? [])
      .find((q) => q.quote_number === quoteNumber);
    const listTotal = quoteTotals(mine?.quote_items);
    check('the list total equals the document total', c(listTotal.total) === c(model.total),
      listTotal.total + ' vs ' + model.total);
  } else {
    check('the list total equals the document total', false, tech(listRes));
  }

  console.log(NL + '======== THE INVOICE RAISED FROM IT AGREES TOO ========');
  const invNumber = 'QINV-' + stamp;
  const converted = await invoke(api, 'invoices', {
    method: 'CREATE_FROM_QUOTE', company_id: co.id, quoteId, percentage: 100,
    invoiceData: {
      invoice_date: TODAY, due_date: '2026-12-31', invoice_number: invNumber,
      accounts_receivable_id: ar.id, tax_payable_account_id: vatAccount?.id ?? null,
    },
  });
  if (converted.ok) {
    const invId = (converted.body as { id: string }).id;
    const invDoc = await invoke(api, 'invoices', { method: 'GET_DOCUMENT', company_id: co.id, invoiceId: invId });
    if (invDoc.ok) {
      const invTotal = (invDoc.body as { settlement?: { gross?: number } }).settlement?.gross ?? 0;
      check('the invoice comes to what was quoted', c(invTotal) === c(model.total),
        'quoted ' + model.total + ', invoiced ' + invTotal);
    } else {
      check('the invoice comes to what was quoted', false, tech(invDoc));
    }
    const after = await invoke(api, 'quotes', { method: 'GET_DOCUMENT', company_id: co.id, quoteId });
    const m2 = buildQuoteDocument(after.body as never, { today: TODAY });
    check('the quote now says which invoice it became', m2.convertedTo?.number === invNumber,
      String(m2.convertedTo?.number));
  } else {
    check('the quote converted to an invoice', false, tech(converted));
  }

  console.log(NL + '======== EVERY STATE RENDERS ========');
  for (const status of ['draft', 'sent', 'accepted', 'declined']) {
    const found = await api.from('quotes').select('id, quote_number')
      .eq('company_id', co.id).eq('status', status).limit(1);
    const q = (found.data ?? [])[0];
    if (!q) { console.log('  no ' + status + ' quote in this company; skipped'); continue; }
    const res = await invoke(api, 'quotes', { method: 'GET_DOCUMENT', company_id: co.id, quoteId: q.id });
    if (!res.ok) { check('a ' + status + ' quote produces a document', false, tech(res)); continue; }
    const m = buildQuoteDocument(res.body as never, { today: TODAY });
    check('a ' + status + ' quote produces a document', true, String(q.quote_number) + ' -> ' + m.statusLabel);
    check('  every line it has is labelled',
      m.lines.every((l) => l.description.trim().length > 0), m.lines.length + ' line(s)');
    check('  its figures are numbers, not NaN',
      [m.subtotal, m.taxTotal, m.total].every((n) => Number.isFinite(n)), 'total ' + m.total);
  }

  console.log(NL + '======== TENANT ISOLATION ========');
  const other = companies.find((x) => x.id !== co.id);
  if (other) {
    const cross = await invoke(api, 'quotes', { method: 'GET_DOCUMENT', company_id: other.id, quoteId });
    check('another company cannot fetch this quotation', !cross.ok, 'status ' + cross.status);
  }

  report();
  console.log('test quote: ' + quoteNumber);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
