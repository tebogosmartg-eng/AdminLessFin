/**
 * Can a stock item be sold on an invoice?
 *
 * post_sales_invoice_atomic consumes stock and posts COGS/inventory for any
 * stock-tracked line, then submits the journal under module 'sales_invoice'.
 * The accounting policy 'inventory.inventory_module_only' only ever allowed
 * those accounts from 'inventory_receipt'/'inventory_issue', so the whole
 * invoice was refused. This proves the state before and after the fix.
 *
 * Read-and-prove: everything it posts is voided and the stock put back.
 *
 *   npx tsx tools/staging-recovery/probe-sell-stock-on-invoice.ts
 */
import { connect, invoke, tech } from './edgeProbe';

const COMPANY = 'CERT TX 1785230675937';
let held = 0;
let missing = 0;
const gaps: string[] = [];

function control(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'HELD   ' : 'MISSING') + ' ' + label + (detail ? '  -- ' + detail : ''));
  if (ok) held++; else { missing++; gaps.push(label); }
}

const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

async function main() {
  const { supabase: api, companies } = await connect(COMPANY);
  const co = companies.find((x) => x.name === COMPANY);
  if (!co) throw new Error(`Not a member of ${COMPANY}.`);
  await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });
  const TODAY = new Date().toISOString().slice(0, 10);

  const customer = await api.from('customers').select('id, name').eq('company_id', co.id).limit(1).single();
  const ar = await api.from('chart_of_accounts').select('id, name')
    .eq('company_id', co.id).eq('account_role', 'trade_receivable').limit(1).single();
  const income = await api.from('chart_of_accounts').select('id, name')
    .eq('company_id', co.id).eq('type', 'Income').order('account_number').limit(1).single();

  // A stock-tracked product with cost accounts mapped and stock on hand.
  const products = await api.from('products')
    .select('id, name, type, item_class, quantity_on_hand, cogs_account_id, inventory_asset_account_id, standard_cost, price')
    .eq('company_id', co.id);
  if (products.error) throw new Error(`Could not read products: ${products.error.message}`);
  const stock = (products.data ?? []).filter((p) => {
    const cls = p.item_class ?? (p.type === 'service' ? 'service' : 'finished_good');
    return cls !== 'service' && cls !== 'non_stock';
  });
  console.log(`customer ${customer.data!.name}, AR ${ar.data!.name}, income ${income.data!.name}`);
  console.log(`stock products: ${stock.map((p) => `${p.name} (qty ${p.quantity_on_hand})`).join(', ') || 'none'}`);

  const product = stock.find((p) => Number(p.quantity_on_hand) > 0) ?? stock[0];
  if (!product) throw new Error('No stock-tracked product in this tenant to sell.');
  control('the product has a COGS and an inventory account mapped',
    Boolean(product.cogs_account_id && product.inventory_asset_account_id),
    `cogs ${product.cogs_account_id ? 'yes' : 'no'}, stock ${product.inventory_asset_account_id ? 'yes' : 'no'}`);

  const qtyBefore = n(product.quantity_on_hand);
  console.log(`selling 1 x ${product.name}; stock on hand before: ${qtyBefore}`);

  const nextNo = await invoke(api, 'invoices', { method: 'GET_NEXT_INVOICE_NUMBER', company_id: co.id });
  // The handler returns the number as a bare string. An undefined here would
  // be dropped from the RPC arguments and surface as "function not found",
  // which reads like a missing migration rather than a probe bug.
  const invoiceNumber = typeof nextNo.body === 'string'
    ? nextNo.body
    : (nextNo.body as { invoice_number?: string })?.invoice_number;
  if (!invoiceNumber) throw new Error(`No invoice number came back: ${JSON.stringify(nextNo.body)}`);
  console.log(`next invoice number: ${invoiceNumber}`);

  const created = await invoke(api, 'invoices', {
    method: 'CREATE_WITH_TIMESHEETS',
    company_id: co.id,
    timesheetIds: [],
    invoiceData: {
      customer_id: customer.data!.id,
      invoice_date: TODAY,
      due_date: TODAY,
      invoice_number: invoiceNumber,
      accounts_receivable_id: ar.data!.id,
      description: 'Stock sale probe',
      p_items: [{
        product_id: product.id,
        description: product.name,
        quantity: 1,
        unit_price: Number(product.price ?? 100) || 100,
        income_account_id: income.data!.id,
        tax_rate_id: null,
      }],
    },
  });

  control('an invoice for a stock item is accepted', created.ok,
    created.ok ? String((created.body as { id?: string })?.id) : tech(created) || JSON.stringify(created.body));

  const invoiceId = (created.body as { id?: string })?.id;
  if (!created.ok || !invoiceId) {
    console.log(`${String.fromCharCode(10)}HELD ${held}   MISSING ${missing}`);
    gaps.forEach((g) => console.log(`  - ${g}`));
    return;
  }

  // What did it actually post?
  const inv = await api.from('invoices').select('id, invoice_number, journal_entry_id').eq('id', invoiceId).single();
  const items = await api.from('journal_entry_items')
    .select('debit, credit, account_id, chart_of_accounts!account_id(name, account_role)')
    .eq('journal_entry_id', inv.data!.journal_entry_id);
  const rows = (items.data ?? []) as Array<{
    debit: number; credit: number;
    chart_of_accounts: { name: string; account_role: string | null } | null;
  }>;
  const roleOf = (r: typeof rows[number]) => r.chart_of_accounts?.account_role ?? '';
  const dr = n(rows.reduce((t, r) => t + Number(r.debit ?? 0), 0));
  const cr = n(rows.reduce((t, r) => t + Number(r.credit ?? 0), 0));
  console.log('journal:');
  rows.forEach((r) => console.log(`    ${r.chart_of_accounts?.name} [${roleOf(r) || '-'}]  Dr ${n(r.debit)}  Cr ${n(r.credit)}`));

  control('the journal balances', dr === cr && dr > 0, `Dr ${dr} / Cr ${cr}`);
  control('cost of sales is charged', rows.some((r) => roleOf(r) === 'cogs' && n(r.debit) > 0));
  control('stock is taken off the balance sheet', rows.some((r) => roleOf(r) === 'inventory_asset' && n(r.credit) > 0));

  const txn = await api.from('inventory_transactions')
    .select('quantity_change, total_cost, transaction_type, journal_entry_id')
    .eq('company_id', co.id).eq('source_doc_id', invoiceId);
  control('the stock subledger records the issue', (txn.data ?? []).length > 0,
    JSON.stringify(txn.data ?? []));
  const cogsPosted = n(rows.filter((r) => roleOf(r) === 'cogs').reduce((t, r) => t + Number(r.debit ?? 0), 0));
  const subledgerCost = n((txn.data ?? []).reduce((t, r) => t + Number(r.total_cost ?? 0), 0));
  control('the cost charged equals the cost taken out of stock', cogsPosted === subledgerCost,
    `GL ${cogsPosted} vs subledger ${subledgerCost}`);
  control('the subledger movement carries the same journal',
    (txn.data ?? []).every((r) => r.journal_entry_id === inv.data!.journal_entry_id));

  const after = await api.from('products').select('quantity_on_hand').eq('id', product.id).single();
  control('stock on hand drops by one', n(after.data!.quantity_on_hand) === n(qtyBefore - 1),
    `${qtyBefore} -> ${n(after.data!.quantity_on_hand)}`);

  // Put it back.
  const voided = await invoke(api, 'invoices', { method: 'VOID', company_id: co.id, invoiceId });
  console.log(`cleanup: void ${voided.ok ? 'ok' : 'FAILED ' + (tech(voided) || JSON.stringify(voided.body))}`);

  console.log(`${String.fromCharCode(10)}HELD ${held}   MISSING ${missing}`);
  gaps.forEach((g) => console.log(`  - ${g}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
