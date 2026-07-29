// ERP Phase 2 — Accounting Health domain model (advisory).
// Health ≠ Readiness. Health never blocks posting.

export type HealthSeverity = 'info' | 'warning' | 'critical';

export type HealthDomainKey =
  | 'chart_of_accounts'
  | 'general_ledger'
  | 'financial_statements'
  | 'tax'
  | 'banking'
  | 'payroll'
  | 'assets'
  | 'double_entry';

export const HEALTH_DOMAIN_ORDER: HealthDomainKey[] = [
  'chart_of_accounts',
  'general_ledger',
  'financial_statements',
  'tax',
  'banking',
  'payroll',
  'assets',
  'double_entry',
];

export const HEALTH_DOMAIN_LABELS: Record<HealthDomainKey, string> = {
  chart_of_accounts: 'Chart of Accounts',
  general_ledger: 'General Ledger',
  financial_statements: 'Financial Statements',
  tax: 'Tax',
  banking: 'Banking',
  payroll: 'Payroll',
  assets: 'Assets',
  double_entry: 'Double Entry',
};

export type HealthFinding = {
  id: string;
  domain: HealthDomainKey;
  severity: HealthSeverity;
  code: string;
  message: string;
  recommendation: string;
  accountId?: string;
  accountName?: string;
};

export type HealthDomainScore = {
  domain: HealthDomainKey;
  label: string;
  score: number;
  maxScore: number;
  percent: number;
  findings: HealthFinding[];
  applicable: boolean;
};

export type HealthStatus = 'Healthy' | 'Needs Attention' | 'Critical' | 'Not Assessed';

export type AccountingHealthReport = {
  overallScore: number;
  status: HealthStatus;
  domains: Record<HealthDomainKey, HealthDomainScore>;
  warnings: HealthFinding[];
  recommendations: string[];
  findingCount: { critical: number; warning: number; info: number };
  assessedAt: string;
};
