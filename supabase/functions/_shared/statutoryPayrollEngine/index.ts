/**
 * South African Statutory Payroll Engine (V3)
 * Independent calculation engines separated from payroll workflow.
 */

export * from './types';
export * from './utils';
export * from './audit';
export * from './registry/index.ts';
export * from './pipeline';
export * from './verify';
export { runCertificationSuite } from './certification';
export { runPerformanceBenchmark } from './benchmark';
export { runCertificationProgramme, formatProgrammeSummary, certificationGatePassed } from './certificationRunner';
export { runHistoricalCertification } from './historicalRecertification';
export { calculateFringeBenefitLine } from './registry/seventhSchedule';
export { calculateTravelAllowance } from './registry/travelAllowance';
export { calculateTerminationBenefit } from './registry/terminationBenefits';

export { runPayeEngine, calculatePayeAmount } from './engines/payeEngine';
export { runDirectorsPayeEngine } from './engines/directorsPayeEngine';
export { runUifEmployeeEngine, runUifEmployerEngine } from './engines/uifEngine';
export { runSdlEngine } from './engines/sdlEngine';
export { runMedicalTaxCreditEngine, resolveMonthlyMedicalCredits } from './engines/medicalTaxCreditEngine';
export { runRetirementDeductionEngine } from './engines/retirementDeductionEngine';
export { runFringeBenefitEngine } from './engines/fringeBenefitEngine';
export { runTravelAllowanceEngine } from './engines/travelAllowanceEngine';
export { runBonusTaxEngine } from './engines/bonusTaxEngine';
export { runLeaveEncashmentEngine } from './engines/leaveEncashmentEngine';
export { runTerminationTaxEngine } from './engines/terminationTaxEngine';
export { taxYearConfigToRuleSet } from './adapter';
