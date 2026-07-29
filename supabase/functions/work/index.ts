// @ts-nocheck
/**
 * Enterprise Work Management edge API (V4.0 + V4.1 additive).
 * Freeze guards: never posts journals; never computes payroll statutory; never mutates payroll engine.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'


const corsHeaders = ENTERPRISE_CORS_HEADERS;

const PAYROLL_FORBIDDEN = new Set([
  "subcontractor", "consultant", "equipment", "vehicle", "plant", "tools",
  "rental_equipment", "materials", "accommodation", "travel", "fuel", "other_operational",
]);

const TYPE_TO_CATEGORY = {
  permanent_employee: "labour",
  contract_employee: "labour",
  casual_labour: "temporary_labour",
  temporary_labour: "temporary_labour",
  subcontractor: "subcontractor",
  consultant: "subcontractor",
  equipment: "equipment",
  vehicle: "vehicle",
  plant: "plant",
  tools: "tools",
  rental_equipment: "rental_equipment",
  materials: "material",
  accommodation: "accommodation",
  travel: "travel",
  fuel: "fuel",
  other_operational: "other",
};

function round4(n) {
  return Math.round(Number(n || 0) * 10000) / 10000;
}
function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function calcHours({ start_at, finish_at, break_minutes, hours }) {
  if (hours != null && Number(hours) > 0) return round4(hours);
  if (!start_at || !finish_at) return 0;
  const ms = new Date(finish_at).getTime() - new Date(start_at).getTime() - (Number(break_minutes) || 0) * 60000;
  return round4(Math.max(0, ms) / 3600000);
}

function sessionHours(clocked_in_at, clocked_out_at, break_minutes) {
  const ms = new Date(clocked_out_at).getTime() - new Date(clocked_in_at).getTime() - (Number(break_minutes) || 0) * 60000;
  return round4(Math.max(0, ms) / 3600000);
}

async function writeAudit(admin, { company_id, entity_type, entity_id, action, actor_user_id, before_state, after_state }) {
  await admin.from("ewm_audit_events").insert({
    company_id, entity_type, entity_id, action, actor_user_id, before_state: before_state ?? null, after_state: after_state ?? null,
  });
}

async function upsertCostRollup(admin, { company_id, ewm_project_id, cost_category, amount, fact_date }) {
  const period_month = `${fact_date.slice(0, 8)}01`;
  const { data: existing } = await admin
    .from("ewm_cost_rollups")
    .select("id, amount")
    .eq("ewm_project_id", ewm_project_id)
    .eq("cost_category", cost_category)
    .eq("period_month", period_month)
    .maybeSingle();
  if (existing) {
    await admin.from("ewm_cost_rollups").update({
      amount: round4(Number(existing.amount) + Number(amount)),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await admin.from("ewm_cost_rollups").insert({
      company_id, ewm_project_id, cost_category, period_month, amount: round4(amount),
    });
  }
}

serve(withEnterprisePlatform('work', 'tenant', async (req, _ctx) => {
  
  try {
    if (req.method !== "POST") {
      throw new Error("Method not allowed.");
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

    
    _ctx.companyId = company_id;const { data: companyMember, error: memberError } = await supabase
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
      // ── Catalogue / hierarchy ─────────────────────────────────────────────
      case "LIST_RESOURCE_TYPES": {
        const { data, error } = await admin.from("ewm_resource_types").select("*").order("sort_order");
        if (error) throw error;
        result = data;
        break;
      }

      case "ENSURE_WORKSPACE_FOR_FINANCIAL_YEAR": {
        const { data, error } = await admin.from("ewm_workspaces").select("*").eq("company_id", company_id).order("name");
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_WORKSPACE": {
        const payload = { ...body.workspace, company_id, updated_at: new Date().toISOString() };
        const { data, error } = body.workspace?.id
          ? await admin.from("ewm_workspaces").update(payload).eq("id", body.workspace.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_workspaces").insert(payload).select().single();
        if (error) throw error;
        await writeAudit(admin, { company_id, entity_type: "workspace", entity_id: data.id, action: body.workspace?.id ? "update" : "create", actor_user_id: user.id, after_state: data });
        result = data;
        break;
      }

      case "LIST_PORTFOLIOS": {
        const q = admin.from("ewm_portfolios").select("*").eq("company_id", company_id);
        if (body.workspace_id) q.eq("workspace_id", body.workspace_id);
        const { data, error } = await q.order("name");
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_PORTFOLIO": {
        const payload = { ...body.portfolio, company_id, updated_at: new Date().toISOString() };
        const { data, error } = body.portfolio?.id
          ? await admin.from("ewm_portfolios").update(payload).eq("id", body.portfolio.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_portfolios").insert(payload).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_EWM_PROJECTS": {
        const { data, error } = await admin.from("ewm_projects").select("*").eq("company_id", company_id).order("updated_at", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "GET_EWM_PROJECT": {
        const { data: project, error } = await admin.from("ewm_projects").select("*").eq("id", body.ewm_project_id).eq("company_id", company_id).single();
        if (error) throw error;
        const [tasks, phases, milestones, costs, budgets, consumptions, timeStats] = await Promise.all([
          admin.from("ewm_tasks").select("*").eq("ewm_project_id", project.id).order("created_at"),
          admin.from("ewm_phases").select("*").eq("ewm_project_id", project.id).order("sequence_no"),
          admin.from("ewm_milestones").select("*").eq("ewm_project_id", project.id).order("due_date"),
          admin.from("ewm_cost_rollups").select("*").eq("ewm_project_id", project.id),
          admin.from("ewm_project_budgets").select("*").eq("ewm_project_id", project.id),
          admin.from("ewm_resource_consumptions").select("*, ewm_work_resources(name, resource_type_id)").eq("ewm_project_id", project.id),
          admin.from("ewm_time_entries").select("id, hours, labour_cost, billable_value, status, billable").eq("ewm_project_id", project.id),
        ]);
        const entries = timeStats.data || [];
        const burn = entries.filter((e) => ["approved", "locked", "historical"].includes(e.status))
          .reduce((s, e) => s + Number(e.labour_cost || 0), 0);
        const billableValue = entries.filter((e) => ["approved", "locked", "historical"].includes(e.status))
          .reduce((s, e) => s + Number(e.billable_value || 0), 0);
        const consumptionBurn = (consumptions.data || [])
          .filter((c) => c.status === "locked" || c.status === "approved")
          .reduce((s, c) => s + Number(c.amount || 0), 0);
        const totalBurn = burn + consumptionBurn;
        const remainingHours = (tasks.data || []).reduce((s, t) => s + Number(t.remaining_hours || 0), 0);
        const blended = entries.length
          ? entries.reduce((s, e) => s + Number(e.labour_cost || 0), 0) / Math.max(1, entries.reduce((s, e) => s + Number(e.hours || 0), 0))
          : 0;
        const forecastCost = round2(totalBurn + remainingHours * blended);
        const contractValue = Number(project.contract_value || 0);
        const forecastProfit = round2(contractValue - forecastCost);
        const forecastMargin = contractValue > 0 ? round2((forecastProfit / contractValue) * 100) : 0;

        // Optional GL / AR reads via legacy project_id (Accounting remains SoT)
        let gl = { revenue: 0, costs: 0, cashReceived: 0, outstanding: 0 };
        if (project.project_id) {
          const { data: jei } = await admin
            .from("journal_entry_items")
            .select("debit, credit, accounts(type), journal_entries!inner(company_id)")
            .eq("project_id", project.project_id)
            .eq("journal_entries.company_id", company_id);
          for (const row of jei || []) {
            const type = row.accounts?.type;
            const debit = Number(row.debit || 0);
            const credit = Number(row.credit || 0);
            if (type === "Income") gl.revenue += credit - debit;
            if (type === "Expense" || type === "Cost of Goods Sold") gl.costs += debit - credit;
          }
        }

        result = {
          project,
          tasks: tasks.data || [],
          phases: phases.data || [],
          milestones: milestones.data || [],
          costRollups: costs.data || [],
          budgets: budgets.data || [],
          consumptions: consumptions.data || [],
          economics: {
            contractValue,
            revenueEarnedGl: round2(gl.revenue),
            revenueRemaining: round2(Math.max(0, contractValue - gl.revenue)),
            actualCostsGl: round2(gl.costs),
            operationalBurn: round2(totalBurn),
            labourCost: round2(burn),
            resourceBurn: round2(consumptionBurn),
            billableValue: round2(billableValue),
            forecastCost,
            forecastProfit,
            forecastMargin,
            budgetRemaining: round2(Number(project.operational_budget || 0) - totalBurn),
            cashReceived: gl.cashReceived,
            outstandingDebtors: gl.outstanding,
            operationalMargin: round2(billableValue - totalBurn),
          },
        };
        break;
      }

      case "UPSERT_EWM_PROJECT": {
        const payload = { ...body.project, company_id, updated_at: new Date().toISOString() };
        const { data, error } = body.project?.id
          ? await admin.from("ewm_projects").update(payload).eq("id", body.project.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_projects").insert(payload).select().single();
        if (error) throw error;
        await writeAudit(admin, { company_id, entity_type: "ewm_project", entity_id: data.id, action: body.project?.id ? "update" : "create", actor_user_id: user.id, after_state: data });
        result = data;
        break;
      }

      case "UPSERT_TASK": {
        const payload = { ...body.task, company_id, updated_at: new Date().toISOString() };
        const { data, error } = body.task?.id
          ? await admin.from("ewm_tasks").update(payload).eq("id", body.task.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_tasks").insert(payload).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_PHASE": {
        const payload = { ...body.phase, company_id, updated_at: new Date().toISOString() };
        const { data, error } = body.phase?.id
          ? await admin.from("ewm_phases").update(payload).eq("id", body.phase.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_phases").insert(payload).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_MILESTONE": {
        const payload = { ...body.milestone, company_id, updated_at: new Date().toISOString() };
        const { data, error } = body.milestone?.id
          ? await admin.from("ewm_milestones").update(payload).eq("id", body.milestone.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_milestones").insert(payload).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      // ── Time workflow ────────────────────────────────────────────────────
      case "LIST_TIME_ENTRIES": {
        let q = admin.from("ewm_time_entries").select("*").eq("company_id", company_id).order("entry_date", { ascending: false });
        if (body.ewm_project_id) q = q.eq("ewm_project_id", body.ewm_project_id);
        if (body.status) q = q.eq("status", body.status);
        if (body.employee_id) q = q.eq("employee_id", body.employee_id);
        const { data, error } = await q.limit(body.limit || 200);
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_TIME_ENTRY": {
        const incoming = body.entry || {};
        if (incoming.id) {
          const { data: existing } = await admin.from("ewm_time_entries").select("*").eq("id", incoming.id).eq("company_id", company_id).single();
          if (!existing) throw new Error("Time entry not found.");
          if (!["draft", "submitted"].includes(existing.status)) {
            throw new Error(`Time entry status '${existing.status}' is immutable. Use a compensating correction.`);
          }
        }
        const hours = calcHours(incoming);
        const operational_rate = Number(incoming.operational_rate || 0);
        const billable_rate = Number(incoming.billable_rate || 0);
        const billable = incoming.billable !== false;
        const payload = {
          ...incoming,
          company_id,
          hours,
          labour_cost: round4(hours * operational_rate),
          billable_value: billable ? round4(hours * billable_rate) : 0,
          capture_channel: incoming.capture_channel || "manual",
          created_by: incoming.created_by || user.id,
          updated_at: new Date().toISOString(),
        };
        delete payload.id;
        const { data, error } = incoming.id
          ? await admin.from("ewm_time_entries").update(payload).eq("id", incoming.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_time_entries").insert({ ...payload, status: incoming.status || "draft" }).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "SUBMIT_TIME_ENTRY": {
        const { data: existing, error: e1 } = await admin.from("ewm_time_entries").select("*").eq("id", body.time_entry_id).eq("company_id", company_id).single();
        if (e1 || !existing) throw new Error("Time entry not found.");
        if (existing.status !== "draft") throw new Error("Only draft entries can be submitted.");
        const { data, error } = await admin.from("ewm_time_entries").update({ status: "submitted", updated_at: new Date().toISOString() }).eq("id", existing.id).select().single();
        if (error) throw error;
        await writeAudit(admin, { company_id, entity_type: "time_entry", entity_id: data.id, action: "submit", actor_user_id: user.id, before_state: existing, after_state: data });
        result = data;
        break;
      }

      case "APPROVE_TIME_ENTRY": {
        const { data: existing, error: e1 } = await admin.from("ewm_time_entries").select("*").eq("id", body.time_entry_id).eq("company_id", company_id).single();
        if (e1 || !existing) throw new Error("Time entry not found.");
        if (existing.status !== "submitted") throw new Error("Only submitted entries can be approved.");
        const { data, error } = await admin.from("ewm_time_entries").update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id).select().single();
        if (error) throw error;
        await writeAudit(admin, { company_id, entity_type: "time_entry", entity_id: data.id, action: "approve", actor_user_id: user.id, before_state: existing, after_state: data });
        result = data;
        break;
      }

      case "LOCK_TIME_ENTRY": {
        const { data: existing, error: e1 } = await admin.from("ewm_time_entries").select("*").eq("id", body.time_entry_id).eq("company_id", company_id).single();
        if (e1 || !existing) throw new Error("Time entry not found.");
        if (existing.status !== "approved") throw new Error("Only approved entries can be locked.");

        const locked = {
          status: "locked",
          locked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          payroll_period_id: body.payroll_period_id || existing.payroll_period_id || null,
        };
        const { data, error } = await admin.from("ewm_time_entries").update(locked).eq("id", existing.id).select().single();
        if (error) throw error;

        // Operational cost fact
        await admin.from("ewm_cost_facts").insert({
          company_id,
          ewm_project_id: data.ewm_project_id,
          time_entry_id: data.id,
          cost_category: "labour",
          amount: data.labour_cost || 0,
          fact_date: data.entry_date,
          source: "time_lock",
          is_locked: true,
        });
        await upsertCostRollup(admin, {
          company_id,
          ewm_project_id: data.ewm_project_id,
          cost_category: "labour",
          amount: data.labour_cost || 0,
          fact_date: data.entry_date,
        });

        // Payroll input fact (adapter — never calculates payroll)
        let resourceTypeId = null;
        if (data.work_resource_id) {
          const { data: wr } = await admin.from("ewm_work_resources").select("resource_type_id").eq("id", data.work_resource_id).maybeSingle();
          resourceTypeId = wr?.resource_type_id || null;
        }
        if (data.employee_id) {
          const forbidden = resourceTypeId && PAYROLL_FORBIDDEN.has(resourceTypeId);
          const wage_input = resourceTypeId === "temporary_labour" || resourceTypeId === "casual_labour";
          await admin.from("ewm_payroll_input_facts").upsert({
            company_id,
            employee_id: data.employee_id,
            work_resource_id: data.work_resource_id,
            time_entry_id: data.id,
            ewm_project_id: data.ewm_project_id,
            entry_date: data.entry_date,
            hours: data.hours,
            is_overtime: !!data.is_overtime,
            wage_input,
            payroll_period_id: data.payroll_period_id,
            status: forbidden ? "excluded" : "ready",
            exclusion_reason: forbidden ? `Resource type '${resourceTypeId}' must never generate payroll` : null,
          }, { onConflict: "time_entry_id" });
        }

        await writeAudit(admin, { company_id, entity_type: "time_entry", entity_id: data.id, action: "lock", actor_user_id: user.id, before_state: existing, after_state: data });
        result = data;
        break;
      }

      // ── Billing bridge (E4) ───────────────────────────────────────────────
      case "PROJECT_TO_TIMESHEET": {
        const { data: entry, error: e1 } = await admin.from("ewm_time_entries").select("*").eq("id", body.time_entry_id).eq("company_id", company_id).single();
        if (e1 || !entry) throw new Error("Time entry not found.");
        if (entry.status !== "locked" && entry.status !== "approved") {
          throw new Error("Only approved/locked billable entries can project to timesheets.");
        }
        if (!entry.billable) throw new Error("Entry is not billable.");
        if (entry.timesheet_id) {
          result = { timesheet_id: entry.timesheet_id, alreadyProjected: true };
          break;
        }
        const { data: ewmProject } = await admin.from("ewm_projects").select("project_id").eq("id", entry.ewm_project_id).single();
        if (!ewmProject?.project_id) throw new Error("EWM project is not linked to a legacy billable project.");

        const { data: ts, error: tsErr } = await admin.from("timesheets").insert({
          company_id,
          project_id: ewmProject.project_id,
          user_id: body.user_id || user.id,
          date: entry.entry_date,
          hours: entry.hours,
          notes: entry.notes || `EWM:${entry.id}`,
          is_billed: false,
        }).select().single();
        if (tsErr) throw tsErr;

        await admin.from("ewm_time_entries").update({ timesheet_id: ts.id, updated_at: new Date().toISOString() }).eq("id", entry.id);
        await writeAudit(admin, { company_id, entity_type: "time_entry", entity_id: entry.id, action: "billing_bridge", actor_user_id: user.id, after_state: { timesheet_id: ts.id } });
        result = { timesheet: ts, time_entry_id: entry.id };
        break;
      }

      case "LIST_BILLABLE_LOCKED_UNPROJECTED": {
        const { data, error } = await admin
          .from("ewm_time_entries")
          .select("*")
          .eq("company_id", company_id)
          .eq("billable", true)
          .in("status", ["approved", "locked"])
          .is("timesheet_id", null);
        if (error) throw error;
        result = data;
        break;
      }

      // ── Allocations / capacity ────────────────────────────────────────────
      case "UPSERT_ALLOCATION": {
        const payload = { ...body.allocation, company_id, updated_at: new Date().toISOString() };
        const { data, error } = body.allocation?.id
          ? await admin.from("ewm_allocations").update(payload).eq("id", body.allocation.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_allocations").insert(payload).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_ALLOCATIONS": {
        let q = admin.from("ewm_allocations").select("*").eq("company_id", company_id);
        if (body.ewm_project_id) q = q.eq("ewm_project_id", body.ewm_project_id);
        const { data, error } = await q.order("window_start", { ascending: false });
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_CAPACITY_SNAPSHOT": {
        const available = Number(body.snapshot?.available_hours || 0);
        const booked = Number(body.snapshot?.booked_hours || 0);
        const actual = Number(body.snapshot?.actual_hours || 0);
        const utilisation_pct = available > 0 ? round2((actual / available) * 100) : 0;
        const payload = { ...body.snapshot, company_id, utilisation_pct };
        const { data, error } = await admin.from("ewm_capacity_snapshots").insert(payload).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "LIST_CAPACITY": {
        const { data, error } = await admin.from("ewm_capacity_snapshots").select("*").eq("company_id", company_id).order("period_start", { ascending: false }).limit(200);
        if (error) throw error;
        result = data;
        break;
      }

      // ── Resources / consumptions (E6) ─────────────────────────────────────
      case "LIST_WORK_RESOURCES": {
        const { data, error } = await admin.from("ewm_work_resources").select("*, ewm_resource_types(label, payroll_eligible, integration_target)").eq("company_id", company_id).order("name");
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_WORK_RESOURCE": {
        const payload = { ...body.resource, company_id, updated_at: new Date().toISOString() };
        const { data, error } = body.resource?.id
          ? await admin.from("ewm_work_resources").update(payload).eq("id", body.resource.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_work_resources").insert(payload).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_RESOURCE_CONSUMPTION": {
        const incoming = body.consumption || {};
        const quantity = Number(incoming.quantity || 1);
        const unit_cost = Number(incoming.unit_cost || 0);
        const amount = round4(quantity * unit_cost);
        const payload = { ...incoming, company_id, quantity, unit_cost, amount, updated_at: new Date().toISOString() };
        const { data, error } = incoming.id
          ? await admin.from("ewm_resource_consumptions").update(payload).eq("id", incoming.id).eq("company_id", company_id).select().single()
          : await admin.from("ewm_resource_consumptions").insert({ ...payload, status: incoming.status || "draft" }).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "APPROVE_RESOURCE_CONSUMPTION": {
        const { data: existing } = await admin.from("ewm_resource_consumptions").select("*").eq("id", body.consumption_id).eq("company_id", company_id).single();
        if (!existing) throw new Error("Consumption not found.");
        const { data, error } = await admin.from("ewm_resource_consumptions").update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "LOCK_RESOURCE_CONSUMPTION": {
        const { data: existing } = await admin.from("ewm_resource_consumptions").select("*, ewm_work_resources(resource_type_id)").eq("id", body.consumption_id).eq("company_id", company_id).single();
        if (!existing) throw new Error("Consumption not found.");
        if (existing.status !== "approved") throw new Error("Only approved consumptions can be locked.");
        const { data, error } = await admin.from("ewm_resource_consumptions").update({
          status: "locked",
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id).select().single();
        if (error) throw error;
        const cost_category = existing.cost_category || TYPE_TO_CATEGORY[existing.ewm_work_resources?.resource_type_id] || "other";
        await admin.from("ewm_cost_facts").insert({
          company_id,
          ewm_project_id: data.ewm_project_id,
          consumption_id: data.id,
          cost_category,
          amount: data.amount,
          fact_date: data.consumption_date,
          source: "resource_consumption",
          is_locked: true,
        });
        await upsertCostRollup(admin, {
          company_id,
          ewm_project_id: data.ewm_project_id,
          cost_category,
          amount: data.amount,
          fact_date: data.consumption_date,
        });
        result = data;
        break;
      }

      // ── Clocking (E7) ────────────────────────────────────────────────────
      case "CLOCK_IN": {
        const { data: open } = await admin.from("ewm_clock_sessions")
          .select("id").eq("company_id", company_id).eq("employee_id", body.employee_id)
          .in("status", ["open", "on_break"]).maybeSingle();
        if (open) throw new Error("An open clock session already exists.");
        const { data: session, error } = await admin.from("ewm_clock_sessions").insert({
          company_id,
          employee_id: body.employee_id,
          work_resource_id: body.work_resource_id || null,
          ewm_project_id: body.ewm_project_id || null,
          task_id: body.task_id || null,
          status: "open",
          clocked_in_at: body.event_at || new Date().toISOString(),
          location_lat: body.location_lat || null,
          location_lng: body.location_lng || null,
          photo_ref: body.photo_ref || null,
          qr_ref: body.qr_ref || null,
        }).select().single();
        if (error) throw error;
        await admin.from("ewm_clock_events").insert({
          company_id,
          session_id: session.id,
          event_type: "clock_in",
          event_at: session.clocked_in_at,
          location_lat: body.location_lat || null,
          location_lng: body.location_lng || null,
          photo_ref: body.photo_ref || null,
          qr_ref: body.qr_ref || null,
          offline_captured: !!body.offline_captured,
          synced_at: new Date().toISOString(),
        });
        result = session;
        break;
      }

      case "CLOCK_BREAK_START":
      case "CLOCK_BREAK_END": {
        const { data: session } = await admin.from("ewm_clock_sessions").select("*").eq("id", body.session_id).eq("company_id", company_id).single();
        if (!session) throw new Error("Session not found.");
        const isStart = method === "CLOCK_BREAK_START";
        if (isStart && session.status !== "open") throw new Error("Session must be open to start break.");
        if (!isStart && session.status !== "on_break") throw new Error("Session must be on break to end break.");
        const event_at = body.event_at || new Date().toISOString();
        let break_minutes = Number(session.break_minutes || 0);
        if (!isStart) {
          const { data: lastBreak } = await admin.from("ewm_clock_events")
            .select("event_at").eq("session_id", session.id).eq("event_type", "break_start")
            .order("event_at", { ascending: false }).limit(1).maybeSingle();
          if (lastBreak) {
            break_minutes += (new Date(event_at).getTime() - new Date(lastBreak.event_at).getTime()) / 60000;
          }
        }
        const { data: updated, error } = await admin.from("ewm_clock_sessions").update({
          status: isStart ? "on_break" : "open",
          break_minutes: round2(break_minutes),
          updated_at: new Date().toISOString(),
        }).eq("id", session.id).select().single();
        if (error) throw error;
        await admin.from("ewm_clock_events").insert({
          company_id,
          session_id: session.id,
          event_type: isStart ? "break_start" : "break_end",
          event_at,
          offline_captured: !!body.offline_captured,
          synced_at: new Date().toISOString(),
        });
        result = updated;
        break;
      }

      case "CLOCK_OUT": {
        const { data: session } = await admin.from("ewm_clock_sessions").select("*").eq("id", body.session_id).eq("company_id", company_id).single();
        if (!session) throw new Error("Session not found.");
        if (!["open", "on_break"].includes(session.status)) throw new Error("Session is not open.");
        const clocked_out_at = body.event_at || new Date().toISOString();
        const hours = sessionHours(session.clocked_in_at, clocked_out_at, session.break_minutes);
        if (!session.ewm_project_id) throw new Error("Clock session requires ewm_project_id to create a time entry.");

        const { data: entry, error: teErr } = await admin.from("ewm_time_entries").insert({
          company_id,
          ewm_project_id: session.ewm_project_id,
          task_id: session.task_id,
          employee_id: session.employee_id,
          work_resource_id: session.work_resource_id,
          entry_date: clocked_out_at.slice(0, 10),
          start_at: session.clocked_in_at,
          finish_at: clocked_out_at,
          break_minutes: session.break_minutes,
          hours,
          status: "draft",
          capture_channel: "clock",
          location_lat: body.location_lat || session.location_lat,
          location_lng: body.location_lng || session.location_lng,
          photo_ref: body.photo_ref || session.photo_ref,
          qr_ref: body.qr_ref || session.qr_ref,
          created_by: user.id,
          operational_rate: Number(body.operational_rate || 0),
          billable_rate: Number(body.billable_rate || 0),
          labour_cost: round4(hours * Number(body.operational_rate || 0)),
          billable_value: round4(hours * Number(body.billable_rate || 0)),
          billable: body.billable !== false,
        }).select().single();
        if (teErr) throw teErr;

        const { data: updated, error } = await admin.from("ewm_clock_sessions").update({
          status: "closed",
          clocked_out_at,
          time_entry_id: entry.id,
          updated_at: new Date().toISOString(),
        }).eq("id", session.id).select().single();
        if (error) throw error;
        await admin.from("ewm_clock_events").insert({
          company_id,
          session_id: session.id,
          event_type: "clock_out",
          event_at: clocked_out_at,
          location_lat: body.location_lat || null,
          location_lng: body.location_lng || null,
          photo_ref: body.photo_ref || null,
          qr_ref: body.qr_ref || null,
          offline_captured: !!body.offline_captured,
          synced_at: new Date().toISOString(),
        });
        result = { session: updated, time_entry: entry };
        break;
      }

      case "LIST_CLOCK_SESSIONS": {
        let q = admin.from("ewm_clock_sessions").select("*").eq("company_id", company_id).order("clocked_in_at", { ascending: false });
        if (body.employee_id) q = q.eq("employee_id", body.employee_id);
        if (body.status) q = q.eq("status", body.status);
        const { data, error } = await q.limit(100);
        if (error) throw error;
        result = data;
        break;
      }

      // ── Payroll adapter read (E5) ─────────────────────────────────────────
      case "LIST_PAYROLL_INPUT_FACTS": {
        let q = admin.from("ewm_payroll_input_facts").select("*").eq("company_id", company_id);
        if (body.status) q = q.eq("status", body.status);
        if (body.payroll_period_id) q = q.eq("payroll_period_id", body.payroll_period_id);
        const { data, error } = await q.order("entry_date", { ascending: false }).limit(500);
        if (error) throw error;
        result = data;
        break;
      }

      // ── Executive dashboard / intelligence (E2/E3) ────────────────────────
      case "GET_EXECUTIVE_DASHBOARD": {
        const { data: projects } = await admin.from("ewm_projects").select("*").eq("company_id", company_id);
        const active = (projects || []).filter((p) => p.status === "active");
        const pipeline = (projects || []).filter((p) => p.status === "pipeline");
        const awardedContractValue = active.reduce((s, p) => s + Number(p.contract_value || 0), 0);
        const pipelineValue = pipeline.reduce((s, p) => s + Number(p.contract_value || 0), 0);

        const { data: rollups } = await admin.from("ewm_cost_rollups").select("*").eq("company_id", company_id);
        const costsIncurred = (rollups || []).reduce((s, r) => s + Number(r.amount || 0), 0);

        const { data: pending } = await admin.from("ewm_time_entries").select("id", { count: "exact", head: true })
          .eq("company_id", company_id).eq("status", "submitted");

        const { data: capacity } = await admin.from("ewm_capacity_snapshots").select("*").eq("company_id", company_id).order("period_start", { ascending: false }).limit(50);
        const avail = (capacity || []).reduce((s, c) => s + Number(c.available_hours || 0), 0);
        const booked = (capacity || []).reduce((s, c) => s + Number(c.booked_hours || 0), 0);
        const actual = (capacity || []).reduce((s, c) => s + Number(c.actual_hours || 0), 0);

        const { data: milestones } = await admin.from("ewm_milestones")
          .select("*, ewm_projects(name, status)")
          .eq("company_id", company_id)
          .neq("status", "completed")
          .order("due_date")
          .limit(20);

        const { data: alerts } = await admin.from("ewm_budget_alerts")
          .select("*").eq("company_id", company_id).eq("acknowledged", false).order("created_at", { ascending: false }).limit(20);

        const { data: unprojected } = await admin.from("ewm_time_entries")
          .select("id, billable_value, ewm_project_id")
          .eq("company_id", company_id).eq("billable", true).in("status", ["approved", "locked"]).is("timesheet_id", null);

        const today = new Date();
        const deadlineRisks = (milestones || []).map((m) => {
          const due = m.due_date ? new Date(m.due_date) : null;
          const days = due ? Math.ceil((due.getTime() - today.getTime()) / 86400000) : 999;
          return {
            id: m.ewm_project_id,
            name: `${m.ewm_projects?.name || "Project"} — ${m.name}`,
            dueDate: m.due_date,
            daysRemaining: days,
          };
        }).filter((d) => d.daysRemaining <= 14);

        const budgetRisks = [];
        for (const p of active) {
          const burn = (rollups || []).filter((r) => r.ewm_project_id === p.id).reduce((s, r) => s + Number(r.amount || 0), 0);
          const budget = Number(p.operational_budget || 0);
          if (budget > 0) {
            const burnPct = round2((burn / budget) * 100);
            if (burnPct >= 85) budgetRisks.push({ id: p.id, name: p.name, burnPct });
          }
        }

        const overallocations = (capacity || [])
          .filter((c) => Number(c.utilisation_pct || 0) > 100)
          .map((c) => ({ id: c.id, name: c.employee_id || c.work_resource_id || "Resource", utilisationPct: Number(c.utilisation_pct) }));

        const idleResources = (capacity || [])
          .filter((c) => Number(c.available_hours || 0) > 0 && Number(c.actual_hours || 0) / Number(c.available_hours) < 0.2)
          .map((c) => ({ id: c.id, name: c.employee_id || c.work_resource_id || "Resource" }));

        const unbilledCompleted = [];
        const byProject = {};
        for (const u of unprojected || []) {
          byProject[u.ewm_project_id] = (byProject[u.ewm_project_id] || 0) + Number(u.billable_value || 0);
        }
        for (const [pid, amount] of Object.entries(byProject)) {
          const proj = (projects || []).find((p) => p.id === pid);
          if (proj) unbilledCompleted.push({ id: pid, name: proj.name, amount });
        }

        result = {
          businessOverview: {
            totalActiveWork: active.length,
            pipelineValue: round2(pipelineValue),
            awardedContractValue: round2(awardedContractValue),
            costsIncurred: round2(costsIncurred),
            expectedGrossProfit: round2(awardedContractValue - costsIncurred),
            payrollDueApprovals: pending?.length ?? pending ?? 0,
            resourceUtilisationPct: avail > 0 ? round2((actual / avail) * 100) : 0,
            capacityRemainingHours: round2(Math.max(0, avail - booked)),
            operationalBurnRate: round2(costsIncurred),
          },
          projectsRequiringAttention: budgetRisks.slice(0, 10),
          upcomingDeadlines: deadlineRisks.slice(0, 10),
          budgetRisks,
          scheduleRisks: deadlineRisks,
          executiveAlerts: alerts || [],
          intelligence: {
            pendingApprovals: typeof pending === "object" && pending !== null && "length" in (pending || {})
              ? (unprojected ? (await admin.from("ewm_time_entries").select("id").eq("company_id", company_id).eq("status", "submitted")).data?.length || 0 : 0)
              : 0,
            idleResources,
            overallocations,
            unbilledCompleted,
            outstandingSupplierInvoices: [],
            cashFlowRisks: [],
          },
          projects: projects || [],
        };

        // Fix pending count properly
        const { data: submittedRows } = await admin.from("ewm_time_entries").select("id").eq("company_id", company_id).eq("status", "submitted");
        result.businessOverview.payrollDueApprovals = (submittedRows || []).length;
        result.intelligence.pendingApprovals = (submittedRows || []).length;
        break;
      }

      case "GET_ATTENTION_QUEUE": {
        // Thin wrapper — client may also compose via analyticsEngine; server returns raw inputs
        const dash = await (async () => {
          // reuse by recursive call pattern avoided; return minimal
          return null;
        })();
        void dash;
        const { data: submittedRows } = await admin.from("ewm_time_entries").select("id").eq("company_id", company_id).eq("status", "submitted");
        const { data: projects } = await admin.from("ewm_projects").select("id, name, operational_budget, status").eq("company_id", company_id).eq("status", "active");
        const { data: rollups } = await admin.from("ewm_cost_rollups").select("*").eq("company_id", company_id);
        const budgetRisks = [];
        for (const p of projects || []) {
          const burn = (rollups || []).filter((r) => r.ewm_project_id === p.id).reduce((s, r) => s + Number(r.amount || 0), 0);
          const budget = Number(p.operational_budget || 0);
          if (budget > 0 && burn / budget >= 0.85) {
            budgetRisks.push({ id: p.id, name: p.name, burnPct: round2((burn / budget) * 100) });
          }
        }
        result = {
          pendingApprovals: (submittedRows || []).length,
          budgetRisks,
        };
        break;
      }

      case "UPSERT_RATE_CARD": {
        const { data, error } = await admin.from("ewm_rate_cards").insert({ ...body.rate_card, company_id }).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      case "UPSERT_PROJECT_BUDGET": {
        const payload = { ...body.budget, company_id, updated_at: new Date().toISOString() };
        const { data, error } = await admin.from("ewm_project_budgets").upsert(payload, { onConflict: "ewm_project_id,cost_category" }).select().single();
        if (error) throw error;
        result = data;
        break;
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return edgeFailure(_ctx, error);
  }
}))
