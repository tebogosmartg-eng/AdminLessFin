import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { summarisePayroll, summarisePayrollYear, earningKind } from '../../supabase/functions/_shared/efsStatementEngine/payrollFacts';
import { AccountIndex, type FinancialFacts } from '@/lib/financialStatements/disclosures/accountIndex';
import { generateDisclosures, payrollLedgerDifferences, type BuildContext } from '@/lib/financialStatements/disclosures/definitions';
import { PAYROLL_ACCOUNTS, classificationAdvice, suggestAccount } from '@/lib/payrollRulesEngine/payrollAccounts';

const run = (id: string, pay_date: string, extra: Record<string, unknown> = {}) => ({ id, status: 'finalized', pay_date, output_metadata: { processed_at: '2026-01-01T00:00:00Z' }, ...extra });
const employees = [
  { id: 'e1', first_name: 'Thandi', last_name: 'Mokoena', employment_type: 'permanent' },
  { id: 'd1', first_name: 'Pieter', last_name: 'Botha', employment_type: 'director' },
  { id: 'e2', first_name: 'Sipho', last_name: 'Dube', employment_type: 'permanent', end_date: '2025-08-31' },
];
const slip = (employee_id: string, payroll_run_id: string, items: Array<Record<string, unknown>>) => ({ employee_id, payroll_run_id, items: items as never });
const runs = [
  run('r1', '2025-03-25'),
  run('r2', '2025-04-25'),
  run('rx', '2025-05-25', { output_metadata: { processed_at: '2025-05-25T00:00:00Z', reversed_at: '2025-05-26T00:00:00Z' } }),
  run('old', '2024-06-25'),
];
const payslips = [
  slip('e1', 'r1', [
    { type: 'earning', irp5_code: '3601', amount: 20000, description: 'Basic Salary' },
    { type: 'earning', irp5_code: '3607', component_code: 'time_overtime', amount: 1000 },
    { type: 'earning', irp5_code: '3701', component_code: 'travel_allowance', amount: 2000 },
    { type: 'deduction', irp5_code: '4102', amount: 3000 },
    { type: 'employer_contribution', irp5_code: '4141', amount: 177.12, description: 'UIF Employer' },
    { type: 'employer_contribution', irp5_code: '4142', amount: 230, description: 'SDL' },
  ]),
  slip('d1', 'r1', [
    { type: 'earning', irp5_code: '3601', amount: 50000 },
    { type: 'taxable_benefit', irp5_code: '3802', amount: 4000 },
    { type: 'employer_contribution', irp5_code: '4142', amount: 500 },
  ]),
  slip('d1', 'r2', [
    { type: 'earning', irp5_code: '3601', amount: 50000 },
    { type: 'earning', irp5_code: '3605', component_code: 'bonus', amount: 25000 },
    { type: 'employer_contribution', irp5_code: '4142', amount: 750 },
  ]),
  slip('e2', 'r2', [
    { type: 'earning', irp5_code: null, amount: 10000, description: 'Basic Salary' },
    { type: 'earning', irp5_code: '3605', component_code: 'leave_payout', amount: 3000 },
    { type: 'employer_contribution', irp5_code: null, amount: 100, description: 'SDL' },
  ]),
  slip('e1', 'rx', [{ type: 'earning', irp5_code: '3601', amount: 99999 }]),
  slip('e1', 'old', [{ type: 'earning', irp5_code: '3601', amount: 18000 }, { type: 'employer_contribution', irp5_code: '4142', amount: 180 }]),
];

describe('payroll summarised for the financial statements', () => {
  const year = summarisePayrollYear('2025-03-01', '2026-02-28', runs, payslips, employees)!;

  it('only runs in effect within the year (a reversed run and last year are left out)', () => {
    expect(year.runs).toBe(2);
    expect(year.payslips).toBe(4);
  });
  it('earnings by IRP5 code: salaries, overtime, bonuses, leave pay, allowances', () => {
    expect(year.earnings).toEqual({ salaries: 130000, overtime: 1000, bonuses: 25000, leavePay: 3000, commission: 0, allowances: 2000, other: 0 });
    expect(year.grossPay).toBe(161000);
    expect(earningKind({ type: 'earning', irp5_code: '3605', component_code: 'leave_payout', amount: 1 })).toBe('leavePay');
  });
  it('employer contributions (UIF, SDL), and payroll cost = gross + employer', () => {
    expect(year.employer).toEqual({ uif: 177.12, sdl: 1580, other: 0 });
    expect(year.payrollCost).toBe(162757.12);
    expect(year.benefits).toBe(4000);
  });
  it('headcount: average over the months paid, year end excludes leavers', () => {
    expect(year.employees).toEqual({ average: 2, yearEnd: 2, paid: 3 });
  });
  it("each director's emoluments by kind, benefits in kind included", () => {
    expect(year.directors).toEqual([{ employeeId: 'd1', name: 'Pieter Botha', salary: 100000, bonuses: 25000, allowances: 0, benefits: 4000, total: 129000 }]);
  });
  it('both years from the seal period; no runs, no year', () => {
    const both = summarisePayroll({ start_date: '2025-03-01', end_date: '2026-02-28', prior_start_date: '2024-03-01', prior_as_of: '2025-02-28' }, runs, payslips, employees);
    expect(both.current?.grossPay).toBe(161000);
    expect(both.prior?.grossPay).toBe(18000);
    expect(summarisePayrollYear('2030-03-01', '2031-02-28', runs, payslips, employees)).toBeNull();
  });
});

const account = (id: string, name: string, type: string, category: string, subcategory: string | null, activity: number, priorActivity = 0, closing = activity) =>
  ({ id, name, type, category, subcategory, activity, priorActivity, closing });

function facts(accounts: ReturnType<typeof account>[], payroll: FinancialFacts['payroll']): FinancialFacts {
  return {
    period: { start_date: '2025-03-01', end_date: '2026-02-28', prior_as_of: '2025-02-28', prior_start_date: '2024-03-01' },
    balances_as_of: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, category: a.category, subcategory: a.subcategory, balance: a.closing })),
    balances_prior_as_of: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, category: a.category, subcategory: a.subcategory, balance: a.priorActivity || 1 })),
    period_activity: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, category: a.category, subcategory: a.subcategory, period_activity: a.activity })),
    prior_period_activity: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, category: a.category, subcategory: a.subcategory, period_activity: a.priorActivity })),
    payroll,
  };
}
const ctxOf = (f: FinancialFacts): BuildContext => ({ index: new AccountIndex(f), currentLabel: '2026', priorLabel: '2025', withComparatives: true });
const tableOf = (ctx: BuildContext, code: string, table: string) => generateDisclosures(ctx).find((d) => d.code === code)?.tables.find((t) => t.code === table);
const row = (t: { rows: Array<{ key?: string; cells: Array<{ value: unknown }> }> } | undefined, key: string) => t?.rows.find((r) => r.key === key)?.cells.map((c) => c.value);

describe('notes from payroll', () => {
  const payroll = summarisePayroll({ start_date: '2025-03-01', end_date: '2026-02-28', prior_start_date: '2024-03-01', prior_as_of: '2025-02-28' }, runs, payslips, employees);
  const ledger = [
    account('w', 'Salaries and Wages', 'Expense', 'Operating Expenses', 'Employee Costs', 161000, 18000),
    account('u', 'UIF Contribution (Employer)', 'Expense', 'Operating Expenses', 'Employee Costs', 177.12),
    account('s', 'SDL Contribution (Employer)', 'Expense', 'Operating Expenses', 'Employee Costs', 1580, 180),
    account('t', 'Staff Training', 'Expense', 'Operating Expenses', 'Employee Costs', 5000, 2000),
    account('dep', 'Depreciation', 'Expense', 'Operating Expenses', null, 12000, 10000),
    account('aud', 'Audit Fees', 'Expense', 'Operating Expenses', null, 30000, 28000),
    account('p', 'PAYE Payable', 'Liability', 'Current Liabilities', 'Statutory Payables', 0, 0, -3000),
  ];
  const ctx = ctxOf(facts(ledger, payroll));

  it('employee costs by nature from payroll; other employee costs make the total the ledger total', () => {
    const t = tableOf(ctx, 'DISC.EMPLOYEE', 'EMPLOYEE.ANALYSIS');
    expect(row(t, 'emp:Salaries and wages')?.slice(1)).toEqual([131000, 18000]);
    expect(row(t, 'emp:Bonuses')?.slice(1)).toEqual([25000, 0]);
    expect(row(t, 'emp:Leave pay')?.slice(1)).toEqual([3000, 0]);
    expect(row(t, 'emp:Skills development levy')?.slice(1)).toEqual([1580, 180]);
    expect(row(t, 'emp:Other employee costs')?.slice(1)).toEqual([5000, 2000]);
    expect(row(t, 'Total employee costs')?.slice(1)).toEqual([167757.12, 20180]);
    expect(row(t, 'Average number of employees during the year')?.slice(1)).toEqual([2, 1]);
  });
  it("directors' emoluments per director per year, with the non-executive fees row to complete", () => {
    const t = tableOf(ctx, 'DISC.DIRECTORS', 'DIRECTORS.CURRENT');
    expect(t?.columns.map((c) => c.label)).toEqual(['Director', 'Salary', 'Bonuses and performance payments', 'Benefits', 'Total']);
    expect(row(t, 'DIRECTORS.CURRENT:d1')).toEqual(['Pieter Botha', 100000, 25000, 4000, 129000]);
    expect(row(t, 'DIRECTORS.CURRENT:total')?.slice(1)).toEqual([100000, 25000, 4000, 129000]);
    expect(tableOf(ctx, 'DISC.DIRECTORS', 'DIRECTORS.PRIOR')).toBeUndefined();
  });
  it('key management compensation: short-term benefits from payroll', () => {
    const t = tableOf(ctx, 'DISC.RELATED', 'DISC.RELATED.TBL.2');
    expect(row(t, 'Short-term employee benefits')?.slice(1)).toEqual([129000, null]);
    expect(tableOf(ctx, 'DISC.RELATED', 'DISC.RELATED.TBL')?.rows).toHaveLength(5);
  });
  it('operating profit is stated after: employee costs, directors, depreciation, audit fees', () => {
    const t = tableOf(ctx, 'DISC.OPERATINGPROFIT', 'OPERATINGPROFIT.ITEMS');
    expect(row(t, 'op:employee')?.slice(1)).toEqual([167757.12, 20180]);
    expect(row(t, 'op:directors')?.slice(1)).toEqual([129000, null]);
    expect(row(t, 'op:depreciation')?.slice(1)).toEqual([12000, 10000]);
    expect(row(t, 'op:audit')?.slice(1)).toEqual([30000, 28000]);
  });
  it('statutory payables note', () => {
    const t = tableOf(ctx, 'DISC.STATUTORYPAYABLES', 'STATUTORYPAYABLES.ANALYSIS');
    expect(row(t, 'Total statutory payables')?.[1]).toBe(-3000);
  });
  it('wages posted outside employee costs: the note falls back to the ledger, and readiness is told', () => {
    const misposted = [account('w', 'Wages', 'Expense', 'Operating Expenses', null, 161000), account('s', 'SDL', 'Expense', 'Operating Expenses', 'Employee Costs', 1580)];
    const f = facts(misposted, payroll);
    const t = tableOf(ctxOf(f), 'DISC.EMPLOYEE', 'EMPLOYEE.ANALYSIS');
    expect(row(t, 'emp:SDL')?.[1]).toBe(1580);
    expect(row(t, 'emp:Salaries and wages')).toBeUndefined();
    expect(payrollLedgerDifferences(f)).toEqual([
      { year: 'current', payroll: 162757.12, ledger: 1580 },
      { year: 'comparative', payroll: 18180, ledger: 0 },
    ]);
    expect(payrollLedgerDifferences(facts(ledger, payroll))).toEqual([]);
  });
  it('no payroll sealed: the notes are as before (ledger accounts, headcount to complete)', () => {
    const t = tableOf(ctxOf(facts(ledger, null)), 'DISC.EMPLOYEE', 'EMPLOYEE.ANALYSIS');
    expect(row(t, 'emp:Salaries and Wages')?.[1]).toBe(161000);
    expect(row(t, 'Average number of employees during the year')?.slice(1)).toEqual([null, null]);
    expect(generateDisclosures(ctxOf(facts(ledger, null))).some((d) => d.code === 'DISC.DIRECTORS')).toBe(false);
  });
});

describe('payroll accounts', () => {
  it('advises when an account is classified where the statements do not look for it', () => {
    const wages = PAYROLL_ACCOUNTS.find((s) => s.role === 'salary_expense')!;
    expect(classificationAdvice(wages, { id: 'w', name: 'Wages', type: 'Expense', category: 'Operating Expenses', subcategory: null })).toMatch(/Employee Costs/);
    expect(classificationAdvice(wages, { id: 'w', name: 'Wages', type: 'Expense', category: 'Operating Expenses', subcategory: 'Employee Costs' })).toBeNull();
    const paye = PAYROLL_ACCOUNTS.find((s) => s.role === 'paye_control')!;
    expect(classificationAdvice(paye, { id: 'a', name: 'AP', type: 'Liability', category: 'Current Liabilities', subcategory: null })).toMatch(/Statutory Payables/);
  });
  it("suggests the standard chart's accounts (PAYE by tax treatment)", () => {
    const paye = PAYROLL_ACCOUNTS.find((s) => s.role === 'paye_control')!;
    expect(suggestAccount(paye, [{ id: 'x', name: 'Tax owed', type: 'Liability', tax_treatment: 'paye' }, { id: 'y', name: 'PAYE Payable', type: 'Liability' }])).toBe('x');
  });
  it('client and server copies are identical', () => {
    for (const file of ['payrollRulesEngine/payrollAccounts.ts']) {
      const client = readFileSync(`src/lib/${file}`, 'utf8').replace(/\r\n/g, '\n');
      const server = readFileSync(`supabase/functions/_shared/${file}`, 'utf8').replace(/\r\n/g, '\n').replace(/(from '\.{1,2}\/[^']+)\.ts'/g, "$1'");
      expect(server, file).toBe(client);
    }
  });
});
