// Governance Foundation — the single runtime access point (Phase G3.1).
//
// This is the "Governance Provider" the G3.1 mandate calls for: one React
// context exposing every domain service. It is intentionally NOT mounted
// anywhere in the app yet — src/App.tsx and src/router.tsx are untouched by
// this phase. A future migration phase decides when and where to mount it,
// once a real consumer is ready to move off its existing implementation.
//
// Until then, this file has zero runtime footprint: nothing imports it,
// so it is not part of any shipped bundle (verified in this phase's
// regression checks, not merely assumed).

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createFinancialCalendarService, type FinancialCalendarService } from './domains/financialCalendar/service';
import { createCompanyService, type CompanyService } from './domains/company/service';
import { createCorporateGovernanceService, type CorporateGovernanceService } from './domains/corporateGovernance/service';
import { createAccountingPoliciesService, type AccountingPoliciesService } from './domains/accountingPolicies/service';
import { createSecurityService, type SecurityService } from './domains/security/service';
import { createWorkflowService, type WorkflowService } from './domains/workflow/service';
import { createTaxService, type TaxService } from './domains/tax/service';
import { createCurrenciesService, type CurrenciesService } from './domains/currencies/service';
import { createAuditConfigurationService, type AuditConfigurationService } from './domains/auditConfiguration/service';
import { createDocumentConfigurationService, type DocumentConfigurationService } from './domains/documentConfiguration/service';

export interface GovernanceServices {
  financialCalendar: FinancialCalendarService;
  company: CompanyService;
  corporateGovernance: CorporateGovernanceService;
  accountingPolicies: AccountingPoliciesService;
  security: SecurityService;
  workflow: WorkflowService;
  tax: TaxService;
  currencies: CurrenciesService;
  auditConfiguration: AuditConfigurationService;
  documentConfiguration: DocumentConfigurationService;
}

const GovernanceContext = createContext<GovernanceServices | undefined>(undefined);

export function GovernanceProvider({ children }: { children: ReactNode }) {
  // Service instances are cheap, stateless façades (no network call happens
  // at construction time) — safe to create once per provider mount.
  const services = useMemo<GovernanceServices>(
    () => ({
      financialCalendar: createFinancialCalendarService(),
      company: createCompanyService(),
      corporateGovernance: createCorporateGovernanceService(),
      accountingPolicies: createAccountingPoliciesService(),
      security: createSecurityService(),
      workflow: createWorkflowService(),
      tax: createTaxService(),
      currencies: createCurrenciesService(),
      auditConfiguration: createAuditConfigurationService(),
      documentConfiguration: createDocumentConfigurationService(),
    }),
    []
  );

  return <GovernanceContext.Provider value={services}>{children}</GovernanceContext.Provider>;
}

export function useGovernance(): GovernanceServices {
  const ctx = useContext(GovernanceContext);
  if (!ctx) {
    throw new Error(
      'useGovernance() was called outside a <GovernanceProvider>. As of Phase G3.1, ' +
      '<GovernanceProvider> is not mounted anywhere in the app — this is expected ' +
      'until a future migration phase wires it in.'
    );
  }
  return ctx;
}
