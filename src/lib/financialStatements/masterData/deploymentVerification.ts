/**
 * V16.1 — Enterprise Deployment Verification (shared contract).
 *
 * Company Master Data must never be fabricated when schema is missing.
 * Missing infrastructure yields an explicit deployment failure.
 */

export const V161_DEPLOYMENT_VERSION = '16.1';

export const V161_REQUIRED_TABLE = 'public.efs_company_master_data';

export const V161_REQUIRED_MIGRATIONS = [
  '20260721120000_efs_v161_company_master_data.sql',
  '20260721130000_efs_v161_legacy_master_data_migration.sql',
] as const;

export const V161_REQUIRED_COLUMNS = [
  'id',
  'company_id',
  'company_profile',
  'addresses',
  'tax_registrations',
  'directors',
  'governance',
  'officers',
  'principal_bankers',
  'created_at',
  'updated_at',
  'legacy_migration_completed_at',
] as const;

export const V161_REQUIRED_INDEXES = ['idx_efs_company_master_data_company'] as const;

export const V161_REQUIRED_CONSTRAINTS = [
  'efs_company_master_data_pkey',
  'efs_company_master_data_company_id_key',
  'efs_company_master_data_company_id_fkey',
] as const;

export const V161_REQUIRED_EDGE_METHODS = [
  'GET_COMPANY_MASTER_DATA',
  'UPSERT_COMPANY_MASTER_DATA_MODULE',
  'GET_WORKSPACE_GENERAL_INFORMATION',
  'VERIFY_V161_DEPLOYMENT',
] as const;

export type DeploymentCheckStatus = 'PASS' | 'FAIL' | 'SKIP';

export type DeploymentCheck = {
  id: string;
  category: 'table' | 'column' | 'index' | 'constraint' | 'rpc' | 'edge_method';
  name: string;
  status: DeploymentCheckStatus;
  detail?: string;
  requiredMigration?: string;
};

export type DeploymentReadinessReport = {
  version: typeof V161_DEPLOYMENT_VERSION;
  deploymentStatus: 'READY' | 'NOT READY';
  readiness: 'PASS' | 'FAIL' | 'BLOCKED';
  reason: string | null;
  requiredMigrations: string[];
  checks: DeploymentCheck[];
  edgeFunctionVersion: string;
  verifiedAt: string;
  companyId?: string | null;
};

export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  if (e.code === 'PGRST205') return true;
  const msg = String(e.message ?? '');
  return msg.includes('Could not find the table') || msg.includes('schema cache');
}

export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  if (e.code === 'PGRST204') return true;
  const msg = String(e.message ?? '').toLowerCase();
  return msg.includes('column') && (msg.includes('does not exist') || msg.includes('could not find'));
}

export function formatDeploymentBlockedMessage(report: DeploymentReadinessReport): string {
  const failed = report.checks.filter((c) => c.status === 'FAIL');
  const primary = failed[0];
  const reasonLines = primary
    ? [
        primary.category === 'table' ? `Missing table:\n${primary.name}` : `Missing ${primary.category}:\n${primary.name}`,
        primary.detail || '',
      ].filter(Boolean)
    : [report.reason || 'Version 16.1 infrastructure is incomplete'];

  const migration =
    primary?.requiredMigration ||
    report.requiredMigrations[0] ||
    V161_REQUIRED_MIGRATIONS[0];

  return [
    'Deployment Status',
    'NOT READY',
    '',
    'Reason',
    reasonLines.join('\n'),
    '',
    'Required migration:',
    migration,
    '',
    'Status',
    'BLOCKED',
  ].join('\n');
}

export function buildBlockedReport(opts: {
  checks: DeploymentCheck[];
  edgeFunctionVersion: string;
  companyId?: string | null;
  reason?: string;
}): DeploymentReadinessReport {
  const failed = opts.checks.filter((c) => c.status === 'FAIL');
  const reason =
    opts.reason ||
    (failed[0]
      ? `Missing ${failed[0].category}: ${failed[0].name}`
      : 'Version 16.1 prerequisites not met');
  return {
    version: V161_DEPLOYMENT_VERSION,
    deploymentStatus: 'NOT READY',
    readiness: 'BLOCKED',
    reason,
    requiredMigrations: [...V161_REQUIRED_MIGRATIONS],
    checks: opts.checks,
    edgeFunctionVersion: opts.edgeFunctionVersion,
    verifiedAt: new Date().toISOString(),
    companyId: opts.companyId ?? null,
  };
}

export function buildReadyReport(opts: {
  checks: DeploymentCheck[];
  edgeFunctionVersion: string;
  companyId?: string | null;
}): DeploymentReadinessReport {
  return {
    version: V161_DEPLOYMENT_VERSION,
    deploymentStatus: 'READY',
    readiness: 'PASS',
    reason: null,
    requiredMigrations: [...V161_REQUIRED_MIGRATIONS],
    checks: opts.checks,
    edgeFunctionVersion: opts.edgeFunctionVersion,
    verifiedAt: new Date().toISOString(),
    companyId: opts.companyId ?? null,
  };
}

export class V161DeploymentError extends Error {
  readonly report: DeploymentReadinessReport;
  readonly code = 'EFS_V161_DEPLOYMENT_BLOCKED';

  constructor(report: DeploymentReadinessReport) {
    super(formatDeploymentBlockedMessage(report));
    this.name = 'V161DeploymentError';
    this.report = report;
  }
}
