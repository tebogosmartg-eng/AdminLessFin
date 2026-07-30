/**
 * Financial Statements API — AdminLess Fin V6.4.0–V6.4.6 / FRP V7.0.0
 *
 * Phase A: Workspace / Period / Framework / Snapshots
 * Phase B: Facts Adapter + Statement Engine (do not redesign)
 * Phase C1: Statement Structure / Disclosure scaffolds / Attachment points
 * Phase C2: Working Paper / Lead Schedule / Evidence / Review notes platform
 * Phase C3: Disclosure / Accounting Policy / Cross Reference / Framework Mapping
 * Phase D1: Technical + Framework Validation (defect identification — NOT approval)
 * Phase D2: Manager/Partner Review Workflow · Sign-off · Immutable history
 * Phase E: Enterprise Publication Platform (PDF / Word / Excel)
 * V6.6.1: Engagement General Information (additive experience layer only)
 * V7.0.0: Canonical Trial Balance + TB Import + Mapping Engine (additive FRP)
 *
 * Hard rules:
 *  - Statement generation NEVER reads live GL
 *  - Validation NEVER mutates financial data
 *  - Review NEVER changes accounting balances
 *  - Publication NEVER reads live GL / recalculates balances
 *  - Does NOT implement XBRL / AI
 *  - FRP converges native GL + imported TB into Canonical TB before fact seal
 */
// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from "../_shared/enterpriseEdgePlatform.ts";
import {
  adaptFinancialFacts,
  runStatementEngine,
} from "../_shared/efsStatementEngine/index.ts";
import { buildCanonicalFinancialAggregation } from "../_shared/canonicalFinancialAggregation.ts";
import {
  resolveStructureAttachmentPoint,
  appendReviewHistory,
  sha256Hex as wpSha256,
} from "../_shared/efsWorkingPaperPlatform/index.ts";
import {
  resolveNoteAttachmentPoint,
  ensureOpenNotePlaceholder,
  resolveCrossReferenceAttachmentPoint,
  resolveStructureNodeByCode,
  resolveDisclosureNodeByCode,
  sha256Hex as discSha256,
} from "../_shared/efsDisclosurePlatform/index.ts";
import {
  loadValidationContext,
  runTechnicalValidation,
  runFrameworkValidation,
  summarizeFindings,
} from "../_shared/efsValidationPlatform/index.ts";
import {
  assertTransition,
  appendPackReviewHistory,
  buildPackFingerprint,
  requireValidationReady,
  mapDecisionToStages,
  sha256Hex as reviewSha256,
} from "../_shared/efsReviewWorkflow/index.ts";
import {
  publicationEnabled,
  executePublication,
  getPublicationDashboard,
  renderArtifactBytes,
  bytesToBase64,
} from "../_shared/efsPublicationPlatform/index.ts";
import {
  frpEnabled,
  handleFrpMethod,
  sealNativeCanonicalTbAndProject,
} from "../_shared/efsFinancialReportingPlatform/handlers.ts";
import {
  hydrateWorkspaceFromMasterData,
  emptyMasterDataRow,
} from "../_shared/efsCorporateInformation/hydration.ts";
import {
  buildLegacyHydratedMasterRow,
  extractMasterDataFromEngagement,
  stripLegacyMasterFieldsFromEngagement,
} from "../_shared/efsCorporateInformation/legacyHydration.ts";
import {
  assertV161CompanyMasterDataReady,
  verifyV161CompanyMasterDataSchema,
  V161DeploymentError,
  EFS_V161_EDGE_FUNCTION_VERSION,
} from "../_shared/efsCorporateInformation/deploymentVerification.ts";

const corsHeaders = ENTERPRISE_CORS_HEADERS;

function flagsEnabled() {
  const master = (Deno.env.get("EFS_MODULE") ?? "false").toLowerCase() === "true";
  const silent = (Deno.env.get("EFCP_SILENT_BACKENDS") ?? "true").toLowerCase() === "true";
  // Phase A: backends may run when silent backends ON (lab) or master ON
  return master || silent;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function sha256Hex(payload) {
  const data = new TextEncoder().encode(typeof payload === "string" ? payload : JSON.stringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function writeAudit(admin, row) {
  await admin.from("efs_audit_events").insert(row);
}

async function writeActivity(admin, row) {
  await admin.from("efs_workspace_activity").insert(row);
}

/** PostgREST errors are plain objects — normalize so catch/platformError keep SQL details. */
function throwDbError(step, { table = null, rpc = null, payload = null, error, rows = null }) {
  const postgrest = error && typeof error === "object"
    ? {
      message: error.message ?? null,
      details: error.details ?? null,
      hint: error.hint ?? null,
      code: error.code ?? null,
    }
    : null;
  console.error({
    level: "error",
    step,
    table,
    rpc,
    payload,
    returnedRows: rows,
    returnedNull: rows == null,
    PostgrestError: postgrest,
    SQLSTATE: postgrest?.code ?? null,
    errorMessage: postgrest?.message ?? (error instanceof Error ? error.message : String(error)),
    stack: error instanceof Error ? error.stack : null,
  });
  if (error instanceof Error) throw error;
  const msg = [
    postgrest?.message || "Database error",
    postgrest?.details ? `DETAIL: ${postgrest.details}` : null,
    postgrest?.hint ? `HINT: ${postgrest.hint}` : null,
    postgrest?.code ? `code=${postgrest.code}` : null,
    table ? `table=${table}` : null,
    rpc ? `rpc=${rpc}` : null,
    `step=${step}`,
  ].filter(Boolean).join(" | ");
  const wrapped = new Error(msg);
  wrapped.cause = error;
  throw wrapped;
}

function logStep(step, fields = {}) {
  console.log(JSON.stringify({ level: "info", event: "CREATE_SNAPSHOT_DRAFT.step", step, ...fields, timestamp: new Date().toISOString() }));
}

function logDbResult(step, { table = null, rpc = null, data, error }) {
  const rowCount = Array.isArray(data) ? data.length : data == null ? 0 : 1;
  console.log(JSON.stringify({
    level: error ? "error" : "info",
    event: "CREATE_SNAPSHOT_DRAFT.db",
    step,
    table,
    rpc,
    returnedRows: rowCount,
    returnedNull: data == null,
    PostgrestError: error
      ? { message: error.message ?? null, details: error.details ?? null, hint: error.hint ?? null, code: error.code ?? null }
      : null,
    SQLSTATE: error?.code ?? null,
    errorMessage: error?.message ?? null,
    timestamp: new Date().toISOString(),
  }));
}

/** V16.1 — structured stage logging for corporate information / master data paths. */
function logStage(stage, fields = {}) {
  console.log(JSON.stringify({
    level: "info",
    event: "financial-statements.stage",
    stage,
    file: "financial-statements/index.ts",
    ...fields,
    timestamp: new Date().toISOString(),
  }));
}

function logStageError(stage, error, fields = {}) {
  console.error(JSON.stringify({
    level: "error",
    event: "financial-statements.stage.error",
    stage,
    file: "financial-statements/index.ts",
    errorMessage: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    originalError: error instanceof Error ? null : error,
    ...fields,
    timestamp: new Date().toISOString(),
  }));
}

/** PostgREST PGRST205 — relation not in schema cache (migration not applied). */
async function ensureDefaultEntity(admin, company_id, companyName) {
  const { data: existing } = await admin
    .from("efs_reporting_entities")
    .select("*")
    .eq("company_id", company_id)
    .eq("is_default", true)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await admin
    .from("efs_reporting_entities")
    .insert({
      company_id,
      name: companyName || "Reporting Entity",
      entity_type: "company",
      is_default: true,
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const WORKSPACE_SELECT = `
  *,
  efs_reporting_periods(*),
  efs_reporting_entities(*),
  efs_framework_bindings(
    *,
    efs_framework_packs(*, efs_frameworks(framework_key, name))
  )
`;

// A workspace reaches its financial year through its reporting period
// (efs_reporting_workspaces.reporting_period_id → efs_reporting_periods
// .financial_year_id, per the G3.6D binding). The workspace table itself carries
// no financial_year_id, so resolve the periods first and match on those.
async function findWorkspaceByFinancialYear(admin, company_id, financial_year_id) {
  const { data: periods, error: periodError } = await admin
    .from("efs_reporting_periods")
    .select("id")
    .eq("company_id", company_id)
    .eq("financial_year_id", financial_year_id);
  if (periodError) throw periodError;

  const periodIds = (periods ?? []).map((p) => p.id);
  if (periodIds.length === 0) return null;

  const { data, error } = await admin
    .from("efs_reporting_workspaces")
    .select(WORKSPACE_SELECT)
    .eq("company_id", company_id)
    .in("reporting_period_id", periodIds)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findOrCreateReportingPeriod(admin, company_id, entity, financial_year_id, user) {
  const { data: existing, error: existingErr } = await admin
    .from("efs_reporting_periods")
    .select("*")
    .eq("company_id", company_id)
    .eq("reporting_entity_id", entity.id)
    .eq("financial_year_id", financial_year_id)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) {
    // Keep snapshot metadata in lockstep with financial_years (label/dates never drift).
    return await syncReportingPeriodFromFinancialYear(admin, existing);
  }

  const { data: fy, error: fyErr } = await admin
    .from("financial_years")
    .select("id, year_code, start_date, end_date, company_id, status")
    .eq("id", financial_year_id)
    .eq("company_id", company_id)
    .maybeSingle();
  if (fyErr) throw fyErr;
  if (!fy) {
    throw new Error(
      "Financial Year not found in the Enterprise Financial Calendar for this company.",
    );
  }

  const { data, error } = await admin
    .from("efs_reporting_periods")
    .insert({
      company_id,
      reporting_entity_id: entity.id,
      financial_year_id: fy.id,
      period_key: fy.year_code,
      label: fy.year_code,
      start_date: fy.start_date,
      end_date: fy.end_date,
      status: "open_for_reporting",
      opened_by: user.id,
      opened_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: retry } = await admin
        .from("efs_reporting_periods")
        .select("*")
        .eq("company_id", company_id)
        .eq("reporting_entity_id", entity.id)
        .eq("financial_year_id", financial_year_id)
        .maybeSingle();
      if (retry) return await syncReportingPeriodFromFinancialYear(admin, retry);
    }
    throw error;
  }
  return data;
}

/**
 * Display identity = financial_years.year_code + dates. Frozen slash labels are rewritten.
 */
async function syncReportingPeriodFromFinancialYear(admin, period, fyRow = null) {
  if (!period) return null;
  let fy = fyRow;
  if (!fy && period.financial_year_id) {
    const { data, error } = await admin
      .from("financial_years")
      .select("id, year_code, start_date, end_date, status")
      .eq("id", period.financial_year_id)
      .maybeSingle();
    if (error) throw error;
    fy = data;
  }
  if (!fy) return { ...period, calendar_bound: false };

  const needsUpdate =
    period.financial_year_id !== fy.id ||
    period.period_key !== fy.year_code ||
    period.label !== fy.year_code ||
    period.start_date !== fy.start_date ||
    period.end_date !== fy.end_date;

  if (!needsUpdate) {
    return {
      ...period,
      financial_year_id: fy.id,
      period_key: fy.year_code,
      label: fy.year_code,
      start_date: fy.start_date,
      end_date: fy.end_date,
      calendar_bound: true,
      year_code: fy.year_code,
    };
  }

  const { data: updated, error: updErr } = await admin
    .from("efs_reporting_periods")
    .update({
      financial_year_id: fy.id,
      period_key: fy.year_code,
      label: fy.year_code,
      start_date: fy.start_date,
      end_date: fy.end_date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", period.id)
    .select()
    .single();
  if (updErr) {
    // Unique conflict: another period already owns this FY — return calendar overlay without persist.
    if (updErr.code === "23505") {
      return {
        ...period,
        financial_year_id: fy.id,
        period_key: fy.year_code,
        label: fy.year_code,
        start_date: fy.start_date,
        end_date: fy.end_date,
        calendar_bound: true,
        year_code: fy.year_code,
      };
    }
    throw updErr;
  }
  return {
    ...updated,
    calendar_bound: true,
    year_code: fy.year_code,
  };
}

/**
 * V3.6.10 / V3.6.11 — Reconcile efs_reporting_periods to Enterprise Financial Calendar.
 * Display identity = financial_years.year_code + dates when explicitly linked.
 * Frozen slash labels on bound periods are rewritten from the linked calendar year.
 *
 * Unbound legacy periods are NEVER auto-bound. Users must migrate explicitly via
 * MIGRATE_LEGACY_REPORTING_PERIOD (create matching FY, link existing, or keep legacy).
 */
async function reconcileReportingPeriodWithCalendar(admin, company_id, period, workspaceStatus) {
  if (!period) return null;

  // Bound by financial_year_id → sync label/dates from that calendar year only.
  if (period.financial_year_id) {
    const synced = await syncReportingPeriodFromFinancialYear(admin, period);
    if (synced?.calendar_bound) return synced;
    // Orphaned financial_year_id — leave for explicit migration.
    return { ...period, calendar_bound: false, legacy_unbound: true };
  }

  // Do not auto-bind unbound periods (including published/archived and drafts).
  void company_id;
  void workspaceStatus;
  return { ...period, calendar_bound: false, legacy_unbound: true };
}

/**
 * Explicit migration for legacy unbound reporting periods.
 * Creates or links Financial Year metadata only — never mutates journals or sealed packs.
 */
async function migrateLegacyReportingPeriod(admin, {
  company_id,
  workspace_id,
  mode,
  financial_year_id: linkYearId,
}) {
  if (!workspace_id) throw new Error("workspace_id is required.");
  if (!["create_and_link", "link_existing"].includes(mode)) {
    throw new Error("mode must be create_and_link or link_existing.");
  }

  const { data: workspace, error: wsErr } = await admin
    .from("efs_reporting_workspaces")
    .select("id, status, company_id, reporting_period_id, efs_reporting_periods(*)")
    .eq("id", workspace_id)
    .eq("company_id", company_id)
    .single();
  if (wsErr) throw wsErr;

  const sealed = ["published", "certified", "closed", "locked", "archived"].includes(
    String(workspace.status || ""),
  );
  if (sealed) {
    throw new Error(
      "Published and archived engagements are immutable and cannot be migrated. Their reporting period stays historically fixed.",
    );
  }

  const period = workspace.efs_reporting_periods;
  if (!period?.id) throw new Error("Engagement reporting period was not found.");
  if (period.financial_year_id) {
    const { data: existingFy } = await admin
      .from("financial_years")
      .select("id")
      .eq("id", period.financial_year_id)
      .maybeSingle();
    if (existingFy) {
      throw new Error("This engagement is already linked to the Enterprise Financial Calendar.");
    }
  }

  let fy = null;
  if (mode === "create_and_link") {
    if (!period.start_date || !period.end_date) {
      throw new Error("Engagement period dates are required to create a matching Financial Year.");
    }
    const year_code = `FY${String(period.end_date).slice(0, 4)}`;
    const { data: byDates } = await admin
      .from("financial_years")
      .select("id, year_code, start_date, end_date, status")
      .eq("company_id", company_id)
      .eq("start_date", period.start_date)
      .eq("end_date", period.end_date)
      .maybeSingle();
    if (byDates) {
      fy = byDates;
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("financial_years")
        .insert({
          company_id,
          year_code,
          start_date: period.start_date,
          end_date: period.end_date,
          status: "open",
        })
        .select("id, year_code, start_date, end_date, status")
        .single();
      if (insErr) {
        if (insErr.code === "23505") {
          const { data: retry } = await admin
            .from("financial_years")
            .select("id, year_code, start_date, end_date, status")
            .eq("company_id", company_id)
            .eq("start_date", period.start_date)
            .eq("end_date", period.end_date)
            .maybeSingle();
          if (!retry) throw insErr;
          fy = retry;
        } else {
          throw insErr;
        }
      } else {
        fy = inserted;
      }
    }
  } else {
    if (!linkYearId) throw new Error("financial_year_id is required for link_existing.");
    const { data: found, error: fyErr } = await admin
      .from("financial_years")
      .select("id, year_code, start_date, end_date, status")
      .eq("id", linkYearId)
      .eq("company_id", company_id)
      .maybeSingle();
    if (fyErr) throw fyErr;
    if (!found) {
      throw new Error("Financial Year not found in the Enterprise Financial Calendar for this company.");
    }
    fy = found;
  }

  const { data: conflict } = await admin
    .from("efs_reporting_periods")
    .select("id")
    .eq("company_id", company_id)
    .eq("reporting_entity_id", period.reporting_entity_id)
    .eq("financial_year_id", fy.id)
    .neq("id", period.id)
    .maybeSingle();
  if (conflict) {
    throw new Error(
      `Another engagement is already linked to Financial Year ${fy.year_code}. One workspace per Financial Year.`,
    );
  }

  const linked = await syncReportingPeriodFromFinancialYear(admin, period, fy);
  return {
    workspace_id,
    mode,
    reporting_period: linked,
    financial_year: fy,
    note: "Migration linked Financial Year metadata only. Journals and sealed publication artefacts were not modified.",
  };
}

async function resolveDefaultFrameworkPackId(admin, framework_pack_id) {
  if (framework_pack_id) return framework_pack_id;
  const { data: packs } = await admin
    .from("efs_framework_packs")
    .select("id")
    .order("label")
    .limit(1);
  return packs?.[0]?.id ?? null;
}

async function createWorkspaceInternal(
  admin,
  { company_id, companyName, entity, period, framework_pack_id, user },
) {
  let bindingId = null;
  const packId = await resolveDefaultFrameworkPackId(admin, framework_pack_id);
  if (packId) {
    const { data: binding, error: bErr } = await admin
      .from("efs_framework_bindings")
      .insert({
        company_id,
        reporting_entity_id: entity.id,
        framework_pack_id: packId,
        reporting_period_id: period.id,
        period_from: period.start_date,
        period_to: period.end_date,
        status: "active",
        bound_by: user.id,
      })
      .select()
      .single();
    if (bErr) throw bErr;
    bindingId = binding.id;
  }

  const name = `${period.label} Financial Statements`;
  const { data, error } = await admin
    .from("efs_reporting_workspaces")
    .insert({
      company_id,
      reporting_entity_id: entity.id,
      reporting_period_id: period.id,
      framework_binding_id: bindingId,
      name,
      status: "opened",
      progress_pct: 5,
      opened_by: user.id,
    })
    .select(WORKSPACE_SELECT)
    .single();
  if (error) {
    if (error.code === "23505") {
      const existing = await findWorkspaceByFinancialYear(
        admin,
        company_id,
        period.financial_year_id,
      );
      if (existing) return existing;
    }
    throw error;
  }

  await writeActivity(admin, {
    company_id,
    workspace_id: data.id,
    event_type: "workspace.opened",
    entity_type: "reporting_workspace",
    entity_id: data.id,
    actor_user_id: user.id,
    message: `Financial Statements workspace opened: ${name}`,
  });
  await writeAudit(admin, {
    company_id,
    entity_type: "reporting_workspace",
    entity_id: data.id,
    action: "create",
    actor_user_id: user.id,
    after_state: data,
  });
  return data;
}

async function ensureWorkspaceForFinancialYear(
  admin,
  company_id,
  company,
  financial_year_id,
  user,
  body,
) {
  let workspace = await findWorkspaceByFinancialYear(admin, company_id, financial_year_id);
  if (workspace) return { workspace, created: false };

  const entity = await ensureDefaultEntity(admin, company_id, company?.name);
  const period = await findOrCreateReportingPeriod(
    admin,
    company_id,
    entity,
    financial_year_id,
    user,
  );
  workspace = await createWorkspaceInternal(admin, {
    company_id,
    companyName: company?.name,
    entity,
    period,
    framework_pack_id: body.framework_pack_id ?? null,
    user,
  });
  return { workspace, created: true };
}

/**
 * V16.1 — One-time legacy engagement → company master data hydration.
 * Idempotent: skips when migration marker is set or master data already exists.
 */
async function ensureLegacyMasterDataMigration(
  admin,
  companyId,
  engagement,
) {
  await assertV161CompanyMasterDataReady(admin, companyId);

  const { data: master, error: masterErr } = await admin
    .from("efs_company_master_data")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (masterErr) throw masterErr;

  const hydratedRow = buildLegacyHydratedMasterRow(companyId, master, engagement);
  if (!hydratedRow) return master;

  logStage("Legacy Master Data Migration", {
    status: "start",
    company_id: companyId,
  });

  const { data, error } = await admin
    .from("efs_company_master_data")
    .upsert(hydratedRow, { onConflict: "company_id" })
    .select("*")
    .single();
  if (error) throw error;

  logStage("Legacy Master Data Migration", {
    status: "complete",
    company_id: companyId,
    entity_id: data.id,
  });
  return data;
}

/** Redirect deprecated master-data field writes to company master data. */
async function upsertMasterDataFromEngagementPayload(admin, companyId, info) {
  await assertV161CompanyMasterDataReady(admin, companyId);

  const extracted = extractMasterDataFromEngagement(info);
  const { data: existing, error: existingErr } = await admin
    .from("efs_company_master_data")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (existingErr) throw existingErr;

  const now = new Date().toISOString();
  const row = existing
    ? {
        ...existing,
        company_profile: hasModuleData(extracted.company_profile)
          ? { ...(existing.company_profile || {}), ...extracted.company_profile }
          : existing.company_profile,
        addresses: hasModuleData(extracted.addresses)
          ? { ...(existing.addresses || {}), ...extracted.addresses }
          : existing.addresses,
        tax_registrations: hasModuleData(extracted.tax_registrations)
          ? { ...(existing.tax_registrations || {}), ...extracted.tax_registrations }
          : existing.tax_registrations,
        directors: extracted.directors?.length ? extracted.directors : existing.directors,
        governance: hasModuleData(extracted.governance)
          ? { ...(existing.governance || {}), ...extracted.governance }
          : existing.governance,
        officers: extracted.officers?.length ? extracted.officers : existing.officers,
        principal_bankers: extracted.principal_bankers?.length
          ? extracted.principal_bankers
          : existing.principal_bankers,
        updated_at: now,
      }
    : { ...emptyMasterDataRow(companyId), ...extracted, updated_at: now };

  const { data, error } = await admin
    .from("efs_company_master_data")
    .upsert(row, { onConflict: "company_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

function hasModuleData(value) {
  if (value == null) return false;
  if (typeof value === "string") return !!value.trim();
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value).some(hasModuleData);
  }
  return false;
}

serve(withEnterprisePlatform("financial-statements", "tenant", async (req, _ctx) => {
  /** Populated for structured failure diagnostics (kept out of try so catch can log them). */
  let body = null;
  let user = null;

  try {
    if (req.method !== "POST") throw new Error("Method not allowed.");
    if (!flagsEnabled()) {
      throw new Error("Financial Statements module is disabled (EFS_MODULE / EFCP_SILENT_BACKENDS).");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: authData } = await supabase.auth.getUser();
    user = authData?.user ?? null;
    if (!user) throw new Error("User not authenticated.");

    try {
      body = await req.json();
    } catch {
      throw new Error("Request body must be valid JSON.");
    }

    const { method, company_id } = body ?? {};
    if (!method) throw new Error("Method is required.");
    if (!company_id) throw new Error("Company ID is required.");
    _ctx.companyId = company_id;
    _ctx.userId = user.id;
    _ctx.requestMethod = method;

    const { data: companyMember, error: memberError } = await supabase
      .from("company_users")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("company_id", company_id)
      .single();
    if (memberError || !companyMember) throw new Error("Permission denied.");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: company } = await admin.from("companies").select("id, name").eq("id", company_id).maybeSingle();

    let result = null;

    // ── FRP V7.0.0 Canonical Trial Balance / Import / Mapping (additive) ──
    if (typeof method === "string" && method.startsWith("FRP_")) {
      const frpResult = await handleFrpMethod({
        method,
        body,
        company_id,
        user,
        admin,
        writeAudit,
        writeActivity,
        throwDbError,
        logDbResult,
      });
      if (frpResult == null) throw new Error(`Unknown method: ${method}`);
      result = frpResult;
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    switch (method) {
      // ── Framework catalogue ──────────────────────────────────────────────
      case "LIST_FRAMEWORKS": {
        const { data: frameworks, error } = await admin
          .from("efs_frameworks")
          .select("*, efs_framework_packs(*)")
          .eq("status", "active")
          .order("framework_key");
        if (error) throw error;
        result = frameworks;
        break;
      }

      case "LIST_FRAMEWORK_PACKS": {
        const { data, error } = await admin
          .from("efs_framework_packs")
          .select("*, efs_frameworks(framework_key, name)")
          .in("status", ["published", "active"])
          .order("framework_key");
        if (error) throw error;
        result = data;
        break;
      }

      // ── Reporting Entity ─────────────────────────────────────────────────
      case "ENSURE_REPORTING_ENTITY": {
        result = await ensureDefaultEntity(admin, company_id, company?.name);
        break;
      }

      // ── Reporting Workspaces ─────────────────────────────────────────────
      case "LIST_WORKSPACES": {
        const { data, error } = await admin
          .from("efs_reporting_workspaces")
          .select(WORKSPACE_SELECT)
          .eq("company_id", company_id)
          .neq("status", "archived")
          .order("updated_at", { ascending: false });
        if (error) throw error;
        // Reconcile each engagement period to financial_years (never leave frozen slash labels).
        result = await Promise.all(
          (data || []).map(async (ws) => {
            const period = await reconcileReportingPeriodWithCalendar(
              admin,
              company_id,
              ws.efs_reporting_periods,
              ws.status,
            );
            return { ...ws, efs_reporting_periods: period };
          }),
        );
        break;
      }

      // ── Reporting Period ─────────────────────────────────────────────────
      case "LIST_PERIODS": {
        const entity = await ensureDefaultEntity(admin, company_id, company?.name);
        const { data, error } = await admin
          .from("efs_reporting_periods")
          .select("*")
          .eq("company_id", company_id)
          .eq("reporting_entity_id", entity.id)
          .order("end_date", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "CREATE_PERIOD": {
        // G3.6D — Financial Statements consumes Enterprise Financial Calendar years.
        // When financial_year_id is supplied, period identity is taken from financial_years
        // (MASTER). FS must never invent year codes, labels, or date bounds.
        const entity = await ensureDefaultEntity(admin, company_id, company?.name);
        const p = body.period ?? {};
        let period_key = p.period_key;
        let label = p.label;
        let start_date = p.start_date;
        let end_date = p.end_date;
        let financial_year_id = p.financial_year_id ?? null;

        if (financial_year_id) {
          const { data: fy, error: fyErr } = await admin
            .from("financial_years")
            .select("id, year_code, start_date, end_date, company_id")
            .eq("id", financial_year_id)
            .eq("company_id", company_id)
            .maybeSingle();
          if (fyErr) throw fyErr;
          if (!fy) {
            throw new Error(
              "Financial Year not found in the Enterprise Financial Calendar for this company.",
            );
          }
          period_key = fy.year_code;
          label = fy.year_code;
          start_date = fy.start_date;
          end_date = fy.end_date;
          financial_year_id = fy.id;

          const { data: existingByFy } = await admin
            .from("efs_reporting_periods")
            .select("id")
            .eq("company_id", company_id)
            .eq("reporting_entity_id", entity.id)
            .eq("financial_year_id", financial_year_id)
            .maybeSingle();
          if (existingByFy) {
            throw new Error(
              `A reporting period already exists for Financial Year ${fy.year_code}. One workspace per Financial Year.`,
            );
          }
        }

        if (!period_key || !label || !start_date || !end_date) {
          throw new Error(
            "period.financial_year_id (preferred) or period.period_key, label, start_date, end_date are required.",
          );
        }
        const { data, error } = await admin
          .from("efs_reporting_periods")
          .insert({
            company_id,
            reporting_entity_id: entity.id,
            financial_year_id,
            period_key,
            label,
            start_date,
            end_date,
            status: p.status || "open_for_reporting",
            opened_by: user.id,
            opened_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) {
          if (error.code === "23505") {
            throw new Error(
              `A reporting period already exists for this Financial Year (${period_key}). One workspace per Financial Year.`,
            );
          }
          throw error;
        }
        await writeAudit(admin, {
          company_id,
          entity_type: "reporting_period",
          entity_id: data.id,
          action: "create",
          actor_user_id: user.id,
          after_state: data,
        });
        result = data;
        break;
      }

      case "MIGRATE_LEGACY_REPORTING_PERIOD": {
        // Explicit user-driven migration only — never auto-bind unbound periods.
        // Creates/links financial_years metadata; does not touch journals or sealed packs.
        result = await migrateLegacyReportingPeriod(admin, {
          company_id,
          workspace_id: body.workspace_id,
          mode: body.mode,
          financial_year_id: body.financial_year_id ?? null,
        });
        break;
      }

      case "OPEN_PERIOD": {
        const { data, error } = await admin
          .from("efs_reporting_periods")
          .update({
            status: "open_for_reporting",
            opened_by: user.id,
            opened_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.period_id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      // ── Framework Binding ────────────────────────────────────────────────
      case "BIND_FRAMEWORK": {
        const entity = await ensureDefaultEntity(admin, company_id, company?.name);
        if (!body.framework_pack_id) throw new Error("framework_pack_id is required.");

        // Supersede prior active bindings for this period (if provided)
        if (body.reporting_period_id) {
          await admin
            .from("efs_framework_bindings")
            .update({ status: "superseded" })
            .eq("company_id", company_id)
            .eq("reporting_period_id", body.reporting_period_id)
            .eq("status", "active");
        }

        const { data, error } = await admin
          .from("efs_framework_bindings")
          .insert({
            company_id,
            reporting_entity_id: entity.id,
            framework_pack_id: body.framework_pack_id,
            reporting_period_id: body.reporting_period_id ?? null,
            period_from: body.period_from ?? null,
            period_to: body.period_to ?? null,
            status: "active",
            bound_by: user.id,
          })
          .select("*, efs_framework_packs(*, efs_frameworks(framework_key, name))")
          .single();
        if (error) throw error;

        if (body.workspace_id) {
          await admin
            .from("efs_reporting_workspaces")
            .update({ framework_binding_id: data.id, updated_at: new Date().toISOString() })
            .eq("id", body.workspace_id)
            .eq("company_id", company_id);
          await writeActivity(admin, {
            company_id,
            workspace_id: body.workspace_id,
            event_type: "framework.bound",
            entity_type: "framework_binding",
            entity_id: data.id,
            actor_user_id: user.id,
            message: `Framework pack bound`,
            payload: { framework_pack_id: body.framework_pack_id },
          });
        }

        await writeAudit(admin, {
          company_id,
          entity_type: "framework_binding",
          entity_id: data.id,
          action: "bind",
          actor_user_id: user.id,
          after_state: data,
        });
        result = data;
        break;
      }

      // ── Financial Statements Workspace (Company + Financial Year) ────────
      case "ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR": {
        if (!body.financial_year_id) throw new Error("financial_year_id is required.");
        const ensured = await ensureWorkspaceForFinancialYear(
          admin,
          company_id,
          company,
          body.financial_year_id,
          user,
          body,
        );
        result = ensured;
        break;
      }

      case "GET_WORKSPACE_BY_FINANCIAL_YEAR": {
        if (!body.financial_year_id) throw new Error("financial_year_id is required.");
        const workspace = await findWorkspaceByFinancialYear(
          admin,
          company_id,
          body.financial_year_id,
        );
        if (!workspace) {
          throw new Error("Financial Statements workspace not found for this Financial Year.");
        }
        result = workspace;
        break;
      }

      case "GET_FINANCIAL_STATEMENTS_HOME": {
        const financial_year_id = body.financial_year_id ?? null;
        let selectedFy = null;
        if (financial_year_id) {
          const { data: fy, error: fyErr } = await admin
            .from("financial_years")
            .select("id, year_code, start_date, end_date, status")
            .eq("id", financial_year_id)
            .eq("company_id", company_id)
            .maybeSingle();
          if (fyErr) throw fyErr;
          selectedFy = fy;
        } else {
          const { data: years, error: yearsErr } = await admin
            .from("financial_years")
            .select("id, year_code, start_date, end_date, status")
            .eq("company_id", company_id)
            .order("start_date", { ascending: false });
          if (yearsErr) throw yearsErr;
          selectedFy =
            years?.find((y) => y.status === "open") ||
            years?.find((y) => y.status === "reopened") ||
            years?.[0] ||
            null;
        }

        let workspace = null;
        let workspaceGi = null;
        if (selectedFy?.id) {
          workspace = await findWorkspaceByFinancialYear(admin, company_id, selectedFy.id);
          if (workspace?.id) {
            const { data: gi } = await admin
              .from("efs_engagement_general_information")
              .select("prepared_by, reporting_framework")
              .eq("workspace_id", workspace.id)
              .eq("company_id", company_id)
              .maybeSingle();
            workspaceGi = gi;
          }
        }

        const framework =
          workspace?.efs_framework_bindings?.efs_framework_packs?.efs_frameworks?.name ||
          workspace?.efs_framework_bindings?.efs_framework_packs?.label ||
          workspaceGi?.reporting_framework ||
          null;

        result = {
          company_id,
          company_name: company?.name ?? null,
          financial_year: selectedFy,
          workspace_id: workspace?.id ?? null,
          workspace_exists: !!workspace,
          reporting_framework: framework,
          status: workspace?.status ?? null,
          progress_pct: workspace?.progress_pct ?? null,
          prepared_by: workspaceGi?.prepared_by ?? null,
          last_updated: workspace?.updated_at ?? null,
        };
        break;
      }

      case "GET_WORKSPACE": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_reporting_workspaces")
          .select(`
            *,
            efs_reporting_periods(*),
            efs_reporting_entities(*),
            efs_framework_bindings(
              *,
              efs_framework_packs(*, efs_frameworks(framework_key, name))
            )
          `)
          .eq("id", body.workspace_id)
          .eq("company_id", company_id)
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      case "GET_WORKSPACE_DASHBOARD": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data: workspace, error } = await admin
          .from("efs_reporting_workspaces")
          .select(`
            *,
            efs_reporting_periods(*),
            efs_reporting_entities(*),
            efs_framework_bindings(
              *,
              efs_framework_packs(*, efs_frameworks(framework_key, name))
            )
          `)
          .eq("id", body.workspace_id)
          .eq("company_id", company_id)
          .single();
        if (error) throw error;

        const { data: snapshots } = await admin
          .from("efs_reporting_snapshots")
          .select("*, efs_snapshot_versions!efs_snapshot_versions_snapshot_id_fkey(*)")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false });

        const currentSnapshot = snapshots?.[0] ?? null;
        let currentVersion = null;
        if (currentSnapshot?.current_version_id) {
          currentVersion =
            (currentSnapshot.efs_snapshot_versions || []).find((v) => v.id === currentSnapshot.current_version_id) ||
            null;
        } else if (currentSnapshot?.efs_snapshot_versions?.length) {
          currentVersion = [...currentSnapshot.efs_snapshot_versions].sort((a, b) => b.version_no - a.version_no)[0];
        }

        const { data: activity } = await admin
          .from("efs_workspace_activity")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .order("created_at", { ascending: false })
          .limit(20);

        // Phase A: downstream widgets are reserved placeholders (no Phase B–D engines)
        const reportingPeriod = await reconcileReportingPeriodWithCalendar(
          admin,
          company_id,
          workspace.efs_reporting_periods,
          workspace.status,
        );
        // Keep workspace embed in sync for any consumer reading nested period.
        if (reportingPeriod) workspace.efs_reporting_periods = reportingPeriod;

        result = {
          workspace,
          reportingPeriod,
          framework: workspace.efs_framework_bindings?.efs_framework_packs ?? null,
          snapshot: currentSnapshot
            ? {
                id: currentSnapshot.id,
                status: currentSnapshot.status,
                currentVersion: currentVersion
                  ? {
                      id: currentVersion.id,
                      version_no: currentVersion.version_no,
                      status: currentVersion.status,
                      content_hash: currentVersion.content_hash,
                      certified_at: currentVersion.certified_at,
                      frozen_at: currentVersion.frozen_at,
                    }
                  : null,
              }
            : null,
          progress: {
            pct: Number(workspace.progress_pct || 0),
            stage: workspace.status,
          },
          outstandingTasks: {
            count: 0,
            items: [],
            note: "Close checklist / tasks arrive in later phases",
          },
          validationSummary: {
            pass: 0,
            fail: 0,
            advisory: 0,
            note: "Use RUN_VALIDATION / GET_VALIDATION_DASHBOARD — Validation identifies defects; does not approve",
          },
          reviewStatus: {
            manager: "use_GET_REVIEW_DASHBOARD",
            partner: "use_GET_REVIEW_DASHBOARD",
            note: "Manager/Partner Review Workflow is Phase D2 — does not change accounting",
          },
          publicationStatus: {
            status: "not_ready",
            note: "Publication / XBRL / AI remain deferred until Review Workflow certified",
          },
          recentActivity: activity || [],
          phase: "D2",
          statementPreparationEnabled: !!(currentVersion && ["certified", "frozen", "publication_bound"].includes(currentVersion.status)),
        };
        break;
      }

      // ── Reporting Snapshot Manager ───────────────────────────────────────
      case "LIST_SNAPSHOTS": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_reporting_snapshots")
          .select("*, efs_snapshot_versions!efs_snapshot_versions_snapshot_id_fkey(*, efs_fact_snapshots(id, content_hash, sealed_at, period_start, period_end, source_rpc_refs))")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "CREATE_SNAPSHOT_DRAFT": {
        // Snapshot Version Manager — create / reuse lineage + draft version
        // HOTFIX: UNIQUE(workspace_id, lineage_key) — never re-insert primary when lineage exists.
        logStep("STEP 1 Validate request", {
          workspace_id: body.workspace_id ?? null,
          snapshot_id: body.snapshot_id ?? null,
          lineage_key: body.lineage_key ?? "primary",
          force_successor: !!body.force_successor,
          company_id,
        });
        if (!body.workspace_id) throw new Error("workspace_id is required.");

        logStep("STEP 2 Load engagement (workspace)");
        let workspace;
        try {
          const { data, error: wErr } = await admin
            .from("efs_reporting_workspaces")
            .select("*")
            .eq("id", body.workspace_id)
            .eq("company_id", company_id)
            .single();
          logDbResult("STEP 2 Load engagement", {
            table: "efs_reporting_workspaces",
            data,
            error: wErr,
          });
          if (wErr) throwDbError("STEP 2 Load engagement", { table: "efs_reporting_workspaces", error: wErr, rows: data });
          if (!data) throw new Error("Workspace not found.");
          workspace = data;
        } catch (error) {
          if (error instanceof Error && error.message === "Workspace not found.") throw error;
          if (error?.cause || (error instanceof Error && String(error.message).includes("step=STEP 2"))) throw error;
          throwDbError("STEP 2 Load engagement", { table: "efs_reporting_workspaces", error, payload: { workspace_id: body.workspace_id } });
        }

        logStep("STEP 3 Verify FK parents on workspace", {
          company_id: workspace.company_id,
          reporting_entity_id: workspace.reporting_entity_id,
          reporting_period_id: workspace.reporting_period_id,
          framework_binding_id: workspace.framework_binding_id,
        });
        if (!workspace.reporting_period_id) throw new Error("Workspace missing reporting_period_id.");
        if (!workspace.reporting_entity_id) throw new Error("Workspace missing reporting_entity_id.");

        const lineage_key = body.lineage_key || "primary";
        let snapshotId = body.snapshot_id;

        if (!snapshotId) {
          logStep("STEP 4 Resolve existing snapshot lineage", { lineage_key });
          try {
            const { data: existing, error: findErr } = await admin
              .from("efs_reporting_snapshots")
              .select("id, status, current_version_id, lineage_key")
              .eq("workspace_id", workspace.id)
              .eq("company_id", company_id)
              .eq("lineage_key", lineage_key)
              .maybeSingle();
            logDbResult("STEP 4 Resolve existing snapshot lineage", {
              table: "efs_reporting_snapshots",
              data: existing,
              error: findErr,
            });
            if (findErr) {
              throwDbError("STEP 4 Resolve existing snapshot lineage", {
                table: "efs_reporting_snapshots",
                error: findErr,
                rows: existing,
                payload: { workspace_id: workspace.id, lineage_key },
              });
            }
            if (existing?.id) {
              snapshotId = existing.id;
              logStep("STEP 4 Reusing existing snapshot lineage", { snapshot_id: snapshotId });
            }
          } catch (error) {
            if (error?.cause || (error instanceof Error && String(error.message).includes("step=STEP 4"))) throw error;
            throwDbError("STEP 4 Resolve existing snapshot lineage", {
              table: "efs_reporting_snapshots",
              error,
              payload: { workspace_id: workspace.id, lineage_key },
            });
          }
        }

        if (!snapshotId) {
          logStep("STEP 5 Create snapshot lineage", { lineage_key });
          const insertPayload = {
            company_id,
            workspace_id: workspace.id,
            reporting_period_id: workspace.reporting_period_id,
            reporting_entity_id: workspace.reporting_entity_id,
            lineage_key,
            status: "draft",
            created_by: user.id,
          };
          try {
            const { data: snap, error: sErr } = await admin
              .from("efs_reporting_snapshots")
              .insert(insertPayload)
              .select()
              .single();
            logDbResult("STEP 5 Create snapshot lineage", {
              table: "efs_reporting_snapshots",
              data: snap,
              error: sErr,
            });
            if (sErr) {
              throwDbError("STEP 5 Create snapshot lineage", {
                table: "efs_reporting_snapshots",
                error: sErr,
                rows: snap,
                payload: insertPayload,
              });
            }
            snapshotId = snap.id;
          } catch (error) {
            if (error?.cause || (error instanceof Error && String(error.message).includes("step=STEP 5"))) throw error;
            throwDbError("STEP 5 Create snapshot lineage", {
              table: "efs_reporting_snapshots",
              error,
              payload: insertPayload,
            });
          }
        }

        logStep("STEP 6 Load prior snapshot versions", { snapshot_id: snapshotId });
        let priorVersions;
        try {
          const { data, error: pErr } = await admin
            .from("efs_snapshot_versions")
            .select("version_no, id, status")
            .eq("snapshot_id", snapshotId)
            .order("version_no", { ascending: false })
            .limit(1);
          logDbResult("STEP 6 Load prior snapshot versions", {
            table: "efs_snapshot_versions",
            data,
            error: pErr,
          });
          if (pErr) {
            throwDbError("STEP 6 Load prior snapshot versions", {
              table: "efs_snapshot_versions",
              error: pErr,
              rows: data,
              payload: { snapshot_id: snapshotId },
            });
          }
          priorVersions = data;
        } catch (error) {
          if (error?.cause || (error instanceof Error && String(error.message).includes("step=STEP 6"))) throw error;
          throwDbError("STEP 6 Load prior snapshot versions", {
            table: "efs_snapshot_versions",
            error,
            payload: { snapshot_id: snapshotId },
          });
        }

        const last = priorVersions?.[0];
        if (last && ["frozen", "publication_bound"].includes(last.status) && !body.force_successor) {
          throw new Error(
            "Frozen Snapshot Version cannot be edited in place. Pass force_successor=true to create a successor version.",
          );
        }

        const nextNo = (last?.version_no || 0) + 1;
        logStep("STEP 7 Create snapshot version", {
          snapshot_id: snapshotId,
          version_no: nextNo,
          predecessor_id: last?.id ?? null,
        });
        const versionPayload = {
          company_id,
          snapshot_id: snapshotId,
          version_no: nextNo,
          status: "draft",
          predecessor_id: last?.id ?? null,
          created_by: user.id,
        };
        let version;
        try {
          const { data, error: vErr } = await admin
            .from("efs_snapshot_versions")
            .insert(versionPayload)
            .select()
            .single();
          logDbResult("STEP 7 Create snapshot version", {
            table: "efs_snapshot_versions",
            data,
            error: vErr,
          });
          if (vErr) {
            throwDbError("STEP 7 Create snapshot version", {
              table: "efs_snapshot_versions",
              error: vErr,
              rows: data,
              payload: versionPayload,
            });
          }
          version = data;
        } catch (error) {
          if (error?.cause || (error instanceof Error && String(error.message).includes("step=STEP 7"))) throw error;
          throwDbError("STEP 7 Create snapshot version", {
            table: "efs_snapshot_versions",
            error,
            payload: versionPayload,
          });
        }

        logStep("STEP 8 Persist snapshot current_version_id", {
          snapshot_id: snapshotId,
          current_version_id: version.id,
        });
        try {
          const { data: updated, error: uErr } = await admin
            .from("efs_reporting_snapshots")
            .update({
              current_version_id: version.id,
              status: "draft",
              updated_at: new Date().toISOString(),
            })
            .eq("id", snapshotId)
            .eq("company_id", company_id)
            .select("id, current_version_id, status")
            .maybeSingle();
          logDbResult("STEP 8 Persist snapshot current_version_id", {
            table: "efs_reporting_snapshots",
            data: updated,
            error: uErr,
          });
          if (uErr) {
            throwDbError("STEP 8 Persist snapshot current_version_id", {
              table: "efs_reporting_snapshots",
              error: uErr,
              rows: updated,
              payload: { snapshot_id: snapshotId, current_version_id: version.id },
            });
          }
        } catch (error) {
          if (error?.cause || (error instanceof Error && String(error.message).includes("step=STEP 8"))) throw error;
          throwDbError("STEP 8 Persist snapshot current_version_id", {
            table: "efs_reporting_snapshots",
            error,
            payload: { snapshot_id: snapshotId, current_version_id: version.id },
          });
        }

        logStep("STEP 9 Write activity", { version_id: version.id, version_no: nextNo });
        try {
          const { error: aErr } = await admin.from("efs_workspace_activity").insert({
            company_id,
            workspace_id: workspace.id,
            event_type: "snapshot.version_created",
            entity_type: "snapshot_version",
            entity_id: version.id,
            actor_user_id: user.id,
            message: `Snapshot Version v${nextNo} created (draft)`,
          });
          logDbResult("STEP 9 Write activity", {
            table: "efs_workspace_activity",
            data: aErr ? null : { ok: true },
            error: aErr,
          });
          if (aErr) {
            // Activity is non-blocking for draft creation, but must never hide SQL cause.
            console.error({
              step: "STEP 9 Write activity",
              table: "efs_workspace_activity",
              PostgrestError: aErr,
              SQLSTATE: aErr.code ?? null,
              note: "activity insert failed; draft version already persisted",
            });
          }
        } catch (error) {
          console.error({
            step: "STEP 9 Write activity",
            table: "efs_workspace_activity",
            error,
            stack: error instanceof Error ? error.stack : null,
            note: "activity insert threw; draft version already persisted",
          });
        }

        logStep("STEP 10 Return response", { snapshot_id: snapshotId, version_id: version.id, version_no: nextNo });
        result = { snapshot_id: snapshotId, version };
        break;
      }

      case "EXTRACT_FACT_SNAPSHOT": {
        // Reporting Snapshot Manager — seal Accounting facts into immutable Fact Snapshot
        // HOTFIX: get_period_activity / get_cash_flow_statement require company_id overloads
        // when invoked via service role (auth.uid() is null). Invalid RPC arity → PGRST202 → 500.
        const extractStep = (step, fields = {}) => {
          console.log(JSON.stringify({
            level: "info",
            event: "EXTRACT_FACT_SNAPSHOT.step",
            step,
            snapshot_version_id: body.snapshot_version_id ?? null,
            workspace_id: body.workspace_id ?? null,
            company_id,
            ...fields,
            timestamp: new Date().toISOString(),
          }));
        };

        extractStep("STEP 1 Validate request", {
          method: "EXTRACT_FACT_SNAPSHOT",
          received: {
            snapshot_version_id: body.snapshot_version_id ?? null,
            workspace_id: body.workspace_id ?? null,
            snapshot_id: body.snapshot_id ?? null,
            engagement_id: body.engagement_id ?? null,
            reporting_period_id: body.reporting_period_id ?? null,
            framework_id: body.framework_id ?? body.framework_pack_id ?? null,
            lineage_key: body.lineage_key ?? null,
          },
        });

        if (!body.snapshot_version_id) {
          throw new Error(
            "snapshot_version_id is required for EXTRACT_FACT_SNAPSHOT. (engagement_id/workspace_id are not substitutes.)",
          );
        }

        extractStep("STEP 2 Load snapshot version + period", {
          snapshot_version_id: body.snapshot_version_id,
        });
        let version;
        try {
          const { data, error: vErr } = await admin
            .from("efs_snapshot_versions")
            .select(
              "*, efs_reporting_snapshots!efs_snapshot_versions_snapshot_id_fkey(*, efs_reporting_periods(*))",
            )
            .eq("id", body.snapshot_version_id)
            .eq("company_id", company_id)
            .single();
          logDbResult("EXTRACT STEP 2 Load version", {
            table: "efs_snapshot_versions",
            data: data
              ? {
                id: data.id,
                status: data.status,
                snapshot_id: data.snapshot_id,
                workspace_id: data.efs_reporting_snapshots?.workspace_id ?? null,
                period_id: data.efs_reporting_snapshots?.reporting_period_id ?? null,
              }
              : null,
            error: vErr,
          });
          if (vErr) {
            throwDbError("EXTRACT STEP 2 Load version", {
              table: "efs_snapshot_versions",
              error: vErr,
              payload: { snapshot_version_id: body.snapshot_version_id, company_id },
            });
          }
          if (!data) throw new Error("Snapshot Version not found.");
          version = data;
        } catch (error) {
          if (error instanceof Error && error.message === "Snapshot Version not found.") throw error;
          if (error?.cause || (error instanceof Error && String(error.message).includes("EXTRACT STEP 2"))) throw error;
          throwDbError("EXTRACT STEP 2 Load version", {
            table: "efs_snapshot_versions",
            error,
            payload: { snapshot_version_id: body.snapshot_version_id },
          });
        }

        extractStep("STEP 3 Validate version status", { status: version.status });
        if (version.status !== "draft" && version.status !== "created") {
          throw new Error(`Cannot extract into Snapshot Version in status ${version.status}`);
        }

        extractStep("STEP 4 Check existing fact seal");
        {
          const { data: existingFact, error: exErr } = await admin
            .from("efs_fact_snapshots")
            .select("id")
            .eq("snapshot_version_id", version.id)
            .maybeSingle();
          logDbResult("EXTRACT STEP 4 Existing fact", {
            table: "efs_fact_snapshots",
            data: existingFact,
            error: exErr,
          });
          if (exErr) {
            throwDbError("EXTRACT STEP 4 Existing fact", {
              table: "efs_fact_snapshots",
              error: exErr,
              payload: { snapshot_version_id: version.id },
            });
          }
          if (existingFact) {
            throw new Error("Fact Snapshot already sealed for this version. Create a successor version.");
          }
        }

        const snap = version.efs_reporting_snapshots;
        const period = snap?.efs_reporting_periods;
        extractStep("STEP 5 Verify prerequisites", {
          snapshot_id: version.snapshot_id,
          workspace_id: snap?.workspace_id ?? null,
          reporting_period_id: snap?.reporting_period_id ?? null,
          period_start: period?.start_date ?? null,
          period_end: period?.end_date ?? null,
        });
        if (!snap) throw new Error("Reporting Snapshot missing for Snapshot Version.");
        if (!snap.workspace_id) throw new Error("Snapshot missing workspace_id.");
        if (!period) throw new Error("Reporting Period missing on snapshot lineage.");
        if (!period.start_date || !period.end_date) {
          throw new Error("Reporting Period missing start_date/end_date.");
        }

        const end_date = period.end_date;
        const start_date = period.start_date;
        const priorDate = new Date(start_date);
        priorDate.setDate(priorDate.getDate() - 1);
        const prior_as_of = priorDate.toISOString().slice(0, 10);

        const source_rpc_refs = [
          { rpc: "get_balances_as_of_date", args: { p_end_date: end_date, p_company_id: company_id } },
          { rpc: "get_balances_as_of_date", args: { p_end_date: prior_as_of, p_company_id: company_id }, role: "prior_as_of" },
          { rpc: "get_period_activity", args: { p_start_date: start_date, p_end_date: end_date, p_company_id: company_id } },
          { rpc: "get_cash_flow_statement", args: { p_start_date: start_date, p_end_date: end_date, p_company_id: company_id } },
        ];

        extractStep("STEP 6 RPC get_balances_as_of_date (closing)", { end_date });
        let closingBalances;
        {
          const { data, error: balErr } = await admin.rpc("get_balances_as_of_date", {
            p_end_date: end_date,
            p_company_id: company_id,
          });
          logDbResult("EXTRACT STEP 6 closing balances", {
            rpc: "get_balances_as_of_date",
            data: Array.isArray(data) ? { rowCount: data.length } : data,
            error: balErr,
          });
          if (balErr) {
            throwDbError("EXTRACT STEP 6 closing balances", {
              rpc: "get_balances_as_of_date",
              error: balErr,
              payload: { p_end_date: end_date, p_company_id: company_id },
            });
          }
          closingBalances = data;
        }

        extractStep("STEP 7 RPC get_balances_as_of_date (prior)", { prior_as_of });
        let openingBalances;
        {
          const { data, error: openErr } = await admin.rpc("get_balances_as_of_date", {
            p_end_date: prior_as_of,
            p_company_id: company_id,
          });
          logDbResult("EXTRACT STEP 7 opening balances", {
            rpc: "get_balances_as_of_date",
            data: Array.isArray(data) ? { rowCount: data.length } : data,
            error: openErr,
          });
          if (openErr) {
            throwDbError("EXTRACT STEP 7 opening balances", {
              rpc: "get_balances_as_of_date",
              error: openErr,
              payload: { p_end_date: prior_as_of, p_company_id: company_id },
            });
          }
          openingBalances = data;
        }

        extractStep("STEP 8 RPC get_period_activity", { start_date, end_date });
        let periodActivityRpc;
        {
          const { data, error: actErr } = await admin.rpc("get_period_activity", {
            p_start_date: start_date,
            p_end_date: end_date,
            p_company_id: company_id,
          });
          logDbResult("EXTRACT STEP 8 period activity", {
            rpc: "get_period_activity",
            data: Array.isArray(data) ? { rowCount: data.length } : data,
            error: actErr,
          });
          if (actErr) {
            throwDbError("EXTRACT STEP 8 period activity", {
              rpc: "get_period_activity",
              error: actErr,
              payload: { p_start_date: start_date, p_end_date: end_date, p_company_id: company_id },
            });
          }
          periodActivityRpc = data;
        }

        extractStep("STEP 9 RPC get_cash_flow_statement", { start_date, end_date });
        let cashFlowRpc;
        {
          const { data, error: cfErr } = await admin.rpc("get_cash_flow_statement", {
            p_start_date: start_date,
            p_end_date: end_date,
            p_company_id: company_id,
          });
          logDbResult("EXTRACT STEP 9 cash flow", {
            rpc: "get_cash_flow_statement",
            data: Array.isArray(data) ? { rowCount: data.length } : data,
            error: cfErr,
          });
          if (cfErr) {
            throwDbError("EXTRACT STEP 9 cash flow", {
              rpc: "get_cash_flow_statement",
              error: cfErr,
              payload: { p_start_date: start_date, p_end_date: end_date, p_company_id: company_id },
            });
          }
          cashFlowRpc = data;
        }

        // Prefer Accounting period-activity RPC; fall back to closing − opening delta (still seal-time facts)
        const openingMap = new Map((openingBalances || []).map((a) => [a.id, Number(a.balance || 0)]));
        let activity;
        if (periodActivityRpc?.length) {
          activity = periodActivityRpc.map((a) => ({
            id: a.id,
            account_number: a.account_number,
            name: a.name,
            type: a.type,
            opening_balance: round2(openingMap.get(a.id) || 0),
            closing_balance: round2((openingMap.get(a.id) || 0) + Number(a.activity || 0)),
            period_activity: round2(a.activity),
            activity: round2(a.activity),
          }));
        } else {
          activity = (closingBalances || []).map((a) => {
            const open = openingMap.get(a.id) || 0;
            const close = Number(a.balance || 0);
            return {
              id: a.id,
              account_number: a.account_number,
              name: a.name,
              type: a.type,
              opening_balance: round2(open),
              closing_balance: round2(close),
              period_activity: round2(close - open),
            };
          });
        }

        const cash_flow = (cashFlowRpc || []).map((c) => ({
          section: c.section,
          category: c.category,
          amount: round2(c.amount),
        }));

        // V7.0.0: seal Canonical Trial Balance from native GL, then project to Fact Snapshot.
        // Fallback preserves pre-FRP dataset shape if FRP flag is off.
        let dataset;
        let content_hash;
        let canonical_tb_id = null;
        if (frpEnabled()) {
          extractStep("STEP 9b Seal Canonical Trial Balance (native_gl)");
          try {
            const projected = await sealNativeCanonicalTbAndProject({
              admin,
              company_id,
              user,
              workspace_id: snap.workspace_id,
              reporting_period_id: snap.reporting_period_id,
              snapshot_version_id: version.id,
              period_start: start_date,
              period_end: end_date,
              prior_as_of,
              period_key: period.period_key,
              closingBalances,
              openingBalances,
              periodActivity: activity,
              cash_flow,
              source_rpc_refs,
              writeActivity,
            });
            dataset = projected.dataset;
            content_hash = projected.content_hash;
            canonical_tb_id = projected.ctb?.id ?? null;
          } catch (ctbErr) {
            // Additive FRP must not block certified extract if CTB tables are not yet migrated.
            console.warn(JSON.stringify({
              level: "warn",
              event: "EXTRACT_FACT_SNAPSHOT.ctb_fallback",
              message: ctbErr instanceof Error ? ctbErr.message : String(ctbErr),
              timestamp: new Date().toISOString(),
            }));
            dataset = null;
          }
        }

        if (!dataset) {
          dataset = {
            schema_version: "6.4.1-phase-b",
            company_id,
            period: { start_date, end_date, prior_as_of, period_key: period.period_key },
            balances_as_of: {
              as_of: end_date,
              accounts: (closingBalances || []).map((a) => ({
                id: a.id,
                account_number: a.account_number,
                name: a.name,
                type: a.type,
                balance: round2(a.balance),
              })),
            },
            balances_prior_as_of: {
              as_of: prior_as_of,
              accounts: (openingBalances || []).map((a) => ({
                id: a.id,
                account_number: a.account_number,
                name: a.name,
                type: a.type,
                balance: round2(a.balance),
              })),
            },
            period_activity: activity,
            cash_flow,
            extracted_at: new Date().toISOString(),
          };
          content_hash = await sha256Hex(dataset);
        }

        // Seal Canonical Financial Aggregation once — Statement Engine must consume, not recalculate.
        {
          const { data: coaMeta } = await admin
            .from("chart_of_accounts")
            .select("id, account_role, category, subcategory, account_code, tax_treatment, cash_flow_classification")
            .eq("company_id", company_id);
          const closingAccounts =
            dataset.balances_as_of?.accounts ?? dataset.balances_as_of ?? closingBalances ?? [];
          const openingAccounts =
            dataset.balances_prior_as_of?.accounts ?? dataset.balances_prior_as_of ?? openingBalances ?? [];
          const periodRows = dataset.period_activity ?? activity ?? [];
          dataset.canonical_aggregation = buildCanonicalFinancialAggregation({
            balancesAsOf: closingAccounts,
            openingBalances: openingAccounts,
            periodActivity: (periodRows || []).map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              activity: Number(a.period_activity ?? a.activity ?? 0),
            })),
            cashFlowData: dataset.cash_flow ?? cash_flow,
            accountMeta: coaMeta || [],
            retainedEarningsAccountIds: (coaMeta || [])
              .filter((r) => r.account_role === "retained_earnings")
              .map((r) => r.id),
          });
          content_hash = await sha256Hex(dataset);
        }

        const extract_summary = {
          account_count: (closingBalances || []).length,
          period_start: start_date,
          period_end: end_date,
          content_hash,
          canonical_tb_id,
          source_kind: canonical_tb_id ? "native_gl" : "legacy_direct",
        };

        extractStep("STEP 10 Persist fact snapshot", {
          account_count: extract_summary.account_count,
          content_hash,
          canonical_tb_id,
        });
        let fact;
        {
          const insertRow = {
            company_id,
            snapshot_version_id: version.id,
            sealed_by: user.id,
            content_hash,
            period_start: start_date,
            period_end: end_date,
            prior_as_of,
            source_rpc_refs,
            dataset,
          };
          if (canonical_tb_id) insertRow.canonical_tb_id = canonical_tb_id;
          const { data, error: fErr } = await admin
            .from("efs_fact_snapshots")
            .insert(insertRow)
            .select()
            .single();
          logDbResult("EXTRACT STEP 10 Persist fact", {
            table: "efs_fact_snapshots",
            data: data ? { id: data.id, content_hash: data.content_hash } : null,
            error: fErr,
          });
          if (fErr) {
            throwDbError("EXTRACT STEP 10 Persist fact", {
              table: "efs_fact_snapshots",
              error: fErr,
              payload: { snapshot_version_id: version.id, company_id },
            });
          }
          fact = data;
        }

        extractStep("STEP 11 Update version extract metadata");
        let updatedVersion;
        {
          const { data, error: uErr } = await admin
            .from("efs_snapshot_versions")
            .update({
              content_hash,
              extract_summary,
              source_rpc_refs,
              status: "draft",
            })
            .eq("id", version.id)
            .eq("company_id", company_id)
            .select()
            .single();
          logDbResult("EXTRACT STEP 11 Update version", {
            table: "efs_snapshot_versions",
            data: data ? { id: data.id, status: data.status } : null,
            error: uErr,
          });
          if (uErr) {
            throwDbError("EXTRACT STEP 11 Update version", {
              table: "efs_snapshot_versions",
              error: uErr,
              payload: { snapshot_version_id: version.id },
            });
          }
          updatedVersion = data;
        }

        const workspaceId = snap.workspace_id;
        extractStep("STEP 12 Update workspace status", { workspace_id: workspaceId });
        {
          const { error: wUpdErr } = await admin
            .from("efs_reporting_workspaces")
            .update({
              status: "facts_sealed",
              progress_pct: 20,
              updated_at: new Date().toISOString(),
            })
            .eq("id", workspaceId)
            .eq("company_id", company_id);
          if (wUpdErr) {
            throwDbError("EXTRACT STEP 12 Update workspace", {
              table: "efs_reporting_workspaces",
              error: wUpdErr,
              payload: { workspace_id: workspaceId },
            });
          }
        }

        await writeActivity(admin, {
          company_id,
          workspace_id: workspaceId,
          event_type: "facts.sealed",
          entity_type: "fact_snapshot",
          entity_id: fact.id,
          actor_user_id: user.id,
          message: `Fact Snapshot sealed (${extract_summary.account_count} accounts)`,
          payload: extract_summary,
        });
        await writeAudit(admin, {
          company_id,
          entity_type: "fact_snapshot",
          entity_id: fact.id,
          action: "seal",
          actor_user_id: user.id,
          after_state: { id: fact.id, content_hash, source_rpc_refs },
        });

        extractStep("STEP 13 Return response", {
          fact_snapshot_id: fact.id,
          version_id: updatedVersion.id,
        });

        // Never return full dataset to list UIs by default — include summary + seal metadata
        result = {
          fact_snapshot: {
            id: fact.id,
            content_hash: fact.content_hash,
            sealed_at: fact.sealed_at,
            period_start: fact.period_start,
            period_end: fact.period_end,
            source_rpc_refs: fact.source_rpc_refs,
          },
          version: updatedVersion,
          extract_summary,
        };
        break;
      }

      case "CERTIFY_SNAPSHOT_VERSION": {
        if (!body.snapshot_version_id) throw new Error("snapshot_version_id is required.");
        const { data: version, error: vErr } = await admin
          .from("efs_snapshot_versions")
          .select("*, efs_reporting_snapshots!efs_snapshot_versions_snapshot_id_fkey(*)")
          .eq("id", body.snapshot_version_id)
          .eq("company_id", company_id)
          .single();
        if (vErr || !version) throw new Error("Snapshot Version not found.");
        if (version.status !== "draft" && version.status !== "created") {
          throw new Error(`Cannot certify from status ${version.status}`);
        }

        const { data: fact } = await admin
          .from("efs_fact_snapshots")
          .select("id, content_hash")
          .eq("snapshot_version_id", version.id)
          .maybeSingle();
        if (!fact) throw new Error("Certify requires a sealed Fact Snapshot.");

        const { data: certified, error } = await admin
          .from("efs_snapshot_versions")
          .update({
            status: "certified",
            certified_by: user.id,
            certified_at: new Date().toISOString(),
            content_hash: version.content_hash || fact.content_hash,
          })
          .eq("id", version.id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;

        await admin
          .from("efs_reporting_snapshots")
          .update({
            status: "certified",
            current_version_id: certified.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", version.snapshot_id)
          .eq("company_id", company_id);

        await writeActivity(admin, {
          company_id,
          workspace_id: version.efs_reporting_snapshots.workspace_id,
          event_type: "snapshot.certified",
          entity_type: "snapshot_version",
          entity_id: certified.id,
          actor_user_id: user.id,
          message: `Snapshot Version v${certified.version_no} certified`,
        });

        result = certified;
        break;
      }

      case "FREEZE_SNAPSHOT_VERSION": {
        if (!body.snapshot_version_id) throw new Error("snapshot_version_id is required.");
        const { data: version, error: vErr } = await admin
          .from("efs_snapshot_versions")
          .select("*, efs_reporting_snapshots!efs_snapshot_versions_snapshot_id_fkey(*)")
          .eq("id", body.snapshot_version_id)
          .eq("company_id", company_id)
          .single();
        if (vErr || !version) throw new Error("Snapshot Version not found.");
        if (version.status !== "certified") {
          throw new Error("Freeze requires a certified Snapshot Version.");
        }

        const { data: frozen, error } = await admin
          .from("efs_snapshot_versions")
          .update({
            status: "frozen",
            frozen_by: user.id,
            frozen_at: new Date().toISOString(),
          })
          .eq("id", version.id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;

        await admin
          .from("efs_reporting_snapshots")
          .update({ status: "frozen", updated_at: new Date().toISOString() })
          .eq("id", version.snapshot_id)
          .eq("company_id", company_id);

        await admin
          .from("efs_reporting_periods")
          .update({ status: "frozen", updated_at: new Date().toISOString() })
          .eq("id", version.efs_reporting_snapshots.reporting_period_id)
          .eq("company_id", company_id);

        await writeActivity(admin, {
          company_id,
          workspace_id: version.efs_reporting_snapshots.workspace_id,
          event_type: "freeze.applied",
          entity_type: "snapshot_version",
          entity_id: frozen.id,
          actor_user_id: user.id,
          message: `Snapshot Version v${frozen.version_no} frozen`,
        });

        result = frozen;
        break;
      }

      case "GET_SNAPSHOT_VERSION": {
        if (!body.snapshot_version_id) throw new Error("snapshot_version_id is required.");
        const includeDataset = !!body.include_dataset;
        const { data: version, error } = await admin
          .from("efs_snapshot_versions")
          .select(
            includeDataset
              ? "*, efs_fact_snapshots(*)"
              : "*, efs_fact_snapshots(id, content_hash, sealed_at, period_start, period_end, source_rpc_refs, prior_as_of)",
          )
          .eq("id", body.snapshot_version_id)
          .eq("company_id", company_id)
          .single();
        if (error) throw error;
        result = version;
        break;
      }

      // ── Phase B: Financial Facts Adapter + Statement Engine ───────────────
      case "GET_FINANCIAL_FACTS": {
        if (!body.snapshot_version_id) throw new Error("snapshot_version_id is required.");
        const { data: version, error: vErr } = await admin
          .from("efs_snapshot_versions")
          .select("id, status, efs_fact_snapshots(*)")
          .eq("id", body.snapshot_version_id)
          .eq("company_id", company_id)
          .single();
        if (vErr || !version) throw new Error("Snapshot Version not found.");
        if (!["certified", "frozen", "publication_bound"].includes(version.status)) {
          throw new Error("Financial Facts Adapter requires a certified or frozen Snapshot Version.");
        }
        const fact = Array.isArray(version.efs_fact_snapshots)
          ? version.efs_fact_snapshots[0]
          : version.efs_fact_snapshots;
        if (!fact) throw new Error("No sealed Fact Snapshot on this version.");
        const facts = adaptFinancialFacts(fact, version.id);
        result = {
          schema_version: facts.schema_version,
          company_id: facts.company_id,
          snapshot_version_id: facts.snapshot_version_id,
          fact_snapshot_id: facts.fact_snapshot_id,
          content_hash: facts.content_hash,
          period: facts.period,
          balances_as_of: facts.balances_as_of,
          balances_prior_as_of: facts.balances_prior_as_of,
          period_activity: facts.period_activity,
          cash_flow: facts.cash_flow,
          source_rpc_refs: facts.source_rpc_refs,
          version_status: version.status,
          live_gl: false,
        };
        break;
      }

      case "GENERATE_STATEMENTS": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");

        const { data: workspace, error: wErr } = await admin
          .from("efs_reporting_workspaces")
          .select(`
            *,
            efs_framework_bindings(
              framework_pack_id,
              efs_framework_packs(id, framework_key, version_id, label)
            )
          `)
          .eq("id", body.workspace_id)
          .eq("company_id", company_id)
          .single();
        if (wErr || !workspace) throw new Error("Workspace not found.");

        const pack = workspace.efs_framework_bindings?.efs_framework_packs;
        if (!pack?.id) throw new Error("Workspace must have a bound Framework Pack before generating statements.");

        // Resolve snapshot version: explicit → workspace current certified/frozen
        let snapshotVersionId = body.snapshot_version_id;
        if (!snapshotVersionId) {
          const { data: snaps } = await admin
            .from("efs_reporting_snapshots")
            .select("id, current_version_id, status")
            .eq("workspace_id", workspace.id)
            .eq("company_id", company_id)
            .order("created_at", { ascending: false })
            .limit(1);
          snapshotVersionId = snaps?.[0]?.current_version_id;
        }
        if (!snapshotVersionId) throw new Error("No Snapshot Version available. Seal and certify facts first.");

        const { data: version, error: vErr } = await admin
          .from("efs_snapshot_versions")
          .select("*, efs_fact_snapshots(*)")
          .eq("id", snapshotVersionId)
          .eq("company_id", company_id)
          .single();
        if (vErr || !version) throw new Error("Snapshot Version not found.");
        if (!["certified", "frozen", "publication_bound"].includes(version.status)) {
          throw new Error(`Statement Engine requires certified/frozen snapshot (status=${version.status}).`);
        }

        const fact = Array.isArray(version.efs_fact_snapshots)
          ? version.efs_fact_snapshots[0]
          : version.efs_fact_snapshots;
        if (!fact?.dataset) throw new Error("Sealed Fact Snapshot dataset missing.");

        // HARD RULE: no live GL — adapter from sealed fact only
        const facts = adaptFinancialFacts(fact, version.id);

        const { data: defs, error: dErr } = await admin
          .from("efs_statement_definitions")
          .select("*")
          .eq("framework_pack_id", pack.id)
          .order("sort_order");
        if (dErr) throw dErr;

        const { data: taxLines, error: tErr } = await admin
          .from("efs_taxonomy_lines")
          .select("*")
          .eq("framework_pack_id", pack.id)
          .order("sort_order");
        if (tErr) throw tErr;

        const { data: typeMaps, error: mErr } = await admin
          .from("efs_default_type_maps")
          .select("*")
          .eq("framework_pack_id", pack.id);
        if (mErr) throw mErr;

        const packOut = await runStatementEngine({
          facts,
          frameworkPack: pack,
          statementDefinitions: defs || [],
          taxonomyLines: taxLines || [],
          defaultTypeMaps: typeMaps || [],
          tenantMappingLines: [],
          canonicalAggregation: facts.canonical_aggregation || null,
        });

        const saved = [];
        for (const st of packOut.statements) {
          const content_hash = await sha256Hex({
            snapshot_version_id: version.id,
            statement_type: st.statement_type,
            lines: st.lines,
            fact_hash: facts.content_hash,
          });
          const row = {
            company_id,
            workspace_id: workspace.id,
            snapshot_version_id: version.id,
            framework_pack_id: pack.id,
            statement_type: st.statement_type,
            title: st.title,
            generated_by: user.id,
            content_hash,
            fact_snapshot_id: fact.id,
            lines: st.lines,
            provenance: st.provenance,
            generated_at: new Date().toISOString(),
          };
          const { data: upserted, error: uErr } = await admin
            .from("efs_statement_instances")
            .upsert(row, { onConflict: "snapshot_version_id,statement_type" })
            .select("id, statement_type, title, content_hash, generated_at, provenance, lines")
            .single();
          if (uErr) throw uErr;
          saved.push(upserted);
        }

        await admin
          .from("efs_reporting_workspaces")
          .update({
            status: "content_assembled",
            progress_pct: Math.max(Number(workspace.progress_pct || 0), 45),
            updated_at: new Date().toISOString(),
          })
          .eq("id", workspace.id)
          .eq("company_id", company_id);

        await writeActivity(admin, {
          company_id,
          workspace_id: workspace.id,
          event_type: "statements.generated",
          entity_type: "statement_instance",
          entity_id: saved[0]?.id ?? null,
          actor_user_id: user.id,
          message: `Primary statements generated from Snapshot Version (hash ${facts.content_hash.slice(0, 12)}…)`,
          payload: {
            snapshot_version_id: version.id,
            statement_types: saved.map((s) => s.statement_type),
            live_gl: false,
          },
        });
        await writeAudit(admin, {
          company_id,
          entity_type: "statement_pack",
          entity_id: workspace.id,
          action: "generate",
          actor_user_id: user.id,
          after_state: {
            snapshot_version_id: version.id,
            fact_snapshot_id: fact.id,
            content_hash: facts.content_hash,
            count: saved.length,
          },
        });

        result = {
          snapshot_version_id: version.id,
          fact_snapshot_id: fact.id,
          framework_pack: pack,
          live_gl: false,
          statements: saved,
        };
        break;
      }

      case "GET_STATEMENTS": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        let query = admin
          .from("efs_statement_instances")
          .select("id, statement_type, title, content_hash, generated_at, provenance, lines, snapshot_version_id, framework_pack_id")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("generated_at", { ascending: false });
        if (body.snapshot_version_id) {
          query = query.eq("snapshot_version_id", body.snapshot_version_id);
        }
        const { data, error } = await query;
        if (error) throw error;

        // Deduplicate to latest per statement_type for requested version (or latest overall)
        const latestByType = new Map();
        for (const row of data || []) {
          if (!latestByType.has(row.statement_type)) latestByType.set(row.statement_type, row);
        }
        result = {
          live_gl: false,
          statements: [...latestByType.values()],
        };
        break;
      }

      case "LIST_FRAMEWORK_TAXONOMY": {
        if (!body.framework_pack_id) throw new Error("framework_pack_id is required.");
        const { data: defs, error: dErr } = await admin
          .from("efs_statement_definitions")
          .select("*")
          .eq("framework_pack_id", body.framework_pack_id)
          .order("sort_order");
        if (dErr) throw dErr;
        const { data: lines, error: lErr } = await admin
          .from("efs_taxonomy_lines")
          .select("*")
          .eq("framework_pack_id", body.framework_pack_id)
          .order("sort_order");
        if (lErr) throw lErr;
        const { data: maps, error: mErr } = await admin
          .from("efs_default_type_maps")
          .select("*")
          .eq("framework_pack_id", body.framework_pack_id);
        if (mErr) throw mErr;
        result = { definitions: defs, taxonomy_lines: lines, default_type_maps: maps };
        break;
      }

      // ── Phase C1: Statement Structure / Disclosure scaffold / Attachment points ─
      // Read-only. Does not implement WP/Leads/Notes/Validation/Review/Publication.
      case "GET_STATEMENT_STRUCTURE": {
        const { data: statements, error: sErr } = await admin
          .from("efs_structure_statements")
          .select("*")
          .order("sort_order");
        if (sErr) throw sErr;
        const { data: sections, error: secErr } = await admin
          .from("efs_structure_sections")
          .select("*")
          .order("sort_order");
        if (secErr) throw secErr;
        const { data: subsections, error: subErr } = await admin
          .from("efs_structure_subsections")
          .select("*")
          .order("sort_order");
        if (subErr) throw subErr;
        const { data: lineItems, error: liErr } = await admin
          .from("efs_structure_line_items")
          .select("*")
          .order("sort_order");
        if (liErr) throw liErr;
        const { data: nodes, error: nErr } = await admin
          .from("efs_structure_nodes")
          .select("*")
          .order("path");
        if (nErr) throw nErr;

        let labels = [];
        if (body.framework_pack_id) {
          const { data: lbl, error: lErr } = await admin
            .from("efs_structure_node_labels")
            .select("*")
            .eq("framework_pack_id", body.framework_pack_id);
          if (lErr) throw lErr;
          labels = lbl || [];
        }

        result = {
          statements,
          sections,
          subsections,
          line_items: lineItems,
          nodes,
          presentation_labels: labels,
          framework_neutral: true,
          attaches_to_statement_instances: false,
        };
        break;
      }

      case "GET_DISCLOSURE_STRUCTURE": {
        const { data: nodes, error: nErr } = await admin
          .from("efs_disclosure_nodes")
          .select("*")
          .order("sort_order");
        if (nErr) throw nErr;
        const { data: placeholders, error: pErr } = await admin
          .from("efs_disclosure_placeholders")
          .select("*")
          .order("placeholder_code");
        if (pErr) throw pErr;
        const { data: refs, error: rErr } = await admin
          .from("efs_disclosure_references")
          .select("*, efs_structure_nodes(node_code, node_kind, path)")
          .order("created_at");
        if (rErr) throw rErr;
        result = {
          disclosure_nodes: nodes,
          placeholders,
          references: refs,
          content_implemented: true,
          phase: "C3",
          validation_engine: false,
          publication: false,
          xbrl: false,
        };
        break;
      }

      case "LIST_ATTACHMENT_POINTS": {
        let q = admin
          .from("efs_attachment_points")
          .select(`
            id, kind_code, status, structure_node_id, disclosure_node_id, reserved_artefact_ref, created_at,
            efs_structure_nodes(node_code, node_kind, path),
            efs_disclosure_nodes(disclosure_code, name),
            efs_attachment_point_kinds(label, capability_phase, description)
          `)
          .eq("status", body.status || "open");
        if (body.structure_node_id) q = q.eq("structure_node_id", body.structure_node_id);
        if (body.disclosure_node_id) q = q.eq("disclosure_node_id", body.disclosure_node_id);
        if (body.kind_code) q = q.eq("kind_code", body.kind_code);
        const { data, error } = await q.order("kind_code").limit(body.limit || 2000);
        if (error) throw error;

        const { data: forbidden } = await admin.from("efs_attachment_forbidden_targets").select("*");

        result = {
          attachment_points: data || [],
          forbidden_targets: forbidden || [],
          rule: "Nothing may attach directly to Statement Instances",
          capabilities_implemented: {
            working_paper: true,
            lead_schedule: true,
            supporting_evidence: true,
            review_note: true,
            validation: false,
            publication: false,
            disclosure_content: false,
          },
        };
        break;
      }

      case "RESOLVE_ATTACHMENT_TARGET": {
        if (body.statement_instance_id) {
          throw new Error(
            "EFS_ATTACHMENT_FORBIDDEN: cannot attach to Statement Instance; use structure_node_id or disclosure_node_id",
          );
        }
        if (body.snapshot_version_id && !body.structure_node_id && !body.disclosure_node_id) {
          throw new Error(
            "EFS_ATTACHMENT_FORBIDDEN: Reporting Snapshot is not an attachment parent",
          );
        }
        if (body.journal_id || body.account_id) {
          throw new Error(
            "EFS_ATTACHMENT_FORBIDDEN: GL / Journal are not attachment parents",
          );
        }
        if (!body.structure_node_id && !body.disclosure_node_id) {
          throw new Error("structure_node_id or disclosure_node_id is required.");
        }
        if (body.structure_node_id) {
          const { data: node, error } = await admin
            .from("efs_structure_nodes")
            .select("id, node_code, node_kind, path, status")
            .eq("id", body.structure_node_id)
            .single();
          if (error || !node) throw new Error("Structure node not found.");
          result = { ok: true, target: { type: "structure_node", ...node } };
        } else {
          const { data: node, error } = await admin
            .from("efs_disclosure_nodes")
            .select("id, disclosure_code, name, status")
            .eq("id", body.disclosure_node_id)
            .single();
          if (error || !node) throw new Error("Disclosure node not found.");
          result = { ok: true, target: { type: "disclosure_node", ...node } };
        }
        break;
      }

      // ── Phase C2: Working Paper Platform ─────────────────────────────────
      case "LIST_WP_TEMPLATES": {
        const { data, error } = await admin
          .from("efs_wp_templates")
          .select("*, efs_wp_template_sections(*)")
          .or(`company_id.is.null,company_id.eq.${company_id}`)
          .eq("status", "active")
          .order("template_code");
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_WORKING_PAPERS": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_working_papers")
          .select("*, efs_structure_nodes(node_code, path, node_kind), efs_working_paper_sections(*)")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "CREATE_WORKING_PAPER": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        if (!body.structure_node_id) throw new Error("structure_node_id is required.");
        if (body.statement_instance_id || body.journal_id || body.account_id) {
          throw new Error("EFS_ATTACHMENT_FORBIDDEN: WP cannot attach to Statement Instance / GL / Journal");
        }

        const ap = await resolveStructureAttachmentPoint(admin, {
          structure_node_id: body.structure_node_id,
          kind_code: "working_paper",
        });

        let template = null;
        if (body.template_id) {
          const { data: t } = await admin
            .from("efs_wp_templates")
            .select("*, efs_wp_template_sections(*)")
            .eq("id", body.template_id)
            .maybeSingle();
          template = t;
        }

        const title = body.title || template?.name || "Working Paper";
        const { data: wp, error } = await admin
          .from("efs_working_papers")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            template_id: template?.id ?? null,
            attachment_point_id: ap.id,
            structure_node_id: ap.structure_node_id,
            title,
            wp_type: body.wp_type || template?.wp_type || "procedure",
            assertion: body.assertion ?? null,
            status: "draft",
            prepared_by: user.id,
            prepared_at: new Date().toISOString(),
            created_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;

        const sectionRows = (template?.efs_wp_template_sections || [
          { section_code: "purpose", title: "Purpose", sort_order: 10 },
          { section_code: "work_performed", title: "Work performed", sort_order: 20 },
          { section_code: "conclusion", title: "Conclusion", sort_order: 30 },
        ]).map((s) => ({
          company_id,
          working_paper_id: wp.id,
          section_code: s.section_code,
          title: s.title,
          body: "",
          sort_order: s.sort_order,
        }));
        if (sectionRows.length) {
          const { error: sErr } = await admin.from("efs_working_paper_sections").insert(sectionRows);
          if (sErr) throw sErr;
        }

        await admin
          .from("efs_attachment_points")
          .update({ status: "bound", reserved_artefact_ref: wp.id })
          .eq("id", ap.id);

        // Keep an open socket for additional WPs on the same structure node
        await admin.from("efs_attachment_points").insert({
          kind_code: "working_paper",
          structure_node_id: ap.structure_node_id,
          status: "open",
        });

        await appendReviewHistory(admin, {
          company_id,
          workspace_id: body.workspace_id,
          working_paper_id: wp.id,
          event_type: "wp.created",
          actor_user_id: user.id,
          to_status: "draft",
          message: `Working Paper created on ${ap.efs_structure_nodes?.node_code || ap.structure_node_id}`,
        });
        await writeActivity(admin, {
          company_id,
          workspace_id: body.workspace_id,
          event_type: "wp.created",
          entity_type: "working_paper",
          entity_id: wp.id,
          actor_user_id: user.id,
          message: `Working Paper: ${title}`,
        });

        result = wp;
        break;
      }

      case "UPDATE_WORKING_PAPER_SECTION": {
        if (!body.section_id) throw new Error("section_id is required.");
        const { data: sec, error: sErr } = await admin
          .from("efs_working_paper_sections")
          .select("*, efs_working_papers!inner(id, status, company_id)")
          .eq("id", body.section_id)
          .eq("company_id", company_id)
          .single();
        if (sErr || !sec) throw new Error("Section not found.");
        if (["finalized", "superseded"].includes(sec.efs_working_papers.status)) {
          throw new Error("Cannot edit sections of a finalized Working Paper.");
        }
        const { data, error } = await admin
          .from("efs_working_paper_sections")
          .update({ body: body.body ?? sec.body, title: body.title ?? sec.title })
          .eq("id", body.section_id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;
        await admin
          .from("efs_working_papers")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sec.working_paper_id);
        result = data;
        break;
      }

      case "TRANSITION_WORKING_PAPER": {
        if (!body.working_paper_id || !body.to_status) throw new Error("working_paper_id and to_status required.");
        const allowed = {
          draft: ["submitted"],
          submitted: ["reviewed", "draft"],
          reviewed: ["finalized", "submitted"],
          finalized: ["superseded"],
        };
        const { data: wp, error: wErr } = await admin
          .from("efs_working_papers")
          .select("*, efs_working_paper_sections(*)")
          .eq("id", body.working_paper_id)
          .eq("company_id", company_id)
          .single();
        if (wErr || !wp) throw new Error("Working Paper not found.");
        const next = body.to_status;
        if (!(allowed[wp.status] || []).includes(next)) {
          throw new Error(`Invalid WP transition ${wp.status} → ${next}`);
        }
        if (next === "finalized") {
          // Snapshot version is optional reference when supporting amounts — still not attachment parent
          if (body.require_snapshot && !body.snapshot_version_id && !wp.snapshot_version_id) {
            throw new Error("Finalize with amounts requires snapshot_version_id reference (not attachment parent).");
          }
        }

        const patch = {
          status: next,
          updated_at: new Date().toISOString(),
          snapshot_version_id: body.snapshot_version_id ?? wp.snapshot_version_id,
        };
        if (next === "submitted") {
          patch.prepared_by = user.id;
          patch.prepared_at = new Date().toISOString();
        }
        if (next === "reviewed" || next === "finalized") {
          patch.reviewed_by = user.id;
          patch.reviewed_at = new Date().toISOString();
        }

        const content_hash = await wpSha256({
          title: wp.title,
          sections: wp.efs_working_paper_sections,
          status: next,
        });
        patch.content_hash = content_hash;

        const { data: updated, error } = await admin
          .from("efs_working_papers")
          .update(patch)
          .eq("id", wp.id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;

        if (next === "finalized") {
          await admin.from("efs_working_paper_versions").insert({
            company_id,
            working_paper_id: wp.id,
            version_no: wp.current_version_no || 1,
            status: "finalized",
            content_snapshot: {
              title: wp.title,
              sections: wp.efs_working_paper_sections,
              structure_node_id: wp.structure_node_id,
              snapshot_version_id: updated.snapshot_version_id,
            },
            content_hash,
            author_user_id: user.id,
          });
        }

        await appendReviewHistory(admin, {
          company_id,
          workspace_id: wp.workspace_id,
          working_paper_id: wp.id,
          event_type: "wp.status_change",
          actor_user_id: user.id,
          from_status: wp.status,
          to_status: next,
          message: `WP status ${wp.status} → ${next}`,
        });

        result = updated;
        break;
      }

      case "LIST_LEAD_SCHEDULES": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_lead_schedules")
          .select("*, efs_structure_nodes(node_code, path), efs_lead_schedule_lines(*)")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "CREATE_LEAD_SCHEDULE": {
        if (!body.workspace_id || !body.structure_node_id) {
          throw new Error("workspace_id and structure_node_id are required.");
        }
        const ap = await resolveStructureAttachmentPoint(admin, {
          structure_node_id: body.structure_node_id,
          kind_code: "lead_schedule",
        });
        const opening = Number(body.opening_balance || 0);
        const closing = Number(body.closing_balance || 0);
        const lines = body.lines || [
          { line_no: 1, description: "Opening balance", amount: opening, movement_type: "opening" },
          { line_no: 2, description: "Closing balance", amount: closing, movement_type: "closing", source_ref: body.source_ref || null },
        ];
        const { data: lead, error } = await admin
          .from("efs_lead_schedules")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            attachment_point_id: ap.id,
            structure_node_id: ap.structure_node_id,
            title: body.title || "Lead Schedule",
            schedule_type: body.schedule_type || "rollforward",
            control_account_ref: body.control_account_ref ?? null,
            opening_balance: opening,
            closing_balance: closing,
            variance_to_gl: Number(body.variance_to_gl || 0),
            status: "draft",
            prepared_by: user.id,
            prepared_at: new Date().toISOString(),
            created_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;

        const lineRows = lines.map((l, i) => ({
          company_id,
          lead_schedule_id: lead.id,
          line_no: l.line_no ?? i + 1,
          description: l.description,
          amount: Number(l.amount || 0),
          movement_type: l.movement_type || "movement",
          source_ref: l.source_ref ?? null,
          taxonomy_hint: l.taxonomy_hint ?? null,
        }));
        const { error: lErr } = await admin.from("efs_lead_schedule_lines").insert(lineRows);
        if (lErr) throw lErr;

        await admin
          .from("efs_attachment_points")
          .update({ status: "bound", reserved_artefact_ref: lead.id })
          .eq("id", ap.id);

        await admin.from("efs_attachment_points").insert({
          kind_code: "lead_schedule",
          structure_node_id: ap.structure_node_id,
          status: "open",
        });

        await appendReviewHistory(admin, {
          company_id,
          workspace_id: body.workspace_id,
          lead_schedule_id: lead.id,
          event_type: "lead.created",
          actor_user_id: user.id,
          to_status: "draft",
          message: `Lead Schedule created on structure node`,
        });

        result = lead;
        break;
      }

      case "TRANSITION_LEAD_SCHEDULE": {
        if (!body.lead_schedule_id || !body.to_status) throw new Error("lead_schedule_id and to_status required.");
        const allowed = {
          draft: ["prepared"],
          prepared: ["reviewed", "draft"],
          reviewed: ["locked_to_snapshot", "prepared"],
          locked_to_snapshot: ["superseded"],
        };
        const { data: lead, error: lErr } = await admin
          .from("efs_lead_schedules")
          .select("*, efs_lead_schedule_lines(*)")
          .eq("id", body.lead_schedule_id)
          .eq("company_id", company_id)
          .single();
        if (lErr || !lead) throw new Error("Lead Schedule not found.");
        const next = body.to_status;
        if (!(allowed[lead.status] || []).includes(next)) {
          throw new Error(`Invalid lead transition ${lead.status} → ${next}`);
        }
        if (next === "locked_to_snapshot" && !body.snapshot_version_id && !lead.snapshot_version_id) {
          throw new Error("Lock requires snapshot_version_id reference (pin), not as attachment parent.");
        }
        const content_hash = await wpSha256({
          lead_id: lead.id,
          lines: lead.efs_lead_schedule_lines,
          opening: lead.opening_balance,
          closing: lead.closing_balance,
        });
        const patch = {
          status: next,
          content_hash,
          updated_at: new Date().toISOString(),
          snapshot_version_id: body.snapshot_version_id ?? lead.snapshot_version_id,
        };
        if (next === "prepared") {
          patch.prepared_by = user.id;
          patch.prepared_at = new Date().toISOString();
        }
        if (next === "reviewed" || next === "locked_to_snapshot") {
          patch.reviewed_by = user.id;
          patch.reviewed_at = new Date().toISOString();
        }
        const { data: updated, error } = await admin
          .from("efs_lead_schedules")
          .update(patch)
          .eq("id", lead.id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;
        await appendReviewHistory(admin, {
          company_id,
          workspace_id: lead.workspace_id,
          lead_schedule_id: lead.id,
          event_type: "lead.status_change",
          actor_user_id: user.id,
          from_status: lead.status,
          to_status: next,
          message: `Lead status ${lead.status} → ${next}`,
        });
        result = updated;
        break;
      }

      case "CREATE_SUPPORTING_EVIDENCE": {
        if (!body.workspace_id || !body.structure_node_id) {
          throw new Error("workspace_id and structure_node_id are required.");
        }
        const ap = await resolveStructureAttachmentPoint(admin, {
          structure_node_id: body.structure_node_id,
          kind_code: "supporting_evidence",
        });
        const { data: ev, error } = await admin
          .from("efs_supporting_evidence")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            attachment_point_id: ap.id,
            structure_node_id: ap.structure_node_id,
            title: body.title || "Supporting Evidence",
            evidence_type: body.evidence_type || "document",
            storage_ref: body.storage_ref ?? null,
            content_hash: body.content_hash ?? null,
            prepared_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;

        if (body.working_paper_id || body.lead_schedule_id) {
          await admin.from("efs_evidence_references").insert({
            company_id,
            evidence_id: ev.id,
            working_paper_id: body.working_paper_id ?? null,
            lead_schedule_id: body.lead_schedule_id ?? null,
            reference_note: body.reference_note ?? null,
          });
        }

        await admin
          .from("efs_attachment_points")
          .update({ status: "bound", reserved_artefact_ref: ev.id })
          .eq("id", ap.id);

        await admin.from("efs_attachment_points").insert({
          kind_code: "supporting_evidence",
          structure_node_id: ap.structure_node_id,
          status: "open",
        });

        result = ev;
        break;
      }

      case "LIST_SUPPORTING_EVIDENCE": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_supporting_evidence")
          .select("*, efs_evidence_references(*), efs_structure_nodes(node_code, path)")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_TICK_MARKS": {
        const { data, error } = await admin.from("efs_tick_mark_catalogue").select("*").order("tick_code");
        if (error) throw error;
        result = data;
        break;
      }

      case "ASSIGN_REVIEWER": {
        if (!body.workspace_id || !body.assignee_user_id) {
          throw new Error("workspace_id and assignee_user_id required.");
        }
        if (!body.working_paper_id && !body.lead_schedule_id) {
          throw new Error("working_paper_id or lead_schedule_id required.");
        }
        const { data, error } = await admin
          .from("efs_reviewer_assignments")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            working_paper_id: body.working_paper_id ?? null,
            lead_schedule_id: body.lead_schedule_id ?? null,
            assignee_user_id: body.assignee_user_id,
            role_label: body.role_label || "reviewer",
            assigned_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;
        await appendReviewHistory(admin, {
          company_id,
          workspace_id: body.workspace_id,
          working_paper_id: body.working_paper_id ?? null,
          lead_schedule_id: body.lead_schedule_id ?? null,
          event_type: "reviewer.assigned",
          actor_user_id: user.id,
          message: `Assigned reviewer ${body.assignee_user_id}`,
          payload: { role_label: body.role_label || "reviewer" },
        });
        result = data;
        break;
      }

      case "ADD_REVIEW_NOTE": {
        if (!body.workspace_id || !body.body) throw new Error("workspace_id and body required.");
        if (!body.working_paper_id && !body.lead_schedule_id) {
          throw new Error("working_paper_id or lead_schedule_id required.");
        }
        const { data, error } = await admin
          .from("efs_review_notes")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            working_paper_id: body.working_paper_id ?? null,
            lead_schedule_id: body.lead_schedule_id ?? null,
            structure_node_id: body.structure_node_id ?? null,
            body: body.body,
            tick_code: body.tick_code ?? null,
            author_user_id: user.id,
          })
          .select()
          .single();
        if (error) throw error;
        await appendReviewHistory(admin, {
          company_id,
          workspace_id: body.workspace_id,
          working_paper_id: body.working_paper_id ?? null,
          lead_schedule_id: body.lead_schedule_id ?? null,
          event_type: "review_note.added",
          actor_user_id: user.id,
          tick_code: body.tick_code ?? null,
          message: body.body,
        });
        result = data;
        break;
      }

      case "CLEAR_REVIEW_NOTE": {
        if (!body.review_note_id) throw new Error("review_note_id required.");
        const { data, error } = await admin
          .from("efs_review_notes")
          .update({
            status: "cleared",
            cleared_by: user.id,
            cleared_at: new Date().toISOString(),
          })
          .eq("id", body.review_note_id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;
        await appendReviewHistory(admin, {
          company_id,
          workspace_id: data.workspace_id,
          working_paper_id: data.working_paper_id,
          lead_schedule_id: data.lead_schedule_id,
          event_type: "review_note.cleared",
          actor_user_id: user.id,
          message: `Cleared review note ${data.id}`,
        });
        result = data;
        break;
      }

      case "LIST_REVIEW_NOTES": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        let q = admin
          .from("efs_review_notes")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false });
        if (body.working_paper_id) q = q.eq("working_paper_id", body.working_paper_id);
        if (body.lead_schedule_id) q = q.eq("lead_schedule_id", body.lead_schedule_id);
        const { data, error } = await q;
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_REVIEW_HISTORY": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        let q = admin
          .from("efs_review_history")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false })
          .limit(body.limit || 100);
        if (body.working_paper_id) q = q.eq("working_paper_id", body.working_paper_id);
        if (body.lead_schedule_id) q = q.eq("lead_schedule_id", body.lead_schedule_id);
        const { data, error } = await q;
        if (error) throw error;
        result = data;
        break;
      }

      case "GET_CLOSE_EVIDENCE_DASHBOARD": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const [wps, leads, evidence, notes, history] = await Promise.all([
          admin.from("efs_working_papers").select("id, title, status, structure_node_id, prepared_by, reviewed_by, updated_at").eq("workspace_id", body.workspace_id).eq("company_id", company_id),
          admin.from("efs_lead_schedules").select("id, title, status, structure_node_id, prepared_by, reviewed_by, updated_at").eq("workspace_id", body.workspace_id).eq("company_id", company_id),
          admin.from("efs_supporting_evidence").select("id, title, evidence_type, structure_node_id, created_at").eq("workspace_id", body.workspace_id).eq("company_id", company_id),
          admin.from("efs_review_notes").select("id, status").eq("workspace_id", body.workspace_id).eq("company_id", company_id),
          admin.from("efs_review_history").select("id, event_type, message, created_at").eq("workspace_id", body.workspace_id).eq("company_id", company_id).order("created_at", { ascending: false }).limit(15),
        ]);
        result = {
          working_papers: wps.data || [],
          lead_schedules: leads.data || [],
          supporting_evidence: evidence.data || [],
          open_review_notes: (notes.data || []).filter((n) => n.status === "open").length,
          recent_history: history.data || [],
          attachment_rule: "structure_nodes_only",
          formal_review_workflow: false,
          validation_engine: false,
          publication: false,
        };
        break;
      }

      // ── Phase C3: Disclosure / Accounting Policy / Cross Reference Platform ─
      // Content owner only — no Validation / Review Workflow / Publication / XBRL / AI.
      case "LIST_DISCLOSURE_TEMPLATES": {
        const { data, error } = await admin
          .from("efs_disclosure_templates")
          .select("*, efs_disclosure_template_sections(*)")
          .or(`company_id.is.null,company_id.eq.${company_id}`)
          .eq("status", "active")
          .order("template_code");
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_FRAMEWORK_DISCLOSURE_MAPPINGS": {
        if (!body.framework_pack_id) throw new Error("framework_pack_id is required.");
        const { data, error } = await admin
          .from("efs_framework_disclosure_mappings")
          .select("*, efs_disclosure_templates(template_code, name, disclosure_kind)")
          .eq("framework_pack_id", body.framework_pack_id)
          .order("sort_order");
        if (error) throw error;
        result = {
          framework_pack_id: body.framework_pack_id,
          mappings: data || [],
          determines_required_disclosures: true,
          validation_engine: false,
        };
        break;
      }

      case "LIST_DISCLOSURE_INSTANCES": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_disclosure_instances")
          .select(`
            *,
            efs_structure_nodes(node_code, path, node_kind),
            efs_disclosure_nodes(disclosure_code, name),
            efs_disclosure_sections(*),
            efs_disclosure_paragraphs(*),
            efs_disclosure_tables(*)
          `)
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("sort_order");
        if (error) throw error;
        result = data;
        break;
      }

      case "CREATE_DISCLOSURE_INSTANCE": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        if (!body.structure_node_id && !body.structure_node_code) {
          throw new Error("structure_node_id or structure_node_code is required.");
        }
        if (body.statement_instance_id || body.journal_id || body.account_id) {
          throw new Error("EFS_ATTACHMENT_FORBIDDEN: Disclosure cannot attach to Statement Instance / GL / Journal");
        }

        let structure_node_id = body.structure_node_id;
        if (!structure_node_id && body.structure_node_code) {
          const sn = await resolveStructureNodeByCode(admin, body.structure_node_code);
          if (!sn) throw new Error(`Unknown structure node code: ${body.structure_node_code}`);
          structure_node_id = sn.id;
        }

        let disclosure_node_id = body.disclosure_node_id ?? null;
        if (!disclosure_node_id && body.disclosure_node_code) {
          const dn = await resolveDisclosureNodeByCode(admin, body.disclosure_node_code);
          disclosure_node_id = dn?.id ?? null;
        }

        let template = null;
        if (body.template_id) {
          const { data: t } = await admin
            .from("efs_disclosure_templates")
            .select("*, efs_disclosure_template_sections(*)")
            .eq("id", body.template_id)
            .maybeSingle();
          template = t;
        } else if (body.template_code) {
          const { data: t } = await admin
            .from("efs_disclosure_templates")
            .select("*, efs_disclosure_template_sections(*)")
            .eq("template_code", body.template_code)
            .is("company_id", null)
            .maybeSingle();
          template = t;
        }

        const ap = await resolveNoteAttachmentPoint(admin, {
          structure_node_id,
          disclosure_node_id,
        });

        const disclosure_code = body.disclosure_code || template?.template_code || `DISC.${Date.now()}`;
        const title = body.title || template?.name || "Disclosure";

        const { data: inst, error } = await admin
          .from("efs_disclosure_instances")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            template_id: template?.id ?? null,
            framework_pack_id: body.framework_pack_id ?? null,
            framework_mapping_id: body.framework_mapping_id ?? null,
            disclosure_code,
            title,
            disclosure_kind: body.disclosure_kind || template?.disclosure_kind || "note",
            attachment_point_id: ap.id,
            structure_node_id: ap.structure_node_id,
            disclosure_node_id: disclosure_node_id ?? ap.disclosure_node_id ?? null,
            working_paper_id: body.working_paper_id ?? null,
            accounting_policy_set_id: body.accounting_policy_set_id ?? null,
            requirement_level: body.requirement_level || "required",
            status: "draft",
            note_number: body.note_number ?? null,
            sort_order: body.sort_order ?? 100,
            prepared_by: user.id,
            prepared_at: new Date().toISOString(),
            created_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;

        const sectionRows = (template?.efs_disclosure_template_sections || [
          { section_code: "body", title: "Disclosure body", sort_order: 10 },
        ]).map((s) => ({
          company_id,
          disclosure_instance_id: inst.id,
          section_code: s.section_code,
          title: s.title,
          body: "",
          sort_order: s.sort_order,
        }));
        if (sectionRows.length) {
          const { error: sErr } = await admin.from("efs_disclosure_sections").insert(sectionRows);
          if (sErr) throw sErr;
        }

        // Seed one empty paragraph under first section
        const { data: secs } = await admin
          .from("efs_disclosure_sections")
          .select("id")
          .eq("disclosure_instance_id", inst.id)
          .order("sort_order")
          .limit(1);
        if (secs?.[0]) {
          await admin.from("efs_disclosure_paragraphs").insert({
            company_id,
            disclosure_instance_id: inst.id,
            section_id: secs[0].id,
            paragraph_code: "P1",
            body: "",
            sort_order: 10,
          });
        }

        await admin
          .from("efs_attachment_points")
          .update({ status: "bound", reserved_artefact_ref: inst.id })
          .eq("id", ap.id);

        await ensureOpenNotePlaceholder(admin, {
          structure_node_id: ap.structure_node_id,
          disclosure_node_id: ap.disclosure_node_id,
        });

        // Primary disclosure reference → structure
        await admin.from("efs_disclosure_content_references").insert({
          company_id,
          disclosure_instance_id: inst.id,
          structure_node_id: ap.structure_node_id,
          reference_role: "discloses",
          reference_note: "Primary statement structure attachment",
        });

        if (body.working_paper_id) {
          await admin.from("efs_disclosure_content_references").insert({
            company_id,
            disclosure_instance_id: inst.id,
            working_paper_id: body.working_paper_id,
            reference_role: "supports",
            reference_note: "Working Paper linkage",
          });
        }

        await writeActivity(admin, {
          company_id,
          workspace_id: body.workspace_id,
          event_type: "disclosure.created",
          entity_type: "disclosure_instance",
          entity_id: inst.id,
          actor_user_id: user.id,
          message: `Disclosure: ${title}`,
        });

        result = inst;
        break;
      }

      case "ASSEMBLE_DISCLOSURES_FROM_FRAMEWORK": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        if (!body.framework_pack_id) throw new Error("framework_pack_id is required.");

        const { data: mappings, error: mErr } = await admin
          .from("efs_framework_disclosure_mappings")
          .select("*, efs_disclosure_templates(*, efs_disclosure_template_sections(*))")
          .eq("framework_pack_id", body.framework_pack_id)
          .order("sort_order");
        if (mErr) throw mErr;

        const created = [];
        const skipped = [];
        for (const map of mappings || []) {
          const { data: existing } = await admin
            .from("efs_disclosure_instances")
            .select("id, disclosure_code, status")
            .eq("workspace_id", body.workspace_id)
            .eq("disclosure_code", map.disclosure_code)
            .maybeSingle();
          if (existing) {
            skipped.push(existing);
            continue;
          }

          const sn = await resolveStructureNodeByCode(admin, map.structure_node_code);
          if (!sn) {
            skipped.push({ disclosure_code: map.disclosure_code, reason: "structure_node_missing" });
            continue;
          }
          const dn = await resolveDisclosureNodeByCode(admin, map.disclosure_node_code);
          const template = map.efs_disclosure_templates;
          const ap = await resolveNoteAttachmentPoint(admin, {
            structure_node_id: sn.id,
            disclosure_node_id: dn?.id ?? null,
          });

          const { data: inst, error } = await admin
            .from("efs_disclosure_instances")
            .insert({
              company_id,
              workspace_id: body.workspace_id,
              template_id: template?.id ?? map.template_id,
              framework_pack_id: body.framework_pack_id,
              framework_mapping_id: map.id,
              disclosure_code: map.disclosure_code,
              title: template?.name || map.disclosure_code,
              disclosure_kind: template?.disclosure_kind || "note",
              attachment_point_id: ap.id,
              structure_node_id: sn.id,
              disclosure_node_id: dn?.id ?? null,
              requirement_level: map.requirement_level,
              status: "draft",
              sort_order: map.sort_order,
              prepared_by: user.id,
              prepared_at: new Date().toISOString(),
              created_by: user.id,
            })
            .select()
            .single();
          if (error) throw error;

          const sectionRows = (template?.efs_disclosure_template_sections || []).map((s) => ({
            company_id,
            disclosure_instance_id: inst.id,
            section_code: s.section_code,
            title: s.title,
            body: "",
            sort_order: s.sort_order,
          }));
          if (sectionRows.length) {
            await admin.from("efs_disclosure_sections").insert(sectionRows);
          }
          if (template?.disclosure_kind === "table") {
            await admin.from("efs_disclosure_tables").insert({
              company_id,
              disclosure_instance_id: inst.id,
              table_code: "T1",
              title: `${template.name} table`,
              columns_json: [],
              rows_json: [],
              sort_order: 10,
            });
          }

          await admin
            .from("efs_attachment_points")
            .update({ status: "bound", reserved_artefact_ref: inst.id })
            .eq("id", ap.id);
          await ensureOpenNotePlaceholder(admin, {
            structure_node_id: sn.id,
            disclosure_node_id: dn?.id ?? null,
          });
          await admin.from("efs_disclosure_content_references").insert({
            company_id,
            disclosure_instance_id: inst.id,
            structure_node_id: sn.id,
            reference_role: "discloses",
          });
          created.push(inst);
        }

        await writeActivity(admin, {
          company_id,
          workspace_id: body.workspace_id,
          event_type: "disclosure.assembled",
          entity_type: "disclosure_pack",
          entity_id: body.workspace_id,
          actor_user_id: user.id,
          message: `Assembled ${created.length} disclosures from framework mapping (skipped ${skipped.length})`,
        });

        result = {
          created,
          skipped,
          validation_engine: false,
          completeness_validated: false,
        };
        break;
      }

      case "UPDATE_DISCLOSURE_SECTION": {
        if (!body.section_id) throw new Error("section_id is required.");
        const { data: sec, error: sErr } = await admin
          .from("efs_disclosure_sections")
          .select("*, efs_disclosure_instances!inner(id, status, company_id)")
          .eq("id", body.section_id)
          .eq("company_id", company_id)
          .single();
        if (sErr || !sec) throw new Error("Disclosure section not found.");
        if (sec.efs_disclosure_instances.status === "superseded") {
          throw new Error("Cannot edit sections of a superseded disclosure.");
        }
        const { data, error } = await admin
          .from("efs_disclosure_sections")
          .update({ body: body.body ?? sec.body, title: body.title ?? sec.title })
          .eq("id", body.section_id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;
        await admin.from("efs_disclosure_instances").update({
          status: sec.efs_disclosure_instances.status === "draft" ? "in_progress" : sec.efs_disclosure_instances.status,
          updated_at: new Date().toISOString(),
        }).eq("id", sec.disclosure_instance_id);
        result = data;
        break;
      }

      case "UPDATE_DISCLOSURE_PARAGRAPH": {
        if (!body.paragraph_id && !body.disclosure_instance_id) {
          throw new Error("paragraph_id or disclosure_instance_id is required.");
        }
        if (body.paragraph_id) {
          const { data: para, error: pErr } = await admin
            .from("efs_disclosure_paragraphs")
            .select("*, efs_disclosure_instances!inner(id, status)")
            .eq("id", body.paragraph_id)
            .eq("company_id", company_id)
            .single();
          if (pErr || !para) throw new Error("Paragraph not found.");
          if (para.efs_disclosure_instances.status === "superseded") {
            throw new Error("Cannot edit paragraphs of a superseded disclosure.");
          }
          const { data, error } = await admin
            .from("efs_disclosure_paragraphs")
            .update({ body: body.body ?? para.body })
            .eq("id", body.paragraph_id)
            .select()
            .single();
          if (error) throw error;
          await admin.from("efs_disclosure_instances").update({
            status: para.efs_disclosure_instances.status === "draft" ? "in_progress" : para.efs_disclosure_instances.status,
            updated_at: new Date().toISOString(),
          }).eq("id", para.disclosure_instance_id);
          result = data;
          break;
        }

        // Create paragraph
        const { data, error } = await admin
          .from("efs_disclosure_paragraphs")
          .insert({
            company_id,
            disclosure_instance_id: body.disclosure_instance_id,
            section_id: body.section_id ?? null,
            paragraph_code: body.paragraph_code || `P${Date.now()}`,
            body: body.body || "",
            sort_order: body.sort_order ?? 100,
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      case "UPDATE_DISCLOSURE_TABLE": {
        if (!body.table_id && !body.disclosure_instance_id) {
          throw new Error("table_id or disclosure_instance_id is required.");
        }
        if (body.table_id) {
          const { data: tbl, error: tErr } = await admin
            .from("efs_disclosure_tables")
            .select("*, efs_disclosure_instances!inner(id, status)")
            .eq("id", body.table_id)
            .eq("company_id", company_id)
            .single();
          if (tErr || !tbl) throw new Error("Disclosure table not found.");
          if (tbl.efs_disclosure_instances.status === "superseded") {
            throw new Error("Cannot edit tables of a superseded disclosure.");
          }
          // Presentation storage only — never recalculates statement/engine amounts
          const { data, error } = await admin
            .from("efs_disclosure_tables")
            .update({
              title: body.title ?? tbl.title,
              columns_json: body.columns_json ?? tbl.columns_json,
              rows_json: body.rows_json ?? tbl.rows_json,
              snapshot_version_id: body.snapshot_version_id ?? tbl.snapshot_version_id,
            })
            .eq("id", body.table_id)
            .select()
            .single();
          if (error) throw error;
          result = data;
          break;
        }
        const { data, error } = await admin
          .from("efs_disclosure_tables")
          .insert({
            company_id,
            disclosure_instance_id: body.disclosure_instance_id,
            section_id: body.section_id ?? null,
            table_code: body.table_code || `T${Date.now()}`,
            title: body.title || "Disclosure table",
            columns_json: body.columns_json || [],
            rows_json: body.rows_json || [],
            snapshot_version_id: body.snapshot_version_id ?? null,
            sort_order: body.sort_order ?? 100,
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      case "TRANSITION_DISCLOSURE_STATUS": {
        if (!body.disclosure_instance_id || !body.to_status) {
          throw new Error("disclosure_instance_id and to_status required.");
        }
        const allowed = {
          draft: ["in_progress", "complete", "superseded"],
          in_progress: ["complete", "draft", "superseded"],
          complete: ["superseded", "in_progress"],
          superseded: [],
        };
        const { data: inst, error: iErr } = await admin
          .from("efs_disclosure_instances")
          .select("*, efs_disclosure_sections(*), efs_disclosure_paragraphs(*), efs_disclosure_tables(*)")
          .eq("id", body.disclosure_instance_id)
          .eq("company_id", company_id)
          .single();
        if (iErr || !inst) throw new Error("Disclosure instance not found.");
        const next = body.to_status;
        if (!(allowed[inst.status] || []).includes(next)) {
          throw new Error(`Invalid disclosure status transition ${inst.status} → ${next}`);
        }
        const content_hash = await discSha256({
          title: inst.title,
          sections: inst.efs_disclosure_sections,
          paragraphs: inst.efs_disclosure_paragraphs,
          tables: inst.efs_disclosure_tables,
          status: next,
        });
        const { data: updated, error } = await admin
          .from("efs_disclosure_instances")
          .update({
            status: next,
            content_hash,
            updated_at: new Date().toISOString(),
            note_number: body.note_number ?? inst.note_number,
          })
          .eq("id", inst.id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;
        await writeActivity(admin, {
          company_id,
          workspace_id: inst.workspace_id,
          event_type: "disclosure.status",
          entity_type: "disclosure_instance",
          entity_id: inst.id,
          actor_user_id: user.id,
          message: `Disclosure ${inst.disclosure_code}: ${inst.status} → ${next}`,
        });
        result = updated;
        break;
      }

      case "LINK_DISCLOSURE_WORKING_PAPER": {
        if (!body.disclosure_instance_id || !body.working_paper_id) {
          throw new Error("disclosure_instance_id and working_paper_id required.");
        }
        const { data: inst, error: iErr } = await admin
          .from("efs_disclosure_instances")
          .select("*")
          .eq("id", body.disclosure_instance_id)
          .eq("company_id", company_id)
          .single();
        if (iErr || !inst) throw new Error("Disclosure instance not found.");
        const { data: wp, error: wErr } = await admin
          .from("efs_working_papers")
          .select("id, workspace_id")
          .eq("id", body.working_paper_id)
          .eq("company_id", company_id)
          .single();
        if (wErr || !wp) throw new Error("Working Paper not found.");
        if (wp.workspace_id !== inst.workspace_id) {
          throw new Error("Working Paper must belong to the same workspace.");
        }

        const { data: updated, error } = await admin
          .from("efs_disclosure_instances")
          .update({ working_paper_id: wp.id, updated_at: new Date().toISOString() })
          .eq("id", inst.id)
          .select()
          .single();
        if (error) throw error;

        const role = body.reference_role || "supports";
        const { data: existingRef } = await admin
          .from("efs_disclosure_content_references")
          .select("id")
          .eq("disclosure_instance_id", inst.id)
          .eq("working_paper_id", wp.id)
          .eq("reference_role", role)
          .maybeSingle();
        if (!existingRef) {
          await admin.from("efs_disclosure_content_references").insert({
            company_id,
            disclosure_instance_id: inst.id,
            working_paper_id: wp.id,
            reference_role: role,
            reference_note: body.reference_note || "Working Paper linkage",
          });
        }

        result = updated;
        break;
      }

      case "LIST_DISCLOSURE_REFERENCES": {
        if (!body.disclosure_instance_id && !body.workspace_id) {
          throw new Error("disclosure_instance_id or workspace_id required.");
        }
        let q = admin
          .from("efs_disclosure_content_references")
          .select(`
            *,
            efs_structure_nodes(node_code, path),
            efs_disclosure_nodes(disclosure_code, name),
            efs_working_papers(id, title, status)
          `)
          .eq("company_id", company_id);
        if (body.disclosure_instance_id) q = q.eq("disclosure_instance_id", body.disclosure_instance_id);
        if (body.workspace_id) {
          const { data: ids } = await admin
            .from("efs_disclosure_instances")
            .select("id")
            .eq("workspace_id", body.workspace_id)
            .eq("company_id", company_id);
          q = q.in("disclosure_instance_id", (ids || []).map((r) => r.id));
        }
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "CREATE_DISCLOSURE_REFERENCE": {
        if (!body.disclosure_instance_id) throw new Error("disclosure_instance_id is required.");
        if (!body.structure_node_id && !body.disclosure_node_id && !body.working_paper_id) {
          throw new Error("structure_node_id, disclosure_node_id, or working_paper_id required.");
        }
        const { data, error } = await admin
          .from("efs_disclosure_content_references")
          .insert({
            company_id,
            disclosure_instance_id: body.disclosure_instance_id,
            structure_node_id: body.structure_node_id ?? null,
            disclosure_node_id: body.disclosure_node_id ?? null,
            working_paper_id: body.working_paper_id ?? null,
            reference_role: body.reference_role || "supports",
            reference_note: body.reference_note ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      case "CREATE_ACCOUNTING_POLICY_SET": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        if (!body.framework_pack_id) throw new Error("framework_pack_id is required.");
        const { data, error } = await admin
          .from("efs_accounting_policy_sets")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            framework_pack_id: body.framework_pack_id,
            title: body.title || "Accounting Policies",
            status: "draft",
            version_no: body.version_no || 1,
            prepared_by: user.id,
            prepared_at: new Date().toISOString(),
            created_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_ACCOUNTING_POLICY_SETS": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_accounting_policy_sets")
          .select("*, efs_accounting_policies(*)")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_ACCOUNTING_POLICY": {
        if (!body.policy_set_id) throw new Error("policy_set_id is required.");
        if (!body.policy_code || !body.title) throw new Error("policy_code and title required.");
        const { data: set, error: sErr } = await admin
          .from("efs_accounting_policy_sets")
          .select("*")
          .eq("id", body.policy_set_id)
          .eq("company_id", company_id)
          .single();
        if (sErr || !set) throw new Error("Accounting policy set not found.");
        if (set.status === "superseded") throw new Error("Cannot edit superseded policy set.");

        const { data: existing } = await admin
          .from("efs_accounting_policies")
          .select("id")
          .eq("policy_set_id", body.policy_set_id)
          .eq("policy_code", body.policy_code)
          .maybeSingle();

        let data;
        if (existing) {
          const { data: updated, error } = await admin
            .from("efs_accounting_policies")
            .update({
              title: body.title,
              body: body.body ?? "",
              sort_order: body.sort_order ?? 100,
              disclosure_template_id: body.disclosure_template_id ?? null,
              structure_node_id: body.structure_node_id ?? null,
              status: body.status || "draft",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();
          if (error) throw error;
          data = updated;
        } else {
          const { data: inserted, error } = await admin
            .from("efs_accounting_policies")
            .insert({
              company_id,
              policy_set_id: body.policy_set_id,
              policy_code: body.policy_code,
              title: body.title,
              body: body.body || "",
              sort_order: body.sort_order ?? 100,
              disclosure_template_id: body.disclosure_template_id ?? null,
              structure_node_id: body.structure_node_id ?? null,
              status: body.status || "draft",
            })
            .select()
            .single();
          if (error) throw error;
          data = inserted;
        }
        await admin.from("efs_accounting_policy_sets").update({
          updated_at: new Date().toISOString(),
        }).eq("id", body.policy_set_id);
        result = data;
        break;
      }

      case "TRANSITION_ACCOUNTING_POLICY_SET": {
        if (!body.policy_set_id || !body.to_status) {
          throw new Error("policy_set_id and to_status required.");
        }
        const allowed = {
          draft: ["active", "superseded"],
          active: ["superseded"],
          superseded: [],
        };
        const { data: set, error: sErr } = await admin
          .from("efs_accounting_policy_sets")
          .select("*")
          .eq("id", body.policy_set_id)
          .eq("company_id", company_id)
          .single();
        if (sErr || !set) throw new Error("Policy set not found.");
        if (!(allowed[set.status] || []).includes(body.to_status)) {
          throw new Error(`Invalid policy set transition ${set.status} → ${body.to_status}`);
        }
        const { data, error } = await admin
          .from("efs_accounting_policy_sets")
          .update({
            status: body.to_status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", set.id)
          .select()
          .single();
        if (error) throw error;
        if (body.to_status === "active") {
          await admin
            .from("efs_accounting_policies")
            .update({ status: "active", updated_at: new Date().toISOString() })
            .eq("policy_set_id", set.id)
            .eq("company_id", company_id);
        }
        result = data;
        break;
      }

      case "CREATE_CROSS_REFERENCE": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        if (!body.source_kind || !body.source_id || !body.target_kind || !body.target_id) {
          throw new Error("source_kind, source_id, target_kind, target_id required.");
        }
        if (body.statement_instance_id || body.journal_id || body.account_id) {
          throw new Error("EFS_ATTACHMENT_FORBIDDEN: Cross reference cannot parent Statement Instance / GL / Journal");
        }

        let attachment_point_id = body.attachment_point_id ?? null;
        if (body.structure_node_id || body.disclosure_node_id) {
          const ap = await resolveCrossReferenceAttachmentPoint(admin, {
            structure_node_id: body.structure_node_id,
            disclosure_node_id: body.disclosure_node_id,
          });
          attachment_point_id = ap?.id ?? null;
        }

        const { data, error } = await admin
          .from("efs_cross_references")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            source_kind: body.source_kind,
            source_id: body.source_id,
            target_kind: body.target_kind,
            target_id: body.target_id,
            attachment_point_id,
            label: body.label ?? null,
            bidirectional: body.bidirectional !== false,
            status: "active",
            created_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;

        if (data.bidirectional) {
          await admin.from("efs_cross_references").insert({
            company_id,
            workspace_id: body.workspace_id,
            source_kind: body.target_kind,
            source_id: body.target_id,
            target_kind: body.source_kind,
            target_id: body.source_id,
            attachment_point_id,
            label: body.label ? `↔ ${body.label}` : null,
            bidirectional: true,
            status: "active",
            created_by: user.id,
          });
        }

        result = data;
        break;
      }

      case "LIST_CROSS_REFERENCES": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        let q = admin
          .from("efs_cross_references")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .eq("status", body.status || "active")
          .order("created_at", { ascending: false })
          .limit(body.limit || 500);
        if (body.source_kind) q = q.eq("source_kind", body.source_kind);
        if (body.source_id) q = q.eq("source_id", body.source_id);
        if (body.target_kind) q = q.eq("target_kind", body.target_kind);
        if (body.target_id) q = q.eq("target_id", body.target_id);
        const { data, error } = await q;
        if (error) throw error;
        result = data;
        break;
      }

      case "GET_DISCLOSURE_DASHBOARD": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const [inst, policies, xrefs, mappings] = await Promise.all([
          admin.from("efs_disclosure_instances").select("id, disclosure_code, title, status, requirement_level, structure_node_id, working_paper_id, sort_order, updated_at").eq("workspace_id", body.workspace_id).eq("company_id", company_id).order("sort_order"),
          admin.from("efs_accounting_policy_sets").select("id, title, status, version_no, updated_at").eq("workspace_id", body.workspace_id).eq("company_id", company_id),
          admin.from("efs_cross_references").select("id, source_kind, target_kind, label, status").eq("workspace_id", body.workspace_id).eq("company_id", company_id).eq("status", "active").limit(50),
          body.framework_pack_id
            ? admin.from("efs_framework_disclosure_mappings").select("id, disclosure_code, requirement_level").eq("framework_pack_id", body.framework_pack_id)
            : Promise.resolve({ data: [] }),
        ]);
        const instances = inst.data || [];
        result = {
          disclosures: instances,
          by_status: {
            draft: instances.filter((d) => d.status === "draft").length,
            in_progress: instances.filter((d) => d.status === "in_progress").length,
            complete: instances.filter((d) => d.status === "complete").length,
            superseded: instances.filter((d) => d.status === "superseded").length,
          },
          accounting_policy_sets: policies.data || [],
          cross_references: xrefs.data || [],
          framework_mappings: mappings.data || [],
          attachment_rule: "structure_nodes_via_note_placeholder",
          duplicates_statement_content: false,
          duplicates_calculations: false,
          validation_engine: false,
          review_workflow: false,
          publication: false,
          xbrl: false,
          ai_generation: false,
        };
        break;
      }

      // ── Phase D1: Enterprise Validation Platform ────────────────────────────
      // Identifies defects. Does NOT approve. Does NOT mutate financial data.
      case "LIST_VALIDATION_RULES": {
        const { data, error } = await admin
          .from("efs_validation_rules")
          .select("*")
          .eq("status", "active")
          .order("engine_scope")
          .order("rule_code");
        if (error) throw error;
        result = {
          rules: data || [],
          engines: ["technical", "framework"],
          approves_statements: false,
        };
        break;
      }

      case "LIST_FRAMEWORK_VALIDATION_MAPPINGS": {
        if (!body.framework_pack_id) throw new Error("framework_pack_id is required.");
        const { data, error } = await admin
          .from("efs_framework_validation_mappings")
          .select("*, efs_validation_rules(*)")
          .eq("framework_pack_id", body.framework_pack_id)
          .eq("enabled", true);
        if (error) throw error;
        result = {
          framework_pack_id: body.framework_pack_id,
          mappings: data || [],
          packs_define_rules_only: true,
        };
        break;
      }

      case "RUN_VALIDATION": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");

        const { data: workspace, error: wErr } = await admin
          .from("efs_reporting_workspaces")
          .select("*, efs_framework_bindings(framework_pack_id, efs_framework_packs(id, framework_key))")
          .eq("id", body.workspace_id)
          .eq("company_id", company_id)
          .single();
        if (wErr || !workspace) throw new Error("Workspace not found.");

        let framework_pack_id =
          body.framework_pack_id ||
          workspace.efs_framework_bindings?.framework_pack_id ||
          workspace.efs_framework_bindings?.efs_framework_packs?.id ||
          null;
        if (!framework_pack_id && workspace.framework_binding_id) {
          const { data: binding } = await admin
            .from("efs_framework_bindings")
            .select("framework_pack_id")
            .eq("id", workspace.framework_binding_id)
            .maybeSingle();
          framework_pack_id = binding?.framework_pack_id ?? null;
        }

        let snapshot_version_id = body.snapshot_version_id || null;
        if (!snapshot_version_id) {
          const { data: snaps } = await admin
            .from("efs_reporting_snapshots")
            .select(
              "id, current_version_id, efs_snapshot_versions!efs_snapshot_versions_snapshot_id_fkey(id, status, version_no)",
            )
            .eq("workspace_id", body.workspace_id)
            .eq("company_id", company_id)
            .order("created_at", { ascending: false })
            .limit(1);
          const snap = snaps?.[0];
          if (snap?.current_version_id) snapshot_version_id = snap.current_version_id;
          else if (snap?.efs_snapshot_versions?.length) {
            snapshot_version_id = [...snap.efs_snapshot_versions].sort((a, b) => b.version_no - a.version_no)[0]?.id;
          }
        }

        const run_type = body.run_type || "full";
        if (!["full", "technical_only", "framework_only"].includes(run_type)) {
          throw new Error("run_type must be full | technical_only | framework_only");
        }

        const { data: run, error: runErr } = await admin
          .from("efs_validation_runs")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            framework_pack_id,
            snapshot_version_id,
            run_type,
            status: "running",
            mutates_financial_data: false,
            live_gl_read: false,
            started_by: user.id,
            engine_version: "6.4.5",
          })
          .select()
          .single();
        if (runErr) throw runErr;

        const ctx = await loadValidationContext(admin, {
          company_id,
          workspace_id: body.workspace_id,
          snapshot_version_id,
          framework_pack_id,
        });

        let findings = [];
        if (run_type === "full" || run_type === "technical_only") {
          findings = findings.concat(runTechnicalValidation(ctx));
        }
        if (run_type === "full" || run_type === "framework_only") {
          findings = findings.concat(runFrameworkValidation(ctx));
        }

        const summary = summarizeFindings(findings);

        if (findings.length) {
          const rows = findings.map((f) => ({
            company_id,
            validation_run_id: run.id,
            rule_id: f.rule_id,
            rule_code: f.rule_code,
            issue_code: f.issue_code,
            title: f.title,
            message: f.message,
            severity: f.severity,
            recommendation: f.recommendation,
            structure_node_id: f.structure_node_id,
            disclosure_instance_id: f.disclosure_instance_id,
            working_paper_id: f.working_paper_id,
            statement_instance_id: f.statement_instance_id,
            resolution_status: "open",
            payload: f.payload || {},
          }));
          const { error: iErr } = await admin.from("efs_validation_issues").insert(rows);
          if (iErr) throw iErr;
        }

        const { data: completed, error: cErr } = await admin
          .from("efs_validation_runs")
          .update({
            status: summary.status,
            blocking_count: summary.blocking_count,
            significant_count: summary.significant_count,
            advisory_count: summary.advisory_count,
            total_issues: summary.total_issues,
            ready_for_review: summary.ready_for_review,
            completed_at: new Date().toISOString(),
            summary: {
              ...summary,
              framework_key: ctx.frameworkKey,
              snapshot_version_id,
              technical_count: findings.filter((f) => String(f.rule_code).startsWith("TECH.")).length,
              framework_count: findings.filter((f) => String(f.rule_code).startsWith("FW.")).length,
            },
          })
          .eq("id", run.id)
          .select()
          .single();
        if (cErr) throw cErr;

        await writeActivity(admin, {
          company_id,
          workspace_id: body.workspace_id,
          event_type: "validation.completed",
          entity_type: "validation_run",
          entity_id: run.id,
          actor_user_id: user.id,
          message: `Validation ${summary.status}: ${summary.blocking_count} blocking, ${summary.significant_count} significant, ${summary.advisory_count} advisory (ready_for_review=${summary.ready_for_review})`,
          payload: {
            ready_for_review: summary.ready_for_review,
            approves_statements: false,
            mutates_financial_data: false,
            live_gl_read: false,
          },
        });

        result = {
          run: completed,
          issues: findings,
          ready_for_review: summary.ready_for_review,
          approves_statements: false,
          mutates_financial_data: false,
          live_gl_read: false,
          manager_review: false,
          partner_review: false,
          publication: false,
          xbrl: false,
          ai: false,
        };
        break;
      }

      case "LIST_VALIDATION_RUNS": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_validation_runs")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("started_at", { ascending: false })
          .limit(body.limit || 25);
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_VALIDATION_ISSUES": {
        if (!body.validation_run_id && !body.workspace_id) {
          throw new Error("validation_run_id or workspace_id required.");
        }
        let runIds = body.validation_run_id ? [body.validation_run_id] : null;
        if (!runIds) {
          const { data: runs } = await admin
            .from("efs_validation_runs")
            .select("id")
            .eq("workspace_id", body.workspace_id)
            .eq("company_id", company_id)
            .order("started_at", { ascending: false })
            .limit(1);
          runIds = (runs || []).map((r) => r.id);
        }
        if (!runIds.length) {
          result = [];
          break;
        }
        let q = admin
          .from("efs_validation_issues")
          .select(`
            *,
            efs_structure_nodes(node_code, path),
            efs_disclosure_instances(disclosure_code, title, status),
            efs_working_papers(title, status)
          `)
          .eq("company_id", company_id)
          .in("validation_run_id", runIds)
          .order("severity")
          .order("created_at");
        if (body.severity) q = q.eq("severity", body.severity);
        if (body.resolution_status) q = q.eq("resolution_status", body.resolution_status);
        const { data, error } = await q;
        if (error) throw error;
        result = data;
        break;
      }

      case "RESOLVE_VALIDATION_ISSUE": {
        // Defect triage only — NOT Manager/Partner approval, NOT publication gate override
        if (!body.issue_id || !body.resolution_status) {
          throw new Error("issue_id and resolution_status required.");
        }
        if (!["acknowledged", "remediated", "waived", "open"].includes(body.resolution_status)) {
          throw new Error("resolution_status must be open | acknowledged | remediated | waived");
        }
        const { data: issue, error: iErr } = await admin
          .from("efs_validation_issues")
          .select("*, efs_validation_runs!inner(id, company_id, workspace_id)")
          .eq("id", body.issue_id)
          .eq("company_id", company_id)
          .single();
        if (iErr || !issue) throw new Error("Validation issue not found.");

        const { data, error } = await admin
          .from("efs_validation_issues")
          .update({
            resolution_status: body.resolution_status,
            resolution_note: body.resolution_note ?? issue.resolution_note,
            resolved_by: user.id,
            resolved_at: body.resolution_status === "open" ? null : new Date().toISOString(),
          })
          .eq("id", body.issue_id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;

        await writeActivity(admin, {
          company_id,
          workspace_id: issue.efs_validation_runs.workspace_id,
          event_type: "validation.issue_resolved",
          entity_type: "validation_issue",
          entity_id: issue.id,
          actor_user_id: user.id,
          message: `Validation issue ${issue.issue_code} → ${body.resolution_status} (triage only; not approval)`,
        });

        result = {
          issue: data,
          note: "Resolution is defect triage only. Validation does not approve statements.",
          approves_statements: false,
        };
        break;
      }

      case "GET_VALIDATION_DASHBOARD": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data: runs } = await admin
          .from("efs_validation_runs")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("started_at", { ascending: false })
          .limit(5);
        const latest = runs?.[0] || null;
        let issues = [];
        if (latest) {
          const { data } = await admin
            .from("efs_validation_issues")
            .select("id, rule_code, issue_code, title, severity, resolution_status, structure_node_id, disclosure_instance_id, working_paper_id, recommendation")
            .eq("validation_run_id", latest.id)
            .eq("company_id", company_id)
            .order("severity");
          issues = data || [];
        }
        result = {
          latest_run: latest,
          recent_runs: runs || [],
          open_issues: issues.filter((i) => i.resolution_status === "open"),
          issues,
          ready_for_review: latest?.ready_for_review === true,
          blocking_count: latest?.blocking_count ?? 0,
          significant_count: latest?.significant_count ?? 0,
          advisory_count: latest?.advisory_count ?? 0,
          // Hard platform guarantees
          mutates_financial_data: false,
          live_gl_read: false,
          approves_statements: false,
          manager_review: true,
          partner_review: true,
          publication: false,
          xbrl: false,
          ai: false,
          note: "Validation identifies defects; Review Workflow (D2) determines publication readiness",
        };
        break;
      }

      // ── Phase D2: Enterprise Review Workflow ───────────────────────────────
      // Acceptability for publication readiness. NEVER changes accounting balances.
      // Does NOT execute Publication / XBRL / AI.
      case "GET_OR_CREATE_PACK_REVIEW": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data: existing } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .eq("status", "open")
          .maybeSingle();
        if (existing) {
          result = existing;
          break;
        }

        let framework_pack_id = body.framework_pack_id || null;
        let snapshot_version_id = body.snapshot_version_id || null;
        let validation_run_id = body.validation_run_id || null;

        if (!validation_run_id) {
          const { data: runs } = await admin
            .from("efs_validation_runs")
            .select("id, ready_for_review, snapshot_version_id, framework_pack_id")
            .eq("workspace_id", body.workspace_id)
            .eq("company_id", company_id)
            .order("started_at", { ascending: false })
            .limit(1);
          validation_run_id = runs?.[0]?.id ?? null;
          snapshot_version_id = snapshot_version_id || runs?.[0]?.snapshot_version_id || null;
          framework_pack_id = framework_pack_id || runs?.[0]?.framework_pack_id || null;
        }

        const { fingerprint } = await buildPackFingerprint(admin, {
          company_id,
          workspace_id: body.workspace_id,
          validation_run_id,
          snapshot_version_id,
        });

        const { data: created, error } = await admin
          .from("efs_pack_reviews")
          .insert({
            company_id,
            workspace_id: body.workspace_id,
            validation_run_id,
            snapshot_version_id,
            framework_pack_id,
            stage: "draft",
            status: "open",
            pack_fingerprint: fingerprint,
            mutates_accounting: false,
            publication_executed: false,
            opened_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: created.id,
          event_type: "review.opened",
          actor_user_id: user.id,
          to_stage: "draft",
          message: "Pack review opened (draft)",
        });

        result = created;
        break;
      }

      case "ASSIGN_PACK_REVIEWER": {
        if (!body.pack_review_id || !body.reviewer_user_id || !body.role_code) {
          throw new Error("pack_review_id, reviewer_user_id, and role_code required.");
        }
        if (!["preparer", "manager", "partner", "observer"].includes(body.role_code)) {
          throw new Error("role_code must be preparer | manager | partner | observer");
        }
        const { data: review, error: rErr } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (rErr || !review) throw new Error("Pack review not found.");
        if (review.status !== "open") throw new Error("Cannot assign on closed review.");

        const { data, error } = await admin
          .from("efs_pack_review_assignments")
          .upsert(
            {
              company_id,
              pack_review_id: review.id,
              reviewer_user_id: body.reviewer_user_id,
              role_code: body.role_code,
              status: "assigned",
              assigned_by: user.id,
              assigned_at: new Date().toISOString(),
            },
            { onConflict: "pack_review_id,reviewer_user_id,role_code" },
          )
          .select()
          .single();
        if (error) throw error;

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: "review.assigned",
          actor_user_id: user.id,
          message: `Assigned ${body.role_code} reviewer`,
          payload: { assignment_id: data.id, reviewer_user_id: body.reviewer_user_id },
        });
        result = data;
        break;
      }

      case "LIST_PACK_REVIEW_ASSIGNMENTS": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data, error } = await admin
          .from("efs_pack_review_assignments")
          .select("*")
          .eq("pack_review_id", body.pack_review_id)
          .eq("company_id", company_id)
          .order("assigned_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "SUBMIT_FOR_VALIDATION_COMPLETE": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data: review, error: rErr } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (rErr || !review) throw new Error("Pack review not found.");
        if (review.stage !== "draft") throw new Error("Only draft reviews can be marked validation_complete.");

        const validation_run_id = body.validation_run_id || review.validation_run_id;
        const run = await requireValidationReady(admin, validation_run_id);
        assertTransition("draft", "validation_complete");

        const { fingerprint } = await buildPackFingerprint(admin, {
          company_id,
          workspace_id: review.workspace_id,
          validation_run_id,
          snapshot_version_id: review.snapshot_version_id || run.snapshot_version_id,
        });

        const { data: updated, error } = await admin
          .from("efs_pack_reviews")
          .update({
            stage: "validation_complete",
            validation_run_id,
            pack_fingerprint: fingerprint,
            updated_at: new Date().toISOString(),
          })
          .eq("id", review.id)
          .select()
          .single();
        if (error) throw error;

        await admin
          .from("efs_reporting_workspaces")
          .update({ status: "validated", progress_pct: Math.max(60, 0), updated_at: new Date().toISOString() })
          .eq("id", review.workspace_id)
          .eq("company_id", company_id);

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: "review.validation_complete",
          actor_user_id: user.id,
          from_stage: "draft",
          to_stage: "validation_complete",
          message: "Validation complete — ready to enter Manager Review",
          payload: { validation_run_id, ready_for_review: true },
        });
        result = updated;
        break;
      }

      case "START_MANAGER_REVIEW": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data: review, error: rErr } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (rErr || !review) throw new Error("Pack review not found.");
        if (review.stage !== "validation_complete" && review.stage !== "corrections") {
          throw new Error("Manager Review starts from validation_complete or corrections(return manager).");
        }
        if (review.stage === "corrections" && review.return_to_stage !== "manager_review") {
          throw new Error("This corrections cycle returns to Partner Review, not Manager Review.");
        }
        await requireValidationReady(admin, review.validation_run_id);
        const from = review.stage;
        const to = "manager_review";
        assertTransition(from, to, { return_to_stage: review.return_to_stage });

        const { data: mgr } = await admin
          .from("efs_pack_review_assignments")
          .select("id")
          .eq("pack_review_id", review.id)
          .eq("role_code", "manager")
          .in("status", ["assigned", "accepted"])
          .limit(1);
        if (!mgr?.length) throw new Error("Assign a Manager reviewer before starting Manager Review.");

        const { data: updated, error } = await admin
          .from("efs_pack_reviews")
          .update({
            stage: to,
            return_to_stage: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", review.id)
          .select()
          .single();
        if (error) throw error;

        await admin
          .from("efs_reporting_workspaces")
          .update({ status: "in_review", progress_pct: 70, updated_at: new Date().toISOString() })
          .eq("id", review.workspace_id)
          .eq("company_id", company_id);

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: "review.manager_started",
          actor_user_id: user.id,
          from_stage: from,
          to_stage: to,
          message: "Manager Review started",
        });
        result = updated;
        break;
      }

      case "START_PARTNER_REVIEW": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data: review, error: rErr } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (rErr || !review) throw new Error("Pack review not found.");
        const from = review.stage;
        if (!["manager_approved", "corrections"].includes(from)) {
          throw new Error("Partner Review starts from manager_approved or corrections(return partner).");
        }
        if (from === "corrections" && review.return_to_stage !== "partner_review") {
          throw new Error("This corrections cycle returns to Manager Review.");
        }
        assertTransition(from, "partner_review", { return_to_stage: review.return_to_stage });

        const { data: ptn } = await admin
          .from("efs_pack_review_assignments")
          .select("id")
          .eq("pack_review_id", review.id)
          .eq("role_code", "partner")
          .in("status", ["assigned", "accepted"])
          .limit(1);
        if (!ptn?.length) throw new Error("Assign a Partner reviewer before starting Partner Review.");

        const { data: updated, error } = await admin
          .from("efs_pack_reviews")
          .update({
            stage: "partner_review",
            return_to_stage: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", review.id)
          .select()
          .single();
        if (error) throw error;

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: "review.partner_started",
          actor_user_id: user.id,
          from_stage: from,
          to_stage: "partner_review",
          message: "Partner Review started",
        });
        result = updated;
        break;
      }

      case "RECORD_REVIEW_DECISION": {
        if (!body.pack_review_id || !body.decision_code || !body.actor_role) {
          throw new Error("pack_review_id, decision_code, and actor_role required.");
        }
        const decision_code = body.decision_code;
        if (!["approve", "reject", "request_changes", "escalate"].includes(decision_code)) {
          throw new Error("decision_code must be approve | reject | request_changes | escalate");
        }
        if (!["manager", "partner", "preparer"].includes(body.actor_role)) {
          throw new Error("actor_role must be manager | partner | preparer");
        }

        const { data: review, error: rErr } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (rErr || !review) throw new Error("Pack review not found.");
        if (review.status !== "open") throw new Error("Review is closed.");

        // Role/stage gates
        if (decision_code === "approve" || decision_code === "request_changes" || decision_code === "reject") {
          if (review.stage === "manager_review" && body.actor_role !== "manager") {
            throw new Error("Manager decisions require actor_role=manager at manager_review.");
          }
          if (review.stage === "partner_review" && body.actor_role !== "partner") {
            throw new Error("Partner decisions require actor_role=partner at partner_review.");
          }
        }
        if (decision_code === "escalate" && body.actor_role !== "manager") {
          throw new Error("Only manager may escalate to Partner Review.");
        }
        if (!["manager_review", "partner_review"].includes(review.stage) && decision_code !== "escalate") {
          // Allow finalize partner_approved → publication_ready via approve from partner
          if (!(review.stage === "partner_approved" && decision_code === "approve" && body.actor_role === "partner")) {
            throw new Error(`Decisions apply at manager_review / partner_review (current: ${review.stage})`);
          }
        }

        const mapped = mapDecisionToStages(review.stage, decision_code);
        assertTransition(review.stage, mapped.to_stage, {
          decision_code,
          return_to_stage: review.return_to_stage,
        });

        const decision_stage =
          review.stage === "partner_approved" ? "partner_review" : review.stage;

        const { data: decision, error: dErr } = await admin
          .from("efs_pack_review_decisions")
          .insert({
            company_id,
            pack_review_id: review.id,
            decision_code,
            decision_stage,
            from_stage: review.stage,
            to_stage: mapped.to_stage,
            actor_user_id: user.id,
            actor_role: body.actor_role,
            rationale: body.rationale ?? null,
          })
          .select()
          .single();
        if (dErr) throw dErr;

        const patch = {
          stage: mapped.to_stage,
          return_to_stage: mapped.return_to_stage,
          escalated: mapped.escalated ? true : review.escalated,
          updated_at: new Date().toISOString(),
        };
        if (mapped.to_stage === "rejected" || mapped.to_stage === "publication_ready") {
          patch.status = mapped.to_stage === "rejected" ? "closed" : "open";
          patch.closed_at = mapped.to_stage === "rejected" ? new Date().toISOString() : review.closed_at;
        }

        const { data: updated, error } = await admin
          .from("efs_pack_reviews")
          .update(patch)
          .eq("id", review.id)
          .select()
          .single();
        if (error) throw error;

        let signoff = null;
        if (decision_code === "approve" && ["manager", "partner"].includes(body.actor_role)) {
          const { fingerprint, payload } = await buildPackFingerprint(admin, {
            company_id,
            workspace_id: review.workspace_id,
            validation_run_id: review.validation_run_id,
            snapshot_version_id: review.snapshot_version_id,
          });
          const signature_payload = {
            pack_review_id: review.id,
            decision_id: decision.id,
            signer_user_id: user.id,
            signer_role: body.actor_role,
            stage: review.stage,
            to_stage: mapped.to_stage,
            pack_fingerprint: fingerprint,
            meaning: body.actor_role === "manager" ? "manager_approval" : "partner_approval",
            mutates_accounting: false,
            publication_executed: false,
            attested_at: new Date().toISOString(),
            consume: {
              validation_run_id: review.validation_run_id,
              statements: payload.statements,
              disclosures_count: payload.disclosures?.length ?? 0,
              working_papers_count: payload.working_papers?.length ?? 0,
            },
          };
          const signature_hash = await reviewSha256(signature_payload);
          const { data: so, error: sErr } = await admin
            .from("efs_pack_review_signoffs")
            .insert({
              company_id,
              pack_review_id: review.id,
              decision_id: decision.id,
              signer_user_id: user.id,
              signer_role: body.actor_role,
              stage: review.stage,
              meaning: signature_payload.meaning,
              signature_payload,
              signature_hash,
            })
            .select()
            .single();
          if (sErr) throw sErr;
          signoff = so;

          await admin
            .from("efs_pack_reviews")
            .update({ pack_fingerprint: fingerprint })
            .eq("id", review.id);
        }

        // Mark publication_ready workspace as approved (NOT published)
        if (mapped.to_stage === "publication_ready") {
          await admin
            .from("efs_reporting_workspaces")
            .update({ status: "approved", progress_pct: 90, updated_at: new Date().toISOString() })
            .eq("id", review.workspace_id)
            .eq("company_id", company_id);
        }
        if (mapped.to_stage === "manager_approved") {
          // Auto-advance visual readiness: remain in_review until partner
          await admin
            .from("efs_reporting_workspaces")
            .update({ status: "in_review", progress_pct: 80, updated_at: new Date().toISOString() })
            .eq("id", review.workspace_id)
            .eq("company_id", company_id);
        }

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: `review.decision.${decision_code}`,
          actor_user_id: user.id,
          from_stage: review.stage,
          to_stage: mapped.to_stage,
          decision_code,
          message: body.rationale || `Decision: ${decision_code}`,
          payload: { decision_id: decision.id, signoff_id: signoff?.id ?? null },
        });

        result = {
          review: updated,
          decision,
          signoff,
          mutates_accounting: false,
          publication_executed: false,
          publication: false,
          xbrl: false,
          ai: false,
        };
        break;
      }

      case "RESUBMIT_AFTER_CORRECTIONS": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data: review, error: rErr } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (rErr || !review) throw new Error("Pack review not found.");
        if (review.stage !== "corrections") throw new Error("Not in corrections stage.");
        const to = review.return_to_stage || "manager_review";
        assertTransition("corrections", to, { return_to_stage: to });

        // Optional: refresh validation if provided
        let validation_run_id = body.validation_run_id || review.validation_run_id;
        if (body.require_fresh_validation) {
          await requireValidationReady(admin, validation_run_id);
        }

        const { fingerprint } = await buildPackFingerprint(admin, {
          company_id,
          workspace_id: review.workspace_id,
          validation_run_id,
          snapshot_version_id: review.snapshot_version_id,
        });

        const { data: updated, error } = await admin
          .from("efs_pack_reviews")
          .update({
            stage: to,
            return_to_stage: null,
            validation_run_id,
            pack_fingerprint: fingerprint,
            updated_at: new Date().toISOString(),
          })
          .eq("id", review.id)
          .select()
          .single();
        if (error) throw error;

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: "review.corrections_resubmitted",
          actor_user_id: user.id,
          from_stage: "corrections",
          to_stage: to,
          message: "Corrections resubmitted to review stage",
        });
        result = updated;
        break;
      }

      case "MARK_PUBLICATION_READY": {
        // Partner Approved → Publication Ready (does NOT publish)
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data: review, error: rErr } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (rErr || !review) throw new Error("Pack review not found.");
        if (review.stage !== "partner_approved") {
          throw new Error("publication_ready requires partner_approved stage.");
        }
        assertTransition("partner_approved", "publication_ready");

        const { data: partnerSign } = await admin
          .from("efs_pack_review_signoffs")
          .select("id")
          .eq("pack_review_id", review.id)
          .eq("signer_role", "partner")
          .limit(1);
        if (!partnerSign?.length) throw new Error("Partner digital sign-off required.");

        const { data: updated, error } = await admin
          .from("efs_pack_reviews")
          .update({
            stage: "publication_ready",
            publication_executed: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", review.id)
          .select()
          .single();
        if (error) throw error;

        await admin
          .from("efs_reporting_workspaces")
          .update({ status: "approved", progress_pct: 95, updated_at: new Date().toISOString() })
          .eq("id", review.workspace_id)
          .eq("company_id", company_id);

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: "review.publication_ready",
          actor_user_id: user.id,
          from_stage: "partner_approved",
          to_stage: "publication_ready",
          message: "Engagement marked publication_ready (Publication engine not executed)",
          payload: { publication: false, xbrl: false, ai: false },
        });

        result = {
          review: updated,
          publication: false,
          publication_executed: false,
          xbrl: false,
          ai: false,
        };
        break;
      }

      case "ADD_PACK_REVIEW_NOTE": {
        // Engagement-level note (distinct from C2 artefact WP notes)
        if (!body.pack_review_id || !body.body) throw new Error("pack_review_id and body required.");
        const { data: review, error: rErr } = await admin
          .from("efs_pack_reviews")
          .select("id, stage")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (rErr || !review) throw new Error("Pack review not found.");

        const { data, error } = await admin
          .from("efs_pack_review_notes")
          .insert({
            company_id,
            pack_review_id: review.id,
            author_user_id: user.id,
            stage_at_create: review.stage,
            body: body.body,
            structure_node_id: body.structure_node_id ?? null,
            disclosure_instance_id: body.disclosure_instance_id ?? null,
            working_paper_id: body.working_paper_id ?? null,
            statement_instance_id: body.statement_instance_id ?? null,
            validation_issue_id: body.validation_issue_id ?? null,
            status: "open",
          })
          .select()
          .single();
        if (error) throw error;

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: "review.note_added",
          actor_user_id: user.id,
          message: "Review note added",
          payload: { note_id: data.id },
        });
        result = data;
        break;
      }

      case "RAISE_REVIEW_QUERY": {
        if (!body.pack_review_id || !body.subject || !body.body || !body.raised_role) {
          throw new Error("pack_review_id, subject, body, raised_role required.");
        }
        const { data: review } = await admin
          .from("efs_pack_reviews")
          .select("id, stage")
          .eq("id", body.pack_review_id)
          .eq("company_id", company_id)
          .single();
        if (!review) throw new Error("Pack review not found.");

        const { data, error } = await admin
          .from("efs_pack_review_queries")
          .insert({
            company_id,
            pack_review_id: review.id,
            raised_by: user.id,
            raised_role: body.raised_role,
            subject: body.subject,
            body: body.body,
            priority: body.priority || "normal",
            structure_node_id: body.structure_node_id ?? null,
            disclosure_instance_id: body.disclosure_instance_id ?? null,
            working_paper_id: body.working_paper_id ?? null,
            statement_instance_id: body.statement_instance_id ?? null,
            validation_issue_id: body.validation_issue_id ?? null,
            status: "open",
          })
          .select()
          .single();
        if (error) throw error;

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: review.id,
          event_type: "review.query_raised",
          actor_user_id: user.id,
          message: `Query: ${body.subject}`,
          payload: { query_id: data.id },
        });
        result = data;
        break;
      }

      case "RESPOND_REVIEW_QUERY": {
        if (!body.query_id || !body.body) throw new Error("query_id and body required.");
        const { data: query, error: qErr } = await admin
          .from("efs_pack_review_queries")
          .select("*")
          .eq("id", body.query_id)
          .eq("company_id", company_id)
          .single();
        if (qErr || !query) throw new Error("Query not found.");

        const { data: response, error } = await admin
          .from("efs_pack_review_responses")
          .insert({
            company_id,
            query_id: query.id,
            author_user_id: user.id,
            body: body.body,
          })
          .select()
          .single();
        if (error) throw error;

        await admin
          .from("efs_pack_review_queries")
          .update({ status: "answered" })
          .eq("id", query.id);

        await appendPackReviewHistory(admin, {
          company_id,
          pack_review_id: query.pack_review_id,
          event_type: "review.query_answered",
          actor_user_id: user.id,
          message: "Review query answered",
          payload: { query_id: query.id, response_id: response.id },
        });
        result = { query_id: query.id, response };
        break;
      }

      case "LIST_PACK_REVIEW_NOTES": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data, error } = await admin
          .from("efs_pack_review_notes")
          .select("*")
          .eq("pack_review_id", body.pack_review_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_REVIEW_QUERIES": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data, error } = await admin
          .from("efs_pack_review_queries")
          .select("*, efs_pack_review_responses(*)")
          .eq("pack_review_id", body.pack_review_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_REVIEW_DECISIONS": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data, error } = await admin
          .from("efs_pack_review_decisions")
          .select("*")
          .eq("pack_review_id", body.pack_review_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_REVIEW_SIGNOFFS": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data, error } = await admin
          .from("efs_pack_review_signoffs")
          .select("id, signer_user_id, signer_role, stage, meaning, signature_hash, signed_at")
          .eq("pack_review_id", body.pack_review_id)
          .eq("company_id", company_id)
          .order("signed_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_PACK_REVIEW_HISTORY": {
        if (!body.pack_review_id) throw new Error("pack_review_id is required.");
        const { data, error } = await admin
          .from("efs_pack_review_history")
          .select("*")
          .eq("pack_review_id", body.pack_review_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false })
          .limit(body.limit || 200);
        if (error) throw error;
        result = data;
        break;
      }

      case "GET_REVIEW_DASHBOARD": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data: review } = await admin
          .from("efs_pack_reviews")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .eq("status", "open")
          .maybeSingle();

        if (!review) {
          result = {
            review: null,
            stage: null,
            assignments: [],
            open_queries: 0,
            signoffs: [],
            recent_history: [],
            workflow: [
              "draft",
              "validation_complete",
              "manager_review",
              "corrections",
              "manager_approved",
              "partner_review",
              "partner_approved",
              "publication_ready",
            ],
            mutates_accounting: false,
            publication: false,
            xbrl: false,
            ai: false,
          };
          break;
        }

        const [assignments, queries, signoffs, history, decisions, notes] = await Promise.all([
          admin.from("efs_pack_review_assignments").select("*").eq("pack_review_id", review.id).eq("company_id", company_id),
          admin.from("efs_pack_review_queries").select("id, status").eq("pack_review_id", review.id).eq("company_id", company_id),
          admin.from("efs_pack_review_signoffs").select("id, signer_role, stage, signature_hash, signed_at").eq("pack_review_id", review.id).eq("company_id", company_id),
          admin.from("efs_pack_review_history").select("id, event_type, message, from_stage, to_stage, created_at").eq("pack_review_id", review.id).eq("company_id", company_id).order("created_at", { ascending: false }).limit(20),
          admin.from("efs_pack_review_decisions").select("*").eq("pack_review_id", review.id).eq("company_id", company_id).order("created_at", { ascending: false }).limit(10),
          admin.from("efs_pack_review_notes").select("id, status").eq("pack_review_id", review.id).eq("company_id", company_id),
        ]);

        result = {
          review,
          stage: review.stage,
          assignments: assignments.data || [],
          open_queries: (queries.data || []).filter((q) => q.status === "open").length,
          open_notes: (notes.data || []).filter((n) => n.status === "open").length,
          signoffs: signoffs.data || [],
          decisions: decisions.data || [],
          recent_history: history.data || [],
          consumes: {
            validation_run_id: review.validation_run_id,
            snapshot_version_id: review.snapshot_version_id,
            working_papers: true,
            disclosures: true,
            statement_instances: true,
          },
          mutates_accounting: false,
          publication_executed: false,
          publication: false,
          xbrl: false,
          ai: false,
        };
        break;
      }

      // ── Phase E: Enterprise Publication Platform ───────────────────────────
      case "GET_PUBLICATION_DASHBOARD": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        result = await getPublicationDashboard(admin, {
          company_id,
          workspace_id: body.workspace_id,
        });
        break;
      }

      case "EXECUTE_PUBLICATION": {
        if (!publicationEnabled()) throw new Error("Publication platform is disabled.");
        if (!body.workspace_id && !body.pack_review_id) {
          throw new Error("workspace_id or pack_review_id is required.");
        }
        let review = null;
        if (body.pack_review_id) {
          const { data, error } = await admin
            .from("efs_pack_reviews")
            .select("*")
            .eq("id", body.pack_review_id)
            .eq("company_id", company_id)
            .single();
          if (error || !data) throw new Error("Pack review not found.");
          review = data;
        } else {
          const { data, error } = await admin
            .from("efs_pack_reviews")
            .select("*")
            .eq("workspace_id", body.workspace_id)
            .eq("company_id", company_id)
            .eq("status", "open")
            .maybeSingle();
          if (error || !data) throw new Error("Open pack review not found.");
          review = data;
        }

        result = await executePublication(admin, {
          company_id,
          workspace_id: review.workspace_id,
          pack_review: review,
          user_id: user.id,
        });
        break;
      }

      case "LIST_PUBLICATION_RECORDS": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_publication_records")
          .select("*, efs_publication_packs(id, publication_fingerprint, publication_seal_hash, metadata, status)")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("executed_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_PUBLICATION_ARTIFACTS": {
        if (!body.publication_record_id) throw new Error("publication_record_id is required.");
        const { data, error } = await admin
          .from("efs_publication_artifacts")
          .select("id, format, content_hash, byte_size, generated_at, publication_record_id, publication_pack_id")
          .eq("publication_record_id", body.publication_record_id)
          .eq("company_id", company_id);
        if (error) throw error;
        result = data;
        break;
      }

      case "GET_PUBLICATION_ARTIFACT": {
        if (!body.artifact_id) throw new Error("artifact_id is required.");
        const { data, error } = await admin
          .from("efs_publication_artifacts")
          .select("*")
          .eq("id", body.artifact_id)
          .eq("company_id", company_id)
          .single();
        if (error || !data) throw new Error("Publication artifact not found.");

        // Presentation is rendered at download from the sealed pack dataset so
        // layout upgrades do not mutate immutable artefact rows.
        let contentBase64 = data.content_base64;
        let liveByteSize = data.byte_size;
        let presentationRendered = false;
        if (data.publication_pack_id) {
          const { data: pubPack } = await admin
            .from("efs_publication_packs")
            .select("dataset, metadata")
            .eq("id", data.publication_pack_id)
            .eq("company_id", company_id)
            .maybeSingle();
          if (pubPack?.dataset) {
            const packForRender = {
              ...pubPack.dataset,
              metadata: {
                ...(pubPack.dataset.metadata || {}),
                ...(pubPack.metadata || {}),
              },
            };
            const bytes = renderArtifactBytes(packForRender, data.format);
            contentBase64 = bytesToBase64(bytes);
            liveByteSize = bytes.length;
            presentationRendered = true;
          }
        }

        result = {
          artifact: {
            id: data.id,
            format: data.format,
            content_hash: data.content_hash,
            byte_size: liveByteSize,
            generated_at: data.generated_at,
          },
          content_base64: contentBase64,
          presentation_rendered: presentationRendered,
          mutates_accounting: false,
          live_gl: false,
        };
        break;
      }

      case "GET_PUBLICATION_PACK": {
        if (!body.publication_pack_id) throw new Error("publication_pack_id is required.");
        const { data, error } = await admin
          .from("efs_publication_packs")
          .select("id, publication_fingerprint, publication_seal_hash, pack_fingerprint, content_hash, metadata, status, sealed_at, version_no")
          .eq("id", body.publication_pack_id)
          .eq("company_id", company_id)
          .single();
        if (error || !data) throw new Error("Publication pack not found.");
        result = { pack: data, mutates_accounting: false, live_gl: false };
        break;
      }

      case "LIST_PUBLICATION_HISTORY": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data, error } = await admin
          .from("efs_publication_history")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .order("created_at", { ascending: false })
          .limit(body.limit || 100);
        if (error) throw error;
        result = data;
        break;
      }

      // ── V6.6.1 Engagement General Information (additive experience layer) ──
      case "GET_WORKSPACE_GENERAL_INFORMATION": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        logStage("Load Engagement", {
          status: "start",
          engagement_id: body.workspace_id,
          company_id,
          entity_id: company_id,
        });
        const { data, error } = await admin
          .from("efs_engagement_general_information")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .maybeSingle();
        if (error) throw error;
        logStage("Load Engagement", {
          status: "complete",
          engagement_id: body.workspace_id,
          company_id,
          hasRow: !!data,
        });

        logStage("Load Company Profile", {
          status: "start",
          engagement_id: body.workspace_id,
          company_id,
        });
        await assertV161CompanyMasterDataReady(admin, company_id);
        const { data: master, error: masterErr } = await admin
          .from("efs_company_master_data")
          .select("*")
          .eq("company_id", company_id)
          .maybeSingle();
        if (masterErr) throw masterErr;
        logStage("Load Company Profile", {
          status: "complete",
          engagement_id: body.workspace_id,
          company_id,
          hasMasterRow: !!master,
          schemaReady: true,
        });

        const migratedMaster = await ensureLegacyMasterDataMigration(admin, company_id, data);
        const effectiveMaster = migratedMaster ?? master;

        logStage("Build Corporate Information", {
          status: "start",
          engagement_id: body.workspace_id,
          company_id,
        });
        result = hydrateWorkspaceFromMasterData(data, effectiveMaster);
        logStage("Build Corporate Information", {
          status: "complete",
          engagement_id: body.workspace_id,
          company_id,
        });
        break;
      }

      case "VERIFY_V161_DEPLOYMENT": {
        result = await verifyV161CompanyMasterDataSchema(admin, company_id);
        break;
      }

      case "GET_COMPANY_MASTER_DATA": {
        logStage("Load Company Profile", {
          status: "start",
          company_id,
          engagement_id: body.workspace_id ?? null,
        });
        await assertV161CompanyMasterDataReady(admin, company_id);
        const { data, error } = await admin
          .from("efs_company_master_data")
          .select("*")
          .eq("company_id", company_id)
          .maybeSingle();
        if (error) {
          logStageError("Load Company Profile", error, { company_id });
          throw error;
        }
        logStage("Load Company Profile", {
          status: "complete",
          company_id,
          hasRow: !!data,
          schemaReady: true,
        });

        let masterRow = data;
        if (!data?.legacy_migration_completed_at) {
          const { data: legacyEngagement } = await admin
            .from("efs_engagement_general_information")
            .select("*")
            .eq("company_id", company_id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const migrated = await ensureLegacyMasterDataMigration(
            admin,
            company_id,
            legacyEngagement,
          );
          if (migrated) masterRow = migrated;
        }
        // Schema verified: empty modules are legitimate when no row exists yet.
        // Never return this path when the table is missing (assert above).
        result = masterRow || emptyMasterDataRow(company_id);
        break;
      }

      case "UPSERT_COMPANY_MASTER_DATA_MODULE": {
        const moduleId = body.module_id;
        if (!moduleId) throw new Error("module_id is required.");
        const allowed = [
          "company_profile",
          "addresses",
          "tax_registrations",
          "directors",
          "governance",
          "officers",
          "principal_bankers",
        ];
        if (!allowed.includes(moduleId)) throw new Error(`Unknown module_id: ${moduleId}`);

        logStage("Load Company Profile", {
          status: "start",
          company_id,
          engagement_id: body.workspace_id ?? null,
          module_id: moduleId,
        });
        await assertV161CompanyMasterDataReady(admin, company_id);
        const { data: existing, error: existingErr } = await admin
          .from("efs_company_master_data")
          .select("*")
          .eq("company_id", company_id)
          .maybeSingle();
        if (existingErr) {
          logStageError("Load Company Profile", existingErr, { company_id, module_id: moduleId });
          throw existingErr;
        }
        logStage("Load Company Profile", {
          status: "complete",
          company_id,
          hasRow: !!existing,
          module_id: moduleId,
        });

        const row = existing
          ? { ...existing, [moduleId]: body.payload ?? {}, updated_at: new Date().toISOString() }
          : { ...emptyMasterDataRow(company_id), [moduleId]: body.payload ?? {} };

        logStage("Publish", {
          status: "start",
          company_id,
          engagement_id: body.workspace_id ?? null,
          module_id: moduleId,
        });
        const { data, error } = await admin
          .from("efs_company_master_data")
          .upsert(row, { onConflict: "company_id" })
          .select("*")
          .single();
        if (error) {
          logStageError("Publish", error, { company_id, module_id: moduleId });
          throw error;
        }
        logStage("Publish", {
          status: "complete",
          company_id,
          engagement_id: body.workspace_id ?? null,
          module_id: moduleId,
          entity_id: data.id,
        });

        await writeActivity(admin, {
          company_id,
          workspace_id: body.workspace_id || null,
          event_type: "company.master_data.saved",
          entity_type: "company_master_data",
          entity_id: data.id,
          actor_user_id: user.id,
          message: `Company master data module saved: ${moduleId}`,
        });
        result = data;
        break;
      }

      case "UPSERT_WORKSPACE_GENERAL_INFORMATION": {
        if (!body.workspace_id) throw new Error("workspace_id is required.");
        const { data: ws, error: wsErr } = await admin
          .from("efs_reporting_workspaces")
          .select("id")
          .eq("id", body.workspace_id)
          .eq("company_id", company_id)
          .single();
        if (wsErr || !ws) throw new Error("Workspace not found.");

        const info = body.general_information || body.info || {};
        await upsertMasterDataFromEngagementPayload(admin, company_id, info);

        const { data: existingEngagement } = await admin
          .from("efs_engagement_general_information")
          .select("*")
          .eq("workspace_id", body.workspace_id)
          .eq("company_id", company_id)
          .maybeSingle();

        const engagementOnly = stripLegacyMasterFieldsFromEngagement(info);
        const preserved = existingEngagement || {};
        const row = {
          company_id,
          workspace_id: body.workspace_id,
          registered_name: preserved.registered_name ?? null,
          trading_name: preserved.trading_name ?? null,
          registration_number: preserved.registration_number ?? null,
          vat_number: preserved.vat_number ?? null,
          income_tax_number: preserved.income_tax_number ?? null,
          financial_year_end: engagementOnly.financial_year_end ?? preserved.financial_year_end ?? null,
          comparative_period: engagementOnly.comparative_period ?? preserved.comparative_period ?? null,
          functional_currency: engagementOnly.functional_currency ?? preserved.functional_currency ?? null,
          approval_date: engagementOnly.approval_date ?? preserved.approval_date ?? null,
          authorisation_date: engagementOnly.authorisation_date ?? preserved.authorisation_date ?? null,
          business_address: preserved.business_address ?? null,
          postal_address: preserved.postal_address ?? null,
          contact_information: preserved.contact_information ?? null,
          nature_of_business: preserved.nature_of_business ?? null,
          reporting_currency: engagementOnly.reporting_currency ?? preserved.reporting_currency ?? "ZAR",
          reporting_framework: engagementOnly.reporting_framework ?? preserved.reporting_framework ?? null,
          auditor: preserved.auditor ?? null,
          prepared_by: preserved.prepared_by ?? null,
          reviewed_by: preserved.reviewed_by ?? null,
          approved_by: preserved.approved_by ?? null,
          directors: Array.isArray(preserved.directors) ? preserved.directors : [],
          company_secretary: preserved.company_secretary ?? null,
          registered_office: preserved.registered_office ?? null,
          share_information:
            engagementOnly.share_information && typeof engagementOnly.share_information === "object"
              ? engagementOnly.share_information
              : preserved.share_information && typeof preserved.share_information === "object"
                ? preserved.share_information
                : {},
          principal_bankers: Array.isArray(preserved.principal_bankers)
            ? preserved.principal_bankers
            : [],
          physical_address: preserved.physical_address ?? null,
          website: preserved.website ?? null,
          email: preserved.email ?? null,
          telephone: preserved.telephone ?? null,
          engagement_type: engagementOnly.engagement_type ?? preserved.engagement_type ?? null,
          independent_reviewer: preserved.independent_reviewer ?? null,
          accounting_officer: preserved.accounting_officer ?? null,
          partner: preserved.partner ?? null,
          issue_date: engagementOnly.issue_date ?? preserved.issue_date ?? null,
          country_of_incorporation: preserved.country_of_incorporation ?? null,
          entity_type: preserved.entity_type ?? null,
          paye_number: preserved.paye_number ?? null,
          sdl_number: preserved.sdl_number ?? null,
          uif_number: preserved.uif_number ?? null,
          custom_tax_registrations: Array.isArray(preserved.custom_tax_registrations)
            ? preserved.custom_tax_registrations
            : [],
          compilation_engagement:
            engagementOnly.compilation_engagement ?? preserved.compilation_engagement ?? false,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await admin
          .from("efs_engagement_general_information")
          .upsert(row, { onConflict: "workspace_id" })
          .select("*")
          .single();
        if (error) throw error;

        await writeActivity(admin, {
          company_id,
          workspace_id: body.workspace_id,
          event_type: "workspace.general_information.saved",
          entity_type: "workspace_general_information",
          entity_id: data.id,
          actor_user_id: user.id,
          message: "Engagement general information saved",
        });

        const { data: masterAfterWrite } = await admin
          .from("efs_company_master_data")
          .select("*")
          .eq("company_id", company_id)
          .maybeSingle();
        result = hydrateWorkspaceFromMasterData(data, masterAfterWrite || null);
        break;
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    // PostgREST errors are plain objects — never stringify to "[object Object]".
    const postgrest =
      err && typeof err === "object" && !(err instanceof Error) && "message" in err
        ? err
        : err?.cause && typeof err.cause === "object"
          ? err.cause
          : null;
    const reason = err instanceof Error
      ? err.message
      : postgrest
        ? [
          postgrest.message,
          postgrest.details ? `DETAIL: ${postgrest.details}` : null,
          postgrest.hint ? `HINT: ${postgrest.hint}` : null,
          postgrest.code ? `code=${postgrest.code}` : null,
        ].filter(Boolean).join(" | ")
        : String(err);
    // Diagnostics only — validation / auth / membership checks are unchanged.
    console.error({
      reason,
      PostgrestError: postgrest
        ? {
          message: postgrest.message ?? null,
          details: postgrest.details ?? null,
          hint: postgrest.hint ?? null,
          code: postgrest.code ?? null,
        }
        : null,
      SQLSTATE: postgrest?.code ?? null,
      stack: err instanceof Error ? err.stack : null,
      payload: body,
      validation: reason,
      user: user?.id ?? null,
      company: body?.company_id ?? _ctx.companyId ?? null,
      engagement: body?.workspace_id ?? null,
      method: body?.method ?? _ctx.requestMethod ?? null,
      period_id: body?.period_id ?? body?.reporting_period_id ?? null,
      correlationId: _ctx.correlationId,
    });
    const normalized = err instanceof Error ? err : new Error(reason);
    if (
      normalized?.name === "V161DeploymentError" ||
      normalized?.code === "EFS_V161_DEPLOYMENT_BLOCKED" ||
      (err && typeof err === "object" && err.name === "V161DeploymentError")
    ) {
      const report = err?.report || normalized?.report || null;
      return new Response(
        JSON.stringify({
          error: normalized.message,
          code: "EFS_V161_DEPLOYMENT_BLOCKED",
          category: "MigrationError",
          severity: "critical",
          deploymentStatus: "NOT READY",
          readiness: "BLOCKED",
          deploymentReport: report,
          businessMessage: "Version 16.1 Company Master Data infrastructure is not deployed.",
          technicalMessage: normalized.message,
          recoverySuggestion:
            "Apply migrations 20260721120000_efs_v161_company_master_data.sql and 20260721130000_efs_v161_legacy_master_data_migration.sql, then redeploy the financial-statements edge function.",
          correlationId: _ctx.correlationId,
          edgeFunctionVersion: EFS_V161_EDGE_FUNCTION_VERSION,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return edgeFailure(
      _ctx,
      normalized,
      {
        companyId: body?.company_id ?? _ctx.companyId,
        technicalMessage: reason,
      },
    );
  }
}));
