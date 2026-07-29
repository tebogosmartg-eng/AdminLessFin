/**
 * Audit trail aggregation — V3.0.2 complete metadata.
 */

import type { AuditMetadata, AuditStep, StatutoryEngineResult, StatutoryPipelineResult } from './types';
import { ENGINE_VERSION } from './utils';

export const AUDIT_TRAIL_REQUIRED_FIELDS = [
  'employee_number',
  'employee_name',
  'company_id',
  'payroll_run_id',
  'gross_earnings',
  'taxable_earnings',
  'net_pay',
  'tax_year',
  'rule_version',
  'calculation_version',
  'calculation_timestamp',
  'audit_trail',
  'engine_results',
] as const;

export function aggregateAuditTrail(
  engineResults: StatutoryEngineResult[],
  pipelineMeta: {
    taxYear: string;
    ruleVersion: string;
    payDate: string;
    audit?: AuditMetadata;
  }
): AuditStep[] {
  const header: AuditStep[] = [
    {
      step: 'pipeline_start',
      formula: 'resolve_rule_set(pay_date)',
      legislativeReference: 'Income Tax Act §81; versioned statutory rule registry',
      inputs: {
        payDate: pipelineMeta.payDate,
        taxYear: pipelineMeta.taxYear,
        ruleVersion: pipelineMeta.ruleVersion,
        calculationVersion: ENGINE_VERSION,
        employeeNumber: pipelineMeta.audit?.employeeNumber ?? null,
        payrollRunId: pipelineMeta.audit?.payrollRunId ?? null,
        correlationId: pipelineMeta.audit?.correlationId ?? null,
      },
      result: pipelineMeta.taxYear,
    },
  ];

  const engineSteps = engineResults.flatMap((r) =>
    r.auditTrail.map((step) => ({
      ...step,
      inputs: {
        ...step.inputs,
        engineId: r.engineId,
        engineVersion: r.engineVersion,
      },
    }))
  );

  return [...header, ...engineSteps];
}

export function buildCalculationSnapshot(
  result: StatutoryPipelineResult,
  meta?: AuditMetadata & { generatedAt?: string; generatedBy?: string }
): Record<string, unknown> {
  const employeeName =
    meta?.employeeName ??
    (result.audit?.employeeName ??
      [meta, result.audit].find((m) => m)?.employeeName ??
      undefined);

  const timestamp = meta?.generatedAt ?? new Date().toISOString();

  return {
    engine: 'statutory_payroll_engine',
    engine_version: ENGINE_VERSION,
    calculation_version: result.calculationVersion,
    tax_year: result.taxYear,
    rule_version: result.ruleVersion,
    calculation_timestamp: timestamp,
    generated_at: timestamp,
    generated_by: meta?.generatedBy ?? meta?.generatedBy,
    employee_number: meta?.employeeNumber ?? result.audit?.employeeNumber,
    employee_name: employeeName,
    company_id: meta?.companyId ?? result.audit?.companyId,
    company_name: meta?.companyName ?? result.audit?.companyName,
    payroll_run_id: meta?.payrollRunId ?? result.audit?.payrollRunId,
    command_id: meta?.commandId ?? result.audit?.commandId,
    correlation_id: meta?.correlationId ?? result.audit?.correlationId,
    audit_reference: meta?.auditReference ?? result.audit?.auditReference,
    gross_earnings: result.grossEarnings,
    taxable_earnings: result.taxableEarnings,
    net_pay: result.netPay,
    cost_to_company: result.costToCompany,
    total_employee_deductions: result.totalEmployeeDeductions,
    total_employer_contributions: result.totalEmployerContributions,
    engine_results: result.engineResults.map((r) => ({
      engine_id: r.engineId,
      engine_version: r.engineVersion,
      skipped: r.skipped,
      skip_reason: r.skipReason,
      employee_amount: r.employeeAmount,
      employer_amount: r.employerAmount,
      taxable_adjustment: r.taxableAdjustment,
      breakdown: r.breakdown,
      audit_trail: r.auditTrail,
    })),
    audit_trail: result.auditTrail,
    journal_lines: result.journalLines,
    payslip_lines: result.payslipLines,
  };
}

export function validateAuditSnapshot(snapshot: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const field of AUDIT_TRAIL_REQUIRED_FIELDS) {
    if (snapshot[field] == null && field !== 'employee_name' && field !== 'company_id') {
      if (field === 'employee_number' && snapshot.employee_id) continue;
      missing.push(field);
    }
  }
  return missing;
}
