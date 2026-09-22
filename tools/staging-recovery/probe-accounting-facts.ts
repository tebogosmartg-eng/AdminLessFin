/**
 * The accounting facts layer, checked against production.
 *
 * Read-only. Proves three things:
 *
 *   1. Tenant isolation. accounting_facts() and financial_year_current() are
 *      SECURITY DEFINER and take a company id, so a signed-in user must not be
 *      able to call them directly -- only the edge functions, with the service
 *      role, after authorising the request.
 *
 *   2. The readiness contract, for every company: `status` and
 *      `accounting_ready` are the live truth and agree with the steps and the
 *      progress in the same response; `modules_unlocked` differs only while a
 *      RECORDED exception says why.
 *
 *   3. The current year is the same one everywhere.
 *
 * That an account is matched on its ROLE and never on its NAME is proved by
 * renaming accounts inside a rolled-back transaction, in the rehearsal for
 * 20260922180000; this probe does not write.
 *
 *   npx tsx tools/staging-recovery/probe-accounting-facts.ts
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
let held = 0;
let missing = 0;
const gaps: string[] = [];

function control(label: string, ok: boolean, detail = '') {
  console.log('  ' + (ok ? 'HELD   ' : 'MISSING') + ' ' + label + (detail ? '  -- ' + detail : ''));
  if (ok) held++; else { missing++; gaps.push(label); }
}

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  const spaceman = companies.find((c) => c.name === 'Spaceman');

  console.log('======== TENANT ISOLATION ========');
  const target = spaceman ?? companies[0];
  const direct = await api.rpc('accounting_facts', { p_company_id: target.id });
  control('a signed-in user cannot read a company\'s facts directly', Boolean(direct.error),
    direct.error ? direct.error.message.slice(0, 90) : 'RETURNED DATA');
  const directYear = await api.rpc('financial_year_current', { p_company_id: target.id });
  control('nor pick a company\'s current year directly', Boolean(directYear.error),
    directYear.error ? directYear.error.message.slice(0, 90) : 'RETURNED DATA');
  const deadOverload = await api.rpc('get_balances_as_of_date', { p_end_date: '2026-12-31' });
  control('the company-less balance overload is gone', Boolean(deadOverload.error),
    deadOverload.error ? deadOverload.error.message.slice(0, 90) : 'RETURNED DATA');

  console.log(`${NL}======== THE READINESS CONTRACT ========`);
  for (const co of companies) {
    await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });
    const [status, years] = await Promise.all([
      invoke(api, 'accounting-setup', { method: 'GET_STATUS', company_id: co.id }),
      invoke(api, 'accounting', { method: 'GET_FINANCIAL_YEARS', company_id: co.id }),
    ]);
    if (!status.ok) {
      control(`${co.name}: status loads`, false, tech(status));
      continue;
    }
    const s = status.body as {
      status: string; accounting_ready: boolean; modules_unlocked?: boolean; progress_percent: number;
      readiness_exception?: { reason?: string | null } | null;
      steps: Record<string, { complete: boolean }>;
      validation: { currentFinancialYear?: { id?: string; year_code?: string } | null; financialYearAmbiguous?: boolean };
    };
    const allSteps = Object.values(s.steps).every((x) => x.complete);
    const truthful = s.accounting_ready === allSteps
      && (s.status === 'READY') === allSteps
      && (s.progress_percent >= 100) === allSteps;
    const gateHonest = s.modules_unlocked === s.accounting_ready
      || (s.modules_unlocked === true && !s.accounting_ready && Boolean(s.readiness_exception?.reason));

    const yearRows = (Array.isArray(years.body) ? years.body : []) as Array<{ id: string; is_current?: boolean }>;
    const flagged = yearRows.find((y) => y.is_current);
    const sameYear = !flagged || flagged.id === s.validation.currentFinancialYear?.id;

    const label = co.name.slice(0, 28).padEnd(30);
    control(`${label} headline agrees with its own steps`, truthful,
      `status=${s.status} ready=${s.accounting_ready} progress=${s.progress_percent}%`);
    control(`${label} modules open only by setup or a recorded exception`, gateHonest,
      `unlocked=${s.modules_unlocked}${s.readiness_exception ? ' (exception)' : ''}`);
    control(`${label} setup and the calendar name the same current year`, sameYear,
      s.validation.currentFinancialYear?.year_code ?? 'no year');
  }

  console.log(`${NL}HELD ${held}   MISSING ${missing}`);
  gaps.forEach((g) => console.log(`  - ${g}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
