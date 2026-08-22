import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const before = await s.from('audit_logs').select('id', { count: 'exact', head: true })
    .eq('company_id', company_id).eq('table_name', 'quotes');
  const customers = await invoke(s, 'customers', { method: 'GET', company_id });
  const customer = (customers.body as Array<{ id: string }>)?.[0];
  const stamp = Date.now();
  const r = await invoke(s, 'quotes', {
    method: 'POST', company_id,
    quoteData: {
      customer_id: customer?.id,
      quote_date: new Date().toISOString().slice(0, 10),
      expiry_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      quote_number: `SR-AUDIT-${stamp}`,
      description: 'audit coverage probe',
      items: [{ description: 'probe line', quantity: 1, unit_price: 10 }],
    },
  });
  console.log(`quote create: ${r.status}`);
  await new Promise((res) => setTimeout(res, 1500));
  const after = await s.from('audit_logs').select('id, operation, new_data', { count: 'exact' })
    .eq('company_id', company_id).eq('table_name', 'quotes').order('created_at', { ascending: false }).limit(1);
  console.log(`quotes audit rows: ${before.count} -> ${after.count}`);
  console.log(`newest: ${JSON.stringify(after.data?.[0]?.operation)} ${JSON.stringify(after.data?.[0]?.new_data).slice(0, 120)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
