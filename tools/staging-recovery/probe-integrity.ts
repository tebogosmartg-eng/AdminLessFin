/** Phase 13 — accounting integrity check across every company. */
import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase: s, companies } = await connect(process.argv[2] || 'Spaceman');
  const year = new Date().getUTCFullYear();
  const period = { start_date: `${year - 3}-01-01`, end_date: `${year}-12-31` };
  let allOk = true;
  for (const c of companies) {
    const tb = await invoke(s, 'accounting', { method: 'GET_TRIAL_BALANCE', company_id: c.id, ...period });
    const b = tb.body as { balanced?: boolean; totals?: Record<string, number>; canonicalAggregation?: Record<string, number> };
    const bal = await s.rpc('get_balances_as_of_date', { p_end_date: period.end_date, p_company_id: c.id });
    const rows = (bal.data as Array<{ type: string; balance: number }>) ?? [];
    const sum = (t: string) => rows.filter((r) => r.type === t).reduce((a, r) => a + Number(r.balance), 0);
    const assets = sum('Asset');
    const liabilities = sum('Liability');
    const equity = sum('Equity');
    const income = sum('Income');
    const expense = sum('Expense');
    // A = L + E + (Income - Expense) while the year is open.
    const lhs = assets;
    const rhs = liabilities + equity + income - expense;
    const diff = Math.round((lhs - rhs) * 100) / 100;
    const ok = b?.balanced === true && Math.abs(diff) < 0.01;
    if (!ok) allOk = false;
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${String(c.name).slice(0, 32).padEnd(34)} balanced=${String(b?.balanced).padEnd(5)} ` +
      `A=${assets.toFixed(2).padStart(13)}  L+E+P=${rhs.toFixed(2).padStart(13)}  diff=${diff}`,
    );
  }
  console.log(`\n${allOk ? 'ALL COMPANIES BALANCED' : 'INTEGRITY FAILURE DETECTED'}`);
  if (!allOk) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
