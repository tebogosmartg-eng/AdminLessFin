import { connect } from './edgeProbe';

/** Empirical audit-trigger coverage: which tables ever produce audit_logs rows. */
async function main() {
  const { supabase: s } = await connect(process.argv[2] || 'Spaceman');
  const all = await s.from('audit_logs').select('table_name, operation').limit(10000);
  const counts: Record<string, Set<string>> = {};
  for (const r of all.data ?? []) {
    (counts[r.table_name] ??= new Set()).add(r.operation);
  }
  console.log(`audit_logs rows sampled: ${all.data?.length ?? 0} (across every company the user can see)\n`);
  console.log('COVERED tables:');
  for (const [t, ops] of Object.entries(counts).sort()) console.log(`   ${t.padEnd(26)} ${[...ops].join(', ')}`);

  const REQUIRED = [
    ['Customer creation', 'customers'],
    ['Quotation creation', 'quotes'],
    ['Invoice creation', 'invoices'],
    ['Bill creation / void', 'bills'],
    ['Bill payment', 'payments'],
    ['Bank transaction', 'bank_transactions'],
    ['Journal', 'journal_entries'],
    ['Account change', 'chart_of_accounts'],
    ['Reconciliation', 'bank_reconciliations'],
  ];
  console.log('\nBrief Phase 7 required events:');
  for (const [label, table] of REQUIRED) {
    const has = !!counts[table];
    console.log(`   ${has ? 'COVERED    ' : 'NOT COVERED'} ${label.padEnd(24)} (${table})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
