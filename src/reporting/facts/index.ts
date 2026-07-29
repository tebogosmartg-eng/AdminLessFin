/**
 * Payroll Facts public barrel (V3.6.4)
 */

export type {
  PayrollFact,
  PayrollFactEngineResult,
  PayrollFactItemLine,
  PayrollFactMetadata,
  PayrollFactQuery,
  PayrollFactTotals,
} from './PayrollFact';

export {
  listPayrollItems,
  getPayrollItem,
  registerPayrollItem,
  classifyPayrollItemDescription,
  VIP_ITEM_CODES,
  type PayrollItemDefinition,
  type PayrollItemCategory,
} from './PayrollItemRegistry';

export { mapRawPayslipToPayrollFact, type RawFinalizedPayslipPayload } from './PayrollFactMapper';
export {
  validatePayrollFact,
  validatePayrollFacts,
  assertFactImmutable,
  type PayrollFactValidationIssue,
  type PayrollFactValidationResult,
} from './PayrollFactValidator';
export {
  loadFinalizedPayrollFactSource,
  saTaxYearDateRange,
  type PayrollFactSourceResult,
} from './PayrollFactSource';
export {
  loadPayrollFacts,
  type PayrollFactRepositoryResult,
} from './PayrollFactRepository';
export {
  factsToRegisterPayslips,
  factsToManagementPayslips,
  factsToStatutoryRunSources,
  measureFactItemAmount,
  listVipItemDefinitions,
  listAllItemDefinitions,
} from './adapters';
