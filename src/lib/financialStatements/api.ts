import { supabase } from '../../integrations/supabase/client';
import {
  SESSION_EXPIRED_MESSAGE,
  authorizationHeaderFromSession,
  ensureSessionForInvoke,
} from '../auth/ensureSessionForInvoke';
import { parsePlatformErrorEnvelope } from '../platform/platformError';

/**
 * On non-2xx, supabase-js returns FunctionsHttpError with the JSON body on
 * error.context (Response). Surface the platform envelope instead of the
 * generic "Edge Function returned a non-2xx status code" / "Bad Request".
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
  if (context && typeof context === 'object' && !('ok' in (context as object))) {
    return context;
  }
  return null;
}

function isAuthFailure(payload: unknown, fallback: string): boolean {
  const text = [
    fallback,
    typeof payload === 'string' ? payload : '',
    payload && typeof payload === 'object'
      ? JSON.stringify(payload)
      : '',
  ]
    .join(' ')
    .toLowerCase();

  return (
    text.includes('not authenticated') ||
    text.includes('authentication') ||
    text.includes('jwt') ||
    text.includes('session has expired') ||
    text.includes('invalid token') ||
    text.includes('authentication_failed')
  );
}

function toReadableError(payload: unknown, fallback: string): Error {
  if (isAuthFailure(payload, fallback)) {
    return new Error(SESSION_EXPIRED_MESSAGE);
  }

  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  if (
    raw &&
    (raw.code === 'EFS_V161_DEPLOYMENT_BLOCKED' ||
      raw.deploymentStatus === 'NOT READY' ||
      raw.readiness === 'BLOCKED')
  ) {
    const technical =
      (typeof raw.technicalMessage === 'string' && raw.technicalMessage) ||
      (typeof raw.error === 'string' && raw.error) ||
      fallback;
    const err = new Error(technical) as Error & {
      code?: string;
      deploymentReport?: unknown;
    };
    err.code = 'EFS_V161_DEPLOYMENT_BLOCKED';
    err.deploymentReport = raw.deploymentReport ?? raw;
    return err;
  }

  const err = parsePlatformErrorEnvelope(payload, 'efs:client');
  if (err.envelope.category === 'AuthenticationError') {
    return new Error(SESSION_EXPIRED_MESSAGE);
  }

  const business = err.envelope.businessMessage || fallback;
  const technical = err.envelope.technicalMessage;

  if (technical && /not authenticated|jwt|session/i.test(technical)) {
    return new Error(SESSION_EXPIRED_MESSAGE);
  }

  // Prefer the edge validation / technical message over generic HTTP labels.
  if (technical && technical.trim() && technical !== business) {
    if (/^bad request$/i.test(technical) || /unknown error/i.test(technical)) {
      return new Error(business !== technical ? business : SESSION_EXPIRED_MESSAGE);
    }
    return new Error(technical);
  }

  if (
    !business ||
    /^bad request$/i.test(business) ||
    /non-2xx/i.test(business) ||
    /unknown error/i.test(business)
  ) {
    return new Error(technical && !/^bad request$/i.test(technical) ? technical : 'Request failed');
  }

  return new Error(business);
}

export async function invokeFinancialStatements<T = unknown>(
  companyId: string,
  method: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const body = { method, company_id: companyId, ...payload };

  // STEP 2–3: prove session, refresh once, then attach user JWT explicitly.
  const session = await ensureSessionForInvoke();
  const authHeaders = authorizationHeaderFromSession(session);

  // Opt-in request trace. Default off in DEV and production so the browser
  // console stays clean; enable with VITE_DEBUG_EFS=true when diagnosing invokes.
  if (import.meta.env.VITE_DEBUG_EFS === 'true') {
    console.info('[efs] invoke request', {
      httpMethod: 'POST',
      function: 'financial-statements',
      queryParams: null,
      headers: {
        authorization: 'Bearer <present>',
        apikey: 'anon',
        'content-type': 'application/json',
      },
      body,
      authenticatedUser: session.user?.id ?? null,
      company_id: companyId,
      snapshot_version_id: (payload.snapshot_version_id as string | undefined) ?? null,
      snapshot_id: (payload.snapshot_id as string | undefined) ?? null,
      workspace_id: (payload.workspace_id as string | undefined) ?? null,
      financial_year_id: (payload.financial_year_id as string | undefined) ?? null,
      period_id:
        (payload.reporting_period_id as string | undefined) ??
        (payload.period_id as string | undefined) ??
        null,
      expires_at: session.expires_at ?? null,
      access_token: true,
      refresh_token: Boolean(session.refresh_token),
    });
  }

  if (method === 'EXTRACT_FACT_SNAPSHOT' && !payload.snapshot_version_id) {
    throw new Error(
      'snapshot_version_id is required before EXTRACT_FACT_SNAPSHOT.',
    );
  }

  const invokeOnce = () =>
    supabase.functions.invoke('financial-statements', {
      body,
      headers: authHeaders,
    });

  let invokeResult = await invokeOnce();
  let { data, error } = invokeResult;
  let response = (invokeResult as { response?: Response }).response;

  // One retry after forced refresh if the edge still rejects auth.
  if (error) {
    let envelope = await readFunctionErrorBody(error);
    if (!envelope && response instanceof Response) {
      try {
        envelope = await response.clone().json();
      } catch {
        envelope = null;
      }
    }

    const httpStatus =
      response?.status ?? (error as { context?: Response }).context?.status ?? null;

    if (httpStatus === 401 || isAuthFailure(envelope, error.message)) {
      if (import.meta.env.DEV) {
        console.warn('[efs] auth rejected by edge — refreshing session and retrying once');
      }
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session?.access_token) {
        invokeResult = await supabase.functions.invoke('financial-statements', {
          body,
          headers: authorizationHeaderFromSession(refreshed.session),
        });
        data = invokeResult.data;
        error = invokeResult.error;
        response = (invokeResult as { response?: Response }).response;
      }
    }
  }

  if (error) {
    let envelope = await readFunctionErrorBody(error);
    if (!envelope && response instanceof Response) {
      try {
        envelope = await response.clone().json();
      } catch {
        envelope = null;
      }
    }
    if (import.meta.env.DEV) {
      console.error('[efs] invoke failure', {
        method,
        company_id: companyId,
        workspace_id: payload.workspace_id ?? null,
        financial_year_id: payload.financial_year_id ?? null,
        httpStatus: response?.status ?? (error as { context?: Response }).context?.status ?? null,
        envelope,
        fallback: error.message,
        access_token_attached: true,
      });
    }
    throw toReadableError(envelope ?? error, error.message || 'Financial Statements request failed');
  }

  if (data?.error) {
    throw toReadableError(data, typeof data.error === 'string' ? data.error : 'Request failed');
  }
  if (data?.platformError) {
    throw toReadableError(data, data.platformError?.message || data.message || 'Platform error');
  }

  return data as T;
}

export type EfsWorkspaceListItem = {
  id: string;
  name: string;
  status: string;
  progress_pct: number;
  updated_at: string;
  efs_reporting_periods?: {
    id: string;
    period_key: string;
    label: string;
    start_date: string;
    end_date: string;
    status: string;
    financial_year_id?: string | null;
  };
  efs_reporting_entities?: { id: string; name: string };
  efs_framework_bindings?: {
    id: string;
    efs_framework_packs?: {
      id: string;
      framework_key: string;
      version_id: string;
      label: string;
      efs_frameworks?: { name: string };
    };
  };
};

export type EfsDashboard = {
  workspace: {
    id: string;
    name: string;
    status: string;
    progress_pct: number;
  };
  reportingPeriod: {
    id: string;
    label: string;
    period_key: string;
    start_date: string;
    end_date: string;
    status: string;
    financial_year_id?: string | null;
    calendar_bound?: boolean;
    year_code?: string | null;
  } | null;
  framework: {
    id: string;
    framework_key: string;
    version_id: string;
    label: string;
    efs_frameworks?: { framework_key: string; name: string };
  } | null;
  snapshot: {
    id: string;
    status: string;
    currentVersion: {
      id: string;
      version_no: number;
      status: string;
      content_hash: string | null;
      certified_at: string | null;
      frozen_at: string | null;
    } | null;
  } | null;
  progress: { pct: number; stage: string };
  outstandingTasks: { count: number; items: unknown[]; note: string };
  validationSummary: { pass: number; fail: number; advisory: number; note: string };
  reviewStatus: { manager: string; partner: string; note: string };
  publicationStatus: { status: string; note: string };
  recentActivity: Array<{
    id: string;
    event_type: string;
    message: string;
    created_at: string;
  }>;
  phase: string;
  statementPreparationEnabled: boolean;
};

export type EfsStatementLine = {
  line_code: string;
  label: string;
  section: string;
  amount: number;
  /** Comparative (prior-period) amount when two-year presentation is available. */
  prior_amount?: number | null;
  /** Display note number / cross-reference shown in the Note column. */
  note_ref?: string | number | null;
  is_total?: boolean;
  /** Section banner — label only, no amount (e.g. "Assets", "Equity and liabilities"). */
  is_header?: boolean;
  /** Class sub-heading — bold label, no amount (e.g. "Non-current assets"). */
  is_subheader?: boolean;
  /** Grand total — double underline treatment. */
  is_grand_total?: boolean;
  accounts?: Array<{ id?: string | null; name: string; type?: string; amount: number }>;
};

export type EfsStatementInstance = {
  id: string;
  statement_type: string;
  title: string;
  content_hash: string;
  generated_at: string;
  provenance?: { live_gl?: boolean; content_hash?: string; fact_snapshot_id?: string };
  lines: EfsStatementLine[];
};

/** Workspace General Information — experience-layer metadata */
export type EfsWorkspaceGeneralInformation = {
  id?: string;
  company_id?: string;
  workspace_id?: string;
  registered_name?: string | null;
  trading_name?: string | null;
  registration_number?: string | null;
  vat_number?: string | null;
  income_tax_number?: string | null;
  financial_year_end?: string | null;
  comparative_period?: string | null;
  functional_currency?: string | null;
  approval_date?: string | null;
  authorisation_date?: string | null;
  business_address?: string | null;
  postal_address?: string | null;
  contact_information?: string | null;
  nature_of_business?: string | null;
  reporting_currency?: string | null;
  reporting_framework?: string | null;
  auditor?: string | null;
  prepared_by?: string | null;
  reviewed_by?: string | null;
  approved_by?: string | null;
  directors?: Array<{
    name?: string;
    role?: string;
    appointment_date?: string | null;
    resignation_date?: string | null;
    executive?: boolean;
    non_executive?: boolean;
    independent?: boolean;
    chairperson?: boolean;
  }>;
  company_secretary?: string | null;
  registered_office?: string | null;
  physical_address?: string | null;
  website?: string | null;
  email?: string | null;
  telephone?: string | null;
  share_information?: Record<string, unknown>;
  principal_bankers?: Array<{
    name?: string;
    bank_name?: string;
    branch?: string;
    branch_code?: string;
    account_type?: string;
    swift?: string;
    iban?: string;
    active?: boolean;
  }>;
  /** Engagement assurance classification — drives level of assurance automatically. */
  engagement_type?: 'audit' | 'independent_review' | 'compilation' | 'internal' | 'unaudited' | null;
  independent_reviewer?: string | null;
  accounting_officer?: string | null;
  partner?: string | null;
  issue_date?: string | null;
  country_of_incorporation?: string | null;
  entity_type?: string | null;
  paye_number?: string | null;
  sdl_number?: string | null;
  uif_number?: string | null;
  custom_tax_registrations?: Array<{ label?: string; number?: string }>;
  compilation_engagement?: boolean | null;
  created_at?: string;
  updated_at?: string;
};

/** Pre-refactor alias — dashboard and orchestrator */
export type EfsEngagementGeneralInformation = EfsWorkspaceGeneralInformation;

export type EfsPeriod = {
  id: string;
  period_key: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
  /** G3.6D — Enterprise Financial Calendar year this period consumes (when bound). */
  financial_year_id?: string | null;
};

export type EfsFrameworkPack = {
  id: string;
  framework_key: string;
  version_id: string;
  label: string;
  efs_frameworks?: { name?: string; framework_key?: string };
};

export type EfsFinancialStatementsHome = {
  company_id: string;
  company_name: string | null;
  financial_year: {
    id: string;
    year_code: string;
    start_date: string;
    end_date: string;
    status: string;
  } | null;
  workspace_id: string | null;
  workspace_exists: boolean;
  reporting_framework: string | null;
  status: string | null;
  progress_pct: number | null;
  prepared_by: string | null;
  last_updated: string | null;
};

export type EfsEnsureWorkspaceResult = {
  workspace: EfsWorkspaceListItem;
  created: boolean;
};

export async function getFinancialStatementsHome(
  companyId: string,
  financialYearId?: string,
): Promise<EfsFinancialStatementsHome> {
  return invokeFinancialStatements(companyId, 'GET_FINANCIAL_STATEMENTS_HOME', {
    ...(financialYearId ? { financial_year_id: financialYearId } : {}),
  });
}

export async function ensureWorkspaceForFinancialYear(
  companyId: string,
  financialYearId: string,
  frameworkPackId?: string,
): Promise<EfsEnsureWorkspaceResult> {
  return invokeFinancialStatements(companyId, 'ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR', {
    financial_year_id: financialYearId,
    ...(frameworkPackId ? { framework_pack_id: frameworkPackId } : {}),
  });
}

export async function getWorkspaceByFinancialYear(
  companyId: string,
  financialYearId: string,
): Promise<EfsWorkspaceListItem> {
  return invokeFinancialStatements(companyId, 'GET_WORKSPACE_BY_FINANCIAL_YEAR', {
    financial_year_id: financialYearId,
  });
}

export type MigrateLegacyReportingPeriodResult = {
  workspace_id: string;
  mode: 'create_and_link' | 'link_existing';
  reporting_period: Record<string, unknown>;
  financial_year: {
    id: string;
    year_code: string;
    start_date: string;
    end_date: string;
    status: string;
  };
  note: string;
};

/** Explicit legacy → calendar migration. Never auto-invoked. */
export async function migrateLegacyReportingPeriod(
  companyId: string,
  args: {
    workspaceId: string;
    mode: 'create_and_link' | 'link_existing';
    financialYearId?: string;
  },
): Promise<MigrateLegacyReportingPeriodResult> {
  return invokeFinancialStatements(companyId, 'MIGRATE_LEGACY_REPORTING_PERIOD', {
    workspace_id: args.workspaceId,
    mode: args.mode,
    ...(args.financialYearId ? { financial_year_id: args.financialYearId } : {}),
  });
}
