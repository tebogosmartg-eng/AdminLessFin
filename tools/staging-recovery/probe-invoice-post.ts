import { connect, invoke, tech } from './edgeProbe';
async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const customers = await invoke(s, 'customers', { method: 'GET', company_id });
  const customer = (customers.body as Array<{ id: string }>)?.[0];
  const coa = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id });
  const accts = (coa.body as Array<Record<string, unknown>>) ?? [];
  const ar = accts.find((a) => a.account_role === 'trade_receivable') ?? accts.find((a) => a.type === 'Asset');
  const income = accts.find((a) => a.type === 'Income');
  const n = `SR-INV-${Date.now()}`;
  const r = await invoke(s, 'invoices', {
    method: 'CREATE_WITH_TIMESHEETS', company_id,
    invoiceData: {
      customer_id: customer?.id, invoice_number: n,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      accounts_receivable_id: ar?.id, description: 'Staging recovery invoice probe',
      p_items: [{ product_id: null, description: 'probe', quantity: 3, unit_price: 33.33, income_account_id: income?.id, tax_rate_id: null, project_id: null }],
    },
  });
  console.log(`invoice post (99.99, a value that rounds awkwardly): ${r.status} ${r.ok ? 'OK' : tech(r)}`);
  if (r.ok) {
    const list = await invoke(s, 'invoices', { method: 'GET_ALL', company_id });
    const m = (list.body as Array<Record<string, unknown>>)?.find((i) => i.invoice_number === n);
    if (m?.id) {
      const d = await invoke(s, 'invoices', { method: 'VOID', company_id, invoiceId: m.id });
      console.log(`cleanup: ${d.ok ? 'deleted' : d.status}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
