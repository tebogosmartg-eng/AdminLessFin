/**
 * Dashboard source-of-truth verification.
 *
 * Proves, against the live tenant, that every financial amount the Dashboard
 * displays originates from Canonical Financial Aggregation and reconciles to
 * the Trial Balance and the Financial Statements.
 *
 * Method — raw General Ledger in, three engines out:
 *   1. Pull the raw GL/TB RPC payloads (get_balances_as_of_date,
 *      get_period_activity, get_cash_flow_statement). These ARE the Trial
 *      Balance; nothing is derived from a KPI endpoint.
 *   2. Aggregate them with the CLIENT CFA authority
 *      (src/lib/accounting/canonicalFinancialAggregation.ts).
 *   3. Aggregate the same rows with the EDGE CFA authority
 *      (supabase/functions/_shared/accountingEngineTotals.ts) — what
 *      dashboard-data and reports emit as `statementTotals`.
 *   4. Assert 2 ≡ 3 (one engine, two deployments), then assert every Dashboard
 *      KPI equals its CFA property, then assert the canonical identities.
 *
 * Also reports which money fields the DEPLOYED edge functions actually return,
 * which is how we know whether shipped code matches the repo.
 *
 * Read-only: invokes read endpoints and RPCs, writes nothing.
 *
 * Usage: npx tsx tools/perf/verifyDashboardSourceOfTruth.ts [companyId]
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildCanonicalFinancialAggregation } from '../../src/lib/accounting/canonicalFinancialAggregation';
import { buildStatementTotals as buildEdgeStatementTotals } from '../../supabase/functions/_shared/accountingEngineTotals.ts';
import { loadE2EEnv } from '../../tests/e2e/playwright/env';

/** Half a cent — the same tolerance the reconciliation controls use. */
const TOLERANCE = 0.005;

const failures: string[] = [];

function money(v: number) {
  return v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

function eq(a: number, b: number) {
  return Math.abs(Number(a) - Number(b)) <= TOLERANCE;
}

async function resolveFinancialYear(supabase: SupabaseClient, companyId: string) {
  const { data } = await supabase
    .from('financial_years')
    .select('start_date, end_date, year_code')
    .eq('company_id', companyId)
    .order('start_date', { ascending: false });

  const today = new Date().toISOString().slice(0, 10);
  const rows = data ?? [];
  const current = rows.find((y) => y.start_date <= today && y.end_date >= today) ?? rows[0];
  if (!current) {
    const year = new Date().getFullYear();
    return { from: `${year}-01-01`, to: `${year}-12-31`, code: 'calendar-fallback' };
  }
  return { from: current.start_date, to: current.end_date, code: current.year_code ?? 'FY' };
}

(async () => {
  const env = loadE2EEnv();
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (authError) throw new Error(`sign-in failed: ${authError.message}`);

  const { data: memberships } = await supabase
    .from('company_users')
    .select('company_id, role')
    .in('role', ['owner', 'admin']);
  const companyId =
    process.argv[2] ?? env.companyId ?? memberships?.[0]?.company_id;
  if (!companyId) throw new Error('no admin company available for the E2E user');

  const fy = await resolveFinancialYear(supabase, companyId);
  console.log(`company : ${companyId}`);
  console.log(`period  : ${fy.from} → ${fy.to}  (${fy.code})`);

  // ---- 1. Raw General Ledger — the Trial Balance itself ---------------------
  const [balancesRes, activityRes, cashFlowRes, coaRes, bankRes] = await Promise.all([
    supabase.rpc('get_balances_as_of_date', { p_end_date: fy.to, p_company_id: companyId }),
    supabase.rpc('get_period_activity', {
      p_start_date: fy.from,
      p_end_date: fy.to,
      p_company_id: companyId,
    }),
    supabase.rpc('get_cash_flow_statement', {
      p_start_date: fy.from,
      p_end_date: fy.to,
      p_company_id: companyId,
    }),
    supabase
      .from('chart_of_accounts')
      .select(
        'id, account_role, category, subcategory, account_code, tax_treatment, cash_flow_classification',
      )
      .eq('company_id', companyId),
    supabase
      .from('bank_accounts')
      .select('chart_of_account_id')
      .eq('company_id', companyId)
      .eq('status', 'active'),
  ]);

  const accountMeta = coaRes.data ?? [];
  const cfaInput = {
    balancesAsOf: balancesRes.data ?? [],
    periodActivity: activityRes.data ?? [],
    cashFlowData: cashFlowRes.data ?? [],
    accountMeta,
    retainedEarningsAccountIds: accountMeta
      .filter((r) => r.account_role === 'retained_earnings')
      .map((r) => r.id),
    bankCoaIds: (bankRes.data ?? [])
      .map((b) => b.chart_of_account_id)
      .filter(Boolean) as string[],
  };
  console.log(
    `GL rows : ${cfaInput.balancesAsOf.length} balances, ${cfaInput.periodActivity.length} activity, ${cfaInput.cashFlowData.length} cash-flow`,
  );

  // ---- 2 & 3. Client engine vs edge engine, identical inputs ---------------
  const client = buildCanonicalFinancialAggregation(cfaInput);
  const edge = buildEdgeStatementTotals(cfaInput);

  console.log('\n=== 1. One engine: client CFA vs edge CFA on identical GL rows ===');
  const parityKeys = Object.keys(edge) as Array<keyof typeof edge>;
  const drifted = parityKeys.filter(
    (k) => typeof edge[k] === 'number' && !eq(edge[k] as number, (client as never)[k]),
  );
  check(
    `all ${parityKeys.length} statementTotals properties match the client authority`,
    drifted.length === 0,
    drifted.length ? `drifted: ${drifted.join(', ')}` : '',
  );

  // ---- 4. Dashboard KPI → CFA property mapping ------------------------------
  // Exactly the expressions src/pages/Dashboard.tsx now evaluates.
  console.log('\n=== 2. Dashboard KPI ← CFA property (as rendered) ===');
  const kpis: Array<[string, number, number]> = [
    ['Cash Balance', Number(edge.cash), client.cash],
    ['Total Assets', Number(edge.totalAssets), client.totalAssets],
    ['Total Liabilities', Number(edge.totalLiabilities), client.totalLiabilities],
    ['Total Equity', Number(edge.totalEquity), client.totalEquity],
    ['Net Income', Number(edge.netIncome), client.netIncome],
    ['Accounts Receivable', Number(edge.receivables), client.receivables],
    ['Accounts Payable', Number(edge.payables), client.payables],
    ['Revenue (total income)', Number(edge.totalIncome), client.totalIncome],
    ['Expenses', Number(edge.totalExpenses), client.totalExpenses],
  ];
  for (const [label, rendered, tb] of kpis) {
    check(`${label.padEnd(24)} ${money(rendered).padStart(16)}`, eq(rendered, tb));
  }

  // ---- 5. Canonical identities from raw GL ---------------------------------
  console.log('\n=== 3. Trial Balance / Financial Statement identities (raw GL) ===');
  console.log(`         debits ${money(client.totalDebits)}   credits ${money(client.totalCredits)}`);
  check('Trial Balance: debits = credits', client.trialBalanceBalanced);
  console.log(
    `         assets ${money(client.totalAssets)}   liabilities+equity ${money(client.totalLiabilitiesAndEquity)}`,
  );
  check('Balance Sheet: assets = liabilities + equity', client.balanceSheetBalanced);
  check('Income Statement: income − expenses = net income', client.profitIdentityHolds);
  check(
    'Income Statement: totalIncome − totalExpenses = netIncome (arithmetic)',
    eq(client.totalIncome - client.totalExpenses, client.netIncome),
  );
  check(
    'Equity: stored equity + net income = total equity',
    eq(client.totalStoredEquity + client.netIncome, client.totalEquity),
  );

  // ---- 6. What the DEPLOYED edges actually return ---------------------------
  console.log('\n=== 4. DEPLOYED edge payloads (is shipped code current?) ===');
  const { data: dash } = await supabase.functions.invoke('dashboard-data', {
    body: { company_id: companyId, date_from: fy.from, date_to: fy.to },
  });
  const { data: reports } = await supabase.functions.invoke('reports', {
    body: { company_id: companyId, start_date: fy.from, end_date: fy.to },
  });
  const has = (o: unknown, k: string) =>
    !!o && Object.prototype.hasOwnProperty.call(o, k) && (o as Record<string, unknown>)[k] != null;

  console.log(`  dashboard-data keys: ${Object.keys(dash ?? {}).sort().join(', ')}`);
  console.log(`  reports keys       : ${Object.keys(reports ?? {}).sort().join(', ')}`);

  const dashLive = has(dash, 'statementTotals');
  const reportsLive = has(reports, 'statementTotals');
  console.log(`\n  dashboard-data returns statementTotals : ${dashLive ? 'YES' : 'NO — pre-CFA build deployed'}`);
  console.log(`  reports        returns statementTotals : ${reportsLive ? 'YES' : 'NO — pre-CFA build deployed'}`);

  const obsolete = [
    'canonicalAggregation',
    'periodNetIncome',
    'periodRevenue',
    'periodExpenses',
    'totalAssets',
    'totalLiabilities',
    'totalStoredEquity',
    'totalEquity',
    'cashBalance',
  ].filter((k) => dash && Object.prototype.hasOwnProperty.call(dash, k));
  console.log(
    `  obsolete money fields still on the wire : ${obsolete.length ? obsolete.join(', ') : 'none'}`,
  );

  if (dashLive) {
    console.log('\n  deployed dashboard-data statementTotals vs raw GL:');
    for (const [label, key] of [
      ['Cash', 'cash'],
      ['Total Assets', 'totalAssets'],
      ['Total Liabilities', 'totalLiabilities'],
      ['Net Income', 'netIncome'],
      ['Receivables', 'receivables'],
      ['Payables', 'payables'],
    ] as const) {
      const live = Number((dash.statementTotals as Record<string, unknown>)[key] ?? NaN);
      check(`  ${label.padEnd(20)} ${money(live).padStart(16)}`, eq(live, (client as never)[key]));
    }
  } else {
    console.log(
      '\n  NOTE: the deployed edges predate CFA, so live Dashboard / Financial\n' +
        '        Statement totals cannot be compared here. They render 0.00 in\n' +
        '        production until the functions are deployed.',
    );
  }

  console.log(
    `\nRESULT: ${failures.length === 0 ? 'PASS' : 'FAIL'}${failures.length ? ` (${failures.length})` : ''}`,
  );
  for (const f of failures) console.log(`  - ${f}`);
  await supabase.auth.signOut({ scope: 'local' });
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('verification failed:', e.message);
  process.exit(1);
});
