/**
 * Statutory Returns — common contract (V3.6).
 *
 * Returns NEVER calculate payroll. They only consume finalized payroll runs.
 * Pipeline: Payroll Engine → Finalized Payroll Run → Statutory Returns
 */

export type StatutoryReturnCountry = string;

export type StatutoryReturnType =
  | 'EMP201'
  | 'EMP501'
  | 'IRP5'
  | 'TAX_CERTIFICATE'
  | (string & {});

export type StatutoryReturnStatus =
  | 'draft'
  | 'validated'
  | 'ready'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'superseded';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type StatutoryValidationIssue = {
  code: string;
  severity: ValidationSeverity;
  message: string;
  field?: string;
};

export type StatutoryValidationResult = {
  ok: boolean;
  issues: StatutoryValidationIssue[];
  validatedAt: string;
};

/**
 * Common interface for all statutory government declarations.
 * Country-specific packages extend declarationData; the envelope stays stable.
 */
export type StatutoryReturn = {
  id: string;
  country: StatutoryReturnCountry;
  returnType: StatutoryReturnType;
  taxYear: string;
  /** Primary payroll run when the return is single-run scoped (e.g. EMP201 month). */
  payrollRunId: string | null;
  status: StatutoryReturnStatus;
  generatedAt: string;
  generatedBy: string | null;
  sourcePayrollRuns: string[];
  validationResult: StatutoryValidationResult;
  declarationData: Record<string, unknown>;
  submissionReference: string | null;
  submittedAt: string | null;
  /** Content hash of immutable declaration snapshot (V3.6.1). */
  contentHash: string | null;
  /** Once true, declaration must never be regenerated. */
  immutable: boolean;
};

/** Immutable finalized payroll run + payslip snapshots — sole input to generators. */
export type FinalizedPayslipSource = {
  payslipId: string;
  employeeId: string;
  employeeNumber?: string | null;
  employeeName: string;
  taxReference?: string | null;
  idNumber?: string | null;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  /** Engine calculation_snapshot — never recomputed here. */
  calculationSnapshot: Record<string, unknown> | null;
  payslipItems: Array<{
    description: string;
    type: 'earning' | 'deduction' | 'employer_contribution' | string;
    amount: number;
  }>;
};

export type FinalizedPayrollRunSource = {
  id: string;
  companyId: string;
  status: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  taxYear?: string | null;
  payslips: FinalizedPayslipSource[];
};

export type GenerateReturnInput = {
  country: StatutoryReturnCountry;
  taxYear: string;
  runs: FinalizedPayrollRunSource[];
  generatedBy?: string | null;
  /** Optional period filter (EMP201 month). ISO dates YYYY-MM-DD. */
  periodStart?: string;
  periodEnd?: string;
  /** Optional employee filter (IRP5 / tax certificate). */
  employeeId?: string;
};

export type StatutoryReturnPackage = {
  country: StatutoryReturnCountry;
  returnType: StatutoryReturnType;
  label: string;
  description: string;
  /** Frequency hint for UI / catalogue. */
  frequency: 'monthly' | 'annual' | 'per_employee' | 'on_demand';
  generate: (input: GenerateReturnInput) => StatutoryReturn;
};
