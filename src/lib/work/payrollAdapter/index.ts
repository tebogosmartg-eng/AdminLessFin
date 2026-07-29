/**
 * Payroll facts adapter (V4.1 E5).
 * Emits payroll INPUT facts only. Never imports statutoryPayrollEngine.
 * Subcontractors / non-payroll resource types are excluded.
 *
 * Change-control: any future wiring into payroll edge contracts requires PAYROLL_CHANGE_CONTROL.
 */

import { assertNotPayrollPath, isPayrollEligibleResourceType } from '../resource';

export type PayrollInputFactDraft = {
  company_id: string;
  employee_id: string;
  work_resource_id?: string | null;
  time_entry_id: string;
  ewm_project_id?: string | null;
  entry_date: string;
  hours: number;
  is_overtime: boolean;
  wage_input: boolean;
  payroll_period_id?: string | null;
  status: 'ready' | 'excluded';
  exclusion_reason?: string | null;
};

export function buildPayrollInputFact(params: {
  companyId: string;
  employeeId: string | null | undefined;
  workResourceId?: string | null;
  resourceTypeId?: string | null;
  timeEntryId: string;
  ewmProjectId?: string | null;
  entryDate: string;
  hours: number;
  isOvertime?: boolean;
  employmentStyle?: 'permanent' | 'temporary' | 'casual' | 'contract' | string;
  payrollPeriodId?: string | null;
}): PayrollInputFactDraft | null {
  if (!params.employeeId) {
    return null;
  }

  try {
    assertNotPayrollPath(params.resourceTypeId);
  } catch (e: any) {
    return {
      company_id: params.companyId,
      employee_id: params.employeeId,
      work_resource_id: params.workResourceId ?? null,
      time_entry_id: params.timeEntryId,
      ewm_project_id: params.ewmProjectId ?? null,
      entry_date: params.entryDate,
      hours: params.hours,
      is_overtime: !!params.isOvertime,
      wage_input: false,
      payroll_period_id: params.payrollPeriodId ?? null,
      status: 'excluded',
      exclusion_reason: e.message,
    };
  }

  if (!isPayrollEligibleResourceType(params.resourceTypeId)) {
    return {
      company_id: params.companyId,
      employee_id: params.employeeId,
      work_resource_id: params.workResourceId ?? null,
      time_entry_id: params.timeEntryId,
      ewm_project_id: params.ewmProjectId ?? null,
      entry_date: params.entryDate,
      hours: params.hours,
      is_overtime: !!params.isOvertime,
      wage_input: false,
      payroll_period_id: params.payrollPeriodId ?? null,
      status: 'excluded',
      exclusion_reason: 'Resource type is not payroll-eligible',
    };
  }

  const wageInput =
    params.employmentStyle === 'temporary' ||
    params.employmentStyle === 'casual' ||
    params.resourceTypeId === 'temporary_labour' ||
    params.resourceTypeId === 'casual_labour';

  return {
    company_id: params.companyId,
    employee_id: params.employeeId,
    work_resource_id: params.workResourceId ?? null,
    time_entry_id: params.timeEntryId,
    ewm_project_id: params.ewmProjectId ?? null,
    entry_date: params.entryDate,
    hours: params.hours,
    is_overtime: !!params.isOvertime,
    wage_input: wageInput,
    payroll_period_id: params.payrollPeriodId ?? null,
    status: 'ready',
    exclusion_reason: null,
  };
}
