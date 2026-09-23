/**
 * The same figure, under the name each side happens to use.
 *
 * The statement engine names its lines from the chart of accounts
 * ("sfp.inventory", "perf.revenue"). The framework content library, written
 * separately, asks for the names the standards use ("sfp.inventories",
 * "perf.total_revenue"). Neither is wrong, but they drifted, and the cost of the
 * drift is invisible: a note table quietly reports "[ — ]" and the readiness
 * check calls it a figure only a person can supply — for a number that is
 * sitting in the ledger.
 *
 * One list, consulted by both the table population and the disclosure condition
 * inference, so a rename on either side has one place to be reconciled.
 */

/** Framework name → the engine's name for the same figure. */
const ALIASES: Record<string, string[]> = {
  'sfp.inventories': ['sfp.inventory'],
  'sfp.inventory': ['sfp.inventories'],
  'sfp.trade_receivables': ['sfp.receivables'],
  'sfp.trade_payables': ['sfp.payables'],
  'sfp.share_capital': ['sfp.issued_capital'],
  'sfp.equity_share_capital': ['sfp.issued_capital'],
  'sfp.retained_earnings': ['sfp.equity.retained_earnings'],
  'sfp.reserves': ['sfp.equity.reserves'],
  'sfp.equity_total': ['sfp.total_equity', 'sfp.equity'],
  'sfp.intangible': ['sfp.intangibles'],
  'sfp.loans': ['sfp.borrowings'],
  'sfp.invprop': ['sfp.investment_property'],
  'perf.total_revenue': ['perf.revenue'],
  'perf.revenue': ['perf.total_revenue'],
  'perf.nonexchange_revenue': ['perf.revenue'],
  'perf.finance_costs': ['perf.other_expenses'],
  'perf.net_result': ['perf.profit_for_period', 'perf.result'],
};

/**
 * Every name worth trying for this line code, the asked-for one first.
 * A prior-period code ("sfp.ppe.prior") resolves through its base code.
 */
export function lineCodeCandidates(code: string): string[] {
  const seen = new Set<string>([code]);
  const out = [code];

  const push = (candidate: string) => {
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  };

  for (const alias of ALIASES[code] || []) push(alias);

  const priorMatch = /^(.*)\.prior$/.exec(code);
  if (priorMatch) {
    for (const alias of ALIASES[priorMatch[1]] || []) push(`${alias}.prior`);
  }

  return out;
}

/** Read a figure under any of the names it may be filed as. */
export function resolveFact(
  facts: { has(code: string): boolean; get(code: string): number | undefined },
  code: string,
): { found: boolean; amount: number; matchedCode?: string } {
  for (const candidate of lineCodeCandidates(code)) {
    if (facts.has(candidate)) {
      return { found: true, amount: Number(facts.get(candidate)) || 0, matchedCode: candidate };
    }
  }
  return { found: false, amount: 0 };
}
