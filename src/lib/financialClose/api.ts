import { supabase } from '../../integrations/supabase/client';
import {
  SESSION_EXPIRED_MESSAGE,
  authorizationHeaderFromSession,
  ensureSessionForInvoke,
} from '../auth/ensureSessionForInvoke';
import { parsePlatformErrorEnvelope } from '../platform/platformError';

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

function toReadableError(payload: unknown, fallback: string): Error {
  const err = parsePlatformErrorEnvelope(payload, 'efcp:client');
  if (
    err.envelope.category === 'AuthenticationError' ||
    /not authenticated|jwt|session/i.test(
      `${err.envelope.technicalMessage} ${err.envelope.businessMessage} ${fallback}`,
    )
  ) {
    return new Error(SESSION_EXPIRED_MESSAGE);
  }
  const business = err.envelope.businessMessage || fallback;
  const technical = err.envelope.technicalMessage;
  if (technical && technical !== business && !/^bad request$/i.test(technical)) {
    return new Error(technical);
  }
  if (!business || /^bad request$/i.test(business) || /non-2xx/i.test(business)) {
    return new Error(technical || 'Request failed');
  }
  return new Error(business);
}

export async function invokeFinancialClose<T = unknown>(
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const session = await ensureSessionForInvoke();
  const { data, error } = await supabase.functions.invoke('financial-close', {
    body: { method, company_id: companyId, ...payload },
    headers: authorizationHeaderFromSession(session),
  });

  if (error) {
    const body = await readFunctionErrorBody(error);
    throw toReadableError(body ?? error, error.message || 'Financial Close request failed');
  }
  if (data?.error) {
    throw toReadableError(data, typeof data.error === 'string' ? data.error : 'Request failed');
  }
  if (data?.platformError) {
    throw toReadableError(data, data.platformError?.message || data.message || 'Platform error');
  }
  return data as T;
}

export type EfcpCloseType = 'month_end' | 'quarter_end' | 'year_end';

export type EfcpPeriodStatus =
  | 'open'
  | 'soft_closed'
  | 'manager_approved'
  | 'partner_approved'
  | 'locked';

export type EfcpCloseWorkspace = {
  id: string;
  close_type: EfcpCloseType;
  label: string;
  start_date: string;
  end_date: string;
  period_status: EfcpPeriodStatus;
  created_at: string;
  updated_at: string;
};

export type EfcpCloseItemStatus =
  | 'ready'
  | 'in_progress'
  | 'outstanding'
  | 'overdue'
  | 'completed';

export type EfcpCloseItem = {
  id: string;
  close_workspace_id: string;
  item_key: string;
  title: string;
  category: 'reconciliation' | 'review' | 'evidence';
  mandatory: boolean;
  status: EfcpCloseItemStatus;
  prepared_by: string | null;
  reviewed_by: string | null;
  completed_at: string | null;
  due_date: string | null;
  outstanding_issues: string | null;
  sort_order: number;
};

export type EfcpApproval = {
  id: string;
  approval_role: 'manager' | 'partner';
  decision: 'approved' | 'rejected';
  decided_by_name: string | null;
  note: string | null;
  decided_at: string;
};

export type EfcpActivity = {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
  efcp_close_workspaces?: { label: string; close_type: string };
};

export type EfcpReadiness = {
  components: {
    general_ledger: number;
    reconciliations: number;
    supporting_evidence: number;
    journal_review: number;
    validation: number;
    management_approval: number;
  };
  overall: number;
  mandatory_total: number;
  mandatory_complete: number;
  manager_approved: boolean;
  partner_approved: boolean;
  ready_for_financial_statements: boolean;
};

export type EfcpSignals = {
  unreconciled_items: number;
  journals_in_period: number;
  assets_tracked: number;
  loans_tracked: number;
  payroll_runs_in_period: number;
  open_critical_validation_issues: number;
};

export type EfcpCloseDashboard = {
  workspace: EfcpCloseWorkspace;
  items: EfcpCloseItem[];
  approvals: EfcpApproval[];
  activity: EfcpActivity[];
  signals: EfcpSignals;
  readiness: EfcpReadiness;
};

export type EfcpPeriodReadiness = {
  close_exists: boolean;
  close_workspace_id?: string;
  period_status: EfcpPeriodStatus | 'open';
  ready_for_financial_statements: boolean;
  readiness?: EfcpReadiness;
  latest_journal_at: string | null;
};
