/**
 * vendors GET_DETAILS already disambiguates its bills embed, but it picks the
 * REVERSE relationship (bills.journal_entry_id). This measures what that costs
 * against the forward one (journal_entries.bill_id), which is the bill the
 * journal is actually for.
 */
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const numOf = (e: any) => (Array.isArray(e) ? e[0]?.bill_number : e?.bill_number) ?? null;

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  for (const co of companies.slice(0, 6)) {
    const fwd = await s.from('journal_entries')
      .select('id, journal_number, bill_id, description, bills!bill_id ( bill_number )')
      .eq('company_id', co.id).not('bill_id', 'is', null).limit(500);
    const rev = await s.from('journal_entries')
      .select('id, journal_number, bill_id, description, bills!journal_entry_id ( bill_number )')
      .eq('company_id', co.id).not('bill_id', 'is', null).limit(500);
    if (fwd.error || rev.error) { console.log(co.name + ': ' + (fwd.error ?? rev.error)?.message); continue; }
    const f = fwd.data ?? [];
    const r = rev.data ?? [];
    const fn = f.filter((x) => numOf(x.bills)).length;
    const rn = r.filter((x) => numOf(x.bills)).length;
    if (!f.length) continue;
    console.log(co.name + ': journals carrying a bill_id=' + f.length + '  forward resolves=' + fn + '  reverse resolves=' + rn);
    if (fn !== rn) {
      console.log('  rows the reverse relationship leaves blank:');
      for (let i = 0; i < f.length; i++) {
        if (numOf(f[i].bills) && !numOf(r[i]?.bills)) {
          console.log('    ' + String(f[i].journal_number).padEnd(12) + String(numOf(f[i].bills)).padEnd(16) + String(f[i].description).slice(0, 60));
        }
      }
    }
  }
  console.log(NL + 'done');
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
