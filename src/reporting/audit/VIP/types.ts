/**
 * Enterprise VIP Payroll Working Paper — types (V3.6.6)
 * Employee-centric audit working paper. Facts only. No payroll calculations.
 */

export const VIP_ANNUAL_TOTAL_COLUMN = 'Annual Total';
export const VIP_SYSTEM_VERSION = '3.6.6';
export const VIP_CLASSIFICATION = 'CONFIDENTIAL';
export const VIP_REPORT_TITLE = 'Enterprise VIP Payroll Working Paper';

export type VipMonthValues = Record<string, number>;

export type VipLineAmount = {
  code: string;
  label: string;
  months: VipMonthValues;
  annualTotal: number;
  /** Highlight totals / section footers */
  emphasis?: 'section_total' | 'grand_total';
};

export type VipAuditBlockId =
  | 'employee_information'
  | 'earnings'
  | 'deductions'
  | 'net_pay'
  | 'employer_contributions'
  | 'cost_to_company';

export type VipEmployeeIdentity = {
  employeeNumber: string;
  employeeName: string;
  employeeSurname: string;
  department: string;
  position: string;
  costCentre: string;
  employmentStatus: string;
  taxNumber: string;
  employmentDate: string;
  terminationDate: string;
};

export type VipAuditBlock = {
  id: VipAuditBlockId;
  title: string;
  lines: VipLineAmount[];
};

/** One employee = one independent working-paper section. */
export type VipEmployeeWorkingPaper = {
  identity: VipEmployeeIdentity;
  blocks: VipAuditBlock[];
};

export type VipWorkingPaperReport = {
  taxYearStartYear: number;
  taxYearLabel: string;
  monthColumns: string[];
  employees: VipEmployeeWorkingPaper[];
  employeeCount: number;
  factCount: number;
  sourcePayrollRunIds: string[];
  snapshotChecksums: string[];
};

/** Flat analysis row (CSV / Excel filter sheet) — not the primary audit layout. */
export type VipDetailRow = Record<string, string | number>;

export type VipExportBranding = {
  product: string;
  platform: string;
  reportTitle: string;
  companyName: string;
  companyLogoUrl?: string | null;
  financialYear: string;
  payrollPeriod: string;
  generatedBy: string;
  generatedAt: string;
  reportId: string;
  systemVersion: string;
  sourcePayrollRuns: string;
  classification: string;
};
