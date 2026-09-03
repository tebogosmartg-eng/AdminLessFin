/**
 * Removes the journal entries the Journal Entry reproduction created, through
 * the application's own DELETE path, then reports ledger integrity.
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;

  const mine = await s
    .from('journal_entries')
    .select('id, journal_number, description')
    .eq('company_id', company_id)
    .ilike('description', 'Repro entry%');
  console.log(`repro journals found: ${mine.data?.length ?? 0}`);

  for (const j of mine.data ?? []) {
    const r = await invoke(s, 'journal-entries', { method: 'DELETE', company_id, entryId: j.id });
    console.log(`  ${j.journal_number} "${j.description}": ${r.ok ? 'deleted' : 'FAILED ' + (tech(r) || r.status)}`);
  }

  const left = await s
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company_id)
    .ilike('description', 'Repro entry%');
  console.log(`remaining repro journals: ${left.count}`);

  console.log(NL + '=== LEDGER INTEGRITY ===');
  const jes = await s.from('journal_entries').select('id').eq('company_id', company_id);
  const ids = (jes.data ?? []).map((j) => j.id);
  let dr = 0;
  let cr = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const it = await s.from('journal_entry_items').select('type, amount').in('journal_entry_id', ids.slice(i, i + 200));
    for (const x of it.data ?? []) {
      if (x.type === 'debit') dr += c(x.amount); else cr += c(x.amount);
    }
  }
  console.log(`  journals=${ids.length} debits=${dr}c credits=${cr}c diff=${dr - cr}c ${dr === cr ? 'PASS' : 'FAIL'}`);

  // Orphaned line items would mean DELETE removed a header but left its lines.
  const orphanProbe = await s.from('journal_entry_items').select('journal_entry_id').limit(1000);
  const known = new Set(ids);
  const orphans = (orphanProbe.data ?? []).filter((x) => !known.has(x.journal_entry_id));
  console.log(`  line items sampled=${orphanProbe.data?.length ?? 0}, belonging to no journal in this company=${orphans.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
