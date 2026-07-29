// Governance Foundation — feature flags (Phase G3.1 scaffold; G3.2–G3.6 activations).
//
// Domains defaulted false until an explicit production migration activates them.
// Flipping a flag here is itself a migration decision — not a side effect of
// the file existing. Inactive domain services throw via assertGovernanceDomainActive.

export const GOVERNANCE_FEATURE_FLAGS = {
  // Activated in Phase G3.2 — the first production migration. Financial
  // Years, Accounting Periods, and Financial Calendar close/reopen actions
  // now flow through src/governance/domains/financialCalendar exclusively.
  financialCalendar: true,
  // Activated in Phase G3.3 — the second production migration. Company
  // profile mutations (CompanySettings) and the full Company Master Data
  // read/write path (directors, governance, officers, addresses, tax
  // registrations, company profile, principal bankers — consumed by the
  // Financial Statements engine) now flow through their Governance services.
  company: true,
  corporateGovernance: true,
  // Activated in Phase G3.4 — the third production migration. Accounting
  // Policies (Materiality, implicit currency/inventory/reporting defaults,
  // tax_rates.is_default pass-through, and EFS narrative accounting-policy
  // set access) now flow through the Governance Accounting Policies Service.
  // Depreciation / Default GL Accounts remain explicit stubs (no company-wide
  // SoT). Tax and Currencies *domains* stay dormant — only defaults surface here.
  accountingPolicies: true,
  // Phase G3.5 (fourth production migration) completes remaining consumers of
  // the four active domains above (Company CREATE, Financial Calendar closed
  // years + FY profile writes). No additional domains are activated here.
  //
  // Activated in Phase G3.6 — the fifth production migration. Team-member
  // read/role/remove (TeamMembersSettings + teamMembersQuery) now flow through
  // the Governance Security Service. Centralized permission evaluators are
  // NOT invented here — role gates elsewhere remain as documented debt until
  // a future phase adds an allow/deny API without changing outcomes.
  security: true,
  workflow: false,
  tax: false,
  currencies: false,
  auditConfiguration: false,
  documentConfiguration: false,
} as const;

export type GovernanceDomainName = keyof typeof GOVERNANCE_FEATURE_FLAGS;

export function isGovernanceDomainActive(domain: GovernanceDomainName): boolean {
  return GOVERNANCE_FEATURE_FLAGS[domain];
}

// Every domain service guards its methods with this so that if something
// calls a Governance service before its domain is migrated, it fails loudly
// and immediately instead of silently running business logic in parallel
// with the existing implementation it is meant to eventually replace.
export function assertGovernanceDomainActive(domain: GovernanceDomainName): void {
  if (!isGovernanceDomainActive(domain)) {
    throw new Error(
      `Governance Foundation: the "${domain}" domain is not yet active. ` +
      `This is expected in Phase G3.1 — no consumer should be calling this ` +
      `service until a future migration phase enables it.`
    );
  }
}
