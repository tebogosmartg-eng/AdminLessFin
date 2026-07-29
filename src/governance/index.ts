// Governance Foundation — root barrel (Phase G3.1).
//
// Nothing outside this directory imports from here yet. This barrel exists
// so a future migration phase has one clean entry point
// (`import { ... } from '@/governance'`) rather than reaching into
// individual domain folders.

export * from './types';
export * from './featureFlags';
export * from './GovernanceContext';

export * as FinancialCalendarDomain from './domains/financialCalendar';
export * as CompanyDomain from './domains/company';
export * as CorporateGovernanceDomain from './domains/corporateGovernance';
export * as AccountingPoliciesDomain from './domains/accountingPolicies';
export * as SecurityDomain from './domains/security';
export * as WorkflowDomain from './domains/workflow';
export * as TaxDomain from './domains/tax';
export * as CurrenciesDomain from './domains/currencies';
export * as AuditConfigurationDomain from './domains/auditConfiguration';
export * as DocumentConfigurationDomain from './domains/documentConfiguration';
export * as AccountingReadinessDomain from './domains/accountingReadiness';
export * as AccountingHealthDomain from './domains/accountingHealth';
export * as AccountingPolicyEngineDomain from './domains/accountingPolicyEngine';
export * as AccountingRulesEngineDomain from './domains/accountingRulesEngine';
export * as BusinessEventOrchestratorDomain from './domains/businessEventOrchestrator';
