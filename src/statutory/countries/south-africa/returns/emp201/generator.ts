/**
 * EMP201 generator — builds declaration from finalized payroll only.
 * Does not run export/transmission. Statutory validation lives in validator.ts.
 */

import { resolveLegislation } from '../../../../registry/resolveLegislation';
import { unwrap } from '../../../../registry/types';
import {
  allPayslips,
  buildValidationResult,
  filterRunsByPeriod,
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
import { EMP201_MAPPINGS } from './mappings';

export type Emp201DeclarationData = {
  returnType: 'EMP201';
  country: 'ZA';
  taxYear: string;
  periodStart: string;
  periodEnd: string;
  fieldCodes: { paye: string; uif: string; sdl: string };
  totals: {
    paye: number;
    uifEmployee: number;
    uifEmployer: number;
    uifTotal: number;
    sdl: number;
    grossRemuneration: number;
    employeeCount: number;
  };
  sourceRunIds: string[];
  legislationRuleVersion: string | null;
  mappingsId: string;
};

export function generateEmp201(input: GenerateReturnInput): StatutoryReturn {
  const issues = mergeIssues(
    validateGenerateInput(input, { requirePeriod: true }),
    validateSourcePayrollIntegrity(input.runs)
  );

  const scoped = filterRunsByPeriod(input.runs, input.periodStart, input.periodEnd);
  if (!scoped.length && input.runs.length) {
    issues.push({
      code: 'NO_RUNS_IN_PERIOD',
      severity: 'error',
      message: `No finalized payroll runs fall within ${input.periodStart} – ${input.periodEnd}.`,
      field: 'periodStart',
    });
  }

  const payslips = allPayslips(scoped);
  const paye = resolvePaye(payslips);
  const uifEmployee = resolveUifEmployee(payslips);
  const uifEmployer = resolveUifEmployer(payslips);
  const sdl = resolveSdl(payslips);
  const gross = resolveGross(payslips);
  const employeeIds = new Set(payslips.map((p) => p.employeeId));

  let fieldCodes = { paye: 'PAYE', uif: 'UIF', sdl: 'SDL' };
  let legislationRuleVersion: string | null = null;

  try {
    const payDate = scoped[0]?.payDate ?? input.periodEnd ?? input.periodStart;
    const pkg = payDate
      ? resolveLegislation({ countryCode: 'ZA', payDate })
      : resolveLegislation({ countryCode: 'ZA', taxYear: input.taxYear });
    fieldCodes = {
      paye: unwrap(pkg.emp201.paye),
      uif: unwrap(pkg.emp201.uif),
      sdl: unwrap(pkg.emp201.sdl),
    };
    legislationRuleVersion = pkg.metadata.ruleVersion;
  } catch (err) {
    issues.push({
      code: 'LEGISLATION_CODE_RESOLVE_FAILED',
      severity: 'warning',
      message: err instanceof Error ? err.message : 'Could not resolve EMP201 field codes from legislation.',
    });
  }

  const taxYear = taxYearFromRuns(scoped, input.taxYear);
  const sourcePayrollRuns = scoped.map((r) => r.id);
  const validationResult = buildValidationResult(issues);

  const declarationData: Emp201DeclarationData = {
    returnType: 'EMP201',
    country: 'ZA',
    taxYear,
    periodStart: input.periodStart ?? '',
    periodEnd: input.periodEnd ?? '',
    fieldCodes,
    totals: {
      paye,
      uifEmployee,
      uifEmployer,
      uifTotal: Math.round((uifEmployee + uifEmployer + Number.EPSILON) * 100) / 100,
      sdl,
      grossRemuneration: gross,
      employeeCount: employeeIds.size,
    },
    sourceRunIds: sourcePayrollRuns,
    legislationRuleVersion,
    mappingsId: EMP201_MAPPINGS.id,
  };

  return {
    id: newReturnId('EMP201'),
    country: 'ZA',
    returnType: 'EMP201',
    taxYear,
    payrollRunId: sourcePayrollRuns[0] ?? null,
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
