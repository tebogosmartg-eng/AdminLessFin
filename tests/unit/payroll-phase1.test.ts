import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateIrp5, type FinalizedPayrollRunSource, type FinalizedPayslipSource } from '@/lib/statutoryReturns';
import { irp5CodeForEngineLine, irp5CodeForRuleLine } from '@/lib/payrollRulesEngine/irp5Codes';
import { isInvalidSaIdNumber, isValidIncomeTaxNumber, isValidSaIdNumber, payrollRunWarnings } from '@/lib/payrollRulesEngine/runWarnings';
import { birthDateFromSaId } from '@/lib/payrollRulesEngine/periodEmployment';
import { RULE_SET_2026_2027 } from '@/lib/statutoryPayrollEngine/registry';
import { executeStatutoryPipeline } from '@/lib/statutoryPayrollEngine/pipeline';
import { executeStatutoryPipeline as serverPipeline } from '../../supabase/functions/_shared/statutoryPayrollEngine/pipeline';
import { RULE_SET_2026_2027 as SERVER_RULE_SET } from '../../supabase/functions/_shared/statutoryPayrollEngine/registry/taxYears';
import { calculateAnnualTax, resolveRebate } from '@/lib/statutoryPayrollEngine/utils';
import { mapRawPayslipToPayrollFact } from '@/reporting/facts/PayrollFactMapper';
import { factsToStatutoryRunSources } from '@/reporting/facts/adapters';

const rs = RULE_SET_2026_2027;

function slip(id: string, items: FinalizedPayslipSource['payslipItems'], paye: number): FinalizedPayslipSource {
  return {
    payslipId: id,
    employeeId: 'emp-1',
    employeeNumber: 'E001',
    employeeName: 'Thandi Mokoena',
    taxReference: '0001339050',
    idNumber: null,
    grossPay: 0,
    totalDeductions: 0,
    netPay: 0,
    calculationSnapshot: {
      tax_year: '2026-2027',
      engine_results: [{ engine_id: 'paye', employee_amount: paye, employer_amount: 0 }],
    },
    payslipItems: items,
  };
}

function run(payslips: FinalizedPayslipSource[]): FinalizedPayrollRunSource {
  return {
    id: 'run-1', companyId: 'co-1', status: 'finalized',
    payPeriodStart: '2026-04-01', payPeriodEnd: '2026-04-30', payDate: '2026-04-25', taxYear: '2026-2027',
    payslips,
  };
}

type Cert = { amounts: Array<{ code: string; field: string; amount: number; description?: string }> };
const amountsOf = (result: ReturnType<typeof generateIrp5>) =>
  Object.fromEntries((result.declarationData.certificates as Cert[])[0].amounts.map((a) => [a.code, a.amount]));

describe('IRP5 is built from the code on each payslip line', () => {
  it('reports each amount under its stamped code, whatever the line is called', () => {
    const result = generateIrp5({
      country: 'ZA', taxYear: '2026-2027',
      runs: [run([slip('ps-1', [
        { description: 'Basic Salary', type: 'earning', amount: 30_000, irp5Code: '3601' },
        // Renamed lines: the wording would have sent these to the wrong codes.
        { description: 'Fringe travel perk', type: 'earning', amount: 1_000, irp5Code: '3713' },
        { description: 'Car', type: 'taxable_benefit', amount: 2_500, irp5Code: '3802' },
        { description: 'Bonus', type: 'earning', amount: 10_000, irp5Code: '3605' },
        { description: 'Pension', type: 'deduction', amount: 2_250, irp5Code: '4001' },
        { description: 'Medical aid', type: 'deduction', amount: 1_800, irp5Code: '4005' },
        { description: 'PAYE', type: 'deduction', amount: 7_000, irp5Code: '4102' },
        { description: 'UIF', type: 'deduction', amount: 177.12, irp5Code: '4141' },
        { description: 'UIF Employer', type: 'employer_contribution', amount: 177.12, irp5Code: '4141' },
        { description: 'SDL', type: 'employer_contribution', amount: 435, irp5Code: '4142' },
        { description: 'Union fees', type: 'deduction', amount: 120, irp5Code: null },
      ], 7_000)])],
    });
    expect(amountsOf(result)).toEqual({
      '3601': 30_000, '3605': 10_000, '3713': 1_000, '3802': 2_500,
      '4001': 2_250, '4005': 1_800, '4102': 7_000, '4141': 354.24, '4142': 435,
    });
    expect(result.validationResult.issues.map((i) => i.code)).not.toContain('IRP5_AMOUNTS_INFERRED');
    const paye = (result.declarationData.certificates as Cert[])[0].amounts.find((a) => a.code === '4102');
    expect(paye).toMatchObject({ field: 'paye', description: 'PAYE' });
  });

  it('adds up a tax year of payslips per code', () => {
    const month = (id: string) => slip(id, [
      { description: 'Basic Salary', type: 'earning', amount: 20_000, irp5Code: '3601' },
      { description: 'PAYE', type: 'deduction', amount: 2_000, irp5Code: '4102' },
    ], 2_000);
    const result = generateIrp5({ country: 'ZA', taxYear: '2026-2027', runs: [run([month('a'), month('b'), month('c')])] });
    expect(amountsOf(result)).toMatchObject({ '3601': 60_000, '4102': 6_000 });
  });

  it('refuses a certificate whose PAYE lines disagree with the calculated PAYE', () => {
    const result = generateIrp5({
      country: 'ZA', taxYear: '2026-2027',
      runs: [run([slip('ps-1', [
        { description: 'Basic Salary', type: 'earning', amount: 30_000, irp5Code: '3601' },
        { description: 'PAYE', type: 'deduction', amount: 6_000, irp5Code: '4102' },
      ], 7_000)])],
    });
    expect(result.validationResult.ok).toBe(false);
    expect(result.validationResult.issues.map((i) => i.code)).toContain('IRP5_PAYE_MISMATCH');
  });

  it('works out older payslips without codes, warns, and reports retirement once', () => {
    const legacy = slip('old', [
      { description: 'Basic Salary', type: 'earning', amount: 25_000 },
      { description: 'Pension Fund', type: 'deduction', amount: 1_000 },
      { description: 'PAYE', type: 'deduction', amount: 3_000 },
    ], 3_000);
    legacy.calculationSnapshot = { ...legacy.calculationSnapshot, gross_earnings: 25_000 };
    const result = generateIrp5({ country: 'ZA', taxYear: '2026-2027', runs: [run([legacy])] });
    const amounts = amountsOf(result);
    expect(amounts['3601']).toBe(25_000);
    expect(amounts['4001']).toBe(1_000);
    expect(amounts['4006']).toBeUndefined(); // previously the same R1 000 also appeared here
    expect(result.validationResult.issues.map((i) => i.code)).toContain('IRP5_AMOUNTS_INFERRED');
  });

  it('carries the stamped codes from the finalised payslip through the payroll facts', () => {
    const fact = mapRawPayslipToPayrollFact({
      companyId: 'co-1', payrollRunId: 'run-1', payDate: '2026-04-25', runStatus: 'finalized', payslipId: 'ps-1',
      employeeId: 'emp-1', employees: { first_name: 'Thandi', last_name: 'Mokoena', tax_number: '0001339050' },
      total_earnings: 30_000, total_deductions: 5_000, net_pay: 25_000,
      calculation_snapshot: { tax_year: '2026-2027', engine_results: [{ engine_id: 'paye', employee_amount: 5_000 }] },
      payslip_items: [
        { description: 'Car allowance', type: 'earning', amount: 30_000, irp5_code: '3701' },
        { description: 'PAYE', type: 'deduction', amount: 5_000, irp5_code: '4102' },
      ],
    });
    const [source] = factsToStatutoryRunSources([fact]);
    expect(source.payslips[0].payslipItems.map((i) => i.irp5Code)).toEqual(['3701', '4102']);
    const result = generateIrp5({ country: 'ZA', taxYear: '2026-2027', runs: [source] });
    expect(amountsOf(result)['3701']).toBe(30_000);
  });
});

describe('IRP5 codes stamped at generation', () => {
  it('codes the rule and statutory lines', () => {
    expect(irp5CodeForRuleLine('basic_salary')).toBe('3601');
    // 3615 was retired after 2018: directors' pay is reported under 3601 (BRS V25.3.0).
    expect(irp5CodeForRuleLine('basic_salary', { isDirector: true })).toBe('3601');
    expect(irp5CodeForRuleLine('pension')).toBe('4001');
    expect(irp5CodeForRuleLine('provident_fund')).toBe('4003');
    expect(irp5CodeForRuleLine('medical_aid')).toBe('4005');
    expect(irp5CodeForRuleLine('union_fees')).toBeNull();
    expect(irp5CodeForRuleLine('garnishee')).toBeNull();
    for (const id of ['paye', 'bonus_tax', 'termination_tax', 'directors_paye']) expect(irp5CodeForEngineLine(id)).toBe('4102');
    expect(irp5CodeForEngineLine('uif')).toBe('4141');
    expect(irp5CodeForEngineLine('uif_employer')).toBe('4141');
    expect(irp5CodeForEngineLine('sdl')).toBe('4142');
  });

  it('keeps the client and server copies identical', () => {
    for (const file of ['irp5Codes.ts', 'runWarnings.ts']) {
      const client = readFileSync(`src/lib/payrollRulesEngine/${file}`, 'utf8').replace(/\r\n/g, '\n');
      // The server copy differs only in the '.ts' extension Deno needs on relative imports.
      const server = readFileSync(`supabase/functions/_shared/payrollRulesEngine/${file}`, 'utf8').replace(/\r\n/g, '\n')
        .replace(/(from '\.{1,2}\/[^']+)\.ts'/g, "$1'");
      expect(server, file).toBe(client);
    }
  });
});

describe('pension and provident fund contributions', () => {
  const run = (pipeline: typeof executeStatutoryPipeline, ruleSet: typeof rs) => pipeline({
    employee: { id: 'p', age: 40 },
    period: { payPeriodStart: '2026-04-01', payPeriodEnd: '2026-04-30', payDate: '2026-04-25' },
    grossEarnings: 30_000,
    taxableEarnings: 30_000,
    enabledEngines: { paye: true, retirement_deduction: true },
    engineConfig: {},
    components: { retirementContributions: 2_250 },
    ruleSet,
  });

  it('reduce taxable income without a second deduction line (both copies)', () => {
    for (const [pipeline, ruleSet] of [[executeStatutoryPipeline, rs], [serverPipeline, SERVER_RULE_SET]] as const) {
      const result = run(pipeline, ruleSet);
      expect(result.payslipLines.find((l) => l.engineId === 'retirement_deduction')).toBeUndefined();
      const rebate = resolveRebate(rs.rebates, 40, { secondaryAge: rs.rebateSecondaryAge, tertiaryAge: rs.rebateTertiaryAge });
      const sars = Math.round(((calculateAnnualTax(27_750 * 12, rs.brackets) - rebate) / 12) * 100) / 100;
      expect(result.engineResults.find((e) => e.engineId === 'paye')!.employeeAmount).toBeCloseTo(sars, 1);
    }
  });
});

describe('run warnings', () => {
  const complete = {
    tax_number: '0001339050', id_number: '8601015800086', bank_account_number: '62000000004', bank_account_type: 'current',
    residential_street_name: 'Main Road', residential_city: 'Cape Town', residential_postal_code: '8001',
  };
  const employees = [
    { id: 'paid', first_name: 'Paid', last_name: 'Person', salary_amount: 20_000, salary_period: 'monthly', ...complete },
    { id: 'nosalary', first_name: 'No', last_name: 'Salary', salary_amount: null, salary_period: 'monthly', ...complete },
    { id: 'weekly', first_name: 'Weekly', last_name: 'Worker', salary_amount: 5_000, salary_period: 'weekly', ...complete },
    { id: 'sparse', first_name: 'Sparse', last_name: 'Record', salary_amount: 10_000, salary_period: 'monthly', bank_account_number: '1', tax_number: '123' },
  ];

  it('names who was not paid, ignored run inputs, and missing SARS details', () => {
    const warnings = payrollRunWarnings({
      candidates: employees.filter((e) => e.salary_period === 'monthly'),
      paidEmployeeIds: new Set(['paid', 'sparse']),
      allEmployees: employees,
      periodInputs: [
        { employee_id: 'weekly', component_code: 'bonus' },
        { employee_id: 'nosalary', component_code: 'travel_allowance' },
        { employee_id: 'paid', component_code: 'bonus' },
      ],
      payFrequency: 'monthly',
    });
    const codes = warnings.map((w) => `${w.employee_id}:${w.code}`);
    expect(codes).toEqual(expect.arrayContaining([
      'nosalary:NO_SALARY',
      'weekly:INPUTS_NOT_APPLIED',
      'nosalary:INPUTS_NOT_APPLIED',
      'sparse:INVALID_TAX_NUMBER',
      'sparse:MISSING_IDENTITY',
      'sparse:MISSING_RESIDENTIAL_ADDRESS',
      'sparse:MISSING_BANK_ACCOUNT_TYPE',
    ]));
    expect(codes.filter((c) => c.startsWith('paid:'))).toEqual([]);
    expect(warnings.find((w) => w.employee_id === 'weekly')!.message).toContain('paid weekly');
  });

  it('clears a SARS warning once the employee record is fixed, and asks for a regenerate when needed', () => {
    const sparse = employees.find((e) => e.id === 'sparse')!;
    const fixed = { ...sparse, ...complete };
    const run = (list: typeof employees) => payrollRunWarnings({
      candidates: list.filter((e) => e.salary_period === 'monthly'),
      paidEmployeeIds: new Set(['paid', 'sparse']),
      allEmployees: list,
      periodInputs: [],
      payFrequency: 'monthly',
    });
    expect(run(employees).some((w) => w.employee_id === 'sparse')).toBe(true);
    const after = run(employees.map((e) => (e.id === 'sparse' ? fixed : e)));
    expect(after.some((w) => w.employee_id === 'sparse')).toBe(false);
    // A salary added after generation: no longer "no salary", but not on the run until regenerated.
    const salaried = run(employees.map((e) => (e.id === 'nosalary' ? { ...e, salary_amount: 15_000 } : e)));
    expect(salaried.find((w) => w.employee_id === 'nosalary')?.code).toBe('NOT_ON_RUN');
  });

  it('flags an SA ID number with a wrong check digit, as the employee form does', () => {
    expect(isValidSaIdNumber('8601015800086')).toBe(true);
    expect(isInvalidSaIdNumber('8601015800083')).toBe(true); // wrong check digit
    expect(isInvalidSaIdNumber('8613015800085')).toBe(true); // month 13
    expect(isInvalidSaIdNumber('FN1234567')).toBe(false); // passport: not checked
    // Same verdict as the form's validator for a spread of numbers.
    for (const id of ['8601015800086', '8601015800083', '9001015800080', '6201155800081', '7502290000084', '0002290000087']) {
      expect(isValidSaIdNumber(id), id).toBe(!!birthDateFromSaId(id, '2026-10-09'));
    }
    const warnings = payrollRunWarnings({
      candidates: [{ ...employees[0], id: 'badid', id_number: '8601015800083' }],
      paidEmployeeIds: new Set(['badid']), allEmployees: [], periodInputs: [], payFrequency: 'monthly',
    });
    expect(warnings.map((w) => w.code)).toEqual(['INVALID_ID_NUMBER']);
  });

  it('checks an income tax number with the SARS modulus 10 rule (BRS 8.1)', () => {
    expect(isValidIncomeTaxNumber('0001339050')).toBe(true); // BRS example 1
    expect(isValidIncomeTaxNumber('0667056642')).toBe(true); // BRS example 2
    expect(isValidIncomeTaxNumber('0667056643')).toBe(false); // wrong check digit
    expect(isValidIncomeTaxNumber('0123456789')).toBe(false);
    expect(isValidIncomeTaxNumber('4001339050')).toBe(false); // must start with 0, 1, 2, 3 or 9
    expect(isValidIncomeTaxNumber('000133905')).toBe(false);
  });
});
