/**
 * The control account ledger now runs for the reporting period, not from
 * inception. That changes the opening balance, so this proves the two things
 * that must survive the change:
 *
 *   1. closing balance still equals the age analysis control balance -- the tie
 *      an auditor checks. It must hold whatever the period start is, because
 *      closing is the balance AT the as-at date either way.
 *   2. opening + movement = closing, so the period presentation is internally
 *      consistent and nothing falls between the brought-forward figure and the
 *      first listed transaction.
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const cents = (n: unknown) => Math.round(Number(n ?? 0) * 100);
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  -- ' + detail : ''));
  if (ok) pass++; else fail++;
}

type Ledger = {
  opening_balance: number; closing_balance: number;
  total_debit: number; total_credit: number;
  rows: unknown[]; truncated: boolean;
  tie: { ledger_closing_balance: number; age_analysis_control_balance: number; ties: boolean };
};

async function main() {
  const { supabase: s, companies } = await connect('Spaceman');
  const asOf = new Date().toISOString().slice(0, 10);
  // The financial year on screen: 1 Mar 2026 - 28 Feb 2027, so the period start
  // is 2026-03-01 and the as-at is capped at today.
  const periodStart = '2026-03-01';

  for (const side of ['payable', 'receivable'] as const) {
    const fn = side === 'payable' ? 'vendors' : 'customers';
    console.log(NL + '======== ' + side.toUpperCase() + ' ========');
    for (const co of companies) {
      const inception = await invoke(s, fn, { method: 'GET_CONTROL_LEDGER', company_id: co.id, as_of: asOf });
      const period = await invoke(s, fn, {
        method: 'GET_CONTROL_LEDGER', company_id: co.id, as_of: asOf, date_from: periodStart,
      });
      if (!inception.ok || !period.ok) {
        check(co.name, false, tech(inception) || tech(period));
        continue;
      }
      const i = inception.body as Ledger;
      const p = period.body as Ledger;
      if (!i.rows.length && !p.rows.length && cents(i.closing_balance) === 0) continue;

      const sign = side === 'payable' ? -1 : 1; // payables increase on credit
      const movement = sign * (cents(p.total_debit) - cents(p.total_credit));
      const arithmetic = cents(p.opening_balance) + movement === cents(p.closing_balance);

      check(co.name + ' period ledger ties to the age analysis',
        cents(p.closing_balance) === cents(p.tie.age_analysis_control_balance) && p.tie.ties,
        'closing ' + p.closing_balance + ' vs analysis ' + p.tie.age_analysis_control_balance);
      check(co.name + ' opening + movement = closing', arithmetic,
        p.opening_balance + ' + ' + (movement / 100) + ' = ' + p.closing_balance);
      check(co.name + ' same closing balance either way',
        cents(i.closing_balance) === cents(p.closing_balance),
        'inception ' + i.closing_balance + ' / period ' + p.closing_balance);
      console.log('       rows: inception ' + i.rows.length + ', period ' + p.rows.length +
        ', opening b/f ' + p.opening_balance);
    }
  }

  console.log(NL + '======== A PERIOD START AFTER THE AS-AT DATE IS REFUSED ========');
  console.log('  Asked for one anyway, this produced a closing balance of 52000.81 against a');
  console.log('  true control balance of 8786.44 -- a ledger that does not tie. The page never');
  console.log('  sends it, and now neither will the engine accept it from anyone else.');
  const co = companies.find((c) => c.name === 'Spaceman')!;
  const future = await invoke(s, 'vendors', {
    method: 'GET_CONTROL_LEDGER', company_id: co.id, as_of: asOf, date_from: '2027-01-01',
  });
  check('refused, rather than returning a ledger that does not tie', !future.ok,
    future.ok ? 'ACCEPTED IT' : tech(future).slice(0, 120));

  console.log(NL + 'PASS ' + pass + '  FAIL ' + fail);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
