/**
 * Verifies BOTH age analyses across every company:
 *
 *   - each reconciles to its control account in the general ledger
 *   - each party's control balance matches the AR/AP sub-ledger RPC
 *   - creditors buckets still match the certified per-supplier statement
 *   - the Reports cards are served from the same numbers
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);

type Analysis = {
  side: string;
  parties: Array<{
    party_id: string; party_name: string; total: number; control_balance: number;
    open_document_count: number; buckets: Record<string, number>;
  }>;
  totals: Record<string, number>;
  reconciliation: {
    age_analysis_total: number; unallocated_to_parties: number;
    unattributed_to_any_party: number; general_ledger_control_balance: number;
    variance: number; reconciles: boolean;
  };
};

const SIDES = [
  { label: 'CREDITORS', fn: 'vendors', rpc: 'get_vendor_ap_balances', idKey: 'vendor_id' },
  { label: 'DEBTORS  ', fn: 'customers', rpc: 'get_customer_ar_balances', idKey: 'customer_id' },
] as const;

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const asOf = process.argv[2] || new Date().toISOString().slice(0, 10);
  let pass = 0;
  let fail = 0;

  for (const side of SIDES) {
    console.log(NL + `=== ${side.label} (${side.fn}) ===`);
    for (const co of companies) {
      const r = await invoke(s, side.fn, { method: 'GET_AGE_ANALYSIS', company_id: co.id, as_of: asOf });
      if (!r.ok) { console.log(`  FAIL ${co.name}: ${r.status} ${tech(r)}`); fail++; continue; }
      const a = r.body as Analysis;
      const rec = a.reconciliation;
      const identity = c(rec.age_analysis_total) + c(rec.unallocated_to_parties) + c(rec.unattributed_to_any_party);
      const glOk = identity === c(rec.general_ledger_control_balance) && rec.reconciles;

      const bal = await s.rpc(side.rpc, { p_company_id: co.id });
      const byId = new Map(((bal.data as Array<Record<string, unknown>>) ?? [])
        .map((v) => [String(v[side.idKey]), c(v.balance)]));
      const mismatches = a.parties.filter((p) => (byId.get(p.party_id) ?? 0) !== c(p.control_balance));

      const ok = glOk && mismatches.length === 0;
      if (ok) pass++; else fail++;
      console.log(
        `  ${ok ? 'PASS' : 'FAIL'} ${co.name.padEnd(30)} parties=${String(a.parties.length).padStart(3)} ` +
        `aged=${R(c(rec.age_analysis_total)).padStart(12)} GL=${R(c(rec.general_ledger_control_balance)).padStart(12)} ` +
        `variance=${rec.variance} subledger-mismatch=${mismatches.length}`
      );
      for (const m of mismatches.slice(0, 3)) {
        console.log(`       ${m.party_name}: report ${m.control_balance} vs sub-ledger ${R(byId.get(m.party_id) ?? 0)}`);
      }
    }
  }

  // Creditors buckets must still equal the certified per-supplier statement.
  console.log(NL + '=== CREDITORS vs THE CERTIFIED PER-SUPPLIER STATEMENT ===');
  const spaceman = companies.find((x) => x.name === 'Spaceman')!;
  const ap = await invoke(s, 'vendors', { method: 'GET_AGE_ANALYSIS', company_id: spaceman.id, as_of: asOf });
  let bucketMismatch = 0;
  for (const v of (ap.body as Analysis).parties) {
    const d = await invoke(s, 'vendors', { method: 'GET_DETAILS', company_id: spaceman.id, vendorId: v.party_id, date_to: asOf });
    const per = (d.body as { ageing?: Record<string, number> })?.ageing;
    if (!per) continue;
    for (const k of ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_120_plus']) {
      if (c(v.buckets[k]) !== c(per[k])) bucketMismatch++;
    }
    if (c(v.total) !== c(per.total)) bucketMismatch++;
    console.log(`  ${v.party_name.padEnd(28)} global=${v.total} per-supplier=${per.total}`);
  }
  console.log(`  bucket mismatches: ${bucketMismatch} ${bucketMismatch === 0 ? '(identical)' : '(INVESTIGATE)'}`);
  if (bucketMismatch) fail++; else pass++;

  // Reports cards.
  console.log(NL + '=== REPORTS CARDS ===');
  const rep = await invoke(s, 'reports', {
    company_id: spaceman.id, start_date: '2025-01-01', end_date: asOf, prior_date: '2024-12-31',
  });
  const b = rep.body as {
    agedPayables?: unknown[]; agedReceivables?: unknown[];
    agedPayablesReconciliation?: { reconciles: boolean; general_ledger_control_balance: number };
    agedReceivablesReconciliation?: { reconciles: boolean; general_ledger_control_balance: number };
  };
  console.log(`  aged payables rows   : ${(b.agedPayables ?? []).length}   reconciliation: ${b.agedPayablesReconciliation ? `GL ${b.agedPayablesReconciliation.general_ledger_control_balance}, reconciles=${b.agedPayablesReconciliation.reconciles}` : 'MISSING'}`);
  console.log(`  aged receivables rows: ${(b.agedReceivables ?? []).length}   reconciliation: ${b.agedReceivablesReconciliation ? `GL ${b.agedReceivablesReconciliation.general_ledger_control_balance}, reconciles=${b.agedReceivablesReconciliation.reconciles}` : 'MISSING'}`);

  console.log(NL + `RESULT: ${pass} PASS, ${fail} FAIL`);
}
main().catch((e) => { console.error(e); process.exit(1); });
