/**
 * V16.1 — Enterprise Deployment Verification regression suite.
 */
import { describe, expect, it } from 'vitest';
import {
  formatDeploymentBlockedMessage,
  buildBlockedReport,
  buildReadyReport,
  isMissingRelationError,
  isMissingColumnError,
  V161DeploymentError,
  V161_REQUIRED_TABLE,
  V161_REQUIRED_MIGRATIONS,
} from '../../src/lib/financialStatements/masterData/deploymentVerification';

describe('V16.1 — Deployment Verification', () => {
  it('detects PGRST205 missing relation', () => {
    expect(isMissingRelationError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(
      true,
    );
    expect(isMissingRelationError({ code: '42P01', message: 'other' })).toBe(false);
  });

  it('detects missing column errors', () => {
    expect(
      isMissingColumnError({
        code: 'PGRST204',
        message: 'Could not find the column',
      }),
    ).toBe(true);
  });

  it('formats structured deployment blocked message', () => {
    const report = buildBlockedReport({
      checks: [
        {
          id: 'table.efs_company_master_data',
          category: 'table',
          name: V161_REQUIRED_TABLE,
          status: 'FAIL',
          detail: 'PGRST205',
          requiredMigration: V161_REQUIRED_MIGRATIONS[0],
        },
      ],
      edgeFunctionVersion: '16.1.0-test',
      companyId: 'company-1',
    });
    const msg = formatDeploymentBlockedMessage(report);
    expect(msg).toContain('Deployment Status');
    expect(msg).toContain('NOT READY');
    expect(msg).toContain('Missing table:');
    expect(msg).toContain(V161_REQUIRED_TABLE);
    expect(msg).toContain(V161_REQUIRED_MIGRATIONS[0]);
    expect(msg).toContain('BLOCKED');
  });

  it('V161DeploymentError never fabricates master data', () => {
    const report = buildBlockedReport({
      checks: [
        {
          id: 'table.efs_company_master_data',
          category: 'table',
          name: V161_REQUIRED_TABLE,
          status: 'FAIL',
          requiredMigration: V161_REQUIRED_MIGRATIONS[0],
        },
      ],
      edgeFunctionVersion: '16.1.0-test',
    });
    const err = new V161DeploymentError(report);
    expect(err.code).toBe('EFS_V161_DEPLOYMENT_BLOCKED');
    expect(err.message).not.toMatch(/company_profile:\s*\{\}/);
    expect(err.report.deploymentStatus).toBe('NOT READY');
  });

  it('ready report passes certification gate', () => {
    const report = buildReadyReport({
      checks: [
        {
          id: 'table.efs_company_master_data',
          category: 'table',
          name: V161_REQUIRED_TABLE,
          status: 'PASS',
        },
      ],
      edgeFunctionVersion: '16.1.0-test',
    });
    expect(report.readiness).toBe('PASS');
    expect(report.deploymentStatus).toBe('READY');
  });
});
