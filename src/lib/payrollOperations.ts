/**
 * Payroll mutations routed through the BOE Command Dispatcher.
 * Business logic remains in the payroll edge function.
 */

import { supabase } from '../integrations/supabase/client';
import { parsePayrollFunctionError } from './utils';
import { dispatchBusinessCommandOrThrow } from './boe/dispatchers/commandDispatcher';
import { BUSINESS_COMMAND_VERSION } from './boe/commandTypes';
import type { CompanyRole } from './boe/executionContract';
import type { QueryClient } from '@tanstack/react-query';

/**
 * On a non-2xx response, supabase-js (@supabase/functions-js) throws a
 * FunctionsHttpError and returns { data: null, error }, placing the actual
 * response body on error.context (a Response). Read it so the payroll edge
 * function's structured { error, stage, code, recovery } payload reaches the
 * caller instead of the generic "Edge Function returned a non-2xx status code".
 */
async function readFunctionErrorBody(error: unknown): Promise<unknown> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      return await context.clone().json();
    } catch {
      return null;
    }
  }
  return null;
}

export async function invokePayroll<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('payroll', { body });
  if (error) {
    const payload = await readFunctionErrorBody(error);
    // Diagnostic: toasts auto-dismiss, so log the full structured edge-function
    // error (stage/code/recovery) to the console for the failing method.
    console.error('[payroll] edge function error', {
      method: body?.method,
      payload,
      fallback: error.message,
    });
    throw new Error(parsePayrollFunctionError(payload, error.message));
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    throw new Error(parsePayrollFunctionError(data, (data as { error: string }).error));
  }
  return data as T;
}

export type PayrollCommandInput<T> = {
  commandName: string;
  outcomeEventId: string;
  companyId: string;
  userId?: string;
  userRole?: CompanyRole;
  entityId?: string;
  metadata?: Record<string, unknown>;
  executor: () => Promise<T>;
  resolveEntityId?: (result: T) => string | undefined;
};

export async function executePayrollCommand<T>(input: PayrollCommandInput<T>) {
  const result = await dispatchBusinessCommandOrThrow({
    commandId: crypto.randomUUID(),
    commandName: input.commandName,
    commandVersion: BUSINESS_COMMAND_VERSION,
    timestamp: new Date().toISOString(),
    companyId: input.companyId,
    userId: input.userId,
    userRole: input.userRole,
    payload: {},
    outcomeEventId: input.outcomeEventId,
    entityType: 'payroll_run',
    entityId: input.entityId,
    metadata: input.metadata,
    executor: input.executor,
    resolveEntityId: input.resolveEntityId,
  });

  if (result.subscriberWarnings.length > 0) {
    console.warn('[payroll] subscriber warnings', result.subscriberWarnings);
  }

  return result;
}

export function invalidatePayrollQueries(
  queryClient: QueryClient,
  companyId: string,
  runId?: string,
  extraKeys: readonly unknown[][] = []
) {
  if (runId) {
    queryClient.invalidateQueries({ queryKey: ['payroll_run_detail', runId] });
    queryClient.invalidateQueries({ queryKey: ['payroll_run_summary', runId] });
  }
  queryClient.invalidateQueries({ queryKey: ['payroll_runs', companyId] });
  queryClient.invalidateQueries({ queryKey: ['payroll_workspace', companyId] });
  queryClient.invalidateQueries({ queryKey: ['dashboardData', companyId] });
  for (const key of extraKeys) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}
