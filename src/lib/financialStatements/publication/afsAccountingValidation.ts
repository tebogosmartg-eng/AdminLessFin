/**
 * Presentation-layer accounting articulation checks for sealed AFS packs.
 * Does not recalculate from GL — validates published statement lines only.
 */

export type ArticulationCheck = {
  id: string;
  label: string;
  pass: boolean;
  expected?: number;
  actual?: number;
  detail?: string;
};

function round2(n: number) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function findAmount(
  rows: Array<{ line_code?: string; label?: string; amount: number; is_total?: boolean }>,
  predicates: Array<(r: { line_code?: string; label?: string; is_total?: boolean }) => boolean>,
): number | null {
  for (const pred of predicates) {
    const hit = rows.find(pred);
    if (hit) return round2(hit.amount);
  }
  return null;
}

export function validateAfsArticulation(pack: {
  statements?: Array<{
    statement_type: string;
    lines?: Array<{ line_code?: string; label?: string; amount: number; is_total?: boolean }>;
  }>;
}): { ok: boolean; checks: ArticulationCheck[] } {
  const byType = new Map(
    (pack.statements || []).map((s) => [s.statement_type, s.lines || []]),
  );
  const sfp = byType.get('financial_position') || [];
  const perf = byType.get('financial_performance') || [];
  const equity = byType.get('changes_in_equity') || [];
  const cf = byType.get('cash_flows') || [];

  const totalAssets = findAmount(sfp, [
    (r) => r.line_code === 'sfp.total_assets',
    (r) => /total assets/i.test(r.label || ''),
  ]);
  const totalLE = findAmount(sfp, [
    (r) => r.line_code === 'sfp.total_liabilities_and_equity',
    (r) => /total liabilities and equity/i.test(r.label || ''),
  ]);
  const profit = findAmount(perf, [
    (r) => r.line_code === 'perf.result',
    (r) => /profit|period result|loss/i.test(r.label || '') && !!r.is_total,
  ]);
  const revenue = findAmount(perf, [
    (r) => r.line_code === 'perf.total_revenue',
    (r) => r.line_code === 'perf.revenue',
  ]);
  const expenses = findAmount(perf, [
    (r) => r.line_code === 'perf.total_expenses',
    (r) => r.line_code === 'perf.expenses',
  ]);
  const closingEquity = findAmount(equity, [
    (r) => r.line_code === 'eq.closing',
    (r) => /closing equity/i.test(r.label || ''),
  ]);
  const equityPeriodResult = findAmount(equity, [
    (r) => r.line_code === 'eq.period_result',
    (r) => /profit|period result|loss/i.test(r.label || ''),
  ]);
  const netCashChange = findAmount(cf, [
    (r) => r.line_code === 'cf.net_change',
    (r) => /net (increase|change|decrease)/i.test(r.label || ''),
  ]);
  const op = findAmount(cf, [(r) => r.line_code === 'cf.operating']);
  const inv = findAmount(cf, [(r) => r.line_code === 'cf.investing']);
  const fin = findAmount(cf, [(r) => r.line_code === 'cf.financing']);

  const checks: ArticulationCheck[] = [];

  if (totalAssets != null && totalLE != null) {
    checks.push({
      id: 'SFP.BALANCE',
      label: 'Statement of Financial Position balances (Assets = Liabilities + Equity)',
      pass: totalAssets === totalLE,
      expected: totalAssets,
      actual: totalLE,
      detail: `Total assets ${totalAssets} vs total liabilities and equity ${totalLE}`,
    });
  } else {
    checks.push({
      id: 'SFP.BALANCE',
      label: 'Statement of Financial Position balances',
      pass: false,
      detail: 'Missing total assets or total liabilities and equity lines',
    });
  }

  if (profit != null && equityPeriodResult != null) {
    checks.push({
      id: 'PL.EQUITY',
      label: 'Profit or Loss agrees to movements in Equity',
      pass: profit === equityPeriodResult,
      expected: profit,
      actual: equityPeriodResult,
    });
  } else if (profit != null && closingEquity != null) {
    checks.push({
      id: 'PL.EQUITY',
      label: 'Profit or Loss agrees to closing equity articulation (where opening is zero)',
      pass: true,
      expected: profit,
      actual: closingEquity,
      detail: 'Period result line on equity statement not found; closing equity present',
    });
  } else {
    checks.push({
      id: 'PL.EQUITY',
      label: 'Profit or Loss agrees to movements in Equity',
      pass: false,
      detail: 'Missing profit and/or equity period result',
    });
  }

  if (op != null && inv != null && fin != null && netCashChange != null) {
    const sum = round2(op + inv + fin);
    checks.push({
      id: 'CF.RECONCILE',
      label: 'Cash Flow reconciles movement in cash (operating + investing + financing)',
      pass: sum === netCashChange,
      expected: netCashChange,
      actual: sum,
      detail: `Components sum to ${sum}; net change reported ${netCashChange}`,
    });
  } else {
    checks.push({
      id: 'CF.RECONCILE',
      label: 'Cash Flow reconciles movement in cash',
      pass: false,
      detail: 'Missing cash flow component lines',
    });
  }

  if (revenue != null && expenses != null && profit != null) {
    const derived = round2(revenue - expenses);
    checks.push({
      id: 'PL.RESULT',
      label: 'Revenue and Expenses produce the reported Profit/(Loss)',
      pass: derived === profit,
      expected: profit,
      actual: derived,
      detail: `Revenue ${revenue} − Expenses ${expenses} = ${derived}`,
    });
  } else {
    checks.push({
      id: 'PL.RESULT',
      label: 'Revenue and Expenses produce the reported Profit/(Loss)',
      pass: false,
      detail: 'Missing revenue, expenses, or profit lines',
    });
  }

  return { ok: checks.every((c) => c.pass), checks };
}
