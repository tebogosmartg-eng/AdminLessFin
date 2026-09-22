/**
 * Can a signed-in user read another company's ledger?
 *
 * Read-only. get_balances_as_of_date, get_period_activity and
 * get_cash_flow_statement are the canonical money functions -- Trial Balance
 * and Financial Statements both read them. They are SECURITY DEFINER and take a
 * company id. This asks each of them, as the E2E user, about companies that user
 * is NOT a member of, and reports only whether rows came back -- never figures.
 *
 *   npx tsx tools/staging-recovery/probe-ledger-tenant-isolation.ts <ids.json>
 */
import fs from 'node:fs';
import { connect } from './edgeProbe';

async function main() {
  const idsFile = process.argv[2];
  if (!idsFile) throw new Error('Pass a JSON file of company ids to test against.');
  const allIds = JSON.parse(fs.readFileSync(idsFile, 'utf8')) as string[];
  const { supabase: api, companies } = await connect('Spaceman');
  const mine = new Set(companies.map((c) => c.id));
  const foreign = allIds.filter((id) => !mine.has(id));
  const own = companies[0];
  console.log(`member of ${mine.size}; testing ${foreign.length} companies this user does not belong to`);

  const probes = [
    ['get_balances_as_of_date', (id: string) => ({ p_end_date: '2026-12-31', p_company_id: id })],
    ['get_period_activity', (id: string) => ({ p_start_date: '2026-01-01', p_end_date: '2026-12-31', p_company_id: id })],
    ['get_cash_flow_statement', (id: string) => ({ p_start_date: '2026-01-01', p_end_date: '2026-12-31', p_company_id: id })],
  ] as const;

  let leaks = 0;
  for (const [fn, args] of probes) {
    const control = await api.rpc(fn, args(own.id));
    let readable = 0;
    for (const id of foreign) {
      const r = await api.rpc(fn, args(id));
      if (!r.error && Array.isArray(r.data) && r.data.length > 0) readable++;
    }
    leaks += readable;
    console.log(`${fn.padEnd(26)} own company: ${control.error ? 'ERROR ' + control.error.message : (control.data as unknown[])?.length + ' rows'}` +
      `   foreign companies readable: ${readable} of ${foreign.length}`);
  }
  console.log(leaks ? `LEAK: ${leaks} foreign ledger reads returned data` : 'ISOLATED: no foreign ledger was readable');
}

main().catch((e) => { console.error(e); process.exit(1); });
