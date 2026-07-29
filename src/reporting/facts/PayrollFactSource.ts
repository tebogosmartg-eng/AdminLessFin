/**
 * Payroll Fact Source — edge read adapter (finalized snapshots only)
 *
 * Loads raw finalized payslip payloads for mapping. Reports must not call this
 * directly for presentation; use PayrollFactRepository instead.
 */

import { invokePayroll } from '../../lib/payrollOperations';
import { isRunFinalized } from '../../lib/payrollWorkflow';
import { saTaxYearStartYear } from '../../lib/payrollMatrixEngine';
import type { PayrollFactQuery } from './PayrollFact';
import type { RawFinalizedPayslipPayload } from './PayrollFactMapper';

type RunRow = {
  id: string;
  company_id?: string;
  pay_period_start?: string;
  pay_period_end?: string;
  pay_date: string;
  status: string;
};

/** SA tax year Y → date range 1 Mar Y … last day of Feb Y+1. */
export function saTaxYearDateRange(taxYearStartYear: number): { start: string; end: string } {
  const endYear = taxYearStartYear + 1;
  const isLeap = (endYear % 4 === 0 && endYear % 100 !== 0) || endYear % 400 === 0;
  const endDay = isLeap ? 29 : 28;
  return {
    start: `${taxYearStartYear}-03-01`,
    end: `${endYear}-02-${endDay}`,
  };
}

export type PayrollFactSourceResult = {
  payloads: RawFinalizedPayslipPayload[];
  runCount: number;
  runIds: string[];
};

/**
 * Read finalized snapshot payloads from payroll edge APIs.
 * Does not invoke GENERATE_PAYSLIPS or FINALIZE_RUN.
 */
export async function loadFinalizedPayrollFactSource(
  query: PayrollFactQuery
): Promise<PayrollFactSourceResult> {
  let startDate = query.startDate;
  let endDate = query.endDate;
  if (query.taxYearStartYear != null && (!startDate || !endDate)) {
    const range = saTaxYearDateRange(query.taxYearStartYear);
    startDate = startDate ?? range.start;
    endDate = endDate ?? range.end;
  }

  const runs = await invokePayroll<RunRow[]>({
    method: 'GET_RUNS',
    company_id: query.companyId,
  });

  const finalized = runs.filter((r) => {
    if (!isRunFinalized(r.status)) return false;
    if (query.payrollRunId && r.id !== query.payrollRunId) return false;
    if (startDate && r.pay_date < startDate) return false;
    if (endDate && r.pay_date > endDate) return false;
    if (
      query.taxYearStartYear != null &&
      saTaxYearStartYear(r.pay_date) !== query.taxYearStartYear
    ) {
      return false;
    }
    return true;
  });

  const payloads: RawFinalizedPayslipPayload[] = [];

  for (const run of finalized) {
    let detail: {
      payslips?: Array<{ id: string; employee_id?: string; payment_status?: string }>;
      run?: RunRow;
    } | null = null;
    try {
      detail = await invokePayroll({
        method: 'GET_RUN_DETAIL',
        company_id: query.companyId,
        runId: run.id,
      });
    } catch {
      continue;
    }
    if (!detail?.payslips?.length) continue;

    for (const payslip of detail.payslips) {
      let payslipDetail: {
        employee_id?: string;
        employees?: RawFinalizedPayslipPayload['employees'];
        total_earnings?: number;
        total_deductions?: number;
        net_pay?: number;
        calculation_snapshot?: Record<string, unknown>;
        payslip_items?: Array<{ description: string; type: string; amount: number }>;
      } | null = null;

      try {
        payslipDetail = await invokePayroll({
          method: 'GET_PAYSLIP_DETAIL',
          company_id: query.companyId,
          payslipId: payslip.id,
        });
      } catch {
        continue;
      }
      if (!payslipDetail) continue;

      const snapshot = payslipDetail.calculation_snapshot ?? null;
      if (query.taxYear && typeof snapshot?.tax_year === 'string' && snapshot.tax_year !== query.taxYear) {
        continue;
      }

      payloads.push({
        companyId: query.companyId,
        payrollRunId: run.id,
        payDate: run.pay_date,
        runStatus: run.status,
        payPeriodStart: run.pay_period_start,
        payPeriodEnd: run.pay_period_end,
        payslipId: payslip.id,
        paymentStatus: payslip.payment_status,
        employeeId: payslipDetail.employee_id ?? payslip.employee_id,
        employees: payslipDetail.employees,
        total_earnings: payslipDetail.total_earnings,
        total_deductions: payslipDetail.total_deductions,
        net_pay: payslipDetail.net_pay,
        calculation_snapshot: snapshot,
        payslip_items: payslipDetail.payslip_items,
      });
    }
  }

  return {
    payloads,
    runCount: finalized.length,
    runIds: finalized.map((r) => r.id),
  };
}
