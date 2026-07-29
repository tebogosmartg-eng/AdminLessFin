/**
 * Payroll Calculation Pipeline — statutory engines orchestration (V3.0.2).
 */

import { aggregateAuditTrail } from './audit.ts';
import { runBonusTaxEngine } from './engines/bonusTaxEngine.ts';
import {
  resolveDeemedTaxableFromDirectorResult,
  resolvePayeModeFromDirectorResult,
  runDirectorsPayeEngine,
} from './engines/directorsPayeEngine.ts';
import { runFringeBenefitEngine } from './engines/fringeBenefitEngine.ts';
import { runLeaveEncashmentEngine } from './engines/leaveEncashmentEngine.ts';
import { runMedicalTaxCreditEngine } from './engines/medicalTaxCreditEngine.ts';
import { runPayeEngine } from './engines/payeEngine.ts';
import { runRetirementDeductionEngine } from './engines/retirementDeductionEngine.ts';
import { runSdlEngine } from './engines/sdlEngine.ts';
import { runTerminationTaxEngine } from './engines/terminationTaxEngine.ts';
import { runTravelAllowanceEngine } from './engines/travelAllowanceEngine.ts';
import { runUifEmployeeEngine, runUifEmployerEngine } from './engines/uifEngine.ts';
import { resolveRuleSetForPayroll } from './registry/index.ts';
import type {
  JournalLine,
  PayslipStatutoryLine,
  PayeCalculationMode,
  StatutoryCalculationContext,
  StatutoryEngineResult,
  StatutoryPipelineResult,
} from './types.ts';
import { createAuditStep, ENGINE_VERSION, roundCurrency } from './utils.ts';

const ENGINE_LABELS: Record<string, string> = {
  paye: 'PAYE',
  directors_paye: 'Directors PAYE',
  uif: 'UIF',
  uif_employer: 'UIF Employer',
  sdl: 'SDL',
  bonus_tax: 'Bonus PAYE',
  termination_tax: 'Termination PAYE',
};

export type PipelineInput = Omit<
  StatutoryCalculationContext,
  'ruleSet' | 'taxableEarnings'
> & {
  ruleSet?: StatutoryCalculationContext['ruleSet'];
  dbTaxYearRows?: Record<string, unknown>[];
};

export function executeStatutoryPipeline(input: PipelineInput): StatutoryPipelineResult {
  const ruleSet =
    input.ruleSet ??
    resolveRuleSetForPayroll(input.period.payDate, input.dbTaxYearRows);

  let taxableEarnings = input.taxableEarnings ?? input.grossEarnings;
  const engineResults: StatutoryEngineResult[] = [];
  let payeMode: PayeCalculationMode = 'standard';

  const ctx: StatutoryCalculationContext = {
    ...input,
    ruleSet,
    taxableEarnings,
    audit: input.audit,
  };

  const preTaxEngines = [
    runRetirementDeductionEngine,
    runFringeBenefitEngine,
    runTravelAllowanceEngine,
    runLeaveEncashmentEngine,
    runBonusTaxEngine,
    runTerminationTaxEngine,
  ];

  for (const run of preTaxEngines) {
    const result = run({ ...ctx, taxableEarnings });
    engineResults.push(result);
    if (!result.skipped && result.taxableAdjustment !== 0) {
      taxableEarnings = roundCurrency(taxableEarnings + result.taxableAdjustment);
    }
  }

  const directorsResult = runDirectorsPayeEngine({ ...ctx, taxableEarnings });
  engineResults.push(directorsResult);
  if (!directorsResult.skipped) {
    payeMode = resolvePayeModeFromDirectorResult(directorsResult);
    const deemed = resolveDeemedTaxableFromDirectorResult(directorsResult, taxableEarnings);
    taxableEarnings = deemed;
  }

  ctx.taxableEarnings = taxableEarnings;
  ctx.payeMode = payeMode;

  const medicalResult = runMedicalTaxCreditEngine(ctx);
  engineResults.push(medicalResult);
  const monthlyMedicalCredits = medicalResult.breakdown.monthlyCredit ?? 0;

  const payeResult = runPayeEngine(ctx, monthlyMedicalCredits);
  engineResults.push(payeResult);

  const uifEmployee = runUifEmployeeEngine(ctx);
  const uifEmployer = runUifEmployerEngine(ctx);
  const sdlResult = runSdlEngine(ctx);
  engineResults.push(uifEmployee, uifEmployer, sdlResult);

  const totalEmployeeDeductions = roundCurrency(
    engineResults.reduce((s, r) => s + r.employeeAmount, 0)
  );
  const totalEmployerContributions = roundCurrency(
    engineResults.reduce((s, r) => s + r.employerAmount, 0)
  );
  const netPay = roundCurrency(input.grossEarnings - totalEmployeeDeductions);
  const costToCompany = roundCurrency(input.grossEarnings + totalEmployerContributions);

  const payslipLines = buildPayslipLines(engineResults);
  const journalLines = buildJournalLines(input.grossEarnings, engineResults, netPay);
  const auditTrail = aggregateAuditTrail(engineResults, {
    taxYear: ruleSet.taxYearLabel,
    ruleVersion: ruleSet.ruleVersion,
    payDate: input.period.payDate,
    audit: input.audit,
  });

  auditTrail.push(
    createAuditStep(
      'pipeline_totals',
      'gross - employee_deductions = net_pay',
      {
        grossEarnings: input.grossEarnings,
        taxableEarnings,
        totalEmployeeDeductions,
        totalEmployerContributions,
        calculationVersion: ENGINE_VERSION,
      },
      netPay
    )
  );

  return {
    taxYear: ruleSet.taxYearLabel,
    ruleVersion: ruleSet.ruleVersion,
    calculationVersion: ENGINE_VERSION,
    grossEarnings: input.grossEarnings,
    taxableEarnings,
    engineResults,
    totalEmployeeDeductions,
    totalEmployerContributions,
    netPay,
    costToCompany,
    journalLines,
    payslipLines,
    auditTrail,
    audit: input.audit,
  };
}

function buildPayslipLines(results: StatutoryEngineResult[]): PayslipStatutoryLine[] {
  const lines: PayslipStatutoryLine[] = [];
  for (const r of results) {
    if (r.skipped) continue;
    if (r.engineId === 'medical_tax_credit' || r.engineId === 'directors_paye') continue;
    if (r.employeeAmount > 0) {
      lines.push({
        engineId: r.engineId,
        description: ENGINE_LABELS[r.engineId] ?? r.engineId,
        type: 'deduction',
        amount: r.employeeAmount,
      });
    }
    if (r.employerAmount > 0) {
      lines.push({
        engineId: r.engineId,
        description: ENGINE_LABELS[r.engineId] ?? r.engineId,
        type: 'employer_contribution',
        amount: r.employerAmount,
      });
    }
  }
  return lines;
}

function buildJournalLines(
  grossEarnings: number,
  results: StatutoryEngineResult[],
  netPay: number
): JournalLine[] {
  const lines: JournalLine[] = [
    { accountRole: 'wages', description: 'Gross wages', debit: grossEarnings, credit: 0 },
    { accountRole: 'bank', description: 'Net pay', debit: 0, credit: netPay },
  ];

  for (const r of results) {
    if (r.skipped) continue;
    const emp = r.employeeAmount;
    const er = r.employerAmount;
    if (emp > 0 && ['paye', 'uif', 'bonus_tax', 'termination_tax'].includes(r.engineId)) {
      lines.push({
        accountRole: r.engineId === 'uif' ? 'uif_liability' : 'paye_liability',
        description: ENGINE_LABELS[r.engineId] ?? r.engineId,
        debit: 0,
        credit: emp,
        sourceEngine: r.engineId,
      });
    }
    if (er > 0) {
      lines.push({
        accountRole: r.engineId === 'sdl' ? 'sdl_expense' : 'uif_liability',
        description: ENGINE_LABELS[r.engineId] ?? r.engineId,
        debit: r.engineId === 'sdl' ? er : 0,
        credit: r.engineId === 'sdl' ? 0 : er,
        sourceEngine: r.engineId,
      });
    }
  }

  const otherDeductions = results
    .filter(
      (r) =>
        !r.skipped &&
        r.employeeAmount > 0 &&
        !['paye', 'uif', 'bonus_tax', 'termination_tax'].includes(r.engineId)
    )
    .reduce((s, r) => s + r.employeeAmount, 0);
  if (otherDeductions > 0) {
    lines.push({
      accountRole: 'other_deduction',
      description: 'Other employee deductions',
      debit: 0,
      credit: otherDeductions,
    });
  }

  return lines;
}

export function mapRulesToStatutoryEngines(
  ruleSettings: Record<string, { enabled?: boolean }>
): StatutoryCalculationContext['enabledEngines'] {
  return {
    paye: ruleSettings.paye?.enabled !== false,
    directors_paye: ruleSettings.paye?.enabled !== false,
    uif: ruleSettings.uif?.enabled !== false,
    uif_employer: ruleSettings.uif_employer?.enabled !== false,
    sdl: ruleSettings.sdl?.enabled !== false,
    medical_tax_credit: ruleSettings.paye?.enabled !== false,
    retirement_deduction:
      ruleSettings.pension?.enabled === true || ruleSettings.provident_fund?.enabled === true,
    fringe_benefit: ruleSettings.fringe_benefit?.enabled === true,
    travel_allowance: ruleSettings.travel_allowance?.enabled === true,
    bonus_tax: ruleSettings.bonus?.enabled === true,
    leave_encashment: ruleSettings.leave_encashment?.enabled === true,
    termination_tax: ruleSettings.termination?.enabled === true,
  };
}
