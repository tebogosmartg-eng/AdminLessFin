/**
 * Enterprise Reconciliation Management Platform — AdminLess Fin V6.9.0
 *
 * Single source of truth for reconciliation preparation, evidence, review,
 * approval, and completion. Financial Close consumes status only.
 *
 * Hard rules:
 *  - NEVER mutates General Ledger or Journal Engine data
 *  - NEVER recalculates financial facts (reads existing tables only)
 *  - NEVER modifies Financial Close / EFS / Validation / Review / Publication
 *  - Evidence becomes immutable once reconciliation is approved
 */
// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from "../_shared/enterpriseEdgePlatform.ts";

const corsHeaders = ENTERPRISE_CORS_HEADERS;

function flagsEnabled() {
  const master = (Deno.env.get("ERMP_MODULE") ?? "false").toLowerCase() === "true";
  const silent = (Deno.env.get("ERMP_SILENT_BACKENDS") ?? "true").toLowerCase() === "true";
  return master || silent;
}

const LIFECYCLE = ["draft", "prepared", "under_review", "approved", "completed", "archived"];

const CATEGORIES = [
  "bank",
  "debtors",
  "creditors",
  "vat",
  "payroll",
  "inventory",
  "asset_register",
  "loan",
  "intercompany",
  "suspense",
  "custom",
];

const DEFAULT_TEMPLATES = [
  { template_key: "bank", name: "Bank Reconciliation", category: "bank", description: "Match bank statements to the general ledger", default_risk_rating: "high", sort_order: 0 },
  { template_key: "debtors", name: "Debtors Reconciliation", category: "debtors", description: "Reconcile receivables sub-ledger to control account", default_risk_rating: "high", sort_order: 1 },
  { template_key: "creditors", name: "Creditors Reconciliation", category: "creditors", description: "Reconcile payables sub-ledger to control account", default_risk_rating: "high", sort_order: 2 },
  { template_key: "vat", name: "VAT Reconciliation", category: "vat", description: "Reconcile VAT returns to the general ledger", default_risk_rating: "critical", sort_order: 3 },
  { template_key: "payroll", name: "Payroll Reconciliation", category: "payroll", description: "Reconcile payroll runs to payroll control accounts", default_risk_rating: "high", sort_order: 4 },
  { template_key: "inventory", name: "Inventory Reconciliation", category: "inventory", description: "Reconcile stock counts to inventory accounts", default_risk_rating: "medium", sort_order: 5 },
  { template_key: "asset_register", name: "Asset Register Reconciliation", category: "asset_register", description: "Reconcile fixed asset register to GL", default_risk_rating: "medium", sort_order: 6 },
  { template_key: "loan", name: "Loan Reconciliation", category: "loan", description: "Reconcile loan statements to liability accounts", default_risk_rating: "medium", sort_order: 7 },
  { template_key: "intercompany", name: "Intercompany Reconciliation", category: "intercompany", description: "Reconcile intercompany balances", default_risk_rating: "high", sort_order: 8 },
  { template_key: "suspense", name: "Suspense Account Reconciliation", category: "suspense", description: "Clear and explain suspense balances", default_risk_rating: "critical", sort_order: 9 },
  { template_key: "custom", name: "Custom Reconciliation", category: "custom", description: "Ad-hoc reconciliation for specialised balances", default_risk_rating: "medium", sort_order: 10 },
];

async function writeActivity(admin, row) {
  await admin.from("ermp_activity").insert(row);
}

async function getReconciliation(admin, company_id, id) {
  const { data, error } = await admin
    .from("ermp_reconciliations")
    .select("*")
    .eq("company_id", company_id)
    .eq("id", id)
    .single();
  if (error) throw new Error("Reconciliation not found.");
  return data;
}

async function ensureTemplates(admin, company_id) {
  const { count } = await admin
    .from("ermp_templates")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company_id);
  if ((count ?? 0) > 0) return;
  const rows = DEFAULT_TEMPLATES.map((t) => ({ ...t, company_id }));
  await admin.from("ermp_templates").insert(rows);
}

async function refreshOutstandingAmount(admin, company_id, reconciliation_id) {
  const { data: diffs } = await admin
    .from("ermp_differences")
    .select("amount, status")
    .eq("reconciliation_id", reconciliation_id)
    .eq("company_id", company_id);
  const open = (diffs ?? []).filter((d) => d.status === "open" || d.status === "in_progress");
  const total = open.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  await admin
    .from("ermp_reconciliations")
    .update({ outstanding_difference_amount: total, updated_at: new Date().toISOString() })
    .eq("id", reconciliation_id)
    .eq("company_id", company_id);
  return total;
}

async function freezeEvidence(admin, company_id, reconciliation_id) {
  await admin
    .from("ermp_evidence")
    .update({ immutable: true })
    .eq("reconciliation_id", reconciliation_id)
    .eq("company_id", company_id);
}

/**
 * Automation: derive live signals from existing platforms without duplicating
 * ownership. Reads only — GL/journals, inventory, payroll, assets, loans, VAT,
 * working papers, Financial Close.
 */
async function collectAutomationSignals(admin, company_id, period_end) {
  const end = period_end || new Date().toISOString().slice(0, 10);

  const [unreconciled, journals, assets, loans, payrollRuns, products] = await Promise.all([
    admin
      .from("journal_entry_items")
      .select("id, journal_entries!inner(company_id, entry_date)", { count: "exact", head: true })
      .eq("journal_entries.company_id", company_id)
      .eq("reconciled", false)
      .lte("journal_entries.entry_date", end),
    admin
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id)
      .lte("entry_date", end),
    admin
      .from("fixed_assets")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id),
    admin
      .from("loans")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id),
    admin
      .from("payroll_runs")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id),
    admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id),
  ]);

  let vatRates = 0;
  try {
    const { count } = await admin
      .from("tax_rates")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id);
    vatRates = count ?? 0;
  } catch {
    vatRates = 0;
  }

  let workingPapers = 0;
  try {
    const { count } = await admin
      .from("efs_working_papers")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id);
    workingPapers = count ?? 0;
  } catch {
    workingPapers = 0;
  }

  let closeWorkspaces = 0;
  try {
    const { count } = await admin
      .from("efcp_close_workspaces")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id)
      .lte("end_date", end);
    closeWorkspaces = count ?? 0;
  } catch {
    closeWorkspaces = 0;
  }

  return {
    unreconciled_bank_items: unreconciled.count ?? 0,
    journal_entries_to_date: journals.count ?? 0,
    assets_tracked: assets.count ?? 0,
    loans_tracked: loans.count ?? 0,
    payroll_runs: payrollRuns.count ?? 0,
    inventory_products: products.count ?? 0,
    vat_rates_configured: vatRates,
    working_papers_available: workingPapers,
    close_periods_available: closeWorkspaces,
  };
}

function buildDashboard(rows, differences, signals) {
  const total = rows.length;
  const completed = rows.filter((r) => r.status === "completed" || r.status === "archived").length;
  const approved = rows.filter((r) => r.status === "approved" || r.status === "completed" || r.status === "archived").length;
  const outstanding = rows.filter((r) => !["completed", "archived", "approved"].includes(r.status)).length;
  const awaitingApproval = rows.filter((r) => r.status === "under_review" || r.status === "prepared").length;
  const overdueReviews = rows.filter((r) => {
    if (!["prepared", "under_review"].includes(r.status)) return false;
    if (!r.period_end) return false;
    return r.period_end < new Date().toISOString().slice(0, 10);
  }).length;
  const criticalDiffs = differences.filter(
    (d) =>
      (d.status === "open" || d.status === "in_progress") &&
      (Number(d.amount) !== 0 || d.difference_type === "unknown"),
  ).length;
  const criticalRisk = rows.filter((r) => r.risk_rating === "critical" && !["completed", "archived"].includes(r.status)).length;

  return {
    overall_completion: total === 0 ? 0 : Math.round((completed / total) * 100),
    outstanding_reconciliations: outstanding,
    overdue_reviews: overdueReviews,
    critical_differences: criticalDiffs + criticalRisk,
    awaiting_approval: awaitingApproval,
    completed,
    approved_for_close: approved,
    total,
    signals,
  };
}

/** Close consumption payload — status only; never editable by Close. */
function buildCloseConsumption(rows, differences) {
  const relevant = rows.filter((r) => r.status !== "archived");
  const approvedOnly = relevant.filter((r) =>
    ["approved", "completed"].includes(r.status),
  );
  const openDiffs = differences.filter((d) => d.status === "open" || d.status === "in_progress");
  const total = relevant.length;
  const approvedCount = approvedOnly.length;

  return {
    reconciliation_status: relevant.map((r) => ({
      name: r.name,
      category: r.category,
      period_start: r.period_start,
      period_end: r.period_end,
      status: r.status,
      risk_rating: r.risk_rating,
      outstanding_differences: Number(r.outstanding_difference_amount || 0),
      prepared_by: r.prepared_by,
      reviewed_by: r.reviewed_by,
      approved_by: r.approved_by,
      completion_date: r.completed_at,
    })),
    outstanding_differences: openDiffs.map((d) => ({
      reconciliation_name: rows.find((r) => r.id === d.reconciliation_id)?.name ?? "Reconciliation",
      difference_type: d.difference_type,
      amount: Number(d.amount || 0),
      description: d.description,
      owner: d.owner,
      target_resolution_date: d.target_resolution_date,
      status: d.status,
    })),
    approval_status: {
      total,
      approved: approvedCount,
      pending: total - approvedCount,
      all_approved: total > 0 && approvedCount === total,
    },
    completion_percentage: total === 0 ? 0 : Math.round((approvedCount / total) * 100),
    consumed_by_close: "approved_and_completed_only",
  };
}

serve(withEnterprisePlatform("reconciliations", "tenant", async (req, _ctx) => {
  try {
    if (req.method !== "POST") throw new Error("Method not allowed.");
    if (!flagsEnabled()) {
      throw new Error("Reconciliations module is disabled (ERMP_MODULE / ERMP_SILENT_BACKENDS).");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated.");

    let body;
    try {
      body = await req.json();
    } catch {
      throw new Error("Request body must be valid JSON.");
    }

    const { method, company_id } = body ?? {};
    if (!method) throw new Error("Method is required.");
    if (!company_id) throw new Error("Company ID is required.");
    _ctx.companyId = company_id;

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

    await ensureTemplates(admin, company_id);

    let result = null;

    switch (method) {
      // ── Dashboard / Overview ─────────────────────────────────────────────
      case "GET_DASHBOARD": {
        const period_end = body.period_end ?? null;
        let query = admin
          .from("ermp_reconciliations")
          .select("*")
          .eq("company_id", company_id)
          .neq("status", "archived");
        if (period_end) query = query.lte("period_end", period_end);
        if (body.period_start) query = query.gte("period_start", body.period_start);

        const { data: rows, error } = await query.order("period_end", { ascending: false });
        if (error) throw error;

        const ids = (rows ?? []).map((r) => r.id);
        let diffs = [];
        if (ids.length) {
          const { data: d } = await admin
            .from("ermp_differences")
            .select("*")
            .eq("company_id", company_id)
            .in("reconciliation_id", ids);
          diffs = d ?? [];
        }

        const signals = await collectAutomationSignals(admin, company_id, period_end);
        result = buildDashboard(rows ?? [], diffs, signals);
        break;
      }

      // ── Register ─────────────────────────────────────────────────────────
      case "LIST_RECONCILIATIONS": {
        let query = admin
          .from("ermp_reconciliations")
          .select("*")
          .eq("company_id", company_id);
        if (body.status) query = query.eq("status", body.status);
        if (body.category) query = query.eq("category", body.category);
        if (body.assigned_to) query = query.eq("assigned_to", body.assigned_to);
        if (body.include_archived !== true) query = query.neq("status", "archived");
        if (body.period_start) query = query.gte("period_start", body.period_start);
        if (body.period_end) query = query.lte("period_end", body.period_end);

        const { data, error } = await query.order("period_end", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "GET_RECONCILIATION": {
        if (!body.reconciliation_id) throw new Error("reconciliation_id is required.");
        const recon = await getReconciliation(admin, company_id, body.reconciliation_id);
        const [{ data: differences }, { data: evidence }, { data: activity }] = await Promise.all([
          admin
            .from("ermp_differences")
            .select("*")
            .eq("reconciliation_id", recon.id)
            .order("created_at", { ascending: false }),
          admin
            .from("ermp_evidence")
            .select("*")
            .eq("reconciliation_id", recon.id)
            .order("attached_at", { ascending: false }),
          admin
            .from("ermp_activity")
            .select("*")
            .eq("reconciliation_id", recon.id)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);
        result = { reconciliation: recon, differences: differences ?? [], evidence: evidence ?? [], activity: activity ?? [] };
        break;
      }

      case "CREATE_RECONCILIATION": {
        const {
          name,
          period_start,
          period_end,
          category,
          risk_rating,
          assigned_to,
          comments,
          template_key,
        } = body;
        if (!name || !period_start || !period_end) {
          throw new Error("name, period_start and period_end are required.");
        }
        const cat = CATEGORIES.includes(category) ? category : "custom";
        const { data, error } = await admin
          .from("ermp_reconciliations")
          .insert({
            company_id,
            name,
            period_start,
            period_end,
            category: cat,
            risk_rating: risk_rating || "medium",
            assigned_to: assigned_to ?? null,
            comments: comments ?? null,
            template_key: template_key ?? null,
            created_by: user.id,
            status: "draft",
          })
          .select()
          .single();
        if (error) throw error;

        await writeActivity(admin, {
          company_id,
          reconciliation_id: data.id,
          event_type: "recon.created",
          message: `${name} opened as draft`,
          created_by: user.id,
        });
        result = data;
        break;
      }

      case "UPDATE_RECONCILIATION": {
        const { reconciliation_id } = body;
        if (!reconciliation_id) throw new Error("reconciliation_id is required.");
        const existing = await getReconciliation(admin, company_id, reconciliation_id);
        if (["approved", "completed", "archived"].includes(existing.status) && body.status && body.status !== existing.status) {
          // Allow lifecycle transitions via TRANSITION_STATUS only when locked fields change
        }
        if (["approved", "completed", "archived"].includes(existing.status)) {
          const lockedFields = ["name", "period_start", "period_end", "category"];
          for (const f of lockedFields) {
            if (body[f] !== undefined && body[f] !== existing[f]) {
              throw new Error("Approved reconciliations cannot change register core fields.");
            }
          }
        }

        const patch = { updated_at: new Date().toISOString() };
        for (const f of ["name", "risk_rating", "assigned_to", "comments", "prepared_by", "reviewed_by", "approved_by"]) {
          if (body[f] !== undefined) patch[f] = body[f];
        }
        const { data, error } = await admin
          .from("ermp_reconciliations")
          .update(patch)
          .eq("id", reconciliation_id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      // ── Lifecycle ────────────────────────────────────────────────────────
      case "TRANSITION_STATUS": {
        const { reconciliation_id, to_status, actor_name } = body;
        if (!reconciliation_id || !to_status) {
          throw new Error("reconciliation_id and to_status are required.");
        }
        if (!LIFECYCLE.includes(to_status)) throw new Error("Invalid reconciliation status.");

        const recon = await getReconciliation(admin, company_id, reconciliation_id);
        const fromIdx = LIFECYCLE.indexOf(recon.status);
        const toIdx = LIFECYCLE.indexOf(to_status);
        const forwardOne = toIdx === fromIdx + 1;
        const reopenDraft = to_status === "draft" && ["prepared", "under_review"].includes(recon.status);
        if (!forwardOne && !reopenDraft) {
          throw new Error(
            `Cannot move reconciliation from ${recon.status.replace(/_/g, " ")} to ${to_status.replace(/_/g, " ")}.`,
          );
        }

        const patch = {
          status: to_status,
          updated_at: new Date().toISOString(),
        };
        const actor = actor_name || user.email || "Preparer";

        if (to_status === "prepared") {
          patch.prepared_by = actor;
          patch.prepared_at = new Date().toISOString();
        }
        if (to_status === "under_review" && !recon.prepared_by) {
          patch.prepared_by = actor;
          patch.prepared_at = new Date().toISOString();
        }
        if (to_status === "approved") {
          patch.reviewed_by = recon.reviewed_by || actor;
          patch.reviewed_at = recon.reviewed_at || new Date().toISOString();
          patch.approved_by = actor;
          patch.approved_at = new Date().toISOString();
        }
        if (to_status === "completed") {
          if (recon.status !== "approved") {
            throw new Error("Only approved reconciliations can be completed.");
          }
          patch.completed_at = new Date().toISOString();
        }

        const { data, error } = await admin
          .from("ermp_reconciliations")
          .update(patch)
          .eq("id", reconciliation_id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;

        if (to_status === "approved" || to_status === "completed") {
          await freezeEvidence(admin, company_id, reconciliation_id);
        }

        await writeActivity(admin, {
          company_id,
          reconciliation_id,
          event_type: `recon.status.${to_status}`,
          message: `Status moved to ${to_status.replace(/_/g, " ")}`,
          created_by: user.id,
        });

        result = data;
        break;
      }

      // ── Differences ──────────────────────────────────────────────────────
      case "LIST_DIFFERENCES": {
        let query = admin.from("ermp_differences").select("*").eq("company_id", company_id);
        if (body.reconciliation_id) query = query.eq("reconciliation_id", body.reconciliation_id);
        if (body.status) query = query.eq("status", body.status);
        const { data, error } = await query.order("created_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_DIFFERENCE": {
        const { reconciliation_id, difference_id, difference_type, amount, description, owner, target_resolution_date, status, resolution_notes } = body;
        if (!reconciliation_id) throw new Error("reconciliation_id is required.");
        const recon = await getReconciliation(admin, company_id, reconciliation_id);
        if (["approved", "completed", "archived"].includes(recon.status)) {
          throw new Error("Differences cannot be changed after approval.");
        }
        if (!description) throw new Error("description is required.");

        if (difference_id) {
          const { data, error } = await admin
            .from("ermp_differences")
            .update({
              difference_type: difference_type || "unreconciled",
              amount: amount ?? 0,
              description,
              owner: owner ?? null,
              target_resolution_date: target_resolution_date ?? null,
              status: status || "open",
              resolution_notes: resolution_notes ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", difference_id)
            .eq("company_id", company_id)
            .select()
            .single();
          if (error) throw error;
          await refreshOutstandingAmount(admin, company_id, reconciliation_id);
          result = data;
        } else {
          const { data, error } = await admin
            .from("ermp_differences")
            .insert({
              company_id,
              reconciliation_id,
              difference_type: difference_type || "unreconciled",
              amount: amount ?? 0,
              description,
              owner: owner ?? null,
              target_resolution_date: target_resolution_date ?? null,
              status: status || "open",
              resolution_notes: resolution_notes ?? null,
            })
            .select()
            .single();
          if (error) throw error;
          await refreshOutstandingAmount(admin, company_id, reconciliation_id);
          await writeActivity(admin, {
            company_id,
            reconciliation_id,
            event_type: "recon.difference.added",
            message: `Difference recorded: ${description}`,
            created_by: user.id,
          });
          result = data;
        }
        break;
      }

      // ── Evidence ─────────────────────────────────────────────────────────
      case "LIST_EVIDENCE": {
        let query = admin.from("ermp_evidence").select("*").eq("company_id", company_id);
        if (body.reconciliation_id) query = query.eq("reconciliation_id", body.reconciliation_id);
        const { data, error } = await query.order("attached_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "ATTACH_EVIDENCE": {
        const { reconciliation_id, evidence_type, title, notes, attached_by } = body;
        if (!reconciliation_id || !title) throw new Error("reconciliation_id and title are required.");
        const recon = await getReconciliation(admin, company_id, reconciliation_id);
        if (["approved", "completed", "archived"].includes(recon.status)) {
          throw new Error("Evidence is immutable after approval.");
        }
        const { data, error } = await admin
          .from("ermp_evidence")
          .insert({
            company_id,
            reconciliation_id,
            evidence_type: evidence_type || "working_papers",
            title,
            notes: notes ?? null,
            attached_by: attached_by || user.email || null,
            immutable: false,
          })
          .select()
          .single();
        if (error) throw error;
        await writeActivity(admin, {
          company_id,
          reconciliation_id,
          event_type: "recon.evidence.attached",
          message: `Evidence attached: ${title}`,
          created_by: user.id,
        });
        result = data;
        break;
      }

      // ── Assigned Work ────────────────────────────────────────────────────
      case "LIST_ASSIGNED_WORK": {
        const assignee = body.assigned_to || user.email;
        const { data, error } = await admin
          .from("ermp_reconciliations")
          .select("*")
          .eq("company_id", company_id)
          .eq("assigned_to", assignee)
          .neq("status", "archived")
          .order("period_end", { ascending: true });
        if (error) throw error;
        result = data;
        break;
      }

      // ── Review / Approval queues ─────────────────────────────────────────
      case "LIST_REVIEW_QUEUE": {
        const { data, error } = await admin
          .from("ermp_reconciliations")
          .select("*")
          .eq("company_id", company_id)
          .in("status", ["prepared", "under_review"])
          .order("period_end", { ascending: true });
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_APPROVAL_QUEUE": {
        const { data, error } = await admin
          .from("ermp_reconciliations")
          .select("*")
          .eq("company_id", company_id)
          .eq("status", "under_review")
          .order("period_end", { ascending: true });
        if (error) throw error;
        result = data;
        break;
      }

      // ── History ──────────────────────────────────────────────────────────
      case "LIST_HISTORY": {
        let query = admin
          .from("ermp_activity")
          .select("*, ermp_reconciliations(name, category, status)")
          .eq("company_id", company_id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (body.reconciliation_id) query = query.eq("reconciliation_id", body.reconciliation_id);
        const { data, error } = await query;
        if (error) throw error;
        result = data;
        break;
      }

      // ── Templates ────────────────────────────────────────────────────────
      case "LIST_TEMPLATES": {
        const { data, error } = await admin
          .from("ermp_templates")
          .select("*")
          .eq("company_id", company_id)
          .eq("active", true)
          .order("sort_order");
        if (error) throw error;
        result = data;
        break;
      }

      // ── Financial Close Integration (read-only consumption) ──────────────
      case "GET_CLOSE_CONSUMPTION": {
        const { period_start, period_end } = body;
        if (!period_start || !period_end) {
          throw new Error("period_start and period_end are required.");
        }
        const { data: rows, error } = await admin
          .from("ermp_reconciliations")
          .select("*")
          .eq("company_id", company_id)
          .lte("period_start", period_end)
          .gte("period_end", period_start)
          .neq("status", "archived");
        if (error) throw error;

        const ids = (rows ?? []).map((r) => r.id);
        let diffs = [];
        if (ids.length) {
          const { data: d } = await admin
            .from("ermp_differences")
            .select("*")
            .eq("company_id", company_id)
            .in("reconciliation_id", ids);
          diffs = d ?? [];
        }

        result = buildCloseConsumption(rows ?? [], diffs);
        break;
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return edgeFailure(_ctx, err);
  }
}));
