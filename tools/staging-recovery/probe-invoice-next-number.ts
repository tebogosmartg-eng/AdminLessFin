/**
 * The next invoice number a company is offered, and whether it is free.
 *
 * get_next_invoice_number_for_user() used to read the most recently CREATED
 * invoice, so any company whose newest invoice was not an INV-##### was offered
 * INV-00001 -- which every such company had already used, so the invoice form
 * failed on save with a duplicate key. This asks the deployed API and checks
 * the answer against the books. Read-only.
 *
 *   npx tsx tools/staging-recovery/probe-invoice-next-number.ts
 */
import { connect, invoke } from './edgeProbe';

const COMPANIES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Spaceman', 'CERT TX 1785230675937'];

async function main() {
  let bad = 0;
  for (const name of COMPANIES) {
    const { supabase: api, companies } = await connect(name);
    const co = companies.find((x) => x.name === name);
    if (!co) { console.log(`${name}: the E2E user is not a member`); continue; }
    await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

    const r = await invoke(api, 'invoices', { method: 'GET_NEXT_INVOICE_NUMBER', company_id: co.id });
    const offered = String(r.body);
    const taken = await api.from('invoices').select('id')
      .eq('company_id', co.id).eq('invoice_number', offered).maybeSingle();
    const highest = await api.from('invoices').select('invoice_number')
      .eq('company_id', co.id).like('invoice_number', 'INV-%').order('invoice_number', { ascending: false }).limit(1).maybeSingle();

    const ok = !taken.data;
    if (!ok) bad++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${name.padEnd(26)} offers ${offered.padEnd(12)} ` +
      `highest on record ${String(highest.data?.invoice_number ?? '-').padEnd(12)} ` +
      `${ok ? 'free' : 'ALREADY USED'}`,
    );
  }
  console.log(bad ? `\n${bad} company/companies would fail on save.` : '\nEvery company is offered a free number.');
  if (bad) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
