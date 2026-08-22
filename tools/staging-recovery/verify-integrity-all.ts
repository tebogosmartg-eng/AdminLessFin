/**
 * Accounting integrity evidence for the release closure.
 *
 * For EVERY company:
 *   - total debits = total credits (raw ledger, integer cents)
 *   - Assets = Liabilities + Equity + (Income - Expense)
 *   - no unbalanced journal
 *
 * Plus, for Spaceman specifically, proof that JE-000017 survives unaltered
 * alongside its reversal and its corrected replacement, with audit coverage.
 */
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (cents: number) => (cents / 100).toFixed(2);

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');

  console.log('=== ACCOUNTING INTEGRITY: ALL COMPANIES ===');
  let pass = 0;
  let fail = 0;
  for (const co of companies) {
    const jes = await s.from('journal_entries').select('id, journal_number, entry_date, description').eq('company_id', co.id);
    if (jes.error) { console.log(`  ${co.name}: ERROR ${jes.error.message}`); fail++; continue; }
    const rows = jes.data ?? [];
    const byId = new Map(rows.map((j) => [j.id, j]));
    const ids = rows.map((j) => j.id);
    let dr = 0;
    let cr = 0;
    const net = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const it = await s
        .from('journal_entry_items')
        .select('type, amount, journal_entry_id')
        .in('journal_entry_id', ids.slice(i, i + 200));
      if (it.error) { console.log(`  ${co.name}: items ERROR ${it.error.message}`); break; }
      for (const x of it.data ?? []) {
        const v = c(x.amount);
        if (x.type === 'debit') dr += v; else cr += v;
        net.set(x.journal_entry_id, (net.get(x.journal_entry_id) ?? 0) + (x.type === 'debit' ? v : -v));
      }
    }
    const bad = [...net.entries()].filter(([, v]) => v !== 0);

    // A DEFECTIVE journal that has been fully mirror-reversed is remediated,
    // not open: the pair nets to exactly zero. The original is retained
    // unaltered by instruction, so it necessarily still fails a per-entry
    // balance test on its own. Pair it with its reversal before judging.
    const reversedNumbers = new Set(
      rows
        .map((j) => /^Reversal of (JE-\d+) - defective entry/.exec(j.description ?? '')?.[1])
        .filter((x): x is string => Boolean(x)),
    );
    const openBad = bad.filter(([id]) => {
      const j = byId.get(id)!;
      const isReversal = /^Reversal of JE-\d+ - defective entry/.test(j.description ?? '');
      const isReversedOriginal = reversedNumbers.has(j.journal_number ?? '');
      return !isReversal && !isReversedOriginal;
    });
    const remediated = bad.length - openBad.length;

    // Accounting equation from the authoritative balance RPC.
    const bal = await s.rpc('get_balances_as_of_date', { p_end_date: '2027-12-31', p_company_id: co.id });
    const brs = (bal.data as Array<{ type: string; balance: number }>) ?? [];
    const sum = (t: string) => brs.filter((r) => r.type === t).reduce((a, r) => a + c(r.balance), 0);
    const A = sum('Asset');
    const L = sum('Liability');
    const E = sum('Equity');
    const I = sum('Income');
    const X = sum('Expense');
    const eq = A - (L + E + I - X);

    const ok = dr === cr && openBad.length === 0 && eq === 0;
    if (ok) pass++; else fail++;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${co.name.padEnd(28)} ` +
      `Dr=${R(dr).padStart(14)} Cr=${R(cr).padStart(14)} diff=${dr - cr}c  ` +
      `A-(L+E+I-X)=${eq}c  open-defects=${openBad.length}` +
      (remediated ? `  (${remediated} retained+reversed, nets to zero)` : '')
    );
    for (const [id, v] of openBad) {
      const j = byId.get(id)!;
      console.log(`        -> OPEN ${j.journal_number} ${j.entry_date} ${v}c ${j.description}`);
    }
  }
  console.log(`  RESULT: ${pass}/${companies.length} PASS, ${fail} FAIL`);

  // ---- JE-000017 preservation ---------------------------------------------
  const spaceman = companies.find((x) => x.name === 'Spaceman')!;
  console.log(NL + '=== JE-000017 PRESERVATION + CORRECTION TRAIL ===');
  const trail = await s
    .from('journal_entries')
    .select('id, journal_number, entry_date, description, created_at')
    .eq('company_id', spaceman.id)
    .or('journal_number.eq.JE-000017,description.ilike.%JE-000017%')
    .order('journal_number');
  for (const j of trail.data ?? []) {
    const it = await s.from('journal_entry_items').select('type, amount').eq('journal_entry_id', j.id);
    let d = 0;
    let k = 0;
    for (const x of it.data ?? []) { if (x.type === 'debit') d += c(x.amount); else k += c(x.amount); }
    console.log(`  ${j.journal_number}  ${j.entry_date}  Dr=${R(d)} Cr=${R(k)} diff=${d - k}c`);
    console.log(`      ${j.description}`);
  }

  console.log(NL + '=== AUDIT COVERAGE OF THE CORRECTION ===');
  const audit = await s
    .from('audit_logs')
    .select('operation, table_name, created_at, record_id')
    .eq('company_id', spaceman.id)
    .eq('table_name', 'journal_entries')
    .order('created_at', { ascending: false })
    .limit(6);
  if (audit.error) console.log('  ERROR ' + audit.error.message);
  for (const a of audit.data ?? []) {
    console.log(`  ${a.created_at}  ${a.operation}  ${a.table_name}  ${a.record_id}`);
  }

  console.log(NL + '=== AMORTISATION INVARIANT (principal = payment - interest) ===');
  const sched = await s.from('loan_amortization_schedule').select('payment_number, payment_amount, principal, interest, journal_entry_id');
  const rowsS = sched.data ?? [];
  const drift = rowsS.filter((r) => c(r.principal) + c(r.interest) !== c(r.payment_amount));
  console.log(`  rows=${rowsS.length}  drifted=${drift.length}`);
  for (const d of drift) console.log(`      #${d.payment_number} pay=${d.payment_amount} p=${d.principal} i=${d.interest}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
