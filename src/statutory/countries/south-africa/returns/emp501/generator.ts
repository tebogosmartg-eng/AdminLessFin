/**
 * EMP501 generator — annual reconciliation from finalized payroll only.
 */

import {
  allPayslips,
  buildValidationResult,
  mergeIssues,
  newReturnId,
  resolveGross,
  resolvePaye,
  resolveSdl,
  resolveUifEmployee,
  resolveUifEmployer,
  taxYearFromRuns,
  validateGenerateInput,
  validateSourcePayrollIntegrity,
} from '../../../../returns/snapshot';
import type { GenerateReturnInput, StatutoryReturn } from '../../../../../lib/statutoryReturns/types';
import { EMP501_MAPPINGS } from './mappings';

export type Emp501DeclarationData = {
  returnType: 'EMP501';
  country: 'ZA';
  taxYear: string;
  reconciliation: {
    payeDeclared: number;
    uifEmployeeDeclared: number;
    uifEmployerDeclared: number;
    uifTotalDeclared: number;
    sdlDeclared: number;
    grossRemuneration: number;
    employeeCount: number;
    finalizedRunCount: number;
  };
  monthlyBreakdown: Array<{
    periodLabel: string;
    payDate: string;
    payrollRunId: string;
    paye: number;
    uifTotal: number;
    sdl: number;
    gross: number;
  }>;
  sourceRunIds: string[];
  mappingsId: string;
};

export function generateEmp501(input: GenerateReturnInput): StatutoryReturn {
  const issues = mergeIssues(
    validateGenerateInput(input),
    validateSourcePayrollIntegrity(input.runs)
  );

  const taxYear = taxYearFromRuns(input.runs, input.taxYear);
  const payslips = allPayslips(input.runs);
  const paye = resolvePaye(payslips);
  const uifEmployee = resolveUifEmployee(payslips);
  const uifEmployer = resolveUifEmployer(payslips);
  const sdl = resolveSdl(payslips);
  const gross = resolveGross(payslips);
  const employeeIds = new Set(payslips.map((p) => p.employeeId));

  const monthlyBreakdown = input.runs
    .slice()
    .sort((a, b) => a.payDate.localeCompare(b.payDate))
    .map((run) => {
      const runPayslips = run.payslips;
      const runUif = resolveUifEmployee(runPayslips) + resolveUifEmployer(runPayslips);
      return {
        periodLabel: `${run.payPeriodStart}_${run.payPeriodEnd}`,
        payDate: run.payDate,
        payrollRunId: run.id,
        paye: resolvePaye(runPayslips),
        uifTotal: Math.round((runUif + Number.EPSILON) * 100) / 100,
        sdl: resolveSdl(runPayslips),
        gross: resolveGross(runPayslips),
      };
    });

  const validationResult = buildValidationResult(issues);
  const sourcePayrollRuns = input.runs.map((r) => r.id);

  const declarationData: Emp501DeclarationData = {
    returnType: 'EMP501',
    country: 'ZA',
    taxYear,
    reconciliation: {
      payeDeclared: paye,
      uifEmployeeDeclared: uifEmployee,
      uifEmployerDeclared: uifEmployer,
      uifTotalDeclared: Math.round((uifEmployee + uifEmployer + Number.EPSILON) * 100) / 100,
      sdlDeclared: sdl,
      grossRemuneration: gross,
      employeeCount: employeeIds.size,
      finalizedRunCount: input.runs.length,
    },
    monthlyBreakdown,
    sourceRunIds: sourcePayrollRuns,
    mappingsId: EMP501_MAPPINGS.id,
  };

  return {
    id: newReturnId('EMP501'),
    country: 'ZA',
    returnType: 'EMP501',
    taxYear,
    payrollRunId: null,
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
