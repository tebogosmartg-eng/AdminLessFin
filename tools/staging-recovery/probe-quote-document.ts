/**
 * What a quote document can actually be built from today.
 *
 * The same survey that preceded the invoice document: establish what columns
 * exist before designing anything that claims to print them.
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });
  console.log('company: ' + co.name);

  console.log(NL + '======== quotes columns ========');
  const q = await api.from('quotes').select('*').eq('company_id', co.id).limit(1);
  if (q.error) console.log('ERR ' + q.error.message);
  else console.log(Object.keys((q.data ?? [{}])[0] ?? {}).join(', '));

  console.log(NL + '======== quote_items columns ========');
  const qi = await api.from('quote_items').select('*').limit(1);
  if (qi.error) console.log('ERR ' + qi.error.message);
  else console.log(Object.keys((qi.data ?? [{}])[0] ?? {}).join(', '));

  console.log(NL + '======== statuses in use ========');
  const all = await api.from('quotes').select('id, quote_number, status, quote_date, expiry_date')
    .eq('company_id', co.id);
  const tally: Record<string, number> = {};
  for (const r of all.data ?? []) tally[String(r.status)] = (tally[String(r.status)] ?? 0) + 1;
  console.log(JSON.stringify(tally));
  console.log('total quotes: ' + (all.data ?? []).length);

  console.log(NL + '======== GET_ONE on a real quote ========');
  const target = (all.data ?? [])[0];
  if (!target) { console.log('no quotes in this company'); return; }
  const one = await invoke(api, 'quotes', { method: 'GET_ONE', company_id: co.id, quoteId: target.id });
  if (!one.ok) console.log('ERR ' + one.status + ' ' + tech(one));
  else console.log(JSON.stringify(one.body).slice(0, 2200));

  console.log(NL + '======== does a quote carry tax? ========');
  const withTax = await api.from('quote_items').select('*').not('tax_rate_id', 'is', null).limit(2);
  if (withTax.error) console.log('no tax_rate_id column: ' + withTax.error.message);
  else console.log('rows with a tax rate: ' + (withTax.data ?? []).length);

  console.log(NL + '======== quote -> invoice link ========');
  const linked = await api.from('invoices').select('id, invoice_number, quote_id')
    .eq('company_id', co.id).not('quote_id', 'is', null).limit(3);
  console.log(JSON.stringify(linked.data));
}

main().catch((e) => { console.error(String(e)); process.exit(1); });
