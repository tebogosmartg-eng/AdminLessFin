/**
 * Canonical Financial Aggregation — SINGLE money authority for AdminLess Fin.
 *
 * Inputs: GL/TB RPC payloads (get_balances_as_of_date | get_period_activity |
 * get_cash_flow_statement) + CoA metadata (roles / categories).
 *
 * Consumers MUST NOT re-sum journals, invent NI, or derive BS/IS totals elsewhere.
 * Presentation layers (UI, Statement Engine, Publication) display these figures only.
 */

export type BalanceRow = {
  id: string;
  name?: string;
  type: string;
  balance: number;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  account_code?: string | null;
  tax_treatment?: string | null;
  cash_flow_classification?: string | null;
};

export type ActivityRow = {
  id: string;
  name?: string;
  type: string;
  activity: number;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  account_code?: string | null;
  tax_treatment?: string | null;
  cash_flow_classification?: string | null;
};

export type CashFlowRow = {
  section: string;
  category?: string;
  amount: number;
};

export type AccountMeta = {
  id: string;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  account_code?: string | null;
  tax_treatment?: string | null;
  cash_flow_classification?: string | null;
  name?: string | null;
  type?: string | null;
};

/** Canonical monetary payload — every surface must consume this shape. */
export type CanonicalFinancialAggregation = {
  schema_version: '1.0.0';
  source: 'general_ledger_trial_balance';

  // P&L (period activity — same basis as Income Statement / TB period Income+Expense)
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  otherIncome: number;
  operatingExpenses: number;
  financeCosts: number;
  taxExpense: number;
  /** All Income period activity (Revenue + Other Income + unclassified Income). */
  totalIncome: number;
  /** All Expense period activity. */
  totalExpenses: number;
  netProfit: number;
  currentYearEarnings: number;

  // Balance sheet (as-of TB balances)
  assets: number;
  liabilities: number;
  storedEquity: number;
  equity: number;
  liabilitiesAndEquity: number;
  retainedEarnings: number;
  openingRetainedEarnings: number;
  closingRetainedEarningsPresented: number;
  openingStoredEquity: number;
  otherEquityMovements: number;

  // Position KPIs from TB + roles
  cash: number;
  receivables: number;
  payables: number;
  vatPayable: number;
  vatReceivable: number;
  vatNet: number;

  // Cash flow statement sections
  cashOperating: number;
  cashInvesting: number;
  cashFinancing: number;
  netCashFlow: number;

  // Trial Balance articulation
  totalDebits: number;
  totalCredits: number;
  trialBalanceBalanced: boolean;
  balanceSheetBalanced: boolean;
  equityIdentityHolds: boolean;
  profitIdentityHolds: boolean;

  /** Backward-compatible aliases used by existing reports/dashboard payloads. */
  totalAssets: number;
  totalLiabilities: number;
  totalStoredEquity: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  netIncome: number;
  closingRetainedEarningsStored: number;
  closingRetainedEarningsPresented_alias?: number;
};

export type StatementLine = {
  line_code: string;
  label: string;
  section: string;
  amount: number;
  is_total?: boolean;
  accounts?: Array<{ id: string; name?: string; type?: string; amount: number }>;
};

function n(v: unknown) {
  return Number(v || 0);
}

function round2(v: number) {
  return Math.round(n(v) * 100) / 100;
}

function mergeMeta<T extends { id: string }>(
  rows: T[] | null | undefined,
  metaById: Map<string, AccountMeta> | null | undefined,
): Array<T & AccountMeta> {
  return (rows || []).map((row) => {
    const m = metaById?.get(row.id);
    if (!m) return { ...row } as T & AccountMeta;
    return {
      ...row,
      account_role: (row as any).account_role ?? m.account_role,
      category: (row as any).category ?? m.category,
      subcategory: (row as any).subcategory ?? m.subcategory,
      account_code: (row as any).account_code ?? m.account_code,
      tax_treatment: (row as any).tax_treatment ?? m.tax_treatment,
      cash_flow_classification:
        (row as any).cash_flow_classification ?? m.cash_flow_classification,
    };
  });
}

function cat(row: { category?: string | null }) {
  return String(row.category || '').trim().toLowerCase();
}

function role(row: { account_role?: string | null }) {
  return String(row.account_role || '').trim().toLowerCase();
}

function code(row: { account_code?: string | null }) {
  return String(row.account_code || '').trim();
}

function cfClass(row: { cash_flow_classification?: string | null }) {
  return String(row.cash_flow_classification || '').trim().toLowerCase();
}

/** Classify period Income into Revenue vs Other Income (CoA category / role). */
export function isOtherIncomeAccount(row: ActivityRow & AccountMeta) {
  if (row.type !== 'Income') return false;
  if (role(row) === 'gain_on_disposal') return true;
  const c = cat(row);
  return c === 'other income';
}

export function isRevenueAccount(row: ActivityRow & AccountMeta) {
  if (row.type !== 'Income') return false;
  if (isOtherIncomeAccount(row)) return false;
  return true;
}

export function isCostOfSalesAccount(row: ActivityRow & AccountMeta) {
  if (row.type !== 'Expense') return false;
  if (role(row) === 'cogs') return true;
  return cat(row) === 'cost of sales';
}

export function isFinanceCostAccount(row: ActivityRow & AccountMeta) {
  if (row.type !== 'Expense') return false;
  if (isCostOfSalesAccount(row) || isTaxExpenseAccount(row)) return false;
  if (cfClass(row) === 'financing') return true;
  if (code(row) === '8010') return true;
  const c = cat(row);
  return c === 'finance costs' || c === 'finance cost';
}

export function isTaxExpenseAccount(row: ActivityRow & AccountMeta) {
  if (row.type !== 'Expense') return false;
  if (code(row) === '8030') return true;
  const c = cat(row);
  if (c === 'taxation' || c === 'income tax' || c === 'tax expense') return true;
  const sub = String(row.subcategory || '').toLowerCase();
  return sub.includes('income tax');
}

export function isOperatingExpenseAccount(row: ActivityRow & AccountMeta) {
  if (row.type !== 'Expense') return false;
  if (isCostOfSalesAccount(row)) return false;
  if (isFinanceCostAccount(row)) return false;
  if (isTaxExpenseAccount(row)) return false;
  return true;
}

function sumActivity(
  rows: Array<ActivityRow & AccountMeta>,
  pred: (r: ActivityRow & AccountMeta) => boolean,
) {
  let sum = 0;
  for (const row of rows) {
    if (pred(row)) sum += n(row.activity);
  }
  return round2(sum);
}

function sumBalancesByType(rows: BalanceRow[], type: string) {
  let sum = 0;
  for (const row of rows) {
    if (row.type === type) sum += n(row.balance);
  }
  return round2(sum);
}

function sumBalancesByPred(rows: Array<BalanceRow & AccountMeta>, pred: (r: BalanceRow & AccountMeta) => boolean) {
  let sum = 0;
  for (const row of rows) {
    if (pred(row)) sum += n(row.balance);
  }
  return round2(sum);
}

function retainedEarningsBalance(rows: Array<BalanceRow & AccountMeta>) {
  for (const row of rows) {
    if (role(row) === 'retained_earnings') return n(row.balance);
  }
  // Legacy fallback only when role metadata was not joined.
  for (const row of rows) {
    if (row.type === 'Equity' && String(row.name || '').toLowerCase() === 'retained earnings') {
      return n(row.balance);
    }
  }
  return 0;
}

function trialBalanceSides(rows: BalanceRow[]) {
  let totalDebits = 0;
  let totalCredits = 0;
  for (const acc of rows) {
    const bal = n(acc.balance);
    if (['Asset', 'Expense'].includes(acc.type)) {
      if (bal >= 0) totalDebits += bal;
      else totalCredits += -bal;
    } else {
      if (bal >= 0) totalCredits += bal;
      else totalDebits += -bal;
    }
  }
  return { totalDebits: round2(totalDebits), totalCredits: round2(totalCredits) };
}

function cashSectionTotals(rows: CashFlowRow[] | null | undefined) {
  let cashOperating = 0;
  let cashInvesting = 0;
  let cashFinancing = 0;
  for (const item of rows || []) {
    const amt = n(item.amount);
    if (item.section === 'Operating') cashOperating += amt;
    else if (item.section === 'Investing') cashInvesting += amt;
    else if (item.section === 'Financing') cashFinancing += amt;
  }
  return {
    cashOperating: round2(cashOperating),
    cashInvesting: round2(cashInvesting),
    cashFinancing: round2(cashFinancing),
    netCashFlow: round2(cashOperating + cashInvesting + cashFinancing),
  };
}

function isCashBalanceAccount(row: BalanceRow & AccountMeta) {
  if (row.type !== 'Asset') return false;
  const r = role(row);
  if (r === 'bank' || r === 'cash') return true;
  return String(row.subcategory || '') === 'Cash and Cash Equivalents';
}

function isReceivableAccount(row: BalanceRow & AccountMeta) {
  if (row.type !== 'Asset') return false;
  if (role(row) === 'trade_receivable') return true;
  return String(row.subcategory || '') === 'Trade and Other Receivables' && !isVatReceivable(row);
}

function isPayableAccount(row: BalanceRow & AccountMeta) {
  if (row.type !== 'Liability') return false;
  if (role(row) === 'trade_payable') return true;
  return String(row.subcategory || '') === 'Trade and Other Payables' && !isVatPayable(row);
}

function isVatPayable(row: BalanceRow & AccountMeta) {
  const r = role(row);
  return r === 'output_vat' || r === 'vat_control' || row.tax_treatment === 'vat_output' || row.tax_treatment === 'vat_control';
}

function isVatReceivable(row: BalanceRow & AccountMeta) {
  const r = role(row);
  return r === 'input_vat' || row.tax_treatment === 'vat_input';
}

/**
 * Build the canonical financial aggregation from GL/TB RPC payloads.
 * This is the ONLY permitted monetary aggregation for AdminLess Fin consumers.
 */
export function buildCanonicalFinancialAggregation(input: {
  balancesAsOf?: BalanceRow[] | null;
  periodActivity?: ActivityRow[] | null;
  cashFlowData?: CashFlowRow[] | null;
  openingBalances?: BalanceRow[] | null;
  accountMeta?: Iterable<AccountMeta> | null;
  /** Optional bank_accounts.chart_of_account_id set — unioned with role-based cash. */
  bankCoaIds?: Iterable<string> | null;
  retainedEarningsAccountIds?: Iterable<string> | null;
}): CanonicalFinancialAggregation {
  const metaById = new Map<string, AccountMeta>();
  for (const m of input.accountMeta || []) {
    if (m?.id) metaById.set(m.id, m);
  }

  const reIds = new Set(input.retainedEarningsAccountIds || []);
  const bankIds = new Set(input.bankCoaIds || []);

  const balances = mergeMeta(input.balancesAsOf, metaById).map((row) => {
    if (reIds.has(row.id)) row.account_role = 'retained_earnings';
    return row;
  });
  const opening = mergeMeta(input.openingBalances, metaById).map((row) => {
    if (reIds.has(row.id)) row.account_role = 'retained_earnings';
    return row;
  });
  const activity = mergeMeta(input.periodActivity, metaById);

  const revenue = sumActivity(activity, isRevenueAccount);
  const otherIncome = sumActivity(activity, isOtherIncomeAccount);
  const costOfSales = sumActivity(activity, isCostOfSalesAccount);
  const operatingExpenses = sumActivity(activity, isOperatingExpenseAccount);
  const financeCosts = sumActivity(activity, isFinanceCostAccount);
  const taxExpense = sumActivity(activity, isTaxExpenseAccount);

  const totalIncome = sumActivity(activity, (r) => r.type === 'Income');
  const totalExpenses = sumActivity(activity, (r) => r.type === 'Expense');
  const netProfit = round2(totalIncome - totalExpenses);
  const grossProfit = round2(revenue - costOfSales);

  // Identity: partitioned P&L must equal type totals (within rounding).
  const partitionedIncome = round2(revenue + otherIncome);
  const partitionedExpenses = round2(
    costOfSales + operatingExpenses + financeCosts + taxExpense,
  );
  const profitIdentityHolds =
    Math.abs(partitionedIncome - totalIncome) < 0.015 &&
    Math.abs(partitionedExpenses - totalExpenses) < 0.015 &&
    Math.abs(round2(partitionedIncome - partitionedExpenses) - netProfit) < 0.015;

  const assets = sumBalancesByType(balances, 'Asset');
  const liabilities = sumBalancesByType(balances, 'Liability');
  const storedEquity = sumBalancesByType(balances, 'Equity');
  const equity = round2(storedEquity + netProfit);
  const liabilitiesAndEquity = round2(liabilities + equity);

  const retainedEarnings = retainedEarningsBalance(balances);
  const openingRetainedEarnings = retainedEarningsBalance(opening);
  const openingStoredEquity = sumBalancesByType(opening, 'Equity');
  const otherEquityMovements = round2(storedEquity - openingStoredEquity);
  const closingRetainedEarningsPresented = round2(openingRetainedEarnings + netProfit);

  let cash = sumBalancesByPred(balances, isCashBalanceAccount);
  if (bankIds.size > 0) {
    // Union: role/subcategory cash OR bank-linked CoA ids (dashboard banking).
    cash = sumBalancesByPred(
      balances,
      (r) => isCashBalanceAccount(r) || bankIds.has(r.id),
    );
  }

  const receivables = sumBalancesByPred(balances, isReceivableAccount);
  const payables = sumBalancesByPred(balances, isPayableAccount);
  const vatPayable = sumBalancesByPred(balances, isVatPayable);
  const vatReceivable = sumBalancesByPred(balances, isVatReceivable);
  const vatNet = round2(vatPayable - vatReceivable);

  const { totalDebits, totalCredits } = trialBalanceSides(balances);
  const cashFlow = cashSectionTotals(input.cashFlowData);

  const equityIdentityHolds =
    Math.abs(openingStoredEquity + netProfit + otherEquityMovements - equity) < 0.015;

  return {
    schema_version: '1.0.0',
    source: 'general_ledger_trial_balance',
    revenue,
    costOfSales,
    grossProfit,
    otherIncome,
    operatingExpenses,
    financeCosts,
    taxExpense,
    totalIncome,
    totalExpenses,
    netProfit,
    currentYearEarnings: netProfit,
    assets,
    liabilities,
    storedEquity,
    equity,
    liabilitiesAndEquity,
    retainedEarnings,
    openingRetainedEarnings,
    closingRetainedEarningsPresented,
    openingStoredEquity,
    otherEquityMovements,
    cash,
    receivables,
    payables,
    vatPayable,
    vatReceivable,
    vatNet,
    ...cashFlow,
    totalDebits,
    totalCredits,
    trialBalanceBalanced: Math.abs(totalDebits - totalCredits) < 0.015,
    balanceSheetBalanced: Math.abs(assets - liabilitiesAndEquity) < 0.015,
    equityIdentityHolds,
    profitIdentityHolds,
    // aliases
    totalAssets: assets,
    totalLiabilities: liabilities,
    totalStoredEquity: storedEquity,
    totalEquity: equity,
    totalLiabilitiesAndEquity: liabilitiesAndEquity,
    netIncome: netProfit,
    closingRetainedEarningsStored: retainedEarnings,
  };
}

/** Map canonical aggregation → primary statement lines (presentation only). */
export function canonicalToPerformanceLines(
  agg: CanonicalFinancialAggregation,
  labels: Record<string, string> = {},
): StatementLine[] {
  const L = (code: string, fallback: string) => labels[code] || fallback;
  return [
    { line_code: 'perf.revenue', label: L('perf.revenue', 'Revenue'), section: 'revenue', amount: agg.revenue },
    {
      line_code: 'perf.cost_of_sales',
      label: L('perf.cost_of_sales', 'Cost of Sales'),
      section: 'expenses',
      amount: agg.costOfSales,
    },
    {
      line_code: 'perf.gross_profit',
      label: L('perf.gross_profit', 'Gross Profit'),
      section: 'result',
      amount: agg.grossProfit,
      is_total: true,
    },
    {
      line_code: 'perf.other_income',
      label: L('perf.other_income', 'Other Income'),
      section: 'revenue',
      amount: agg.otherIncome,
    },
    {
      line_code: 'perf.operating_expenses',
      label: L('perf.operating_expenses', 'Operating Expenses'),
      section: 'expenses',
      amount: agg.operatingExpenses,
    },
    {
      line_code: 'perf.finance_costs',
      label: L('perf.finance_costs', 'Finance Costs'),
      section: 'expenses',
      amount: agg.financeCosts,
    },
    {
      line_code: 'perf.tax',
      label: L('perf.tax', 'Tax'),
      section: 'expenses',
      amount: agg.taxExpense,
    },
    {
      line_code: 'perf.total_income',
      label: L('perf.total_income', 'Total Income'),
      section: 'revenue',
      amount: agg.totalIncome,
      is_total: true,
    },
    {
      line_code: 'perf.total_expenses',
      label: L('perf.total_expenses', 'Total Expenses'),
      section: 'expenses',
      amount: agg.totalExpenses,
      is_total: true,
    },
    {
      line_code: 'perf.result',
      label: L('perf.result', 'Profit / (Loss) for the period'),
      section: 'result',
      amount: agg.netProfit,
      is_total: true,
    },
  ];
}

export function canonicalToPositionLines(
  agg: CanonicalFinancialAggregation,
  labels: Record<string, string> = {},
): StatementLine[] {
  const L = (code: string, fallback: string) => labels[code] || fallback;
  return [
    { line_code: 'sfp.assets', label: L('sfp.assets', 'Assets'), section: 'assets', amount: agg.assets },
    {
      line_code: 'sfp.total_assets',
      label: L('sfp.total_assets', 'Total Assets'),
      section: 'assets',
      amount: agg.assets,
      is_total: true,
    },
    {
      line_code: 'sfp.liabilities',
      label: L('sfp.liabilities', 'Liabilities'),
      section: 'liabilities',
      amount: agg.liabilities,
    },
    {
      line_code: 'sfp.total_liabilities',
      label: L('sfp.total_liabilities', 'Total Liabilities'),
      section: 'liabilities',
      amount: agg.liabilities,
      is_total: true,
    },
    {
      line_code: 'sfp.retained_earnings',
      label: L('sfp.retained_earnings', 'Retained Earnings'),
      section: 'equity',
      amount: agg.retainedEarnings,
    },
    {
      line_code: 'sfp.equity',
      label: L('sfp.equity', 'Equity'),
      section: 'equity',
      amount: agg.storedEquity,
    },
    {
      line_code: 'sfp.current_period_result',
      label: L('sfp.current_period_result', 'Current Year Earnings'),
      section: 'equity',
      amount: agg.currentYearEarnings,
    },
    {
      line_code: 'sfp.total_equity',
      label: L('sfp.total_equity', 'Total Equity'),
      section: 'equity',
      amount: agg.equity,
      is_total: true,
    },
    {
      line_code: 'sfp.total_liabilities_and_equity',
      label: L('sfp.total_liabilities_and_equity', 'Total Liabilities and Equity'),
      section: 'totals',
      amount: agg.liabilitiesAndEquity,
      is_total: true,
    },
  ];
}

export function canonicalToCashFlowLines(
  agg: CanonicalFinancialAggregation,
  labels: Record<string, string> = {},
): StatementLine[] {
  const L = (code: string, fallback: string) => labels[code] || fallback;
  return [
    {
      line_code: 'cf.operating',
      label: L('cf.operating', 'Operating activities'),
      section: 'operating',
      amount: agg.cashOperating,
    },
    {
      line_code: 'cf.investing',
      label: L('cf.investing', 'Investing activities'),
      section: 'investing',
      amount: agg.cashInvesting,
    },
    {
      line_code: 'cf.financing',
      label: L('cf.financing', 'Financing activities'),
      section: 'financing',
      amount: agg.cashFinancing,
    },
    {
      line_code: 'cf.net_change',
      label: L('cf.net_change', 'Net change in cash'),
      section: 'totals',
      amount: agg.netCashFlow,
      is_total: true,
    },
  ];
}

export function canonicalToEquityLines(
  agg: CanonicalFinancialAggregation,
  labels: Record<string, string> = {},
): StatementLine[] {
  const L = (code: string, fallback: string) => labels[code] || fallback;
  return [
    {
      line_code: 'eq.opening',
      label: L('eq.opening', 'Opening equity'),
      section: 'opening',
      amount: agg.openingStoredEquity,
      is_total: true,
    },
    {
      line_code: 'eq.period_result',
      label: L('eq.period_result', 'Current Year Earnings'),
      section: 'movements',
      amount: agg.currentYearEarnings,
    },
    {
      line_code: 'eq.other_movements',
      label: L('eq.other_movements', 'Other movements'),
      section: 'movements',
      amount: agg.otherEquityMovements,
    },
    {
      line_code: 'eq.closing',
      label: L('eq.closing', 'Closing equity'),
      section: 'closing',
      amount: agg.equity,
      is_total: true,
    },
  ];
}

/** Comparative BS section totals — delegates equity+CYE identity to canonical math. */
export function buildComparativeBalanceSheetTotals(
  accounts: { type: string; current?: number; prior?: number }[],
  netIncome: { current: number; prior: number },
) {
  const sum = (type: string, key: 'current' | 'prior') =>
    (accounts || []).reduce((s, a) => (a.type === type ? s + n(a[key]) : s), 0);

  const assets = { current: round2(sum('Asset', 'current')), prior: round2(sum('Asset', 'prior')) };
  const liabilities = {
    current: round2(sum('Liability', 'current')),
    prior: round2(sum('Liability', 'prior')),
  };
  const storedEquity = {
    current: round2(sum('Equity', 'current')),
    prior: round2(sum('Equity', 'prior')),
  };
  const equity = {
    current: round2(storedEquity.current + n(netIncome.current)),
    prior: round2(storedEquity.prior + n(netIncome.prior)),
  };
  return {
    assets,
    liabilities,
    storedEquity,
    equity,
    liabilitiesAndEquity: {
      current: round2(liabilities.current + equity.current),
      prior: round2(liabilities.prior + equity.prior),
    },
    netIncome,
  };
}

/** Monthly P&L totals — type-sum only (same Income/Expense identity as canonical). */
export function buildComparativePlMonthTotals(
  accounts: { type: string; values?: Record<string, number> }[],
  monthLabels: string[],
) {
  const months: Record<string, { totalIncome: number; totalExpenses: number; netIncome: number }> = {};
  for (const label of monthLabels) {
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const acc of accounts || []) {
      const v = n(acc.values?.[label]);
      if (acc.type === 'Income') totalIncome += v;
      else if (acc.type === 'Expense') totalExpenses += v;
    }
    months[label] = {
      totalIncome: round2(totalIncome),
      totalExpenses: round2(totalExpenses),
      netIncome: round2(totalIncome - totalExpenses),
    };
  }
  return months;
}

export function sumCashFromBankLinks(
  accounts: BalanceRow[] | null | undefined,
  bankCoaIds: Iterable<string>,
) {
  const ids = new Set(bankCoaIds);
  let sum = 0;
  for (const a of accounts || []) {
    if (ids.has(a.id)) sum += n(a.balance);
  }
  return round2(sum);
}

export function sumBalanceSheetFromRows(accounts: BalanceRow[] | null | undefined) {
  return {
    assets: sumBalancesByType(accounts || [], 'Asset'),
    liabilities: sumBalancesByType(accounts || [], 'Liability'),
    storedEquity: sumBalancesByType(accounts || [], 'Equity'),
  };
}

/** Period NI from activity rows — MUST match canonical netProfit. */
export function sumPeriodNetIncome(rows: ActivityRow[] | null | undefined) {
  return buildCanonicalFinancialAggregation({ periodActivity: rows }).netProfit;
}
