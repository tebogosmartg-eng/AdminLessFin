/**
 * journal_entries has TWO relationships to invoices and to bills:
 *
 *   journal_entries.invoice_id -> invoices.id      (the document a journal is for)
 *   invoices.journal_entry_id  -> journal_entries.id (the journal a document raised)
 *
 * so a bare invoices(...) or bills(...) embed is ambiguous and PostgREST
 * refuses it. This runs every such query shape found in the edge functions and
 * reports which fail, then compares the two directions so the replacement is
 * chosen on evidence rather than preference.
 */
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);

async function run(label: string, q: any) {
  const { data, error } = await q;
  if (error) {
    console.log('  FAIL ' + label);
    console.log('       ' + String(error.message).slice(0, 160));
    return null;
  }
  console.log('  ok   ' + label + '  rows=' + (data?.length ?? (data ? 1 : 0)));
  return data;
}

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const cid = company.id;
  console.log('company: ' + company.name);

  console.log(NL + '======== AS THE CODE IS TODAY ========');
  await run('customers GET_DETAILS   journal_entries -> invoices(invoice_number)',
    s.from('journal_entries').select('id, entry_date, invoice_id, invoices ( invoice_number )').eq('company_id', cid).limit(5));
  await run('send-statement-email    journal_entries -> invoices+bills',
    s.from('journal_entries').select('id, entry_date, invoices(invoice_number), bills(bill_number)').eq('company_id', cid).limit(5));
  await run('calendar-events         invoices -> journal_entries(...)',
    s.from('invoices').select('id, invoice_number, journal_entries(journal_entry_items(amount, type))').eq('company_id', cid).limit(5));
  await run('calendar-events         bills -> journal_entries(...)',
    s.from('bills').select('id, bill_number, journal_entries(journal_entry_items(amount, type))').eq('company_id', cid).limit(5));
  await run('send-invoice-email      invoices -> journal_entries(...)',
    s.from('invoices').select('id, invoice_number, journal_entries ( journal_entry_items ( amount, type ) )').eq('company_id', cid).limit(5));

  console.log(NL + '======== THE TWO DIRECTIONS, DISAMBIGUATED ========');
  await run('journal_entries -> invoices!invoice_id',
    s.from('journal_entries').select('id, invoice_id, invoices!invoice_id ( invoice_number )').eq('company_id', cid).limit(5));
  await run('journal_entries -> invoices!journal_entry_id',
    s.from('journal_entries').select('id, invoice_id, invoices!journal_entry_id ( invoice_number )').eq('company_id', cid).limit(5));
  await run('journal_entries -> bills!bill_id',
    s.from('journal_entries').select('id, bill_id, bills!bill_id ( bill_number )').eq('company_id', cid).limit(5));
  await run('invoices -> journal_entries!journal_entry_id',
    s.from('invoices').select('id, invoice_number, journal_entries!journal_entry_id(journal_entry_items(amount, type))').eq('company_id', cid).limit(5));
  await run('bills -> journal_entries!journal_entry_id',
    s.from('bills').select('id, bill_number, journal_entries!journal_entry_id(journal_entry_items(amount, type))').eq('company_id', cid).limit(5));

  console.log(NL + '======== WHICH DIRECTION ACTUALLY ANSWERS THE STATEMENT? ========');
  console.log('A customer statement row shows the invoice the journal RELATES TO.');
  const fwd = await s.from('journal_entries')
    .select('id, journal_number, invoice_id, description, invoices!invoice_id ( invoice_number )')
    .eq('company_id', cid).not('invoice_id', 'is', null).limit(200);
  const rev = await s.from('journal_entries')
    .select('id, journal_number, invoice_id, description, invoices!journal_entry_id ( invoice_number )')
    .eq('company_id', cid).not('invoice_id', 'is', null).limit(200);
  const named = (rows: any[], key: 'f' | 'r') => rows.filter((r) => {
    const e = r.invoices;
    const v = Array.isArray(e) ? e[0]?.invoice_number : e?.invoice_number;
    return Boolean(v);
  }).length;
  const f = fwd.data ?? [];
  const r = rev.data ?? [];
  console.log('  journals that carry an invoice_id: ' + f.length);
  console.log('  ...of those, invoices!invoice_id resolves a number      : ' + named(f, 'f'));
  console.log('  ...of those, invoices!journal_entry_id resolves a number: ' + named(r, 'r'));
  console.log(NL + '  sample rows (forward | reverse):');
  for (let i = 0; i < Math.min(8, f.length); i++) {
    const fe = f[i].invoices;
    const re = r[i]?.invoices;
    const fv = (Array.isArray(fe) ? fe[0]?.invoice_number : fe?.invoice_number) ?? '-';
    const rv = (Array.isArray(re) ? re[0]?.invoice_number : re?.invoice_number) ?? '-';
    console.log('    ' + String(f[i].journal_number).padEnd(12) + String(fv).padEnd(14) + '| ' + String(rv).padEnd(14) + ' ' + String(f[i].description).slice(0, 46));
  }
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
