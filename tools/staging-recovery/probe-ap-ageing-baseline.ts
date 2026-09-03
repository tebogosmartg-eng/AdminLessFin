/**
 * Baseline for the global creditors age analysis.
 *
 * Establishes, factually, what the existing sources say and whether they agree:
 *   A. get_aged_payables            (the current Reports "Aged Payables Summary")
 *   B. get_vendor_ap_balances       (the AP sub-ledger by supplier)
 *   C. vendors GET_DETAILS ageing   (the certified per-supplier age analysis)
 *   D. the AP control account balance in the general ledger
 */
import { connect, invoke } from './edgeProbe';

const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
const R = (cents: number) => (cents / 100).toFixed(2);

async function main() {
  const { supabase: s, company } = await connect(process.argv[2] || 'Spaceman');
  const company_id = company.id;
  const asOf = new Date().toISOString().slice(0, 10);
  console.log(`company: ${company.name}   as of ${asOf}`);

  // ---- D. AP control account per the general ledger -----------------------
  const apAcc = await s.from('chart_of_accounts')
    .select('id, account_number, name')
    .eq('company_id', company_id).eq('type', 'Liability').eq('account_role', 'trade_payable');
  const apIds = (apAcc.data ?? []).map((a) => a.id);
  console.log(NL + `AP control accounts (account_role=trade_payable): ${(apAcc.data ?? []).map((a) => `${a.account_number} ${a.name}`).join(', ') || 'NONE'}`);

  let glTotal = 0;
  let glAttributed = 0;
  let glUnattributed = 0;
  if (apIds.length) {
    let from = 0;
    for (;;) {
      const page = await s.from('journal_entry_items')
        .select('amount, type, account_id, journal_entries!inner ( company_id, vendor_id, entry_date )')
        .in('account_id', apIds)
        .eq('journal_entries.company_id', company_id)
        .lte('journal_entries.entry_date', asOf)
        .range(from, from + 999);
      if (page.error) { console.log('GL error: ' + page.error.message); break; }
      const rows = page.data ?? [];
      for (const m of rows) {
        const signed = m.type === 'credit' ? c(m.amount) : -c(m.amount);
        glTotal += signed;
        const vid = (m as unknown as { journal_entries: { vendor_id: string | null } }).journal_entries.vendor_id;
        if (vid) glAttributed += signed; else glUnattributed += signed;
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }
  console.log(NL + '=== D. GENERAL LEDGER (creditors control account) ===');
  console.log(`  AP control balance          : ${R(glTotal)}`);
  console.log(`    of which carries a supplier: ${R(glAttributed)}`);
  console.log(`    of which has NO supplier   : ${R(glUnattributed)}`);

  // ---- A. get_aged_payables ----------------------------------------------
  const aged = await s.rpc('get_aged_payables', { p_company_id: company_id });
  console.log(NL + '=== A. get_aged_payables (current Reports card) ===');
  if (aged.error) {
    console.log('  ERROR ' + aged.error.message);
  } else {
    const rows = (aged.data as Array<Record<string, unknown>>) ?? [];
    console.log(`  rows: ${rows.length}; columns: ${rows[0] ? Object.keys(rows[0]).join(', ') : 'n/a'}`);
    let sum = 0;
    for (const r of rows) sum += c(r.total_due);
    for (const r of rows.slice(0, 6)) {
      console.log(`    ${String(r.vendor_name).padEnd(26)} total=${R(c(r.total_due))}`);
    }
    console.log(`  SUM of total_due            : ${R(sum)}`);
    console.log(`  vs GL AP control balance    : ${R(glTotal)}  -> ${sum === glTotal ? 'AGREES' : `DIFFERS by ${R(sum - glTotal)}`}`);
  }

  // ---- B. get_vendor_ap_balances -----------------------------------------
  const bal = await s.rpc('get_vendor_ap_balances', { p_company_id: company_id });
  console.log(NL + '=== B. get_vendor_ap_balances (AP sub-ledger) ===');
  const brows = ((bal.data as Array<{ vendor_id: string; vendor_name: string; balance: number }>) ?? [])
    .filter((v) => c(v.balance) !== 0);
  let bsum = 0;
  for (const v of brows) bsum += c(v.balance);
  console.log(`  suppliers with a balance    : ${brows.length}`);
  for (const v of brows.slice(0, 8)) console.log(`    ${v.vendor_name.padEnd(26)} ${R(c(v.balance))}`);
  console.log(`  SUM                         : ${R(bsum)}`);
  console.log(`  vs GL attributed            : ${R(glAttributed)}  -> ${bsum === glAttributed ? 'AGREES' : `DIFFERS by ${R(bsum - glAttributed)}`}`);

  // ---- C. certified per-supplier ageing ----------------------------------
  console.log(NL + '=== C. vendors GET_DETAILS ageing, summed over suppliers ===');
  let cAge = 0;
  let cControl = 0;
  let cUnalloc = 0;
  for (const v of brows) {
    const d = await invoke(s, 'vendors', { method: 'GET_DETAILS', company_id, vendorId: v.vendor_id, date_to: asOf });
    const a = (d.body as { ageing?: Record<string, number> })?.ageing;
    if (!a) { console.log(`    ${v.vendor_name}: no ageing returned (${d.status})`); continue; }
    cAge += c(a.total);
    cControl += c(a.ap_control_balance);
    cUnalloc += c(a.unallocated);
    console.log(`    ${v.vendor_name.padEnd(26)} age=${R(c(a.total))} control=${R(c(a.ap_control_balance))} unallocated=${R(c(a.unallocated))}`);
  }
  console.log(`  age analysis total          : ${R(cAge)}`);
  console.log(`  control total               : ${R(cControl)}  -> vs GL attributed ${R(glAttributed)} ${cControl === glAttributed ? 'AGREES' : 'DIFFERS'}`);
  console.log(`  unallocated total           : ${R(cUnalloc)}`);

  console.log(NL + '=== RECONCILIATION THE AUDITOR NEEDS ===');
  console.log(`  age analysis (open bills)   : ${R(cAge)}`);
  console.log(`  + unallocated to suppliers  : ${R(cUnalloc)}`);
  console.log(`  + not attributed to any     : ${R(glUnattributed)}`);
  console.log(`  = ${R(cAge + cUnalloc + glUnattributed)}   GL control ${R(glTotal)}  ` +
    `${cAge + cUnalloc + glUnattributed === glTotal ? 'RECONCILES' : 'VARIANCE ' + R(cAge + cUnalloc + glUnattributed - glTotal)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
