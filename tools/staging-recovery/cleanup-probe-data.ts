/**
 * Voids/removes only the records these staging-recovery probes created.
 * Matches on the SR- / "Staging recovery" markers the probes write.
 */
import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;

  const bills = await invoke(s, 'bills', { method: 'GET', company_id });
  const mine = ((bills.body as Array<Record<string, unknown>>) ?? []).filter(
    (b) => /^SR-/.test(String(b.bill_number ?? '')) && b.status !== 'void',
  );
  console.log(`bills to void: ${mine.length}`);
  for (const b of mine) {
    const r = await invoke(s, 'bills', { method: 'VOID', company_id, billId: b.id });
    console.log(`  ${b.bill_number}: ${r.ok ? 'voided' : 'FAILED'}`);
  }

  const products = await invoke(s, 'products', { method: 'GET', company_id });
  const mineP = ((products.body as Array<Record<string, unknown>>) ?? []).filter((p) =>
    /^SR (Service|Inventory) \d+/.test(String(p.name ?? '')),
  );
  console.log(`products to delete: ${mineP.length}`);
  for (const p of mineP) {
    const r = await invoke(s, 'products', { method: 'DELETE', company_id, productId: p.id });
    console.log(`  ${p.name}: ${r.ok ? 'deleted' : 'kept (' + r.status + ')'}`);
  }

  const quotes = await invoke(s, 'quotes', { method: 'GET_ALL', company_id });
  const mineQ = ((quotes.body as Array<Record<string, unknown>>) ?? []).filter((q) =>
    /^SR-AUDIT-/.test(String(q.quote_number ?? '')),
  );
  console.log(`quotes to delete: ${mineQ.length}`);
  for (const q of mineQ) {
    const r = await invoke(s, 'quotes', { method: 'DELETE', company_id, quoteId: q.id });
    console.log(`  ${q.quote_number}: ${r.ok ? 'deleted' : 'kept (' + r.status + ')'}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
