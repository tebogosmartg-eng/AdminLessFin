// ERP Phase 3 — Accounting Policy Engine domain model (preventive governance).
// Health detects. Policy prevents.

export type PolicySeverity = 'information' | 'warning' | 'error' | 'blocking';

export type PolicyType = 'system' | 'company' | 'industry';

export type PolicyDomainKey =
  | 'chart_of_accounts'
  | 'general_ledger'
  | 'journal_entries'
  | 'banking'
  | 'tax'
  | 'payroll'
  | 'assets'
  | 'inventory'
  | 'financial_statements';

export const POLICY_DOMAIN_ORDER: PolicyDomainKey[] = [
  'chart_of_accounts',
  'general_ledger',
  'journal_entries',
  'banking',
  'tax',
  'payroll',
  'assets',
  'inventory',
  'financial_statements',
];

export const POLICY_DOMAIN_LABELS: Record<PolicyDomainKey, string> = {
  chart_of_accounts: 'Chart of Accounts',
  general_ledger: 'General Ledger',
  journal_entries: 'Journal Entries',
  banking: 'Banking',
  tax: 'Tax',
  payroll: 'Payroll',
  assets: 'Assets',
  inventory: 'Inventory',
  financial_statements: 'Financial Statements',
};

export type PolicyDefinition = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  domain: PolicyDomainKey;
  policyType: PolicyType;
  defaultSeverity: PolicySeverity;
  isMandatory: boolean;
  industryTemplate: string | null;
  enabled: boolean;
  severityOverride: PolicySeverity | null;
};

export type PolicyViolation = {
  code: string;
  name: string;
  domain: PolicyDomainKey;
  severity: PolicySeverity;
  message: string;
  overridden?: boolean;
};

export type PolicyEvaluationResult = {
  passed: PolicyViolation[];
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
  blocking: boolean;
  evaluatedAt: string;
};

export type PolicyAuditEntry = {
  id: string;
  policyCode: string;
  policyName: string;
  result: 'passed' | 'violation' | 'override';
  severity: PolicySeverity | null;
  message: string | null;
  userId: string | null;
  module: string | null;
  reason: string | null;
  createdAt: string;
};

export type AccountingPolicyDashboard = {
  totalPolicies: number;
  enabledPolicies: number;
  passedCount: number;
  violationCount: number;
  overrideCount: number;
  recentViolations: PolicyAuditEntry[];
  recentOverrides: PolicyAuditEntry[];
  policiesByDomain: Record<PolicyDomainKey, number>;
  evaluatedAt: string;
};
