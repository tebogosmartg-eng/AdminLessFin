/**
 * Canonical immutable Payroll Fact — Enterprise Reporting Architecture (V3.6.4)
 *
 * Facts are derived from finalized payroll snapshots. They are the ONLY reporting source.
 * Payslips remain presentation documents and must not be queried by reports.
 */

export type PayrollFactItemLine = {
  /** Registry code when classified; raw description when unclassified. */
  code: string;
  description: string;
  category: string;
  amount: number;
  isEarning: boolean;
  isDeduction: boolean;
  isEmployerContribution: boolean;
};

export type PayrollFactTotals = {
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  employerContributions: number;
  costToCompany: number;
};

export type PayrollFactEngineResult = {
  engineId: string;
  employeeAmount: number;
  employerAmount: number;
  skipped: boolean;
};

export type PayrollFactMetadata = {
  runStatus: string;
  paymentStatus?: string;
  payslipId?: string;
  ruleVersion?: string;
  calculationVersion?: string;
  taxReference?: string | null;
  idNumber?: string | null;
  companyName?: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  branch?: string;
  employeeGroup?: string;
};

/**
 * Immutable payroll fact. Treat as read-only after construction.
 * `Object.freeze` applied by mapper / repository.
 */
export type PayrollFact = {
  readonly companyId: string;
  readonly payrollRunId: string;
  readonly employeeId: string;
  readonly employeeNumber: string;
  readonly employeeName: string;
  readonly surname: string;
  readonly department: string;
  readonly position: string;
  readonly costCentre: string;
  readonly employmentStatus: string;
  readonly payDate: string;
  /** Calendar / company FY label when available (e.g. 2026). */
  readonly financialYear: string;
  /** SA tax year label from snapshot when available (e.g. 2025/2026). */
  readonly taxYear: string;
  readonly payrollItems: readonly PayrollFactItemLine[];
  readonly totals: Readonly<PayrollFactTotals>;
  readonly metadata: Readonly<PayrollFactMetadata>;
  readonly snapshotChecksum: string;
  /** Snapshot engine results for statutory preference — never recalculated. */
  readonly engineResults: readonly PayrollFactEngineResult[];
};

export type PayrollFactQuery = {
  companyId: string;
  startDate?: string;
  endDate?: string;
  taxYearStartYear?: number;
  taxYear?: string;
  payrollRunId?: string;
};
