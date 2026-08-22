import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const vendors = await invoke(s, 'vendors', { method: 'GET', company_id });
  const vendor = (vendors.body as Array<{ id: string }>)?.[0];
  const coa = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id });
  const accounts = (coa.body as Array<Record<string, unknown>>) ?? [];
  const ap = accounts.find((a) => a.account_role === 'trade_payable') ?? accounts.find((a) => a.type === 'Liability');
  const cogs = accounts.find((a) => a.account_role === 'cogs');
  const inventory = accounts.find((a) => a.account_role === 'inventory_asset');
  const plainExpense = accounts.find((a) => a.type === 'Expense' && a.account_role !== 'cogs');

  // What the form assigns when a product is chosen.
  const products = await invoke(s, 'products', { method: 'GET', company_id });
  const prods = (products.body as Array<Record<string, unknown>>) ?? [];
  console.log('products:', prods.map((p) => `${p.name}|${p.type}|cogs=${p.cogs_account_id ? 'set' : 'null'}`).join('\n          '));
  console.log(`cogs acct     : ${cogs?.name ?? 'NONE'}`);
  console.log(`inventory acct: ${inventory?.name ?? 'NONE'}`);
  console.log(`plain expense : ${plainExpense?.name}\n`);

  const today = new Date().toISOString().slice(0, 10);
  const mk = (acctId: unknown, label: string) => ({ label, acctId });
  const targets = [
    mk(cogs?.id, 'COGS account (what the form picks for a product with cogs_account_id)'),
    mk(inventory?.id, 'Inventory asset (what the form picks for an inventory product)'),
    mk(plainExpense?.id, 'Plain expense (control)'),
  ].filter((t) => t.acctId);

  const created: string[] = [];
  for (const t of targets) {
    const billNumber = `SR-COGS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const r = await invoke(s, 'bills', {
      method: 'POST', company_id,
      billData: {
        bill_number: billNumber, vendor_id: vendor?.id, bill_date: today, due_date: today,
        accounts_payable_id: ap?.id, tax_receivable_account_id: null,
        description: 'Staging recovery — COGS path', attachment_url: null,
        p_items: [{ product_id: null, quantity: 1, unit_cost: 55.55, expense_account_id: t.acctId, tax_rate_id: null, project_id: null }],
      },
    });
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${String(r.status).padEnd(4)} ${t.label}`);
    if (!r.ok) console.log(`        → ${tech(r)}`);
    if (r.ok) {
      const list = await invoke(s, 'bills', { method: 'GET', company_id });
      const m = (list.body as Array<Record<string, unknown>>)?.find((b) => b.bill_number === billNumber);
      if (m?.id) created.push(String(m.id));
    }
  }
  for (const id of created) await invoke(s, 'bills', { method: 'VOID', company_id, billId: id });
  console.log(`\ncleaned up ${created.length} bill(s)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
