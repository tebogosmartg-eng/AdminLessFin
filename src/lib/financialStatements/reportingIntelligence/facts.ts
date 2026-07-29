/**
 * V17.0 — Fact extraction utilities for reporting intelligence.
 */
import type { DocumentModel } from '../document/documentModel';

export type StatementFacts = {
  lookup: Map<string, number>;
  totalAssets: number;
  totalRevenue: number;
  totalLiabilities: number;
  netProfit: number;
  priorRevenue: number;
  ppeBalance: number;
  inventoryBalance: number;
  receivablesBalance: number;
  borrowingsBalance: number;
  cashBalance: number;
  taxExpense: number;
  leaseBalance: number;
  investmentBalance: number;
  ppeCategories: number;
};

function lineAmount(lookup: Map<string, number>, codes: string[]): number {
  let total = 0;
  for (const [key, amount] of lookup) {
    if (Math.abs(amount) <= 0) continue;
    for (const code of codes) {
      if (key === code || key.startsWith(`${code}.`)) {
        total += Math.abs(amount);
        break;
      }
    }
  }
  return total;
}

function countCategories(lookup: Map<string, number>, prefix: string): number {
  let count = 0;
  for (const [key, amount] of lookup) {
    if (key.startsWith(`${prefix}.`) && Math.abs(amount) > 0) count += 1;
  }
  return count;
}

export function extractStatementFacts(model: DocumentModel): StatementFacts {
  const lookup = new Map<string, number>();
  for (const stmt of model.statements || []) {
    for (const line of stmt.lines || []) {
      if (line?.line_code) {
        lookup.set(String(line.line_code), Number(line.amount) || 0);
      }
    }
  }

  const totalAssets = Math.abs(lookup.get('sfp.total_assets') || 0);
  const totalRevenue = Math.abs(lookup.get('perf.total_revenue') || lookup.get('perf.revenue') || 0);
  const totalLiabilities =
    Math.abs(lookup.get('sfp.total_liabilities') || 0) ||
    Math.abs(lookup.get('sfp.payables') || 0) + Math.abs(lookup.get('sfp.borrowings') || 0);
  const netProfit =
    lookup.get('perf.profit_for_period') ??
    lookup.get('eq.period_result') ??
    (totalRevenue - Math.abs(lookup.get('perf.total_expenses') || 0));
  const priorRevenue = Math.abs(lookup.get('perf.prior_revenue') || 0);

  return {
    lookup,
    totalAssets,
    totalRevenue,
    totalLiabilities,
    netProfit: Number(netProfit) || 0,
    priorRevenue,
    ppeBalance: lineAmount(lookup, ['sfp.ppe']),
    inventoryBalance: lineAmount(lookup, ['sfp.inventories', 'sfp.inventory']),
    receivablesBalance: lineAmount(lookup, ['sfp.receivables', 'sfp.trade_receivables']),
    borrowingsBalance: lineAmount(lookup, ['sfp.borrowings', 'sfp.loans']),
    cashBalance: lineAmount(lookup, ['sfp.cash']),
    taxExpense: lineAmount(lookup, ['perf.tax_expense', 'perf.tax']),
    leaseBalance: lineAmount(lookup, ['sfp.lease_liability', 'sfp.rou_asset', 'sfp.leases']),
    investmentBalance: lineAmount(lookup, [
      'sfp.investments',
      'sfp.investments_subsidiaries',
      'sfp.associates',
    ]),
    ppeCategories: Math.max(1, countCategories(lookup, 'sfp.ppe')),
  };
}

export function hasNonZeroBalance(facts: StatementFacts, codes: string[]): boolean {
  for (const code of codes) {
    const amount = facts.lookup.get(code);
    if (amount != null && Math.abs(amount) > 0) return true;
    for (const [key, val] of facts.lookup) {
      if (key.startsWith(`${code}.`) && Math.abs(val) > 0) return true;
    }
  }
  return false;
}
