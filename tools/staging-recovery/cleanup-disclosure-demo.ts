/**
 * Remove the demonstration entries this exercise posted.
 *
 * These are the seeded entries in a test company, identified by their
 * description. Nothing else is touched: the filter is exact, the company must
 * be named on the command line, and the entries are listed before anything is
 * removed.
 *
 *   npx tsx tools/staging-recovery/cleanup-disclosure-demo.ts <company-id> [--apply]
 */
import { connect, invoke } from './edgeProbe';

const TAG = 'AFS disclosure demonstration';

async function main() {
  const [companyId] = process.argv.slice(2);
  const apply = process.argv.includes('--apply');
  if (!companyId) throw new Error('Pass the company id.');

  const { supabase } = await connect();

  const { data: entries, error } = await supabase
    .from('journal_entries')
    .select('id, entry_date, description')
    .eq('company_id', companyId)
    .like('description', `${TAG}%`)
    .order('entry_date');
  if (error) throw error;

  if (!entries?.length) {
    console.log('No demonstration entries found.');
    return;
  }

  console.log(`${entries.length} demonstration entries:`);
  for (const e of entries) console.log(`  ${e.id.slice(0, 8)}  ${e.entry_date}  ${e.description}`);

  if (!apply) {
    console.log('\nDry run. Pass --apply to remove them.');
    return;
  }

  let removed = 0;
  for (const e of entries) {
    const r = await invoke(supabase, 'journal-entries', {
      method: 'DELETE',
      company_id: companyId,
      entryId: e.id,
    });
    if (r.ok) removed += 1;
    else console.log(`FAIL ${e.id.slice(0, 8)}: ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  console.log(`\nremoved ${removed} of ${entries.length}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
