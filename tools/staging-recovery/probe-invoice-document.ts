/**
 * What an invoice document can actually be built from today.
 *
 * Before redesigning the PDF, establish what data exists: line descriptions,
 * quantities, banking details, company identity, logo. Anything the PDF claims
 * must come from a real column, not a hopeful one.
 */
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  console.log('company: ' + co.name + ' (' + co.id + ')');

  console.log(NL + '======== companies row ========');
  const comp = await api.from('companies').select('*').eq('id', co.id).maybeSingle();
  if (comp.error) console.log('ERR ' + comp.error.message);
  else console.log(Object.keys(comp.data ?? {}).join(', '));
  console.log('logo_url: ' + JSON.stringify((comp.data as Record<string, unknown>)?.logo_url));

  console.log(NL + '======== bank_accounts ========');
  const banks = await api.from('bank_accounts')
    .select('id, name, account_type, account_number, bank_name, branch_code, currency, status, is_default')
    .eq('company_id', co.id);
  if (banks.error) console.log('ERR ' + banks.error.message);
  else for (const b of banks.data ?? []) console.log('  ' + JSON.stringify(b));

  console.log(NL + '======== journal_entry_items columns ========');
  const jei = await api.from('journal_entry_items').select('*').limit(1);
  if (jei.error) console.log('ERR ' + jei.error.message);
  else console.log(Object.keys((jei.data ?? [{}])[0] ?? {}).join(', '));

  console.log(NL + '======== invoices columns ========');
  const inv = await api.from('invoices').select('*').eq('company_id', co.id).limit(1);
  if (inv.error) console.log('ERR ' + inv.error.message);
  else console.log(Object.keys((inv.data ?? [{}])[0] ?? {}).join(', '));

  console.log(NL + '======== customers columns ========');
  const cust = await api.from('customers').select('*').eq('company_id', co.id).limit(1);
  if (cust.error) console.log('ERR ' + cust.error.message);
  else console.log(Object.keys((cust.data ?? [{}])[0] ?? {}).join(', '));

  console.log(NL + '======== master data (identity + bankers) ========');
  const md = await invoke(api, 'company-master-data', { method: 'GET', company_id: co.id });
  if (!md.ok) console.log('ERR ' + md.status + ' ' + JSON.stringify(md.body).slice(0, 300));
  else {
    const b = md.body as Record<string, unknown>;
    console.log('keys: ' + Object.keys(b).join(', '));
    console.log(JSON.stringify(b).slice(0, 1600));
  }

  console.log(NL + '======== a real invoice through GET_ONE ========');
  const anyInv = await api.from('invoices')
    .select('id, invoice_number, status')
    .eq('company_id', co.id).neq('status', 'draft').order('invoice_date', { ascending: false }).limit(1);
  const target = (anyInv.data ?? [])[0];
  if (target) {
    const one = await invoke(api, 'invoices', { method: 'GET_ONE', company_id: co.id, invoiceId: target.id });
    console.log('status ' + one.status + '  ' + target.invoice_number);
    console.log(JSON.stringify(one.body).slice(0, 2000));
  }

  console.log(NL + '======== tax_rates ========');
  const tr = await api.from('tax_rates').select('*').eq('company_id', co.id).limit(3);
  if (tr.error) console.log('ERR ' + tr.error.message);
  else console.log(JSON.stringify(tr.data));
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
