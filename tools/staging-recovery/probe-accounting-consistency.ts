/**
 * Do the accounting screens agree with each other?
 *
 * Read-only. For every company the signed-in user belongs to, this asks each
 * surface for the same financial facts over the same period and reports where
 * they differ:
 *
 *   accounting-setup  GET_STATUS            readiness, steps, validation
 *   accounting        GET_TRIAL_BALANCE     trial balance totals + balanced
 *   reports           (default)             financial statement totals
 *   accounting-health GET_HEALTH            health view of the same CoA
 *   accounting        GET_FINANCIAL_YEARS   financial year
 *   accounting        GET_FINANCIAL_PERIODS period status
 *   dashboard-data                          onboarding / dashboard status
 *
 * It changes nothing. Run it before and after any consolidation.
 *
 *   npx tsx tools/staging-recovery/probe-accounting-consistency.ts
 */
import { connect, invoke, tech } from './edgeProbe';

const NL = String.fromCharCode(10);
const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
const money = (v: unknown) => n(v).toFixed(2);

type Row = { company: string; fact: string; a: string; b: string; agree: boolean };
const findings: Row[] = [];
let agreements = 0;

function compare(company: string, fact: string, a: unknown, b: unknown, labelA: string, labelB: string) {
  const sa = typeof a === 'number' ? money(a) : String(a);
  const sb = typeof b === 'number' ? money(b) : String(b);
  const agree = sa === sb;
  if (agree) agreements++;
  else findings.push({ company, fact, a: `${labelA}=${sa}`, b: `${labelB}=${sb}`, agree });
  return agree;
}

async function main() {
  const { supabase: api, companies } = await connect('Spaceman');
  console.log(`${companies.length} companies${NL}`);

  for (const co of companies) {
    await api.functions.invoke('settings', { body: { method: 'SWITCH_COMPANY', target_company_id: co.id } });

    // The financial year the accounting screens use.
    const years = await invoke(api, 'accounting', { method: 'GET_FINANCIAL_YEARS', company_id: co.id });
    const yearRows = (Array.isArray(years.body) ? years.body : (years.body as { years?: unknown[] })?.years ?? []) as Array<{
      id: string; start_date: string; end_date: string; status?: string; is_current?: boolean; year_code?: string;
    }>;
    // The year every surface is meant to use, as decided by financial_year_current().
    const activeYear = yearRows.find((y) => y.is_current) ?? yearRows[0];
    if (!activeYear) {
      // Not a disagreement: setup reports "Active financial year is required".
      console.log(`## ${co.name}: no financial year yet${NL}`);
      continue;
    }
    const start = activeYear.start_date;
    const end = activeYear.end_date;

    const [setup, tb, rpt, health, periods, dash] = await Promise.all([
      invoke(api, 'accounting-setup', { method: 'GET_STATUS', company_id: co.id }),
      invoke(api, 'accounting', { method: 'GET_TRIAL_BALANCE', company_id: co.id, start_date: start, end_date: end }),
      invoke(api, 'reports', { company_id: co.id, start_date: start, end_date: end, prior_date: start }),
      invoke(api, 'accounting-health', { method: 'GET_HEALTH', company_id: co.id }),
      invoke(api, 'accounting', { method: 'GET_FINANCIAL_PERIODS', company_id: co.id }),
      invoke(api, 'dashboard-data', { company_id: co.id }),
    ]);

    console.log(`## ${co.name}  (${start} .. ${end})`);
    for (const [label, r] of [['accounting-setup', setup], ['trial balance', tb], ['reports', rpt],
                              ['accounting-health', health], ['periods', periods], ['dashboard', dash]] as const) {
      if (!r.ok) console.log(`   !! ${label} failed: ${tech(r) || JSON.stringify(r.body).slice(0, 120)}`);
    }

    const s = setup.body as {
      accounting_ready?: boolean; status?: string; progress_percent?: number;
      steps?: Record<string, { complete: boolean }>;
      validation?: Record<string, unknown>;
    } | null;
    const t = tb.body as { totals?: Record<string, number>; balanced?: boolean; canonicalAggregation?: Record<string, number> } | null;
    const p = rpt.body as { statementTotals?: Record<string, number> } | null;

    // ---- money: trial balance vs financial statements, same engine, same period
    if (t?.canonicalAggregation && p?.statementTotals) {
      const cfa = t.canonicalAggregation;
      const st = p.statementTotals;
      for (const key of ['totalAssets', 'totalLiabilities', 'totalEquity', 'totalIncome',
                         'totalExpenses', 'netIncome', 'totalDebits', 'totalCredits',
                         'cash', 'receivables', 'payables', 'vatNet', 'retainedEarnings']) {
        compare(co.name, `statements vs trial balance: ${key}`, cfa[key], st[key], 'TB', 'AFS');
      }
      compare(co.name, 'trial balance balanced', String(t.balanced), String(st.trialBalanceBalanced), 'TB', 'AFS');
      compare(co.name, 'balance sheet balanced', String(cfa.balanceSheetBalanced), String(st.balanceSheetBalanced), 'TB', 'AFS');
    }

    // ---- readiness: does the headline agree with its own evidence?
    //
    // The contract: `status` and `accounting_ready` are the live truth, so they
    // must agree with the steps and progress in the same response. Only
    // `modules_unlocked` may differ, and only while a recorded exception says
    // why. (A company that is NOT ready can perfectly well have a valid
    // financial year, so "not ready" is only a conflict when the evidence says
    // every step is complete.)
    if (s) {
      const v = (s.validation ?? {}) as Record<string, unknown>;
      const r = s as typeof s & { modules_unlocked?: boolean; readiness_exception?: { reason?: string } | null };
      const stepsAllComplete = Object.values(s.steps ?? {}).every((x) => x.complete);
      compare(co.name, 'accounting_ready agrees with its own steps',
        String(Boolean(s.accounting_ready)), String(stepsAllComplete), 'headline', 'steps');
      compare(co.name, 'accounting_ready agrees with progress',
        String(Boolean(s.accounting_ready)), String((s.progress_percent ?? 0) >= 100), 'headline', 'progress');
      compare(co.name, 'status READY only when setup is complete',
        String(s.status === 'READY'), String(stepsAllComplete), 'status', 'steps');
      if (s.accounting_ready) {
        compare(co.name, 'a ready company has its control accounts',
          'true', String(Boolean(v.mandatoryControlAccounts)), 'headline', 'validation');
        compare(co.name, 'a ready company has tax configured',
          'true', String(Boolean(v.taxConfigurationExists)), 'headline', 'validation');
        compare(co.name, 'a ready company has an open financial year',
          'true', String(Boolean(v.activeFinancialYear)), 'headline', 'validation');
      }
      const unlockedWithoutReason = r.modules_unlocked === true && !s.accounting_ready && !r.readiness_exception;
      compare(co.name, 'modules open without setup only under a recorded exception',
        'false', String(unlockedWithoutReason), 'expected', 'observed');
      if (r.readiness_exception) {
        console.log(`   modules open under a recorded exception: ${String(r.readiness_exception.reason ?? '').slice(0, 90)}...`);
      }

      // ---- the same CoA facts, seen by setup and by health
      const h = health.body as Record<string, unknown> | null;
      if (h) {
        const hv = JSON.stringify(h);
        const setupCoaOk = Boolean(v.chartOfAccountsExists);
        const healthSaysAccounts = /"accounts?_?count"\s*:\s*([0-9]+)/.exec(hv)?.[1];
        if (healthSaysAccounts !== undefined) {
          compare(co.name, 'chart of accounts count',
            String(v.accountCount ?? 0), healthSaysAccounts, 'setup', 'health');
        }
        if (setupCoaOk === false) {
          findings.push({ company: co.name, fact: 'setup says CoA missing',
            a: `accountCount=${v.accountCount}`, b: 'health=' + hv.slice(0, 80), agree: false });
        }
      }
      console.log(`   setup: ready=${s.accounting_ready} status=${s.status} progress=${s.progress_percent}%` +
        ` | steps=${Object.entries(s.steps ?? {}).filter(([, x]) => !x.complete).map(([k]) => k).join(',') || 'all complete'}`);
      if (Array.isArray(v.missingControlAccounts) && v.missingControlAccounts.length) {
        console.log(`   missing control accounts: ${(v.missingControlAccounts as string[]).join(', ')}`);
      }
      if (Array.isArray(v.errors) && v.errors.length) {
        console.log(`   validation errors: ${(v.errors as string[]).slice(0, 4).join(' | ')}`);
      }
    }
    if (t?.totals) {
      console.log(`   trial balance: Dr ${money(t.totals.closing_debit)} Cr ${money(t.totals.closing_credit)} balanced=${t.balanced}`);
    }
    if (p?.statementTotals) {
      const st = p.statementTotals;
      console.log(`   statements:    A ${money(st.totalAssets)} L ${money(st.totalLiabilities)} E ${money(st.totalEquity)} NI ${money(st.netIncome)}`);
    }
    console.log('');
  }

  console.log(`${NL}================ DISAGREEMENTS ================`);
  if (!findings.length) console.log('  none');
  const byFact = new Map<string, Row[]>();
  for (const f of findings) {
    if (!byFact.has(f.fact)) byFact.set(f.fact, []);
    byFact.get(f.fact)!.push(f);
  }
  for (const [fact, rows] of byFact) {
    console.log(`${NL}${fact}  (${rows.length})`);
    rows.forEach((r) => console.log(`    ${r.company}: ${r.a}  vs  ${r.b}`));
  }
  console.log(`${NL}agreed on ${agreements} facts, disagreed on ${findings.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
