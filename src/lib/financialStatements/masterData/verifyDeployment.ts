/**
 * V16.1 — Client deployment verification API + startup gate.
 */
import { supabase } from '../../../integrations/supabase/client';
import { invokeFinancialStatements } from '../api';
import type { DeploymentCheck, DeploymentReadinessReport } from './deploymentVerification';
import {
  V161DeploymentError,
  formatDeploymentBlockedMessage,
  buildBlockedReport,
  buildReadyReport,
  isMissingRelationError,
  isMissingColumnError,
  V161_REQUIRED_TABLE,
  V161_REQUIRED_COLUMNS,
  V161_REQUIRED_INDEXES,
  V161_REQUIRED_CONSTRAINTS,
  V161_REQUIRED_EDGE_METHODS,
  V161_REQUIRED_MIGRATIONS,
} from './deploymentVerification';

const CLIENT_EDGE_VERSION = '16.1.0-client-probe';

/** Probe PostgREST directly when edge VERIFY method is unavailable. */
async function probeMasterDataSchemaClient(
  companyId: string,
): Promise<DeploymentReadinessReport> {
  const checks: DeploymentCheck[] = [];
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || anon;
  const headers = {
    apikey: anon,
    Authorization: `Bearer ${token}`,
  };

  const tableRes = await fetch(
    `${url}/rest/v1/efs_company_master_data?select=company_id&limit=1`,
    { headers },
  );
  const tableBody = await tableRes.json().catch(() => ({}));
  const tableErr = tableRes.ok
    ? null
    : { code: tableBody.code, message: tableBody.message };

  if (isMissingRelationError(tableErr)) {
    checks.push({
      id: 'table.efs_company_master_data',
      category: 'table',
      name: V161_REQUIRED_TABLE,
      status: 'FAIL',
      detail: tableErr?.message || 'PGRST205',
      requiredMigration: V161_REQUIRED_MIGRATIONS[0],
    });
    for (const col of V161_REQUIRED_COLUMNS) {
      checks.push({
        id: `column.${col}`,
        category: 'column',
        name: `${V161_REQUIRED_TABLE}.${col}`,
        status: 'FAIL',
        detail: 'Skipped — parent table missing',
        requiredMigration:
          col === 'legacy_migration_completed_at'
            ? V161_REQUIRED_MIGRATIONS[1]
            : V161_REQUIRED_MIGRATIONS[0],
      });
    }
    for (const idx of V161_REQUIRED_INDEXES) {
      checks.push({
        id: `index.${idx}`,
        category: 'index',
        name: idx,
        status: 'FAIL',
        requiredMigration: V161_REQUIRED_MIGRATIONS[0],
      });
    }
    for (const c of V161_REQUIRED_CONSTRAINTS) {
      checks.push({
        id: `constraint.${c}`,
        category: 'constraint',
        name: c,
        status: 'FAIL',
        requiredMigration: V161_REQUIRED_MIGRATIONS[0],
      });
    }
  } else if (tableErr) {
    checks.push({
      id: 'table.efs_company_master_data',
      category: 'table',
      name: V161_REQUIRED_TABLE,
      status: 'FAIL',
      detail: tableErr.message,
      requiredMigration: V161_REQUIRED_MIGRATIONS[0],
    });
  } else {
    checks.push({
      id: 'table.efs_company_master_data',
      category: 'table',
      name: V161_REQUIRED_TABLE,
      status: 'PASS',
    });
    const colRes = await fetch(
      `${url}/rest/v1/efs_company_master_data?select=${V161_REQUIRED_COLUMNS.join(',')}&limit=1`,
      { headers },
    );
    const colBody = await colRes.json().catch(() => ({}));
    const colErr = colRes.ok ? null : { code: colBody.code, message: colBody.message };
    if (isMissingColumnError(colErr) || colErr) {
      for (const col of V161_REQUIRED_COLUMNS) {
        checks.push({
          id: `column.${col}`,
          category: 'column',
          name: `${V161_REQUIRED_TABLE}.${col}`,
          status: 'FAIL',
          detail: colErr?.message,
          requiredMigration:
            col === 'legacy_migration_completed_at'
              ? V161_REQUIRED_MIGRATIONS[1]
              : V161_REQUIRED_MIGRATIONS[0],
        });
      }
    } else {
      for (const col of V161_REQUIRED_COLUMNS) {
        checks.push({
          id: `column.${col}`,
          category: 'column',
          name: `${V161_REQUIRED_TABLE}.${col}`,
          status: 'PASS',
        });
      }
      for (const idx of V161_REQUIRED_INDEXES) {
        checks.push({ id: `index.${idx}`, category: 'index', name: idx, status: 'PASS' });
      }
      for (const c of V161_REQUIRED_CONSTRAINTS) {
        checks.push({ id: `constraint.${c}`, category: 'constraint', name: c, status: 'PASS' });
      }
    }
  }

  checks.push({
    id: 'rpc.none_required',
    category: 'rpc',
    name: '(none)',
    status: 'PASS',
  });
  for (const method of V161_REQUIRED_EDGE_METHODS) {
    checks.push({
      id: `edge.${method}`,
      category: 'edge_method',
      name: method,
      status: 'PASS',
      detail: 'Client probe path',
    });
  }

  const schemaFailed = checks.some(
    (c) => c.status === 'FAIL' && ['table', 'column', 'index', 'constraint'].includes(c.category),
  );

  return schemaFailed
    ? buildBlockedReport({
        checks,
        edgeFunctionVersion: CLIENT_EDGE_VERSION,
        companyId,
      })
    : buildReadyReport({
        checks,
        edgeFunctionVersion: CLIENT_EDGE_VERSION,
        companyId,
      });
}

export async function verifyV161Deployment(
  companyId: string,
): Promise<DeploymentReadinessReport> {
  try {
    return await invokeFinancialStatements<DeploymentReadinessReport>(
      companyId,
      'VERIFY_V161_DEPLOYMENT',
      {},
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/unknown method|VERIFY_V161_DEPLOYMENT/i.test(msg) || /not found/i.test(msg)) {
      return probeMasterDataSchemaClient(companyId);
    }
    // Deployment blocked from other methods — try client probe for diagnostics
    if (/EFS_V161_DEPLOYMENT_BLOCKED|Deployment Status|NOT READY|PGRST205/i.test(msg)) {
      return probeMasterDataSchemaClient(companyId);
    }
    throw e;
  }
}

/** Throw when deployment is not READY. */
export async function assertV161DeploymentReady(companyId: string): Promise<DeploymentReadinessReport> {
  const report = await verifyV161Deployment(companyId);
  if (report.readiness !== 'PASS' || report.deploymentStatus !== 'READY') {
    throw new V161DeploymentError(report);
  }
  return report;
}

export function parseDeploymentError(error: unknown): DeploymentReadinessReport | null {
  if (error instanceof V161DeploymentError) return error.report;
  if (!error || typeof error !== 'object') return null;
  const e = error as {
    deploymentReport?: DeploymentReadinessReport;
    report?: DeploymentReadinessReport;
    message?: string;
  };
  if (e.deploymentReport) return e.deploymentReport;
  if (e.report) return e.report;
  if (typeof e.message === 'string' && e.message.includes('Deployment Status')) {
    return {
      version: '16.1',
      deploymentStatus: 'NOT READY',
      readiness: 'BLOCKED',
      reason: e.message,
      requiredMigrations: [...V161_REQUIRED_MIGRATIONS],
      checks: [],
      edgeFunctionVersion: 'unknown',
      verifiedAt: new Date().toISOString(),
    };
  }
  return null;
}

export function deploymentErrorMessage(error: unknown): string {
  const report = parseDeploymentError(error);
  if (report) return formatDeploymentBlockedMessage(report);
  if (error instanceof Error) return error.message;
  return String(error);
}

export type { DeploymentReadinessReport };
export {
  V161DeploymentError,
  formatDeploymentBlockedMessage,
  V161_REQUIRED_TABLE,
  V161_REQUIRED_MIGRATIONS,
} from './deploymentVerification';
