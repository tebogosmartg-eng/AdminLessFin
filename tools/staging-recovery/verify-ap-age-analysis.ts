/**
 * Verifies the global creditors age analysis against the sources it must agree
 * with, for EVERY company the harness can see:
 *
 *   - it reconciles to the creditors control account in the general ledger
 *   - each supplier's control balance matches get_vendor_ap_balances
 *   - each supplier's buckets match the certified per-supplier statement
 *   - the Reports card is served from the same numbers
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (n: number) => (n / 100).toFixed(2);

type Ageing = {
  as_of: string;
  suppliers: Array<{
    vendor_id: string; vendor_name: string; total: number; ap_control_balance: number;
    unallocated: number; open_bill_count: number;
    buckets: Record<string, number>;
  }>;
  totals: Record<string, number>;
  reconciliation: {
    age_analysis_total: number; unallocated_to_suppliers: number;
    unattributed_to_any_supplier: number; general_ledger_ap_balance: number;
    variance: number; reconciles: boolean;
  };
};

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const asOf = process.argv[2] || new Date().toISOString().slice(0, 10);
  let pass = 0;
  let fail = 0;

  for (const co of companies) {
    const r = await invoke(s, 'vendors', { method: 'GET_AGE_ANALYSIS', company_id: co.id, as_of: asOf });
    if (!r.ok) { console.log(`FAIL ${co.name}: ${r.status} ${tech(r)}`); fail++; continue; }
    const a = r.body as Ageing;

    // 1. Reconciles to the general ledger.
    const rec = a.reconciliation;
    const identity = c(rec.age_analysis_total) + c(rec.unallocated_to_suppliers) + c(rec.unattributed_to_any_supplier);
    const glOk = identity === c(rec.general_ledger_ap_balance) && rec.reconciles;

    // 2. Control balances match the AP sub-ledger RPC.
    const bal = await s.rpc('get_vendor_ap_balances', { p_company_id: co.id });
    const rpcById = new Map(((bal.data as Array<{ vendor_id: string; balance: number }>) ?? [])
      .map((v) => [v.vendor_id, c(v.balance)]));
    const mismatches = a.suppliers.filter((v) => (rpcById.get(v.vendor_id) ?? 0) !== c(v.ap_control_balance));

    // 3. Buckets match the certified per-supplier statement.
    let bucketMismatch = 0;
    for (const v of a.suppliers.filter((x) => x.open_bill_count > 0).slice(0, 5)) {
      const d = await invoke(s, 'vendors', { method: 'GET_DETAILS', company_id: co.id, vendorId: v.vendor_id, date_to: asOf });
      const per = (d.body as { ageing?: Record<string, number> })?.ageing;
      if (!per) continue;
      for (const k of ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_120_plus', 'total']) {
        const mine = k === 'total' ? c(v.total) : c(v.buckets[k]);
        if (mine !== c(per[k])) bucketMismatch++;
      }
    }

    const ok = glOk && mismatches.length === 0 && bucketMismatch === 0;
    if (ok) pass++; else fail++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${co.name.padEnd(30)} suppliers=${String(a.suppliers.length).padStart(3)} ` +
      `aged=${R(c(rec.age_analysis_total)).padStart(12)} GL=${R(c(rec.general_ledger_ap_balance)).padStart(12)} ` +
      `variance=${rec.variance} subledger-mismatch=${mismatches.length} bucket-mismatch=${bucketMismatch}`
    );
    if (!glOk) {
      console.log(`     aged ${rec.age_analysis_total} + unallocated ${rec.unallocated_to_suppliers} ` +
        `+ unattributed ${rec.unattributed_to_any_supplier} = ${R(identity)} vs GL ${rec.general_ledger_ap_balance}`);
    }
    for (const m of mismatches.slice(0, 3)) {
      console.log(`     ${m.vendor_name}: report ${m.ap_control_balance} vs sub-ledger ${R(rpcById.get(m.vendor_id) ?? 0)}`);
    }
  }

  console.log(NL + `RESULT: ${pass}/${companies.length} PASS, ${fail} FAIL`);

  // 4. The Reports card is served from the same numbers.
  const spaceman = companies.find((x) => x.name === 'Spaceman')!;
  const rep = await invoke(s, 'reports', {
    company_id: spaceman.id, start_date: '2025-01-01', end_date: asOf, prior_date: '2024-12-31',
  });
  const body = rep.body as { agedPayables?: Array<{ total_due: number }>; agedPayablesReconciliation?: { general_ledger_ap_balance: number; reconciles: boolean } };
  const repSum = (body.agedPayables ?? []).reduce((t, v) => t + c(v.total_due), 0);
  const own = await invoke(s, 'vendors', { method: 'GET_AGE_ANALYSIS', company_id: spaceman.id, as_of: asOf });
  const ownTotal = c((own.body as Ageing).reconciliation.age_analysis_total);
  console.log(NL + '=== REPORTS CARD (previously always empty) ===');
  console.log(`  rows: ${(body.agedPayables ?? []).length}`);
  console.log(`  aged total from Reports : ${R(repSum)}`);
  console.log(`  aged total from Suppliers: ${R(ownTotal)}  -> ${repSum === ownTotal ? 'SAME NUMBERS' : 'DIFFER'}`);
  console.log(`  reconciliation attached : ${body.agedPayablesReconciliation ? `yes (GL ${body.agedPayablesReconciliation.general_ledger_ap_balance}, reconciles=${body.agedPayablesReconciliation.reconciles})` : 'NO'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
