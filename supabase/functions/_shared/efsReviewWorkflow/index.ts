/**
 * EFS V6.4.6 — Enterprise Review Workflow helpers
 * Determines engagement acceptability for publication readiness.
 * Never mutates accounting balances / GL / statement amounts.
 * Does not execute Publication / XBRL / AI.
 */
// @ts-nocheck

export const REVIEW_STAGES = [
  "draft",
  "validation_complete",
  "manager_review",
  "corrections",
  "manager_approved",
  "partner_review",
  "partner_approved",
  "publication_ready",
  "rejected",
];

/**
 * Controlled transitions. Corrections return target is return_to_stage on the case.
 */
export function assertTransition(from, to, { decision_code, return_to_stage } = {}) {
  const allowed = {
    draft: ["validation_complete", "rejected"],
    validation_complete: ["manager_review", "rejected"],
    manager_review: ["corrections", "manager_approved", "rejected", "partner_review"], // escalate may skip
    corrections: ["manager_review", "partner_review"],
    manager_approved: ["partner_review", "rejected"],
    partner_review: ["corrections", "partner_approved", "rejected"],
    partner_approved: ["publication_ready"],
    publication_ready: [],
    rejected: [],
  };
  if (!(allowed[from] || []).includes(to)) {
    throw new Error(`Invalid review stage transition ${from} → ${to}`);
  }
  if (from === "corrections") {
    const expected = return_to_stage || "manager_review";
    if (to !== expected) {
      throw new Error(`Corrections must return to ${expected}, got ${to}`);
    }
  }
  if (decision_code === "request_changes" && to !== "corrections") {
    throw new Error("request_changes must transition to corrections");
  }
  if (decision_code === "reject" && to !== "rejected") {
    throw new Error("reject must transition to rejected");
  }
  return true;
}

export async function sha256Hex(payload) {
  const data = new TextEncoder().encode(typeof payload === "string" ? payload : JSON.stringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function appendPackReviewHistory(admin, row) {
  const { error } = await admin.from("efs_pack_review_history").insert(row);
  if (error) throw error;
}

export async function buildPackFingerprint(admin, { company_id, workspace_id, validation_run_id, snapshot_version_id }) {
  const [{ data: statements }, { data: disclosures }, { data: wps }, { data: run }] = await Promise.all([
    admin
      .from("efs_statement_instances")
      .select("id, statement_type, content_hash, snapshot_version_id")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id),
    admin
      .from("efs_disclosure_instances")
      .select("id, disclosure_code, status, content_hash")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id),
    admin
      .from("efs_working_papers")
      .select("id, title, status, content_hash")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id),
    validation_run_id
      ? admin
          .from("efs_validation_runs")
          .select("id, status, ready_for_review, blocking_count")
          .eq("id", validation_run_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let stmts = statements || [];
  if (snapshot_version_id) {
    stmts = stmts.filter((s) => s.snapshot_version_id === snapshot_version_id);
  }

  const payload = {
    validation_run_id: validation_run_id || null,
    snapshot_version_id: snapshot_version_id || null,
    ready_for_review: run?.ready_for_review ?? null,
    blocking_count: run?.blocking_count ?? null,
    statements: stmts.map((s) => ({ t: s.statement_type, h: s.content_hash })).sort((a, b) => a.t.localeCompare(b.t)),
    disclosures: (disclosures || []).map((d) => ({ c: d.disclosure_code, s: d.status, h: d.content_hash || null })),
    working_papers: (wps || []).map((w) => ({ id: w.id, s: w.status, h: w.content_hash || null })),
    // Explicit: fingerprint is attestation material — never rewrites balances
    mutates_accounting: false,
  };
  return { fingerprint: await sha256Hex(payload), payload };
}

export async function requireValidationReady(admin, validation_run_id) {
  if (!validation_run_id) throw new Error("validation_run_id is required to leave draft.");
  const { data: run, error } = await admin
    .from("efs_validation_runs")
    .select("id, status, ready_for_review, blocking_count, workspace_id")
    .eq("id", validation_run_id)
    .single();
  if (error || !run) throw new Error("Validation run not found.");
  if (!run.ready_for_review || Number(run.blocking_count || 0) > 0) {
    throw new Error("Validation must be ready_for_review (no blocking issues) before Manager Review.");
  }
  if (!["passed", "passed_with_advisories"].includes(run.status)) {
    throw new Error(`Validation run status '${run.status}' is not acceptable for review.`);
  }
  return run;
}

export function mapDecisionToStages(currentStage, decision_code, { escalate_to_partner = false } = {}) {
  if (decision_code === "reject") {
    return { to_stage: "rejected", return_to_stage: null };
  }
  if (decision_code === "request_changes") {
    const return_to =
      currentStage === "partner_review" || currentStage === "partner_approved"
        ? "partner_review"
        : "manager_review";
    return { to_stage: "corrections", return_to_stage: return_to };
  }
  if (decision_code === "escalate") {
    return { to_stage: "partner_review", return_to_stage: null, escalated: true };
  }
  if (decision_code === "approve") {
    if (currentStage === "manager_review") return { to_stage: "manager_approved", return_to_stage: null };
    if (currentStage === "partner_review") return { to_stage: "partner_approved", return_to_stage: null };
    if (currentStage === "partner_approved") return { to_stage: "publication_ready", return_to_stage: null };
    if (currentStage === "manager_approved" && escalate_to_partner) {
      return { to_stage: "partner_review", return_to_stage: null };
    }
    throw new Error(`approve is not valid from stage ${currentStage}`);
  }
  throw new Error(`Unknown decision_code ${decision_code}`);
}
