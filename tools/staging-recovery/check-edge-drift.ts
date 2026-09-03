/**
 * Detects repo-vs-deployed drift for edge functions changed since the last
 * deploy I performed, by calling a method that only exists in the repo version.
 * "Unsupported method" means the deployed bundle is older than the repo.
 */
import { connect, invoke, tech } from './edgeProbe';

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const company_id = company.id;

  const probes: Array<{ fn: string; body: Record<string, unknown>; addedBy: string }> = [
    { fn: 'purchase-orders', body: { method: 'CANCEL', company_id, poId: '00000000-0000-0000-0000-000000000000' }, addedBy: 'df5ba5c cancel-not-delete' },
    { fn: 'purchase-orders', body: { method: 'GET_NEXT_NUMBER', company_id }, addedBy: '440e4a8 auto-fill PO number' },
    { fn: 'expense-claims', body: { method: 'GET_ALL', company_id }, addedBy: '9a7eba8 sequential claim numbers' },
    { fn: 'dashboard-data', body: { method: 'GET', company_id }, addedBy: '498a47f onboarding address' },
  ];

  for (const p of probes) {
    const r = await invoke(s, p.fn, p.body);
    const msg = tech(r) || String(r.error ?? '');
    const unsupported = /unsupported method|unknown method/i.test(msg);
    console.log(
      `${p.fn.padEnd(17)} ${String(p.body.method).padEnd(16)} status=${String(r.status).padEnd(4)} ` +
      `${unsupported ? 'STALE — method not in deployed bundle' : 'method exists in deployed bundle'}`
    );
    if (!r.ok && !unsupported) console.log(`    (failed for another reason, which still proves the method exists: ${msg.slice(0, 90)})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
