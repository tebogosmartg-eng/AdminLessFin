/**
 * Do the accounting identities hold, and does every surface say the same thing?
 *
 * Read-only. Trial balance balancing (debits = credits) is not the same claim as
 * the balance sheet balancing (assets = liabilities + equity). A ledger can
 * satisfy the first and fail the second when accounts are missing or misclassified.
 *
 *   npx tsx tools/staging-recovery/probe-balance-identities.ts
 */
import { connect, invoke } from './edgeProbe';

const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  console.log(
    'company'.padEnd(30), 'TB'.padEnd(6), 'BS'.padEnd(6),
    'A-(L+E)'.padStart(14), 'equity'.padEnd(7), 'profit',
  );
  for (const co of companies) {
    await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });
    const y = await invoke(api, 'accounting', { method: 'GET_FINANCIAL_YEARS', company_id: co.id });
    const years = (Array.isArray(y.body) ? y.body : []) as Array<{ start_date: string; end_date: string }>;
    const yr = years[0];
    if (!yr) {
      console.log(co.name.slice(0, 28).padEnd(30), 'no financial year');
      continue;
    }
    const tb = await invoke(api, 'accounting', {
      method: 'GET_TRIAL_BALANCE', company_id: co.id, start_date: yr.start_date, end_date: yr.end_date,
    });
    const body = tb.body as { balanced?: boolean; canonicalAggregation?: Record<string, unknown> } | null;
    const c = (body?.canonicalAggregation ?? {}) as Record<string, number | boolean>;
    const gap = n(Number(c.totalAssets) - Number(c.totalLiabilitiesAndEquity));
    console.log(
      co.name.slice(0, 28).padEnd(30),
      String(body?.balanced).padEnd(6),
      String(c.balanceSheetBalanced).padEnd(6),
      String(gap).padStart(14),
      String(c.equityIdentityHolds).padEnd(7),
      String(c.profitIdentityHolds),
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
