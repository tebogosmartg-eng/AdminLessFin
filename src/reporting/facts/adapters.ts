/**
 * Fact → locked consumer adapters (V3.6.4)
 *
 * Preserve identical output of locked Register / Management / Statutory builders
 * by projecting PayrollFact into their existing input shapes — without those
 * builders reading payslips.
 */

import type { RegisterPayslipInput } from '../../lib/payrollReports';
import type { ManagementPayslipInput } from '../../lib/payrollManagementReports';
import type { FinalizedPayrollRunSource, FinalizedPayslipSource } from '../../lib/statutoryReturns/types';
import type { PayrollFact } from './PayrollFact';
import { getPayrollItem, listPayrollItems, VIP_ITEM_CODES } from './PayrollItemRegistry';

function itemsFromFact(fact: PayrollFact): RegisterPayslipInput['items'] {
  return fact.payrollItems.map((i) => ({
    description: i.description,
    type: i.isEmployerContribution
      ? 'employer_contribution'
      : i.isEarning
        ? 'earning'
        : 'deduction',
    amount: i.amount,
  }));
}

/** Project facts → RegisterPayslipInput for locked buildPeriodReports. */
export function factsToRegisterPayslips(facts: PayrollFact[]): RegisterPayslipInput[] {
  return facts.map((f) => ({
    employee_number: f.employeeNumber,
    employee: `${f.employeeName} ${f.surname}`.trim(),
    department: f.department,
    gross_pay: f.totals.grossPay,
    total_deductions: f.totals.totalDeductions,
    net_pay: f.totals.netPay,
    employer_contributions: f.totals.employerContributions,
    items: itemsFromFact(f),
    status: f.metadata.paymentStatus ?? f.metadata.runStatus,
  }));
}

/** Project facts → ManagementPayslipInput for locked buildManagementReports. */
export function factsToManagementPayslips(
  facts: PayrollFact[],
  companyName = 'Company'
): ManagementPayslipInput[] {
  return facts.map((f) => ({
    employee_number: f.employeeNumber,
    employee: `${f.employeeName} ${f.surname}`.trim(),
    department: f.department,
    cost_centre: f.costCentre,
    employee_group: f.metadata.employeeGroup ?? f.position ?? 'Ungrouped',
    company: f.metadata.companyName ?? companyName,
    pay_date: f.payDate,
    gross_pay: f.totals.grossPay,
    total_deductions: f.totals.totalDeductions,
    net_pay: f.totals.netPay,
    employer_contributions: f.totals.employerContributions,
    items: itemsFromFact(f),
    status: f.metadata.paymentStatus ?? f.metadata.runStatus,
  }));
}

/** Project facts → statutory FinalizedPayrollRunSource[] for locked generators. */
export function factsToStatutoryRunSources(facts: PayrollFact[]): FinalizedPayrollRunSource[] {
  const byRun = new Map<string, FinalizedPayrollRunSource>();

  for (const f of facts) {
    let run = byRun.get(f.payrollRunId);
    if (!run) {
      run = {
        id: f.payrollRunId,
        companyId: f.companyId,
        status: f.metadata.runStatus,
        payPeriodStart: f.metadata.payPeriodStart ?? f.payDate,
        payPeriodEnd: f.metadata.payPeriodEnd ?? f.payDate,
        payDate: f.payDate,
        taxYear: f.taxYear || null,
        payslips: [],
      };
      byRun.set(f.payrollRunId, run);
    }

    const payslip: FinalizedPayslipSource = {
      payslipId: f.metadata.payslipId ?? `${f.payrollRunId}:${f.employeeId}`,
      employeeId: f.employeeId,
      employeeNumber: f.employeeNumber,
      employeeName: `${f.employeeName} ${f.surname}`.trim(),
      taxReference: f.metadata.taxReference ?? null,
      idNumber: f.metadata.idNumber ?? null,
      grossPay: f.totals.grossPay,
      totalDeductions: f.totals.totalDeductions,
      netPay: f.totals.netPay,
      calculationSnapshot: {
        tax_year: f.taxYear,
        rule_version: f.metadata.ruleVersion,
        calculation_version: f.metadata.calculationVersion,
        total_employer_contributions: f.totals.employerContributions,
        cost_to_company: f.totals.costToCompany,
        employee_number: f.employeeNumber,
        engine_results: f.engineResults.map((e) => ({
          engine_id: e.engineId,
          employee_amount: e.employeeAmount,
          employer_amount: e.employerAmount,
          skipped: e.skipped,
        })),
      },
      payslipItems: itemsFromFact(f),
    };
    run.payslips.push(payslip);
  }

  return [...byRun.values()];
}

/** Amount for a registry item code from one fact (engine preference + lines + synthetics). */
export function measureFactItemAmount(fact: PayrollFact, itemCode: string): number {
  const def = getPayrollItem(itemCode);
  if (!def) {
    return fact.payrollItems.filter((i) => i.code === itemCode).reduce((s, i) => s + i.amount, 0);
  }

  if (def.synthetic === 'net_pay') return fact.totals.netPay;
  if (def.synthetic === 'cost_to_company') return fact.totals.costToCompany;
  if (def.synthetic === 'gross_pay') return fact.totals.grossPay;

  if (def.engineIds?.length) {
    const idSet = new Set(def.engineIds);
    let fromEngine = 0;
    for (const er of fact.engineResults) {
      if (!idSet.has(er.engineId) || er.skipped) continue;
      fromEngine += def.engineSide === 'employer' ? er.employerAmount : er.employeeAmount;
    }
    if (fromEngine > 0) return fromEngine;
  }

  if (itemCode === 'uif_employee') {
    return fact.payrollItems
      .filter((i) => {
        const d = i.description.toLowerCase();
        return d.includes('uif') && !d.includes('employer');
      })
      .reduce((s, i) => s + i.amount, 0);
  }
  if (itemCode === 'uif_employer') {
    return fact.payrollItems
      .filter((i) => {
        const d = i.description.toLowerCase();
        return d.includes('uif') && d.includes('employer');
      })
      .reduce((s, i) => s + i.amount, 0);
  }
  if (itemCode === 'allowances') {
    return fact.payrollItems
      .filter((i) => i.isEarning && i.description.toLowerCase().includes('allowance'))
      .reduce((s, i) => s + i.amount, 0);
  }

  return fact.payrollItems.filter((i) => i.code === itemCode).reduce((s, i) => s + i.amount, 0);
}

export function listVipItemDefinitions() {
  return VIP_ITEM_CODES.map((code) => getPayrollItem(code)).filter(Boolean);
}

export function listAllItemDefinitions() {
  return listPayrollItems();
}
