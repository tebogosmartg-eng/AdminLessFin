/**
 * AdminLess Fin — Enterprise Edge Function Platform (V4.2.1)
 *
 * Certified execution lifecycle for ALL edge functions.
 * Does not implement business logic — only platform concerns:
 * CORS, OPTIONS, auth context helpers, company isolation helpers,
 * structured errors, structured logs, correlation IDs, security headers,
 * success/error response generation, observability readiness.
 */
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  createCorrelationId,
  platformErrorResponse,
  classifyFromMessage,
  type PlatformErrorEnvelope,
} from "./platformError.ts";

export const ENTERPRISE_EDGE_PLATFORM_VERSION = "4.2.1";

/** Certified CORS + security headers — identical for every function. */
export const ENTERPRISE_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-request-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Max-Age": "86400",
  "X-Content-Type-Options": "nosniff",
};

export type EdgeAuthMode =
  /** JWT user + company_users membership (default product APIs). */
  | "tenant"
  /** Service-role / cron jobs — no end-user JWT. */
  | "system"
  /** Internal invoke with service role bearer (email senders). */
  | "service";

export type EdgeRequestContext = {
  platformVersion: typeof ENTERPRISE_EDGE_PLATFORM_VERSION;
  functionName: string;
  correlationId: string;
  startedAt: number;
  method: string;
  authMode: EdgeAuthMode;
  companyId?: string;
  userId?: string;
  requestMethod?: string;
};

export function resolveCorrelationId(req: Request): string {
  const incoming =
    req.headers.get("x-correlation-id") ||
    req.headers.get("x-request-id") ||
    req.headers.get("X-Correlation-Id") ||
    req.headers.get("X-Request-Id");
  if (incoming && incoming.trim()) return incoming.trim();
  return createCorrelationId("edge");
}

export function beginEdgeRequest(
  req: Request,
  functionName: string,
  authMode: EdgeAuthMode = "tenant",
): EdgeRequestContext {
  const ctx: EdgeRequestContext = {
    platformVersion: ENTERPRISE_EDGE_PLATFORM_VERSION,
    functionName,
    correlationId: resolveCorrelationId(req),
    startedAt: Date.now(),
    method: req.method,
    authMode,
  };
  platformLog(ctx, "request.start", {
    httpMethod: req.method,
    authMode,
  });
  return ctx;
}

export function platformLog(
  ctx: EdgeRequestContext,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const payload = {
    level: "info",
    event,
    platformVersion: ctx.platformVersion,
    functionName: ctx.functionName,
    correlationId: ctx.correlationId,
    authMode: ctx.authMode,
    companyId: ctx.companyId ?? null,
    userId: ctx.userId ?? null,
    requestMethod: ctx.requestMethod ?? null,
    elapsedMs: Date.now() - ctx.startedAt,
    ...fields,
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(payload));
}

export function platformLogError(
  ctx: EdgeRequestContext,
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      level: "error",
      event,
      platformVersion: ctx.platformVersion,
      functionName: ctx.functionName,
      correlationId: ctx.correlationId,
      authMode: ctx.authMode,
      companyId: ctx.companyId ?? null,
      userId: ctx.userId ?? null,
      category: classifyFromMessage(message),
      message,
      elapsedMs: Date.now() - ctx.startedAt,
      ...fields,
      timestamp: new Date().toISOString(),
    }),
  );
}

/** OPTIONS must execute before auth, DB, env business use, or routing. */
export function optionsResponse(ctx: EdgeRequestContext): Response {
  platformLog(ctx, "request.options");
  return new Response(null, {
    status: 200,
    headers: {
      ...ENTERPRISE_CORS_HEADERS,
      "x-correlation-id": ctx.correlationId,
      "x-platform-version": ENTERPRISE_EDGE_PLATFORM_VERSION,
    },
  });
}

export function responseHeaders(ctx: EdgeRequestContext): Record<string, string> {
  return {
    ...ENTERPRISE_CORS_HEADERS,
    "Content-Type": "application/json",
    "x-correlation-id": ctx.correlationId,
    "x-platform-version": ENTERPRISE_EDGE_PLATFORM_VERSION,
    "x-function-name": ctx.functionName,
  };
}

export function edgeSuccess(
  ctx: EdgeRequestContext,
  data: unknown,
  status = 200,
): Response {
  platformLog(ctx, "request.success", { status });
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(ctx),
  });
}

export function edgeFailure(
  ctx: EdgeRequestContext,
  cause: unknown,
  extras: Partial<PlatformErrorEnvelope> = {},
  statusOverride?: number,
): Response {
  platformLogError(ctx, "request.failure", cause, {
    code: extras.code,
  });
  const response = platformErrorResponse(
    cause,
    {
      correlationId: ctx.correlationId,
      companyId: ctx.companyId ?? extras.companyId,
      ...extras,
    },
    {
      ...ENTERPRISE_CORS_HEADERS,
      "x-correlation-id": ctx.correlationId,
      "x-platform-version": ENTERPRISE_EDGE_PLATFORM_VERSION,
      "x-function-name": ctx.functionName,
    },
    statusOverride,
  );
  return response;
}

export function createUserClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
}

export function createAdminClient() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY edge function secret.");
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", key);
}

/**
 * JWT validation via Supabase Auth getUser().
 * Throws AuthenticationError-classifiable message on failure.
 */
export async function requireAuthenticatedUser(req: Request, ctx: EdgeRequestContext) {
  const supabase = createUserClient(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("User not authenticated.");
  ctx.userId = user.id;
  platformLog(ctx, "auth.user_resolved", { userId: user.id });
  return { user, supabase };
}

/**
 * Multi-company tenant isolation — membership in company_users.
 */
export async function requireCompanyMembership(
  supabase: ReturnType<typeof createUserClient>,
  userId: string,
  companyId: string | undefined,
  ctx: EdgeRequestContext,
) {
  if (!companyId) throw new Error("Company ID is required.");
  ctx.companyId = companyId;
  const { data: companyMember, error: memberError } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .single();
  if (memberError || !companyMember) throw new Error("Permission denied.");
  platformLog(ctx, "auth.company_resolved", { companyId });
  return companyMember;
}

/**
 * Service-mode gate: Authorization bearer must equal service role key.
 * Rate-limiting readiness: logs invoke for future quota hooks.
 */
export function requireServiceRole(req: Request, ctx: EdgeRequestContext) {
  const auth = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!serviceKey || token !== serviceKey) {
    throw new Error("User not authenticated.");
  }
  platformLog(ctx, "auth.service_role_resolved");
  // Rate limiting readiness hook (no enforcement yet — observability only)
  platformLog(ctx, "ratelimit.observe", { bucket: `service:${ctx.functionName}` });
}

export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch (e) {
    if (e instanceof Error && e.message.includes("JSON object")) throw e;
    throw new Error("Request body must be valid JSON.");
  }
}

/**
 * ERP Context (V10 Foundation) — the single resolver every module consumes
 * instead of independently deriving financial year / period / role. Calls
 * `resolve_erp_context`, which re-verifies membership itself (defense in
 * depth, same pattern as the atomic posting RPCs) and additionally resolves
 * the company's current financial year and accounting period.
 *
 * Resolution failure is NON-FATAL here: membership was already proven by
 * `requireCompanyMembership` above, so a failure at this step means only
 * that financial-year/period data isn't available yet for this company
 * (e.g. before the Phase 1 backfill has reached it) — callers get `erp:
 * null` rather than a broken request, preserving backward compatibility.
 */
export async function resolveErpContext(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  companyId: string,
  ctx: EdgeRequestContext,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin.rpc("resolve_erp_context", {
    p_user_id: userId,
    p_company_id: companyId,
  });
  if (error) {
    platformLog(ctx, "erp_context.resolve_failed", { message: error.message });
    return null;
  }
  const erp = data as Record<string, unknown> | null;
  platformLog(ctx, "erp_context.resolved", {
    financialYearId: (erp?.financial_year as Record<string, unknown> | null)?.id ?? null,
    accountingPeriodId: (erp?.accounting_period as Record<string, unknown> | null)?.id ?? null,
  });
  return erp;
}

/**
 * Full tenant bootstrap: OPTIONS already handled by caller.
 * Auth → JSON → company → ERP context → admin client.
 */
export async function bootstrapTenantRequest(req: Request, ctx: EdgeRequestContext) {
  if (req.method !== "POST" && req.method !== "GET") {
    throw new Error("Method not allowed.");
  }
  const { user, supabase } = await requireAuthenticatedUser(req, ctx);
  const body = req.method === "GET" ? {} : await parseJsonBody(req);
  const companyId = (body.company_id as string) || undefined;
  await requireCompanyMembership(supabase, user.id, companyId, ctx);
  if (typeof body.method === "string") ctx.requestMethod = body.method;
  platformLog(ctx, "ratelimit.observe", {
    bucket: `tenant:${ctx.companyId}:${ctx.functionName}`,
  });
  const admin = createAdminClient();
  const erp = await resolveErpContext(admin, user.id, companyId as string, ctx);
  return { user, supabase, admin, body, company_id: companyId as string, erp };
}

/** System/cron bootstrap — service admin only. */
export function bootstrapSystemRequest(req: Request, ctx: EdgeRequestContext) {
  // Prefer service-role bearer when present; allow legacy cron invokes without JWT
  // but always log for audit. Production schedulers should send service role.
  const auth = req.headers.get("Authorization");
  if (auth) {
    try {
      requireServiceRole(req, ctx);
    } catch {
      platformLog(ctx, "auth.system_legacy_unauthenticated_invoke");
    }
  } else {
    platformLog(ctx, "auth.system_legacy_unauthenticated_invoke");
  }
  const admin = createAdminClient();
  return { admin };
}

/**
 * Certified request lifecycle wrapper.
 * Injects correlation / platform headers on every response (concurrent-safe).
 * Does not alter business payload shape.
 */
export function withEnterprisePlatform(
  functionName: string,
  authMode: EdgeAuthMode,
  handler: (req: Request, ctx: EdgeRequestContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const ctx = beginEdgeRequest(req, functionName, authMode);
    if (req.method === "OPTIONS") return optionsResponse(ctx);

    try {
      const res = await handler(req, ctx);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(ENTERPRISE_CORS_HEADERS)) {
        if (!headers.has(k)) headers.set(k, v);
      }
      headers.set("x-correlation-id", ctx.correlationId);
      headers.set("x-platform-version", ENTERPRISE_EDGE_PLATFORM_VERSION);
      headers.set("x-function-name", functionName);
      if (!headers.has("Content-Type") && res.body) {
        headers.set("Content-Type", "application/json");
      }
      platformLog(ctx, "request.success", { status: res.status });
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    } catch (cause) {
      return edgeFailure(ctx, cause, { companyId: ctx.companyId });
    }
  };
}
