import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const customers = await invoke(s, 'customers', { method: 'GET', company_id });
  const customer = (customers.body as Array<{ id: string }>)?.[0];
  const TERMS = 'Valid 30 days. 50% deposit on acceptance. E&OE.';
  const n = `SR-TERMS-${Date.now()}`;

  const create = await invoke(s, 'quotes', {
    method: 'POST', company_id,
    quoteData: {
      customer_id: customer?.id, quote_number: n,
      quote_date: new Date().toISOString().slice(0, 10),
      expiry_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      description: 'terms persistence probe', terms: TERMS,
      items: [{ description: 'probe line', quantity: 1, unit_price: 250 }],
    },
  });
  console.log(`create: ${create.status} ${create.ok ? 'OK' : tech(create)}`);
  if (!create.ok) return;
  const id = (create.body as { id: string }).id;

  const one = await invoke(s, 'quotes', { method: 'GET_ONE', company_id, quoteId: id });
  const q = one.body as { terms?: string; quote_number?: string };
  console.log(`read back terms: ${JSON.stringify(q.terms)}`);
  console.log(`terms persisted : ${q.terms === TERMS ? 'YES' : 'NO'}`);

  const EDITED = TERMS + ' Amended.';
  const put = await invoke(s, 'quotes', {
    method: 'PUT', company_id, quoteId: id,
    quoteData: {
      customer_id: customer?.id, quote_number: n,
      quote_date: new Date().toISOString().slice(0, 10),
      expiry_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      description: 'terms persistence probe', terms: EDITED,
      items: [{ description: 'probe line', quantity: 1, unit_price: 250 }],
    },
  });
  const one2 = await invoke(s, 'quotes', { method: 'GET_ONE', company_id, quoteId: id });
  console.log(`edit: ${put.status} · terms after edit persisted: ${(one2.body as { terms?: string }).terms === EDITED ? 'YES' : 'NO'}`);

  // audit coverage added earlier should have recorded this quote
  const audit = await s.from('audit_logs').select('operation').eq('company_id', company_id)
    .eq('table_name', 'quotes').eq('record_id', id);
  console.log(`audit rows for this quote: ${audit.data?.length} (${(audit.data ?? []).map((r) => r.operation).join(',')})`);

  const del = await invoke(s, 'quotes', { method: 'DELETE', company_id, quoteId: id });
  console.log(`cleanup: ${del.ok ? 'deleted' : del.status}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
