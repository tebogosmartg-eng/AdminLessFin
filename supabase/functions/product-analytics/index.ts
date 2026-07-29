// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from "../_shared/enterpriseEdgePlatform.ts";

const corsHeaders = ENTERPRISE_CORS_HEADERS;

function parseAllowlist(): Set<string> {
  const raw =
    Deno.env.get("BETA_ANALYTICS_ALLOWLIST") ||
    Deno.env.get("VITE_BETA_ANALYTICS_ALLOWLIST") ||
    "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isBetaAnalyticsAdmin(email: string | undefined): boolean {
  if (!email) return false;
  const allow = parseAllowlist();
  if (allow.size === 0) return false;
  return allow.has(email.toLowerCase());
}

serve(
  withEnterprisePlatform("product-analytics", "tenant", async (req, ctx) => {
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated.");

      const body = await req.json();
      const { method } = body;

      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
      const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey);

      if (method === "TRACK") {
        const events = body.events;
        if (!Array.isArray(events) || events.length === 0) {
          throw new Error("events array is required.");
        }
        if (events.length > 50) throw new Error("Maximum 50 events per batch.");

        const rows = events.map((e: Record<string, unknown>) => ({
          event_name: String(e.event_name || "unknown"),
          event_category: String(e.event_category || "journey"),
          user_id: user.id,
          company_id: e.company_id || null,
          session_id: e.session_id || null,
          route: e.route || null,
          module: e.module || null,
          duration_ms: typeof e.duration_ms === "number" ? e.duration_ms : null,
          properties: e.properties && typeof e.properties === "object" ? e.properties : {},
          created_at: e.created_at || new Date().toISOString(),
        }));

        const { error } = await admin.from("product_analytics_events").insert(rows);
        if (error) throw error;

        return new Response(JSON.stringify({ tracked: rows.length }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (method === "GET_BETA_DASHBOARD") {
        if (!isBetaAnalyticsAdmin(user.email)) {
          throw new Error("Permission denied: beta analytics admin required.");
        }

        const days = Math.min(Number(body.days) || 30, 90);
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceIso = since.toISOString();

        const { data: events, error: evErr } = await admin
          .from("product_analytics_events")
          .select(
            "id, created_at, event_name, event_category, user_id, company_id, session_id, route, module, duration_ms, properties",
          )
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(10000);

        if (evErr) throw evErr;
        const all = events || [];

        const { data: readinessRows } = await admin
          .from("accounting_readiness")
          .select("company_id, status, accounting_ready, updated_at");

        const { data: companies } = await admin.from("companies").select("id, name, created_at");

        const companyNameById = new Map((companies || []).map((c) => [c.id, c.name]));
        const readinessByCompany = new Map((readinessRows || []).map((r) => [r.company_id, r]));

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const activeCompanyIds = new Set(
          all.filter((e) => e.company_id && new Date(e.created_at) >= sevenDaysAgo).map((e) => e.company_id),
        );

        const today = new Date().toISOString().slice(0, 10);
        const dauToday = new Set(
          all.filter((e) => e.user_id && String(e.created_at).startsWith(today)).map((e) => e.user_id),
        );

        const dauByDay: Record<string, number> = {};
        for (const e of all) {
          if (!e.user_id) continue;
          const day = String(e.created_at).slice(0, 10);
          if (!dauByDay[day]) dauByDay[day] = 0;
        }
        for (const e of all) {
          if (!e.user_id) continue;
          const day = String(e.created_at).slice(0, 10);
          dauByDay[day] = new Set(
            all.filter((x) => x.user_id && String(x.created_at).startsWith(day)).map((x) => x.user_id),
          ).size;
        }

        const accountingReadyCompanies = new Set(
          all.filter((e) => e.event_name === "setup.accounting_ready").map((e) => e.company_id),
        );

        const notReadyCompanies = (companies || [])
          .filter((c) => {
            const r = readinessByCompany.get(c.id);
            return !r?.accounting_ready && !accountingReadyCompanies.has(c.id);
          })
          .map((c) => ({
            id: c.id,
            name: c.name,
            status: readinessByCompany.get(c.id)?.status ?? "NOT_STARTED",
            created_at: c.created_at,
          }));

        const errorCounts: Record<string, number> = {};
        const moduleErrorCounts: Record<string, number> = {};
        for (const e of all.filter((x) => x.event_category === "error")) {
          errorCounts[e.event_name] = (errorCounts[e.event_name] || 0) + 1;
          const mod = e.module || "unknown";
          moduleErrorCounts[mod] = (moduleErrorCounts[mod] || 0) + 1;
        }

        const validationFailureCounts: Record<string, number> = {};
        for (const e of all.filter(
          (x) => x.event_name === "setup.validation_failed" || x.event_name === "error.validation_failure",
        )) {
          const errors = (e.properties as { errors?: string[] })?.errors || [];
          for (const msg of errors) {
            validationFailureCounts[msg] = (validationFailureCounts[msg] || 0) + 1;
          }
          if (errors.length === 0 && (e.properties as { message?: string })?.message) {
            const msg = (e.properties as { message: string }).message;
            validationFailureCounts[msg] = (validationFailureCounts[msg] || 0) + 1;
          }
        }

        const dropoffCounts: Record<string, number> = {};
        for (const e of all.filter(
          (x) => x.event_name === "setup.abandoned" || x.event_name === "journey.dropoff",
        )) {
          const step = (e.properties as { step?: string })?.step || "unknown";
          dropoffCounts[step] = (dropoffCounts[step] || 0) + 1;
        }

        const onboardingFunnel = {
          setup_started: all.filter((e) => e.event_name === "setup.started").length,
          financial_year: all.filter((e) => e.event_name === "setup.financial_year_configured").length,
          coa_generated: all.filter((e) => e.event_name === "setup.coa_generated").length,
          tax_configured: all.filter((e) => e.event_name === "setup.tax_configured").length,
          opening_balances: all.filter((e) => e.event_name === "setup.opening_balances_completed").length,
          accounting_ready: all.filter((e) => e.event_name === "setup.accounting_ready").length,
        };

        const firstUsage = {
          first_customer: all.filter((e) => e.event_name === "usage.first_customer").length,
          first_supplier: all.filter((e) => e.event_name === "usage.first_supplier").length,
          first_invoice: all.filter((e) => e.event_name === "usage.first_invoice").length,
          first_bill: all.filter((e) => e.event_name === "usage.first_bill").length,
          first_journal: all.filter((e) => e.event_name === "usage.first_journal").length,
          first_trial_balance: all.filter((e) => e.event_name === "usage.first_trial_balance").length,
          first_financial_statements: all.filter((e) => e.event_name === "usage.first_financial_statements")
            .length,
        };

        const avgStepDurations: Record<string, { count: number; totalMs: number }> = {};
        for (const e of all.filter((x) => x.event_name === "journey.step_completed" && x.duration_ms)) {
          const step = (e.properties as { step?: string })?.step || "unknown";
          if (!avgStepDurations[step]) avgStepDurations[step] = { count: 0, totalMs: 0 };
          avgStepDurations[step].count += 1;
          avgStepDurations[step].totalMs += e.duration_ms;
        }

        const stepCompletionAverages = Object.fromEntries(
          Object.entries(avgStepDurations).map(([step, v]) => [
            step,
            Math.round(v.totalMs / v.count),
          ]),
        );

        const betaCompanies = (companies || []).map((c) => ({
          id: c.id,
          name: c.name,
          created_at: c.created_at,
          accounting_ready: readinessByCompany.get(c.id)?.accounting_ready ?? false,
          status: readinessByCompany.get(c.id)?.status ?? "NOT_STARTED",
          active_last_7d: activeCompanyIds.has(c.id),
        }));

        return new Response(
          JSON.stringify({
            period_days: days,
            generated_at: new Date().toISOString(),
            summary: {
              total_events: all.length,
              active_beta_companies_7d: activeCompanyIds.size,
              total_companies: (companies || []).length,
              accounting_ready_count: (readinessRows || []).filter((r) => r.accounting_ready).length,
              not_accounting_ready_count: notReadyCompanies.length,
              dau_today: dauToday.size,
              failed_onboarding_attempts: all.filter((e) => e.event_name === "setup.validation_failed")
                .length,
            },
            dau_by_day: dauByDay,
            onboarding_funnel: onboardingFunnel,
            first_usage: firstUsage,
            not_ready_companies: notReadyCompanies.slice(0, 50),
            beta_companies: betaCompanies,
            most_common_errors: Object.entries(errorCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([name, count]) => ({ event_name: name, count })),
            errors_by_module: Object.entries(moduleErrorCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([module, count]) => ({ module, count })),
            most_common_validation_failures: Object.entries(validationFailureCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([message, count]) => ({ message, count })),
            dropoff_by_step: Object.entries(dropoffCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([step, count]) => ({ step, count })),
            step_completion_avg_ms: stepCompletionAverages,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      throw new Error(`Unknown method: ${method}`);
    } catch (error) {
      return edgeFailure(ctx, error);
    }
  }),
);
