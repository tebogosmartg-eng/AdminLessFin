/**
 * Enterprise Financial Close Platform — AdminLess Fin V6.8.0
 *
 * Orchestrates the accounting close process before Annual Financial
 * Statements are generated. Experience + orchestration layer ONLY.
 *
 * Hard rules:
 *  - NEVER mutates General Ledger or Journal Engine data
 *  - NEVER recalculates financial facts (reads existing RPCs/tables only)
 *  - NEVER modifies EFS / Snapshot / Validation / Review / Publication
 *  - Only Accounting controls period locking; Financial Statements consume it
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
  const master = (Deno.env.get("EFCP_MODULE") ?? "false").toLowerCase() === "true";
  const silent = (Deno.env.get("EFCP_SILENT_BACKENDS") ?? "true").toLowerCase() === "true";
  return master || silent;
}

/** Standard close checklist blueprint (accounting language only). */
const CHECKLIST_BLUEPRINT = [
  { item_key: "bank_recon", title: "Bank Reconciliations", category: "reconciliation", mandatory: true },
  { item_key: "debtors_recon", title: "Debtors Reconciliation", category: "reconciliation", mandatory: true },
  { item_key: "creditors_recon", title: "Creditors Reconciliation", category: "reconciliation", mandatory: true },
  { item_key: "inventory_recon", title: "Inventory Reconciliation", category: "reconciliation", mandatory: false },
  { item_key: "vat_recon", title: "VAT Reconciliation", category: "reconciliation", mandatory: true },
  { item_key: "payroll_recon", title: "Payroll Reconciliation", category: "reconciliation", mandatory: true },
  { item_key: "asset_register_recon", title: "Asset Register Reconciliation", category: "reconciliation", mandatory: false },
  { item_key: "loan_recon", title: "Loan Reconciliation", category: "reconciliation", mandatory: false },
  { item_key: "suspense_accounts", title: "Suspense Accounts", category: "review", mandatory: true },
  { item_key: "journal_review", title: "Journal Review", category: "review", mandatory: true },
  { item_key: "accrual_review", title: "Accrual Review", category: "review", mandatory: true },
  { item_key: "prepayment_review", title: "Prepayment Review", category: "review", mandatory: false },
  { item_key: "intercompany_review", title: "Intercompany Review", category: "review", mandatory: false },
  { item_key: "fx_review", title: "Foreign Currency Review", category: "review", mandatory: false },
  { item_key: "trial_balance_review", title: "Trial Balance Review", category: "review", mandatory: true },
];

const PERIOD_LADDER = ["open", "soft_closed", "manager_approved", "partner_approved", "locked"];

async function writeActivity(admin, row) {
  await admin.from("efcp_close_activity").insert(row);
}

async function getWorkspace(admin, company_id, id) {
  const { data, error } = await admin
    .from("efcp_close_workspaces")
    .select("*")
    .eq("company_id", company_id)
    .eq("id", id)
    .single();
  if (error) throw new Error("Close period not found.");
  return data;
}

/**
 * Automation: derive live signals from existing platforms without duplicating
 * ownership. Reads only — GL, journals, assets, loans, payroll, validation.
 */
async function collectAutomationSignals(admin, company_id, ws) {
  const [unreconciled, journals, assets, loans, payrollRuns, efsPeriods] = await Promise.all([
    admin
      .from("journal_entry_items")
      .select("id, journal_entries!inner(company_id, entry_date)", { count: "exact", head: true })
      .eq("journal_entries.company_id", company_id)
      .eq("reconciled", false)
      .lte("journal_entries.entry_date", ws.end_date),
    admin
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id)
      .gte("entry_date", ws.start_date)
      .lte("entry_date", ws.end_date),
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
      .eq("company_id", company_id)
      .gte("pay_period_start", ws.start_date)
      .lte("pay_period_start", ws.end_date),
    admin
      .from("efs_reporting_periods")
      .select("id, status, start_date, end_date")
      .eq("company_id", company_id)
      .lte("start_date", ws.end_date)
      .gte("end_date", ws.start_date),
  ]);

  // Validation issues from the certified Validation Platform (read-only)
  let validationOpen = 0;
  try {
    const { count } = await admin
      .from("efs_validation_issues")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id)
      .eq("resolution_status", "open")
      .in("severity", ["blocking", "critical"]);
    validationOpen = count ?? 0;
  } catch {
    validationOpen = 0;
  }

  return {
    unreconciled_items: unreconciled.count ?? 0,
    journals_in_period: journals.count ?? 0,
    assets_tracked: assets.count ?? 0,
    loans_tracked: loans.count ?? 0,
    payroll_runs_in_period: payrollRuns.count ?? 0,
    open_critical_validation_issues: validationOpen,
    reporting_periods: efsPeriods.data ?? [],
  };
}

function computeReadiness(items, approvals, signals, ws) {
  const mandatory = items.filter((i) => i.mandatory);
  const mandatoryDone = mandatory.filter((i) => i.status === "completed").length;
  const reconItems = items.filter((i) => i.category === "reconciliation");
  const reconDone = reconItems.filter((i) => i.status === "completed").length;

  const pct = (done, total) => (total === 0 ? 100 : Math.round((done / total) * 100));

  const generalLedger = signals.unreconciled_items === 0 ? 100 : Math.max(0, 100 - Math.min(100, signals.unreconciled_items * 5));
  const reconciliations = pct(reconDone, reconItems.length);
  const evidence = pct(
    items.filter((i) => i.category === "evidence" && i.status === "completed").length,
    Math.max(1, items.filter((i) => i.category === "evidence").length),
  );
  const journalReview = items.find((i) => i.item_key === "journal_review")?.status === "completed" ? 100 : 0;
  const validation = signals.open_critical_validation_issues === 0 ? 100 : 0;
  const managerApproved = approvals.some((a) => a.approval_role === "manager" && a.decision === "approved");
  const partnerApproved = approvals.some((a) => a.approval_role === "partner" && a.decision === "approved");
  const managementApproval = partnerApproved ? 100 : managerApproved ? 60 : 0;

  const overall = Math.round(
    generalLedger * 0.2 +
      reconciliations * 0.25 +
      evidence * 0.05 +
      journalReview * 0.1 +
      validation * 0.2 +
      managementApproval * 0.2,
  );

  const mandatoryComplete = mandatoryDone === mandatory.length;
  const readyForFinancialStatements =
    mandatoryComplete &&
    signals.open_critical_validation_issues === 0 &&
    managerApproved &&
    ["manager_approved", "partner_approved", "locked"].includes(ws.period_status);

  return {
    components: {
      general_ledger: generalLedger,
      reconciliations,
      supporting_evidence: evidence,
      journal_review: journalReview,
      validation,
      management_approval: managementApproval,
    },
    overall,
    mandatory_total: mandatory.length,
    mandatory_complete: mandatoryDone,
    manager_approved: managerApproved,
    partner_approved: partnerApproved,
    ready_for_financial_statements: readyForFinancialStatements,
  };
}

serve(withEnterprisePlatform("financial-close", "tenant", async (req, _ctx) => {
  try {
    if (req.method !== "POST") throw new Error("Method not allowed.");
    if (!flagsEnabled()) {
      throw new Error("Financial Close module is disabled (EFCP_MODULE / EFCP_SILENT_BACKENDS).");
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

    let result = null;

    switch (method) {
      // ── Close Workspaces ─────────────────────────────────────────────────
      case "LIST_CLOSE_WORKSPACES": {
        const { data, error } = await admin
          .from("efcp_close_workspaces")
          .select("*")
          .eq("company_id", company_id)
          .order("end_date", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "CREATE_CLOSE_WORKSPACE": {
        const { close_type, label, start_date, end_date } = body;
        if (!label || !start_date || !end_date) {
          throw new Error("label, start_date and end_date are required.");
        }
        const { data: existing } = await admin
          .from("efcp_close_workspaces")
          .select("id")
          .eq("company_id", company_id)
          .eq("start_date", start_date)
          .eq("end_date", end_date)
          .eq("close_type", close_type || "month_end")
          .maybeSingle();
        if (existing) {
          result = { id: existing.id, existing: true };
          break;
        }

        const { data: ws, error } = await admin
          .from("efcp_close_workspaces")
          .insert({
            company_id,
            close_type: close_type || "month_end",
            label,
            start_date,
            end_date,
            created_by: user.id,
          })
          .select()
          .single();
        if (error) throw error;

        // Automatically build the checklist — no manual synchronisation
        const rows = CHECKLIST_BLUEPRINT.map((item, i) => ({
          company_id,
          close_workspace_id: ws.id,
          ...item,
          sort_order: i,
          status: "ready",
        }));
        const { error: itemsErr } = await admin.from("efcp_close_items").insert(rows);
        if (itemsErr) throw itemsErr;

        await writeActivity(admin, {
          company_id,
          close_workspace_id: ws.id,
          event_type: "close.workspace.opened",
          message: `Close opened for ${label}`,
          created_by: user.id,
        });

        result = { id: ws.id, existing: false };
        break;
      }

      case "GET_CLOSE_DASHBOARD": {
        if (!body.close_workspace_id) throw new Error("close_workspace_id is required.");
        const ws = await getWorkspace(admin, company_id, body.close_workspace_id);
        const [{ data: items }, { data: approvals }, { data: activity }] = await Promise.all([
          admin
            .from("efcp_close_items")
            .select("*")
            .eq("close_workspace_id", ws.id)
            .order("sort_order"),
          admin
            .from("efcp_close_approvals")
            .select("*")
            .eq("close_workspace_id", ws.id)
            .order("decided_at", { ascending: false }),
          admin
            .from("efcp_close_activity")
            .select("*")
            .eq("close_workspace_id", ws.id)
            .order("created_at", { ascending: false })
            .limit(30),
        ]);

        const signals = await collectAutomationSignals(admin, company_id, ws);
        const readiness = computeReadiness(items ?? [], approvals ?? [], signals, ws);

        result = {
          workspace: ws,
          items: items ?? [],
          approvals: approvals ?? [],
          activity: activity ?? [],
          signals,
          readiness,
        };
        break;
      }

      // ── Checklist ────────────────────────────────────────────────────────
      case "UPDATE_CLOSE_ITEM": {
        const { close_item_id, status, prepared_by, reviewed_by, outstanding_issues, due_date } = body;
        if (!close_item_id) throw new Error("close_item_id is required.");

        const patch = { updated_at: new Date().toISOString() };
        if (status) {
          if (!["ready", "in_progress", "outstanding", "overdue", "completed"].includes(status)) {
            throw new Error("Invalid status.");
          }
          patch.status = status;
          patch.completed_at = status === "completed" ? new Date().toISOString() : null;
        }
        if (prepared_by !== undefined) patch.prepared_by = prepared_by;
        if (reviewed_by !== undefined) patch.reviewed_by = reviewed_by;
        if (outstanding_issues !== undefined) patch.outstanding_issues = outstanding_issues;
        if (due_date !== undefined) patch.due_date = due_date;

        const { data, error } = await admin
          .from("efcp_close_items")
          .update(patch)
          .eq("id", close_item_id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;

        if (status) {
          await writeActivity(admin, {
            company_id,
            close_workspace_id: data.close_workspace_id,
            event_type: "close.task.updated",
            message: `${data.title} marked ${status.replace(/_/g, " ")}`,
            created_by: user.id,
          });
        }
        result = data;
        break;
      }

      // ── Approvals ────────────────────────────────────────────────────────
      case "RECORD_CLOSE_APPROVAL": {
        const { close_workspace_id, approval_role, decision, note, decided_by_name } = body;
        if (!close_workspace_id || !approval_role) {
          throw new Error("close_workspace_id and approval_role are required.");
        }
        const ws = await getWorkspace(admin, company_id, close_workspace_id);
        if (ws.period_status === "locked") throw new Error("Period is locked.");

        // Approval gate: mandatory reconciliations + critical validation issues
        if ((decision ?? "approved") === "approved") {
          const { data: items } = await admin
            .from("efcp_close_items")
            .select("*")
            .eq("close_workspace_id", ws.id);
          const { data: approvals } = await admin
            .from("efcp_close_approvals")
            .select("*")
            .eq("close_workspace_id", ws.id);
          const signals = await collectAutomationSignals(admin, company_id, ws);

          const mandatoryOpen = (items ?? []).filter((i) => i.mandatory && i.status !== "completed");
          if (mandatoryOpen.length > 0) {
            throw new Error(
              `Cannot approve: ${mandatoryOpen.length} mandatory checklist item(s) outstanding.`,
            );
          }
          if (signals.open_critical_validation_issues > 0) {
            throw new Error("Cannot approve: critical validation issues unresolved.");
          }
          if (
            approval_role === "partner" &&
            !(approvals ?? []).some((a) => a.approval_role === "manager" && a.decision === "approved")
          ) {
            throw new Error("Partner approval requires manager approval first.");
          }
        }

        const { data, error } = await admin
          .from("efcp_close_approvals")
          .insert({
            company_id,
            close_workspace_id,
            approval_role,
            decision: decision ?? "approved",
            decided_by: user.id,
            decided_by_name: decided_by_name ?? null,
            note: note ?? null,
          })
          .select()
          .single();
        if (error) throw error;

        // Advance period status ladder on approval
        if ((decision ?? "approved") === "approved") {
          const target = approval_role === "manager" ? "manager_approved" : "partner_approved";
          const currentIdx = PERIOD_LADDER.indexOf(ws.period_status);
          const targetIdx = PERIOD_LADDER.indexOf(target);
          if (targetIdx > currentIdx) {
            await admin
              .from("efcp_close_workspaces")
              .update({ period_status: target, updated_at: new Date().toISOString() })
              .eq("id", ws.id)
              .eq("company_id", company_id);
          }
        }

        await writeActivity(admin, {
          company_id,
          close_workspace_id,
          event_type: `close.${approval_role}_review.${decision ?? "approved"}`,
          message: `${approval_role === "manager" ? "Manager" : "Partner"} ${decision ?? "approved"} the close`,
          created_by: user.id,
        });

        result = data;
        break;
      }

      // ── Period Locks (only Accounting controls locking) ──────────────────
      case "TRANSITION_PERIOD_STATUS": {
        const { close_workspace_id, to_status } = body;
        if (!close_workspace_id || !to_status) {
          throw new Error("close_workspace_id and to_status are required.");
        }
        if (!PERIOD_LADDER.includes(to_status)) throw new Error("Invalid period status.");

        const ws = await getWorkspace(admin, company_id, close_workspace_id);
        const fromIdx = PERIOD_LADDER.indexOf(ws.period_status);
        const toIdx = PERIOD_LADDER.indexOf(to_status);

        // Allowed: one step forward, or reopen back to open (before lock)
        const forwardOne = toIdx === fromIdx + 1;
        const reopen = to_status === "open" && ws.period_status !== "locked";
        if (!forwardOne && !reopen) {
          throw new Error(
            `Cannot move period from ${ws.period_status.replace(/_/g, " ")} to ${to_status.replace(/_/g, " ")}.`,
          );
        }

        // Locking requires partner approval
        if (to_status === "locked" && ws.period_status !== "partner_approved") {
          throw new Error("Locking requires partner approval.");
        }
        // Approval statuses only advance via RECORD_CLOSE_APPROVAL
        if (["manager_approved", "partner_approved"].includes(to_status)) {
          throw new Error("Approval statuses are set through the approval workflow.");
        }

        const { data, error } = await admin
          .from("efcp_close_workspaces")
          .update({ period_status: to_status, updated_at: new Date().toISOString() })
          .eq("id", ws.id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;

        await writeActivity(admin, {
          company_id,
          close_workspace_id: ws.id,
          event_type: to_status === "locked" ? "close.period.locked" : "close.period.status",
          message: `Accounting period moved to ${to_status.replace(/_/g, " ")}`,
          created_by: user.id,
        });

        result = data;
        break;
      }

      // ── Close History ─────────────────────────────────────────────────────
      case "LIST_CLOSE_HISTORY": {
        const query = admin
          .from("efcp_close_activity")
          .select("*, efcp_close_workspaces(label, close_type)")
          .eq("company_id", company_id)
          .order("created_at", { ascending: false })
          .limit(100);
        const { data, error } = body.close_workspace_id
          ? await query.eq("close_workspace_id", body.close_workspace_id)
          : await query;
        if (error) throw error;
        result = data;
        break;
      }

      // ── Financial Statements Integration (read-only readiness check) ─────
      case "GET_PERIOD_READINESS": {
        // Used by Financial Statements to verify the accounting period before
        // generation, and to detect accounting changes for unlocked periods.
        const { start_date, end_date } = body;
        if (!start_date || !end_date) throw new Error("start_date and end_date are required.");

        const { data: ws } = await admin
          .from("efcp_close_workspaces")
          .select("*")
          .eq("company_id", company_id)
          .lte("start_date", end_date)
          .gte("end_date", start_date)
          .order("end_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!ws) {
          result = {
            close_exists: false,
            period_status: "open",
            ready_for_financial_statements: false,
            latest_journal_at: null,
          };
          break;
        }

        const [{ data: items }, { data: approvals }] = await Promise.all([
          admin.from("efcp_close_items").select("*").eq("close_workspace_id", ws.id),
          admin.from("efcp_close_approvals").select("*").eq("close_workspace_id", ws.id),
        ]);
        const signals = await collectAutomationSignals(admin, company_id, ws);
        const readiness = computeReadiness(items ?? [], approvals ?? [], signals, ws);

        // Detect accounting changes for unlocked periods (never regenerate automatically)
        const { data: latestJournal } = await admin
          .from("journal_entries")
          .select("created_at")
          .eq("company_id", company_id)
          .gte("entry_date", ws.start_date)
          .lte("entry_date", ws.end_date)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        result = {
          close_exists: true,
          close_workspace_id: ws.id,
          period_status: ws.period_status,
          ready_for_financial_statements: readiness.ready_for_financial_statements,
          readiness,
          latest_journal_at: latestJournal?.created_at ?? null,
        };
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
