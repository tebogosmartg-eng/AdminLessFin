/**
 * IRP5 generator — certificates from finalized snapshots only.
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

export type Irp5CodeAmount = { code: string; field: string; amount: number };
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
  codes: Record<string, string>
): Irp5EmployeeCertificate {
  const sample = payslips[0];
  const amounts: Irp5CodeAmount[] = [
    { field: 'income', code: codes.income, amount: resolveGross(payslips) },
    { field: 'travelAllowance', code: codes.travelAllowance, amount: travelAllowance(payslips) },
    { field: 'useOfMotorVehicle', code: codes.useOfMotorVehicle, amount: fringeMotorVehicle(payslips) },
    {
      field: 'medicalSchemeContributions',
      code: codes.medicalSchemeContributions,
      amount: medicalContributions(payslips),
    },
    { field: 'paye', code: codes.paye, amount: resolvePaye(payslips) },
    { field: 'uifEmployee', code: codes.uifEmployee, amount: resolveUifEmployee(payslips) },
    {
      field: 'retirementFundEmployee',
      code: codes.retirementFundEmployee,
      amount: retirementEmployee(payslips),
    },
    {
      field: 'pensionProvidentCurrent',
      code: codes.pensionProvidentCurrent,
      amount: retirementEmployee(payslips),
    },
  ].filter((a) => a.amount !== 0 || a.field === 'income' || a.field === 'paye');

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
    buildCertificate(employeeId, empPayslips, codeCatalogue)
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
