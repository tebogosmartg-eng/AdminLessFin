/**
 * IRP5 generator — certificates from finalized snapshots only.
 *
 * Amounts come from the IRP5 code stamped on each payslip line when the payslip was
 * generated. Payslips generated before codes were stamped fall back to the engine
 * results and line wording, and the return carries a warning saying so.
 */

import { resolveLegislation } from '../../../../registry/resolveLegislation';
import { unwrap } from '../../../../registry/types';
import {
  allPayslips,
  buildValidationResult,
  mergeIssues,
  newReturnId,
  resolveGross,
  resolvePaye,
  resolveUifEmployee,
  roundMoney,
  sumEngineAmount,
  sumItemKeywords,
  taxYearFromRuns,
  validateGenerateInput,
  validateSourcePayrollIntegrity,
} from '../../../../returns/snapshot';
import type {
  FinalizedPayslipSource,
  GenerateReturnInput,
  StatutoryReturn,
} from '../../../../../lib/statutoryReturns/types';
import { IRP5_MAPPINGS } from './mappings';
import { IRP5_CODE_LABELS } from '../../../../../lib/payrollRulesEngine/irp5Codes';
import type { StatutoryValidationIssue } from '../../../../../lib/statutoryReturns/types';

export type Irp5CodeAmount = { code: string; field: string; amount: number; description?: string };
export type Irp5EmployeeCertificate = {
  employeeId: string;
  employeeNumber: string | null;
  employeeName: string;
  taxReference: string | null;
  idNumber: string | null;
  amounts: Irp5CodeAmount[];
  sourcePayslipIds: string[];
};
export type Irp5DeclarationData = {
  returnType: 'IRP5' | 'TAX_CERTIFICATE';
  country: 'ZA';
  taxYear: string;
  certificates: Irp5EmployeeCertificate[];
  codeCatalogue: Record<string, string>;
  sourceRunIds: string[];
  legislationRuleVersion: string | null;
  mappingsId: string;
};

/** True when the payslip's lines carry IRP5 codes (generated after codes were stamped). */
function hasIrp5Codes(payslip: FinalizedPayslipSource): boolean {
  return payslip.payslipItems.some((item) => !!item.irp5Code);
}

function addAmount(totals: Map<string, number>, code: string | undefined, amount: number) {
  if (!code || !amount) return;
  totals.set(code, roundMoney((totals.get(code) ?? 0) + amount));
}

/** Totals per IRP5 code from the codes on the payslip lines. */
function codedTotals(payslips: FinalizedPayslipSource[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const p of payslips) {
    for (const item of p.payslipItems) {
      if (item.irp5Code) addAmount(totals, item.irp5Code, Number(item.amount) || 0);
    }
  }
  return totals;
}

/** Older payslips without codes: engine results first, then line wording. */
function inferredTotals(payslips: FinalizedPayslipSource[], codes: Record<string, string>): Map<string, number> {
  const totals = new Map<string, number>();
  if (!payslips.length) return totals;
  addAmount(totals, codes.income, resolveGross(payslips));
  addAmount(totals, codes.travelAllowance, travelAllowance(payslips));
  addAmount(totals, codes.useOfMotorVehicle, fringeMotorVehicle(payslips));
  addAmount(totals, codes.medicalSchemeContributions, medicalContributions(payslips));
  addAmount(totals, codes.paye, resolvePaye(payslips));
  addAmount(totals, codes.uifEmployee, resolveUifEmployee(payslips));
  // One retirement code only: the same contribution used to be reported under two codes.
  addAmount(totals, codes.pensionProvidentCurrent, retirementEmployee(payslips));
  return totals;
}

function retirementEmployee(payslips: FinalizedPayslipSource[]): number {
  const fromEngine = sumEngineAmount(payslips, ['retirement'], 'employee');
  if (fromEngine > 0) return fromEngine;
  return sumItemKeywords(payslips, ['retirement', 'pension', 'provident'], 'deduction');
}

function medicalContributions(payslips: FinalizedPayslipSource[]): number {
  return sumItemKeywords(payslips, ['medical'], undefined);
}

function travelAllowance(payslips: FinalizedPayslipSource[]): number {
  const fromEngine = sumEngineAmount(payslips, ['travel_allowance'], 'employee');
  if (fromEngine > 0) return fromEngine;
  return sumItemKeywords(payslips, ['travel'], 'earning');
}

function fringeMotorVehicle(payslips: FinalizedPayslipSource[]): number {
  const fromEngine = sumEngineAmount(payslips, ['fringe_benefit'], 'employee');
  if (fromEngine > 0) return fromEngine;
  return sumItemKeywords(payslips, ['motor vehicle', 'company car', 'fringe'], 'earning');
}

function buildCertificate(
  employeeId: string,
  payslips: FinalizedPayslipSource[],
  codes: Record<string, string>,
  issues: StatutoryValidationIssue[]
): Irp5EmployeeCertificate {
  const sample = payslips[0];
  const coded = payslips.filter(hasIrp5Codes);
  const legacy = payslips.filter((p) => !hasIrp5Codes(p));
  const employeeName = sample?.employeeName ?? employeeId;

  const totals = codedTotals(coded);
  for (const [code, amount] of inferredTotals(legacy, codes)) addAmount(totals, code, amount);

  if (legacy.length) {
    issues.push({
      code: 'IRP5_AMOUNTS_INFERRED',
      severity: 'warning',
      message: `${employeeName}: ${legacy.length} payslip(s) were generated before IRP5 codes were recorded on payslip lines; their amounts were worked out from the calculation and line descriptions. Review them before submitting.`,
    });
  }

  // PAYE on the coded lines must agree with the PAYE the engines calculated.
  if (coded.length) {
    const fromLines = codedTotals(coded).get(codes.paye) ?? 0;
    const fromEngines = resolvePaye(coded);
    if (Math.abs(fromLines - fromEngines) > 0.01) {
      issues.push({
        code: 'IRP5_PAYE_MISMATCH',
        severity: 'error',
        message: `${employeeName}: PAYE on the payslip lines (${fromLines}) does not match the calculated PAYE (${fromEngines}).`,
      });
    }
  }

  // Income and PAYE are always shown, even when nil.
  if (!totals.has(codes.income)) totals.set(codes.income, 0);
  if (!totals.has(codes.paye)) totals.set(codes.paye, 0);

  const fieldByCode = new Map<string, string>();
  for (const [field, code] of Object.entries(codes)) if (!fieldByCode.has(code)) fieldByCode.set(code, field);
  const amounts: Irp5CodeAmount[] = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, amount]) => ({
      code,
      field: fieldByCode.get(code) ?? `code${code}`,
      amount,
      description: IRP5_CODE_LABELS[code],
    }));

  return {
    employeeId,
    employeeNumber: sample?.employeeNumber ?? null,
    employeeName: sample?.employeeName ?? employeeId,
    taxReference: sample?.taxReference ?? null,
    idNumber: sample?.idNumber ?? null,
    amounts,
    sourcePayslipIds: payslips.map((p) => p.payslipId),
  };
}

export function generateIrp5(input: GenerateReturnInput): StatutoryReturn {
  const issues = mergeIssues(
    validateGenerateInput(input),
    validateSourcePayrollIntegrity(input.runs)
  );

  const taxYear = taxYearFromRuns(input.runs, input.taxYear);
  let codeCatalogue: Record<string, string> = { ...IRP5_MAPPINGS.defaultCodes };
  let legislationRuleVersion: string | null = null;

  try {
    const payDate = input.runs[0]?.payDate;
    const pkg = resolveLegislation(
      payDate
        ? { countryCode: 'ZA', payDate }
        : { countryCode: 'ZA', taxYear: input.taxYear }
    );
    codeCatalogue = {
      income: unwrap(pkg.irp5.income),
      annualPayment: unwrap(pkg.irp5.annualPayment),
      travelAllowance: unwrap(pkg.irp5.travelAllowance),
      useOfMotorVehicle: unwrap(pkg.irp5.useOfMotorVehicle),
      medicalSchemeContributions: unwrap(pkg.irp5.medicalSchemeContributions),
      paye: unwrap(pkg.irp5.paye),
      uifEmployee: unwrap(pkg.irp5.uifEmployee),
      retirementFundEmployee: unwrap(pkg.irp5.retirementFundEmployee),
      pensionProvidentCurrent: unwrap(pkg.irp5.pensionProvidentCurrent),
    };
    legislationRuleVersion = pkg.metadata.ruleVersion;
  } catch (err) {
    issues.push({
      code: 'IRP5_CODE_RESOLVE_FAILED',
      severity: 'warning',
      message: err instanceof Error ? err.message : 'Could not resolve IRP5 codes from legislation; using package defaults.',
    });
  }

  const payslips = allPayslips(input.runs).filter((p) =>
    input.employeeId ? p.employeeId === input.employeeId : true
  );

  if (input.employeeId && !payslips.length) {
    issues.push({
      code: 'IRP5_EMPLOYEE_NOT_FOUND',
      severity: 'error',
      message: `No finalized payslips found for employee ${input.employeeId}.`,
      field: 'employeeId',
    });
  }

  const byEmployee = new Map<string, FinalizedPayslipSource[]>();
  for (const p of payslips) {
    const list = byEmployee.get(p.employeeId) ?? [];
    list.push(p);
    byEmployee.set(p.employeeId, list);
  }

  const certificates = Array.from(byEmployee.entries()).map(([employeeId, empPayslips]) =>
    buildCertificate(employeeId, empPayslips, codeCatalogue, issues)
  );

  const validationResult = buildValidationResult(issues);
  const sourcePayrollRuns = input.runs.map((r) => r.id);

  const declarationData: Irp5DeclarationData = {
    returnType: 'IRP5',
    country: 'ZA',
    taxYear,
    certificates,
    codeCatalogue,
    sourceRunIds: sourcePayrollRuns,
    legislationRuleVersion,
    mappingsId: IRP5_MAPPINGS.id,
  };

  return {
    id: newReturnId('IRP5'),
    country: 'ZA',
    returnType: 'IRP5',
    taxYear,
    payrollRunId: sourcePayrollRuns.length === 1 ? sourcePayrollRuns[0] : null,
    status: validationResult.ok ? 'validated' : 'draft',
    generatedAt: new Date().toISOString(),
    generatedBy: input.generatedBy ?? null,
    sourcePayrollRuns,
    validationResult,
    declarationData: declarationData as unknown as Record<string, unknown>,
    submissionReference: null,
    submittedAt: null,
    contentHash: null,
    immutable: false,
  };
}
