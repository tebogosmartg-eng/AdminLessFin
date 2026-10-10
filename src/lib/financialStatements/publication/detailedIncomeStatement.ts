/**
 * The Detailed Income Statement — the supplementary schedule a South African
 * set of annual financial statements closes with.
 *
 * Built from the sealed fact snapshot's account-level movements: every income
 * and expense account, both years where the seal carries the comparative
 * year, expenses in brackets, and the same ladder the statement of
 * comprehensive income states — gross profit, operating profit, finance costs,
 * profit before taxation, taxation, profit for the year. It is supplementary
 * information: it prints behind its own disclaimer and is never part of the
 * annual financial statements. Employee costs are one line; their note analyses them.
 *
 * The page band names the years, so the schedule carries no year row of its
 * own; its first row is an empty column header that the renderer recognises.
 */
import { AccountIndex, type FinancialFacts } from '../disclosures/accountIndex';
import { formatStatementFigure, type ReportingYears } from './statementPresentation';

export type SupplementarySchedule = {
  id: string;
  title: string;
  rows: string[][];
  /** Row kinds, index for index with `rows` (row 0 is the column header). */
  kinds: string[];
};

const fmt = (value: number | null, negate = false): string =>
  value == null ? '' : formatStatementFigure(value, 'item', { negate });

export function buildDetailedIncomeStatement(
  facts: FinancialFacts | null | undefined,
  _years: ReportingYears,
): SupplementarySchedule | null {
  if (!facts) return null;
  const index = new AccountIndex(facts);
  // Only accounts that carry a figure in either year: a schedule of dashes
  // says nothing a reader needs.
  const flows = index.rows.filter(
    (r) => (r.type === 'Income' || r.type === 'Expense') && (r.activity !== 0 || r.priorActivity !== 0),
  );
  if (!flows.length) return null;
  const priorKnown = index.hasPriorFlows;

  type Row = (typeof flows)[number];
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const cat = (r: Row) => String(r.category || '');
  const income = flows.filter((r) => r.type === 'Income');
  const revenue = income.filter((r) => cat(r) !== 'Other Income').sort(byName);
  const otherIncome = income.filter((r) => cat(r) === 'Other Income').sort(byName);
  const expenses = flows.filter((r) => r.type === 'Expense');
  const costOfSales = expenses.filter((r) => cat(r) === 'Cost of Sales').sort(byName);
  const finance = expenses.filter((r) => cat(r) === 'Finance Costs').sort(byName);
  const taxation = expenses.filter((r) => cat(r) === 'Taxation').sort(byName);
  const operatingAccounts = expenses.filter((r) => !['Cost of Sales', 'Finance Costs', 'Taxation'].includes(cat(r)));
  // Employee costs read as one line, as a published schedule states them; the
  // employee costs note analyses them.
  const employee = operatingAccounts.filter((r) => String(r.subcategory || '') === 'Employee Costs');
  const employeeLine: Row[] = employee.length
    ? [{
        ...employee[0],
        id: 'employee-costs',
        name: 'Employee costs',
        activity: employee.reduce((s, r) => s + r.activity, 0),
        priorActivity: employee.reduce((s, r) => s + r.priorActivity, 0),
      }]
    : [];
  const operating = [...operatingAccounts.filter((r) => !employee.includes(r)), ...employeeLine].sort(byName);

  const sum = (rows: Row[], of: (r: Row) => number) => rows.reduce((acc, r) => acc + of(r), 0);
  const cur = (r: Row) => r.activity;
  const pri = (r: Row) => r.priorActivity;
  const both = (rows: Row[]) => [sum(rows, cur), sum(rows, pri)] as const;

  const rows: string[][] = [['', '', '']];
  const kinds: string[] = ['columns'];
  const add = (row: string[], kind: string) => {
    rows.push(row);
    kinds.push(kind);
  };
  const figures = (current: number, prior: number, negate = false) => [
    fmt(current, negate),
    priorKnown ? fmt(prior, negate) : '',
  ];
  const section = (caption: string, list: Row[], negate: boolean, subtotalLabel?: string) => {
    if (!list.length) return;
    add([caption, '', ''], 'header');
    for (const r of list) add([r.name, ...figures(cur(r), pri(r), negate)], 'data');
    if (list.length > 1 || subtotalLabel) {
      const [c, p] = both(list);
      add([subtotalLabel ?? '', ...figures(c, p, negate)], 'subtotal');
    }
  };

  section('Revenue', revenue, false);
  section('Cost of sales', costOfSales, true);
  const [revNow, revThen] = both(revenue);
  const [cosNow, cosThen] = both(costOfSales);
  if (costOfSales.length) {
    add(['Gross profit', ...figures(revNow - cosNow, revThen - cosThen)], 'subtotal');
  }
  section('Other income', otherIncome, false);
  section('Operating expenses', operating, true, 'Total operating expenses');

  const [oiNow, oiThen] = both(otherIncome);
  const [opNow, opThen] = both(operating);
  const operatingNow = revNow - cosNow + oiNow - opNow;
  const operatingThen = revThen - cosThen + oiThen - opThen;
  const [finNow, finThen] = both(finance);
  const [taxNow, taxThen] = both(taxation);

  if (finance.length || taxation.length) {
    add(['Operating profit / (loss)', ...figures(operatingNow, operatingThen)], 'subtotal');
  }
  for (const r of finance) add([r.name, ...figures(cur(r), pri(r), true)], 'data');
  if (taxation.length) {
    add(['Profit / (loss) before taxation', ...figures(operatingNow - finNow, operatingThen - finThen)], 'subtotal');
    for (const r of taxation) add([r.name, ...figures(cur(r), pri(r), true)], 'data');
  }
  add(
    [
      'Profit / (loss) for the year',
      ...figures(operatingNow - finNow - taxNow, operatingThen - finThen - taxThen),
    ],
    'total',
  );

  return { id: 'supp:detailed-income-statement', title: 'Detailed Income Statement', rows, kinds };
}
