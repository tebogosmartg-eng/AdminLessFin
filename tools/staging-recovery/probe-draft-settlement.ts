import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const co = companies.find((x) => x.name === 'Spaceman')!;
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

  const inv = await api.from('invoices')
    .select('id, invoice_number, status, journal_entry_id')
    .eq('company_id', co.id).eq('status', 'draft').limit(1).maybeSingle();
  console.log('draft: ' + JSON.stringify(inv.data));
  if (!inv.data) return;

  const res = await invoke(api, 'invoices', {
    method: 'GET_DOCUMENT', company_id: co.id, invoiceId: inv.data.id,
  });
  if (!res.ok) { console.log('ERR ' + tech(res)); return; }
  const body = res.body as Record<string, unknown>;
  console.log('settlement: ' + JSON.stringify(body.settlement));

  const alloc = await api.from('invoice_payment_allocations')
    .select('amount, journal_entry_id').eq('invoice_id', inv.data.id);
  console.log('allocations: ' + JSON.stringify(alloc.data));

  const je = (body.invoice as Record<string, any>).journal_entries;
  const items = (Array.isArray(je) ? je[0] : je)?.journal_entry_items ?? [];
  for (const i of items) {
    const a = Array.isArray(i.chart_of_accounts) ? i.chart_of_accounts[0] : i.chart_of_accounts;
    console.log('  ' + i.type + ' ' + i.amount + '  ' + a?.name + '  role=' + a?.account_role + '  type=' + a?.type);
  }
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
