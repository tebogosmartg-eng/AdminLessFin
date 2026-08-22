import { connect } from './edgeProbe';
async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const je = await s.from('journal_entries').select('id, journal_number, entry_date, description')
    .eq('company_id', company.id).eq('journal_number', 'JE-000017').maybeSingle();
  console.log('journal:', JSON.stringify(je.data));
  const items = await s.from('journal_entry_items')
    .select('type, amount, account_id, chart_of_accounts!account_id ( name, account_number )')
    .eq('journal_entry_id', je.data?.id);
  for (const i of items.data ?? []) {
    const a = i.chart_of_accounts as { name?: string; account_number?: number } | null;
    console.log(`  ${String(i.type).padEnd(7)} ${String(i.amount).padStart(12)}  ${a?.account_number} ${a?.name}`);
  }
  const dr = (items.data ?? []).filter((i) => i.type === 'debit').reduce((a, i) => a + Number(i.amount), 0);
  const cr = (items.data ?? []).filter((i) => i.type === 'credit').reduce((a, i) => a + Number(i.amount), 0);
  console.log(`  debits=${dr.toFixed(2)} credits=${cr.toFixed(2)} diff=${(dr - cr).toFixed(2)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
