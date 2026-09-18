/**
 * What the quotations module currently allows, against production.
 *
 * Read-and-prove, not a fix: every check below states a control a quotation
 * module is expected to have, and reports whether it is there. Runs in a
 * certification tenant. Anything it posts is voided or deleted before it ends.
 *
 *   npx tsx tools/staging-recovery/probe-quote-controls.ts
 */
import { connect, invoke, tech } from './edgeProbe';

const COMPANY = 'CERT TX 1785230675937';
const NL = String.fromCharCode(10);
let held = 0;
let missing = 0;
const gaps: string[] = [];

function control(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'HELD   ' : 'MISSING') + ' ' + label + (detail ? '  -- ' + detail : ''));
  if (ok) held++; else { missing++; gaps.push(label); }
}

async function main() {
  const { supabase: api, companies } = await connect(COMPANY);
  const co = companies.find((x) => x.name === COMPANY);
  if (!co) throw new Error(`Not a member of ${COMPANY}.`);
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });
  const TODAY = new Date().toISOString().slice(0, 10);

  const customer = await api.from('customers').select('id, name').eq('company_id', co.id).limit(1).single();
  const income = await api.from('chart_of_accounts').select('id, name')
    .eq('company_id', co.id).eq('type', 'Income').order('account_number').limit(1).single();
  const ar = await api.from('chart_of_accounts').select('id')
    .eq('company_id', co.id).eq('account_role', 'trade_receivable').single();
  console.log(`customer ${customer.data!.name}, income ${income.data!.name}`);

  const line = {
    description: 'Quote control probe line',
    quantity: 1,
    unit_price: 1000,
    income_account_id: income.data!.id,
    tax_rate_id: null,
  };

  const made: string[] = [];
  const invoicesMade: string[] = [];

  const newQuote = async (overrides: Record<string, unknown> = {}) => {
    const r = await invoke(api, 'quotes', {
      method: 'POST', company_id: co.id,
      quoteData: {
        customer_id: customer.data!.id, quote_date: TODAY, expiry_date: TODAY,
        status: 'draft', description: 'control probe', items: [line], ...overrides,
      },
    });
    const id = (r.body as { quote_id?: string; id?: string })?.quote_id ?? (r.body as { id?: string })?.id;
    if (r.ok && id) made.push(id);
    return r;
  };

  console.log(NL + '======== WHAT A QUOTE MAY SAY ========');
  const badStatus = await newQuote({ status: 'totally-made-up' });
  const badStatusId = (badStatus.body as { quote_id?: string })?.quote_id;
  const storedStatus = badStatusId
    ? (await api.from('quotes').select('status').eq('id', badStatusId).single()).data?.status
    : null;
  control('a quote cannot be given a status that does not exist',
    !badStatus.ok || storedStatus === 'draft',
    badStatus.ok ? `created as "${storedStatus}"` : tech(badStatus));

  const noLines = await newQuote({ items: [] });
  control('a quote must have at least one line', !noLines.ok,
    noLines.ok ? 'a quote with no lines was accepted' : tech(noLines));

  const negative = await newQuote({ items: [{ ...line, quantity: -5 }] });
  control('a quote line cannot be for a negative quantity', !negative.ok,
    negative.ok ? 'quantity -5 was accepted' : tech(negative));

  const foreignAccount = await api.from('chart_of_accounts').select('id, company_id')
    .neq('company_id', co.id).eq('type', 'Income').limit(1).single();
  const crossAccount = await newQuote({ items: [{ ...line, income_account_id: foreignAccount.data!.id }] });
  control('a quote line cannot point at another company’s income account', !crossAccount.ok,
    crossAccount.ok ? 'another company’s account was accepted' : tech(crossAccount));

  console.log(NL + '======== WRITING PAST THE EDGE FUNCTION ========');
  const directQuote = await api.from('quotes').insert({
    company_id: co.id, customer_id: customer.data!.id, quote_number: 'RLS-' + Date.now(),
    quote_date: TODAY, status: 'accepted',
  }).select('id');
  const wroteDirect = !directQuote.error && (directQuote.data ?? []).length > 0;
  if (wroteDirect) made.push(directQuote.data![0].id);
  control('quote rows cannot be written straight to the database', !wroteDirect,
    wroteDirect ? 'a signed-in user inserted a quote directly' : directQuote.error?.message ?? '');

  console.log(NL + '======== AN ACCEPTED QUOTE ========');
  const accepted = await newQuote();
  const acceptedId = (accepted.body as { quote_id?: string; id?: string }).quote_id
    ?? (accepted.body as { id: string }).id;

  const answered = await invoke(api, 'quotes', {
    method: 'PUT', company_id: co.id, quoteId: acceptedId, quoteData: { status: 'accepted' },
  });
  control('a quotation can be marked accepted', answered.ok, tech(answered));

  const nonsense = await invoke(api, 'quotes', {
    method: 'PUT', company_id: co.id, quoteId: acceptedId, quoteData: { status: 'totally-made-up' },
  });
  control('a quotation cannot be answered with something that is not an answer', !nonsense.ok, tech(nonsense));

  const rewritten = await invoke(api, 'quotes', {
    method: 'PUT', company_id: co.id, quoteId: acceptedId,
    quoteData: {
      customer_id: customer.data!.id, quote_date: TODAY, expiry_date: TODAY, description: 'control probe',
      items: [{ ...line, unit_price: 999999, description: 'Rewritten after acceptance' }],
    },
  });
  let nowSays = 0;
  if (rewritten.ok) {
    const check = await api.from('quote_items').select('unit_price').eq('quote_id', acceptedId);
    nowSays = Number((check.data ?? [])[0]?.unit_price ?? 0);
  }
  control('the lines of an accepted quote cannot be rewritten',
    (!rewritten.ok && /can no longer be changed/i.test(JSON.stringify(rewritten.body))) || nowSays !== 999999,
    nowSays === 999999 ? 'the accepted price was changed to 999999' : tech(rewritten));

  console.log(NL + '======== TURNING A QUOTE INTO AN INVOICE ========');
  // invoice_number must be supplied: the edge function passes it straight to
  // post_sales_invoice_atomic, and omitting it makes the RPC miss the function
  // signature entirely rather than report anything useful.
  const nextInvoiceNumber = async () =>
    String((await invoke(api, 'invoices', { method: 'GET_NEXT_INVOICE_NUMBER', company_id: co.id })).body);

  const convert = async (percentage: unknown) => invoke(api, 'invoices', {
    method: 'CREATE_FROM_QUOTE', company_id: co.id, quoteId: acceptedId, percentage,
    invoiceData: {
      invoice_date: TODAY, due_date: TODAY, accounts_receivable_id: ar.data!.id,
      invoice_number: await nextInvoiceNumber(),
      description: 'Quote control probe',
    },
  });

  const first = await convert(100);
  if (first.ok) invoicesMade.push(String((first.body as { id: string }).id));
  control('a quote can be turned into an invoice', first.ok, tech(first));

  const noNumber = await invoke(api, 'invoices', {
    method: 'CREATE_FROM_QUOTE', company_id: co.id, quoteId: acceptedId, percentage: 100,
    invoiceData: { invoice_date: TODAY, due_date: TODAY, accounts_receivable_id: ar.data!.id, description: 'no number' },
  });
  control('leaving out the invoice number says so, rather than reporting a missing function',
    !noNumber.ok && !/schema cache|Could not find the function/i.test(JSON.stringify(noNumber.body)), tech(noNumber));

  const second = await convert(100);
  if (second.ok) invoicesMade.push(String((second.body as { id: string }).id));
  control('the same quote cannot be invoiced twice', !second.ok,
    second.ok ? 'a second full invoice was raised from one quote' : tech(second));

  const over = await convert(500);
  if (over.ok) invoicesMade.push(String((over.body as { id: string }).id));
  control('a quote cannot be invoiced for more than it was for', !over.ok,
    over.ok ? '500% of the quote was invoiced' : tech(over));

  const declined = await newQuote();
  const declinedId = (declined.body as { quote_id: string }).quote_id;
  await invoke(api, 'quotes', {
    method: 'PUT', company_id: co.id, quoteId: declinedId, quoteData: { status: 'declined', reason: 'probe' },
  });
  const declinedConvert = await invoke(api, 'invoices', {
    method: 'CREATE_FROM_QUOTE', company_id: co.id, quoteId: declinedId, percentage: 100,
    invoiceData: {
      invoice_date: TODAY, due_date: TODAY, accounts_receivable_id: ar.data!.id,
      invoice_number: await nextInvoiceNumber(), description: 'declined probe',
    },
  });
  if (declinedConvert.ok) invoicesMade.push(String((declinedConvert.body as { id: string }).id));
  control('a declined quote cannot be invoiced', !declinedConvert.ok,
    declinedConvert.ok ? 'a declined quote was invoiced' : tech(declinedConvert));

  console.log(NL + '======== DELETING ========');
  const deleteConverted = await invoke(api, 'quotes', { method: 'DELETE', company_id: co.id, quoteId: acceptedId });
  let stillLinked = true;
  if (deleteConverted.ok) {
    const q = await api.from('quotes').select('id').eq('id', acceptedId).maybeSingle();
    stillLinked = !!q.data;
  }
  control('a quote that has been invoiced cannot be deleted', !deleteConverted.ok || stillLinked,
    deleteConverted.ok && !stillLinked ? 'the quote behind a posted invoice was deleted' : tech(deleteConverted));

  console.log(NL + '======== WHAT THE LINES REMEMBER ========');
  const cols = await api.from('quote_items').select('*').eq('quote_id', acceptedId).limit(1);
  const sample = (cols.data ?? [])[0] ?? {};
  control('a quote line records where it sat, so the printed order is the entered order',
    Object.prototype.hasOwnProperty.call(sample, 'position'), Object.keys(sample).join(', '));
  control('a quote line records what it was quoted at, so a later rate change cannot restate it',
    Object.prototype.hasOwnProperty.call(sample, 'line_amount'), '');

  console.log(NL + '======== CLEARING UP ========');
  for (const id of invoicesMade) {
    const v = await invoke(api, 'invoices', { method: 'VOID', company_id: co.id, invoiceId: id, reason: 'Quote control probe' });
    console.log('  invoice ' + id.slice(0, 8) + ' voided: ' + (v.ok ? 'yes' : tech(v)));
  }
  for (const id of made) {
    await invoke(api, 'quotes', { method: 'DELETE', company_id: co.id, quoteId: id });
  }
  const left = await api.from('quotes').select('quote_number, status').eq('company_id', co.id).in('id', made);
  const rows = left.data ?? [];
  console.log(rows.length === 0
    ? '  every probe quote removed'
    : `  kept on record (invoiced, so not deletable — by design): ${rows.map((r) => r.quote_number + ' ' + r.status).join(', ')}`);

  console.log(NL + 'CONTROLS HELD ' + held + '  MISSING ' + missing);
  if (missing) {
    console.log(NL + 'Missing:');
    for (const g of gaps) console.log('  - ' + g);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
