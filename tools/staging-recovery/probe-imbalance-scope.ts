/**
 * Scope + machinery survey for the R0.01 remediation.
 *
 *  1. Every unbalanced journal in EVERY company (not just Spaceman).
 *  2. Every amortisation row where principal + interest != payment_amount,
 *     which is the generator defect behind it.
 *  3. What reversal machinery the platform already has.
 */
import { connect } from './edgeProbe';

const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  console.log(`companies visible to the harness: ${companies.length}`);

  console.log(String.fromCharCode(10) + '=== 1. UNBALANCED JOURNALS, ALL COMPANIES ===');
  let totalUnbalanced = 0;
  for (const co of companies) {
    const jes = await s.from('journal_entries').select('id, journal_number, entry_date, description').eq('company_id', co.id);
    if (jes.error) { console.log(`  ${co.name}: ERROR ${jes.error.message}`); continue; }
    const rows = jes.data ?? [];
    const byId = new Map(rows.map((j) => [j.id, j]));
    const net = new Map<string, number>();
    const ids = rows.map((j) => j.id);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const it = await s.from('journal_entry_items').select('type, amount, journal_entry_id').in('journal_entry_id', chunk);
      if (it.error) { console.log(`  ${co.name}: items ERROR ${it.error.message}`); break; }
      for (const x of it.data ?? []) {
        net.set(x.journal_entry_id, (net.get(x.journal_entry_id) ?? 0) + (x.type === 'debit' ? c(x.amount) : -c(x.amount)));
      }
    }
    const bad = [...net.entries()].filter(([, v]) => v !== 0);
    totalUnbalanced += bad.length;
    const tag = bad.length === 0 ? 'OK' : `${bad.length} UNBALANCED`;
    console.log(`  ${co.name.padEnd(28)} journals=${String(rows.length).padStart(4)}  ${tag}`);
    for (const [id, v] of bad) {
      const j = byId.get(id)!;
      console.log(`      -> ${j.journal_number} ${j.entry_date} diff=${v}c  ${j.description}`);
    }
  }
  console.log(`  TOTAL unbalanced journals platform-wide: ${totalUnbalanced}`);

  console.log(String.fromCharCode(10) + '=== 2. AMORTISATION ROWS WHERE principal + interest != payment_amount ===');
  const sched = await s.from('loan_amortization_schedule').select('id, loan_id, payment_number, payment_amount, principal, interest, status, journal_entry_id');
  if (sched.error) { console.log('  ERROR ' + sched.error.message); }
  const rows = sched.data ?? [];
  const drifted = rows.filter((r) => c(r.principal) + c(r.interest) !== c(r.payment_amount));
  console.log(`  schedule rows visible: ${rows.length};  drifted: ${drifted.length};  drifted AND posted: ${drifted.filter((r) => r.journal_entry_id).length}`);
  for (const d of drifted.slice(0, 20)) {
    console.log(`      loan=${d.loan_id.slice(0, 8)} #${d.payment_number} pay=${d.payment_amount} p=${d.principal} i=${d.interest} drift=${c(d.principal) + c(d.interest) - c(d.payment_amount)}c posted=${!!d.journal_entry_id} status=${d.status}`);
  }

  console.log(String.fromCharCode(10) + '=== 3. REVERSAL / VOID MACHINERY ===');
  for (const fn of ['reverse_journal_entry', 'void_journal_entry', 'posting_engine_reverse', 'posting_engine_void', 'reverse_posting', 'void_loan_payment', 'unpost_loan_payment']) {
    const r = await s.rpc(fn as never, {} as never);
    const msg = r.error ? r.error.message : 'CALLABLE';
    const exists = !/Could not find the function|does not exist/i.test(msg);
    console.log(`  ${fn.padEnd(26)} ${exists ? 'EXISTS' : 'absent'}   ${exists ? msg.slice(0, 90) : ''}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
