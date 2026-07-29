/**
 * Platform Diagnostics Service — continuous self-check of platform health.
 */

import { supabase } from '../../integrations/supabase/client';
import { getSubscribers } from '../boe/subscribers/registry';
import { getRecentCommandLogs } from './observability';
import { createCorrelationId, PlatformError } from './platformError';

export type DiagnosticStatus = 'healthy' | 'warning' | 'critical';

export type DiagnosticCheck = {
  id: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
  latencyMs?: number;
  correlationId: string;
  checkedAt: string;
};

export type PlatformDiagnosticsReport = {
  overall: DiagnosticStatus;
  correlationId: string;
  checkedAt: string;
  checks: DiagnosticCheck[];
};

async function timedCheck(
  id: string,
  label: string,
  fn: () => Promise<{ status: DiagnosticStatus; message: string }>,
): Promise<DiagnosticCheck> {
  const correlationId = createCorrelationId('diag');
  const started = performance.now();
  try {
    const result = await fn();
    return {
      id,
      label,
      ...result,
      latencyMs: Math.round(performance.now() - started),
      correlationId,
      checkedAt: new Date().toISOString(),
    };
  } catch (cause) {
    const err = PlatformError.fromUnknown(cause, { correlationId });
    return {
      id,
      label,
      status: 'critical',
      message: err.envelope.businessMessage,
      latencyMs: Math.round(performance.now() - started),
      correlationId,
      checkedAt: new Date().toISOString(),
    };
  }
}

function worstStatus(checks: DiagnosticCheck[]): DiagnosticStatus {
  if (checks.some((c) => c.status === 'critical')) return 'critical';
  if (checks.some((c) => c.status === 'warning')) return 'warning';
  return 'healthy';
}

export async function runPlatformDiagnostics(companyId?: string): Promise<PlatformDiagnosticsReport> {
  const correlationId = createCorrelationId('diag-run');
  const checks: DiagnosticCheck[] = [];

  checks.push(
    await timedCheck('supabase_connectivity', 'Supabase connectivity', async () => {
      const { error } = await supabase.from('companies').select('id').limit(1);
      if (error) return { status: 'critical', message: error.message };
      return { status: 'healthy', message: 'Database reachable' };
    }),
  );

  checks.push(
    await timedCheck('authentication', 'Authentication session', async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) return { status: 'critical', message: error.message };
      if (!data.session) return { status: 'warning', message: 'No active session' };
      return { status: 'healthy', message: 'Session valid' };
    }),
  );

  checks.push(
    await timedCheck('storage', 'Storage availability', async () => {
      const { data, error } = await supabase.storage.listBuckets();
      if (error) return { status: 'warning', message: error.message };
      return { status: 'healthy', message: `${data?.length ?? 0} bucket(s) accessible` };
    }),
  );

  if (companyId) {
    checks.push(
      await timedCheck('edge_functions', 'Edge Functions (settings)', async () => {
        const { data, error } = await supabase.functions.invoke('settings', {
          body: { method: 'GET', company_id: companyId },
        });
        if (error) return { status: 'critical', message: error.message };
        if (data && typeof data === 'object' && 'error' in data) {
          return { status: 'critical', message: String((data as { error: string }).error) };
        }
        return { status: 'healthy', message: 'Settings edge function responding' };
      }),
    );

    checks.push(
      await timedCheck('payroll', 'Payroll availability', async () => {
        const { data, error } = await supabase.functions.invoke('payroll', {
          body: { method: 'GET_RUNS', company_id: companyId },
        });
        if (error) return { status: 'critical', message: error.message };
        if (data && typeof data === 'object' && 'error' in data) {
          return { status: 'critical', message: String((data as { error: string }).error) };
        }
        return { status: 'healthy', message: 'Payroll edge function responding' };
      }),
    );

    checks.push(
      await timedCheck('employees', 'Employee Identity availability', async () => {
        const { data, error } = await supabase.functions.invoke('employees', {
          body: { method: 'GET', company_id: companyId },
        });
        if (error) return { status: 'critical', message: error.message };
        if (data && typeof data === 'object' && 'error' in data) {
          return { status: 'critical', message: String((data as { error: string }).error) };
        }
        return { status: 'healthy', message: 'Employees edge function responding' };
      }),
    );

    checks.push(
      await timedCheck('reports', 'Report generation availability', async () => {
        const { data, error } = await supabase.functions.invoke('reports', {
          body: { method: 'GET_INVENTORY_VALUATION', company_id: companyId },
        });
        if (error) return { status: 'warning', message: error.message };
        if (data && typeof data === 'object' && 'error' in data) {
          return { status: 'warning', message: String((data as { error: string }).error) };
        }
        return { status: 'healthy', message: 'Reports edge function responding' };
      }),
    );
  }

  const subscriberCount = getSubscribers().length;
  checks.push({
    id: 'subscribers',
    label: 'BOE Subscribers',
    status: subscriberCount >= 7 ? 'healthy' : 'warning',
    message: `${subscriberCount} subscriber(s) registered`,
    correlationId: createCorrelationId('diag'),
    checkedAt: new Date().toISOString(),
  });

  const recentFailures = getRecentCommandLogs(20).filter((l) => l.phase === 'failed');
  checks.push({
    id: 'boe_commands',
    label: 'BOE Command health',
    status: recentFailures.length > 5 ? 'warning' : 'healthy',
    message:
      recentFailures.length > 0
        ? `${recentFailures.length} recent command failure(s) in session`
        : 'No recent command failures',
    correlationId: createCorrelationId('diag'),
    checkedAt: new Date().toISOString(),
  });

  return {
    overall: worstStatus(checks),
    correlationId,
    checkedAt: new Date().toISOString(),
    checks,
  };
}
