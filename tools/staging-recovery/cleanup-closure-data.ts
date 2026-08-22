/**
 * Removes what the closure suite and the void-attribution probes created.
 *
 * Bills and invoices are VOIDED, never deleted: they are posted documents, and
 * voiding nets their ledger effect to zero through the normal path while
 * leaving the audit trail intact. Master data with no postings behind it is
 * deleted outright.
 */
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;

  console.log('=== VOID PROBE BILLS ===');
  const bills = await invoke(s, 'bills', { method: 'GET', company_id });
  const mine = ((bills.body as Array<Record<string, unknown>>) ?? []).filter(
    (b) => /^(CLOSURE-BILL-|CLOSURE-POBILL-|VOIDTEST-)/.test(String(b.bill_number ?? '')) && b.status !== 'void',
  );
  console.log(`  ${mine.length} to void`);
  for (const b of mine) {
    const r = await invoke(s, 'bills', { method: 'VOID', company_id, billId: b.id });
    console.log(`    ${b.bill_number}: ${r.ok ? 'voided' : 'FAILED ' + r.status}`);
  }

  console.log(NL + '=== VOID PROBE INVOICES ===');
  const invs = await invoke(s, 'invoices', { method: 'GET_ALL', company_id });
  const mineI = ((invs.body as Array<Record<string, unknown>>) ?? []).filter(
    (i) => /Closure suite/i.test(String(i.notes ?? i.description ?? '')) && i.status !== 'void',
  );
  console.log(`  ${mineI.length} to void`);
  for (const i of mineI) {
    const r = await invoke(s, 'invoices', { method: 'VOID', company_id, invoiceId: i.id });
    console.log(`    ${i.invoice_number}: ${r.ok ? 'voided' : 'FAILED ' + r.status}`);
  }

  console.log(NL + '=== DELETE PROBE MASTER DATA / DRAFTS ===');
  const quotes = await s.from('quotes').select('id, quote_number').eq('company_id', company_id)
    .or('quote_number.like.CLOSURE-Q-%,quote_number.like.UIERR-%');
  for (const q of quotes.data ?? []) {
    await s.from('quote_items').delete().eq('quote_id', q.id);
    const r = await s.from('quotes').delete().eq('id', q.id);
    console.log(`  quote ${q.quote_number}: ${r.error ? r.error.message : 'deleted'}`);
  }

  const pos = await s.from('purchase_orders').select('id, po_number').eq('company_id', company_id)
    .like('po_number', 'CLOSURE-PO-%');
  for (const p of pos.data ?? []) {
    await s.from('purchase_order_items').delete().eq('purchase_order_id', p.id);
    const r = await s.from('purchase_orders').delete().eq('id', p.id);
    console.log(`  PO ${p.po_number}: ${r.error ? r.error.message : 'deleted'}`);
  }

  const prods = await s.from('products').select('id, name').eq('company_id', company_id)
    .like('name', 'CLOSURE Service%');
  for (const p of prods.data ?? []) {
    const r = await s.from('products').delete().eq('id', p.id);
    console.log(`  product ${p.name}: ${r.error ? 'kept (' + r.error.code + ')' : 'deleted'}`);
  }

  const custs = await s.from('customers').select('id, name').eq('company_id', company_id)
    .like('name', 'CLOSURE Customer%');
  for (const c of custs.data ?? []) {
    const r = await s.from('customers').delete().eq('id', c.id);
    console.log(`  customer ${c.name}: ${r.error ? 'kept (' + r.error.code + ')' : 'deleted'}`);
  }

  const vends = await s.from('vendors').select('id, name').eq('company_id', company_id)
    .or('name.like.CLOSURE Supplier%,name.like.VOIDTEST%');
  for (const v of vends.data ?? []) {
    const r = await s.from('vendors').delete().eq('id', v.id);
    console.log(`  supplier ${v.name}: ${r.error ? 'kept (' + r.error.code + ', has postings)' : 'deleted'}`);
  }

  console.log(NL + '=== RESIDUAL PARTY BALANCES (must all be zero) ===');
  const ap = await s.rpc('get_vendor_ap_balances', { p_company_id: company_id });
  for (const v of (ap.data as Array<{ vendor_name: string; balance: number }>) ?? []) {
    if (/^(CLOSURE Supplier|VOIDTEST)/.test(v.vendor_name)) {
      console.log(`  ${v.vendor_name}: ${v.balance} ${Number(v.balance) === 0 ? 'PASS' : 'NON-ZERO'}`);
    }
  }
  const ar = await s.rpc('get_customer_ar_balances', { p_company_id: company_id });
  for (const c of (ar.data as Array<{ customer_name: string; balance: number }>) ?? []) {
    if (/^CLOSURE Customer/.test(c.customer_name)) {
      console.log(`  ${c.customer_name}: ${c.balance} ${Number(c.balance) === 0 ? 'PASS' : 'NON-ZERO'}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
