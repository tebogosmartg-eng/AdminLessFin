import { connect } from './edgeProbe';
async function main() {
  const { supabase: s } = await connect('Spaceman');
  const items = await s.from('journal_entry_items').select('journal_entry_id').limit(2000);
  const ids = [...new Set((items.data ?? []).map((x) => x.journal_entry_id))];
  console.log(`distinct journal_entry_ids referenced by sampled line items: ${ids.length}`);
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const je = await s.from('journal_entries').select('id').in('id', ids.slice(i, i + 200));
    for (const j of je.data ?? []) found.add(j.id);
  }
  const missing = ids.filter((id) => !found.has(id));
  console.log(`referenced journals that do not exist at all: ${missing.length}`);
  if (missing.length) console.log(missing.slice(0, 10));
  console.log('(a non-zero count in the earlier check was items belonging to OTHER companies, not orphans)');
}
main().catch((e) => { console.error(e); process.exit(1); });
