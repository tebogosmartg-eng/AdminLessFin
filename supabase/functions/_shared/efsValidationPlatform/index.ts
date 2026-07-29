/**
 * EFS V6.4.5 — Validation Platform
 * Identifies defects. Does NOT approve. Does NOT mutate financial data.
 * Reads Reporting Snapshots / Statement Structure / Disclosures / Working Papers only.
 */
// @ts-nocheck

function lineAmount(lines, code) {
  const row = (lines || []).find((l) => l.line_code === code || l.code === code);
  if (!row) return null;
  const n = Number(row.amount ?? row.value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function issue({
  rule,
  severity,
  issue_code,
  title,
  message,
  recommendation,
  structure_node_id = null,
  disclosure_instance_id = null,
  working_paper_id = null,
  statement_instance_id = null,
  payload = {},
}) {
  return {
    rule_id: rule?.id ?? null,
    rule_code: rule?.rule_code || rule?.code || "UNKNOWN",
    issue_code,
    title,
    message,
    severity: severity || rule?.default_severity || "advisory",
    recommendation: recommendation || rule?.recommendation_template || null,
    structure_node_id,
    disclosure_instance_id,
    working_paper_id,
    statement_instance_id,
    resolution_status: "open",
    payload,
  };
}

/**
 * PART A — Technical Validation Engine (read-only against finance).
 */
export function runTechnicalValidation(ctx) {
  const {
    rulesByCode,
    structureNodes = [],
    structureStatements = [],
    statementInstances = [],
    snapshotVersion = null,
    factSnapshot = null,
    workingPapers = [],
    evidence = [],
    evidenceRefs = [],
    crossReferences = [],
    attachmentPoints = [],
  } = ctx;

  const findings = [];

  // ── Snapshot Integrity ────────────────────────────────────────────────────
  const snapRule = rulesByCode["TECH.SNAPSHOT_INTEGRITY"];
  if (snapRule) {
    if (!snapshotVersion) {
      findings.push(issue({
        rule: snapRule,
        severity: "blocking",
        issue_code: "SNAP.MISSING",
        title: "No Reporting Snapshot Version",
        message: "Validation requires a Reporting Snapshot Version. Live GL is forbidden.",
        recommendation: snapRule.recommendation_template,
      }));
    } else {
      if (!["certified", "frozen", "publication_bound"].includes(snapshotVersion.status)) {
        findings.push(issue({
          rule: snapRule,
          severity: "blocking",
          issue_code: "SNAP.NOT_CERTIFIED",
          title: "Snapshot Version not certified",
          message: `Snapshot Version status is '${snapshotVersion.status}'. Certify before review readiness.`,
          payload: { snapshot_version_id: snapshotVersion.id, status: snapshotVersion.status },
        }));
      }
      if (!snapshotVersion.content_hash) {
        findings.push(issue({
          rule: snapRule,
          severity: "blocking",
          issue_code: "SNAP.NO_HASH",
          title: "Snapshot Version missing content hash",
          message: "Integrity hash absent on Reporting Snapshot Version.",
          payload: { snapshot_version_id: snapshotVersion.id },
        }));
      }
      if (!factSnapshot?.id) {
        findings.push(issue({
          rule: snapRule,
          severity: "blocking",
          issue_code: "SNAP.NO_FACT_SEAL",
          title: "Fact Snapshot seal missing",
          message: "No sealed Fact Snapshot linked for validation. Validation reads sealed facts only.",
          payload: { snapshot_version_id: snapshotVersion.id },
        }));
      }
    }
  }

  // ── Structural Validation ─────────────────────────────────────────────────
  const structRule = rulesByCode["TECH.STRUCTURAL"];
  if (structRule) {
    if (!structureNodes.length) {
      findings.push(issue({
        rule: structRule,
        severity: "blocking",
        issue_code: "STRUCT.NO_NODES",
        title: "Statement Structure empty",
        message: "Certified Statement Structure nodes are required for validation.",
      }));
    }
    const expectedTypes = ["financial_position", "financial_performance", "cash_flows", "changes_in_equity"];
    const present = new Set(statementInstances.map((s) => s.statement_type));
    for (const t of expectedTypes) {
      if (!present.has(t)) {
        findings.push(issue({
          rule: structRule,
          severity: "blocking",
          issue_code: `STRUCT.MISSING_${t.toUpperCase()}`,
          title: `Missing primary statement: ${t}`,
          message: `No Statement Instance of type '${t}' found for the snapshot under validation.`,
          payload: { statement_type: t, structure_statements: structureStatements.length },
        }));
      }
    }
  }

  // ── Statement Consistency (read-only articulation) ────────────────────────
  const consRule = rulesByCode["TECH.STATEMENT_CONSISTENCY"];
  if (consRule) {
    const sfp = statementInstances.find((s) => s.statement_type === "financial_position");
    if (sfp) {
      const assets = lineAmount(sfp.lines, "sfp.total_assets");
      const le = lineAmount(sfp.lines, "sfp.total_liabilities_and_equity");
      if (assets != null && le != null && Math.abs(assets - le) > 0.01) {
        findings.push(issue({
          rule: consRule,
          severity: "blocking",
          issue_code: "CONS.SFP_IMBALANCE",
          title: "Statement of Financial Position does not articulate",
          message: `Total Assets (${assets}) ≠ Total Liabilities and Equity (${le}). Validation does not correct amounts.`,
          statement_instance_id: sfp.id,
          payload: { assets, liabilities_and_equity: le, delta: Math.round((assets - le) * 100) / 100 },
        }));
      }
      const node = structureNodes.find((n) => n.node_code === "NODE.LI.SFP.TOTAL_ASSETS");
      if (assets != null && le != null && Math.abs(assets - le) > 0.01 && node) {
        findings[findings.length - 1].structure_node_id = node.id;
      }
    }
    const perf = statementInstances.find((s) => s.statement_type === "financial_performance");
    const eq = statementInstances.find((s) => s.statement_type === "changes_in_equity");
    if (perf && eq) {
      const perfResult = lineAmount(perf.lines, "perf.result");
      const eqResult = lineAmount(eq.lines, "eq.period_result");
      if (perfResult != null && eqResult != null && Math.abs(perfResult - eqResult) > 0.01) {
        findings.push(issue({
          rule: consRule,
          severity: "significant",
          issue_code: "CONS.RESULT_MISMATCH",
          title: "Period result inconsistent across statements",
          message: `Performance result (${perfResult}) ≠ Equity period result (${eqResult}).`,
          statement_instance_id: perf.id,
          payload: { performance_result: perfResult, equity_period_result: eqResult },
        }));
      }
    }
  }

  // ── Cross Reference Validation ────────────────────────────────────────────
  const xrefRule = rulesByCode["TECH.CROSS_REF"];
  if (xrefRule) {
    const discIds = new Set((ctx.disclosureInstances || []).map((d) => d.id));
    const wpIds = new Set(workingPapers.map((w) => w.id));
    const nodeIds = new Set(structureNodes.map((n) => n.id));
    for (const xr of crossReferences) {
      if (xr.status && xr.status !== "active") continue;
      const targetOk =
        (xr.target_kind === "structure_node" && nodeIds.has(xr.target_id)) ||
        (xr.target_kind === "working_paper" && wpIds.has(xr.target_id)) ||
        (xr.target_kind === "disclosure_instance" && discIds.has(xr.target_id)) ||
        !["structure_node", "working_paper", "disclosure_instance"].includes(xr.target_kind);
      if (!targetOk) {
        findings.push(issue({
          rule: xrefRule,
          severity: "significant",
          issue_code: "XREF.DANGLING_TARGET",
          title: "Dangling cross-reference target",
          message: `Cross-reference ${xr.id} target ${xr.target_kind}/${xr.target_id} is missing.`,
          disclosure_instance_id: xr.source_kind === "disclosure_instance" ? xr.source_id : null,
          working_paper_id: xr.source_kind === "working_paper" ? xr.source_id : null,
          structure_node_id: xr.target_kind === "structure_node" ? xr.target_id : null,
          payload: { cross_reference_id: xr.id },
        }));
      }
    }
  }

  // ── Working Paper Completeness ────────────────────────────────────────────
  const wpRule = rulesByCode["TECH.WP_COMPLETENESS"];
  if (wpRule) {
    if (workingPapers.length === 0) {
      findings.push(issue({
        rule: wpRule,
        severity: "advisory",
        issue_code: "WP.NONE",
        title: "No Working Papers present",
        message: "Close evidence has no Working Papers. Significant line items may lack WP support.",
      }));
    }
    for (const wp of workingPapers) {
      if (["draft", "submitted"].includes(wp.status)) {
        findings.push(issue({
          rule: wpRule,
          severity: "significant",
          issue_code: "WP.NOT_FINALIZED",
          title: "Working Paper not finalized",
          message: `Working Paper '${wp.title}' remains in status '${wp.status}'.`,
          working_paper_id: wp.id,
          structure_node_id: wp.structure_node_id ?? null,
          payload: { status: wp.status },
        }));
      }
    }
  }

  // ── Missing Attachments ───────────────────────────────────────────────────
  const attRule = rulesByCode["TECH.MISSING_ATTACHMENTS"];
  if (attRule) {
    const lineItems = structureNodes.filter((n) => n.node_kind === "line_item");
    const openByNodeKind = new Map();
    for (const ap of attachmentPoints) {
      if (ap.status !== "open" || ap.reserved_artefact_ref) continue;
      if (!ap.structure_node_id) continue;
      const key = `${ap.structure_node_id}:${ap.kind_code}`;
      openByNodeKind.set(key, true);
    }
    // Spot-check a sample of line items for critical kinds
    const sample = lineItems.slice(0, 12);
    for (const n of sample) {
      for (const kind of ["working_paper", "note_placeholder", "validation_result"]) {
        if (!openByNodeKind.has(`${n.id}:${kind}`)) {
          // Bound artefacts still OK if any attachment point of that kind exists historically
          const any = attachmentPoints.some(
            (ap) => ap.structure_node_id === n.id && ap.kind_code === kind,
          );
          if (!any) {
            findings.push(issue({
              rule: attRule,
              severity: "advisory",
              issue_code: `ATT.MISSING_${kind.toUpperCase()}`,
              title: `Missing ${kind} attachment point`,
              message: `Structure node ${n.node_code} has no ${kind} attachment point.`,
              structure_node_id: n.id,
              payload: { kind_code: kind, node_code: n.node_code },
            }));
          }
        }
      }
    }
  }

  // ── Missing Evidence ──────────────────────────────────────────────────────
  const evRule = rulesByCode["TECH.MISSING_EVIDENCE"];
  if (evRule) {
    const refsByWp = new Set(
      (evidenceRefs || []).filter((r) => r.working_paper_id).map((r) => r.working_paper_id),
    );
    for (const wp of workingPapers.filter((w) => w.status === "finalized")) {
      if (!refsByWp.has(wp.id)) {
        findings.push(issue({
          rule: evRule,
          severity: "significant",
          issue_code: "EV.WP_NO_EVIDENCE",
          title: "Finalized Working Paper lacks evidence reference",
          message: `Finalized WP '${wp.title}' has no Supporting Evidence reference.`,
          working_paper_id: wp.id,
          structure_node_id: wp.structure_node_id ?? null,
        }));
      }
    }
    if (evidence.length === 0 && workingPapers.some((w) => w.status === "finalized")) {
      findings.push(issue({
        rule: evRule,
        severity: "advisory",
        issue_code: "EV.NONE",
        title: "No Supporting Evidence artefacts",
        message: "Workspace has finalized Working Papers but no Supporting Evidence rows.",
      }));
    }
  }

  return findings;
}

/**
 * PART B — Framework Validation Engine.
 * Framework packs define validation rules only (via mappings).
 */
export function runFrameworkValidation(ctx) {
  const {
    rulesByCode,
    frameworkKey,
    frameworkMappings = [],
    disclosureInstances = [],
    policySets = [],
    statementInstances = [],
  } = ctx;

  const findings = [];
  const enabledCodes = new Set(
    frameworkMappings.filter((m) => m.enabled !== false).map((m) => m.rule_code || m.efs_validation_rules?.rule_code),
  );

  const severityFor = (ruleCode, fallback) => {
    const map = frameworkMappings.find(
      (m) => (m.rule_code || m.efs_validation_rules?.rule_code) === ruleCode,
    );
    return map?.severity_override || fallback;
  };

  const activeDisclosures = disclosureInstances.filter((d) => d.status !== "superseded");
  const byCode = new Map(activeDisclosures.map((d) => [d.disclosure_code, d]));

  // Required disclosures from mapping requirement_level
  if (enabledCodes.has("FW.REQUIRED_DISCLOSURES") || rulesByCode["FW.REQUIRED_DISCLOSURES"]) {
    const rule = rulesByCode["FW.REQUIRED_DISCLOSURES"];
    const requiredMaps = ctx.disclosureMappings || [];
    for (const dm of requiredMaps.filter((m) => m.requirement_level === "required")) {
      if (!byCode.has(dm.disclosure_code)) {
        findings.push(issue({
          rule,
          severity: severityFor("FW.REQUIRED_DISCLOSURES", "blocking"),
          issue_code: `FW.DISC.MISSING.${dm.disclosure_code}`,
          title: `Required disclosure missing: ${dm.disclosure_code}`,
          message: `Framework pack requires disclosure '${dm.disclosure_code}' which is not assembled.`,
          recommendation: rule?.recommendation_template,
          payload: { disclosure_code: dm.disclosure_code, framework_key: frameworkKey },
        }));
      }
    }
  }

  if (enabledCodes.has("FW.ACCOUNTING_POLICIES") || rulesByCode["FW.ACCOUNTING_POLICIES"]) {
    const rule = rulesByCode["FW.ACCOUNTING_POLICIES"];
    const activePolicy = policySets.find((p) => ["draft", "active"].includes(p.status));
    if (!activePolicy) {
      findings.push(issue({
        rule,
        severity: severityFor("FW.ACCOUNTING_POLICIES", "blocking"),
        issue_code: "FW.POLICY.MISSING",
        title: "Accounting Policy Set missing",
        message: "No draft/active Accounting Policy Set for this workspace under the bound framework.",
      }));
    }
  }

  if (enabledCodes.has("FW.DISCLOSURE_COMPLETE") || rulesByCode["FW.DISCLOSURE_COMPLETE"]) {
    const rule = rulesByCode["FW.DISCLOSURE_COMPLETE"];
    for (const d of activeDisclosures.filter((x) => x.requirement_level === "required" && x.status === "draft")) {
      findings.push(issue({
        rule,
        severity: severityFor("FW.DISCLOSURE_COMPLETE", "significant"),
        issue_code: `FW.DISC.DRAFT.${d.disclosure_code}`,
        title: `Required disclosure still draft: ${d.disclosure_code}`,
        message: `Disclosure '${d.title}' is required but remains in draft.`,
        disclosure_instance_id: d.id,
        structure_node_id: d.structure_node_id ?? null,
      }));
    }
  }

  // Framework-specific presentation rules
  const specific = {
    IFRS: {
      code: "FW.IFRS.BASIS",
      check: () => byCode.has("DISC.BASIS") || byCode.has("NOTE.BASIS"),
      msg: "IFRS requires a basis-of-preparation disclosure instance.",
    },
    IFRS_SME: {
      code: "FW.IFRS_SME.SIMPLIFIED",
      check: () =>
        (byCode.has("DISC.POLICIES") || byCode.has("NOTE.POLICIES") || policySets.length > 0) &&
        (byCode.has("DISC.RELATED") || byCode.has("NOTE.RELATED")),
      msg: "IFRS for SMEs expects policy and related-party disclosure coverage.",
    },
    GRAP: {
      code: "FW.GRAP.PUBLIC",
      check: () =>
        byCode.has("DISC.POLICIES") ||
        byCode.has("NOTE.POLICIES") ||
        policySets.length > 0,
      msg: "GRAP expects accounting policy disclosures for public-sector presentation.",
    },
    MCS: {
      code: "FW.MCS.CASH",
      check: () => statementInstances.some((s) => s.statement_type === "cash_flows"),
      msg: "Modified Cash Standard expects a cash flows statement instance to be present.",
    },
    IPSAS: {
      code: "FW.IPSAS.PUBLIC",
      check: () =>
        byCode.has("DISC.POLICIES") ||
        byCode.has("NOTE.POLICIES") ||
        policySets.length > 0,
      msg: "IPSAS expects accounting policy disclosures.",
    },
  };

  const spec = specific[frameworkKey];
  if (spec && (enabledCodes.has(spec.code) || rulesByCode[spec.code])) {
    const rule = rulesByCode[spec.code];
    if (rule && !spec.check()) {
      findings.push(issue({
        rule,
        severity: severityFor(spec.code, rule.default_severity || "significant"),
        issue_code: `${spec.code}.FAIL`,
        title: rule.name,
        message: spec.msg,
        recommendation: rule.recommendation_template,
        payload: { framework_key: frameworkKey },
      }));
    }
  }

  return findings;
}

export function summarizeFindings(findings) {
  const blocking = findings.filter((f) => f.severity === "blocking").length;
  const significant = findings.filter((f) => f.severity === "significant").length;
  const advisory = findings.filter((f) => f.severity === "advisory").length;
  const ready_for_review = blocking === 0;
  let status = "passed";
  if (blocking > 0) status = "failed";
  else if (significant > 0 || advisory > 0) status = "passed_with_advisories";
  return {
    blocking_count: blocking,
    significant_count: significant,
    advisory_count: advisory,
    total_issues: findings.length,
    ready_for_review,
    status,
    // Explicit non-approval
    approves_statements: false,
    mutates_financial_data: false,
    live_gl_read: false,
  };
}

export async function loadValidationContext(admin, { company_id, workspace_id, snapshot_version_id, framework_pack_id }) {
  const [
    rulesRes,
    nodesRes,
    statementsStructRes,
    stmtInstRes,
    snapRes,
    wpRes,
    evRes,
    xrefRes,
    apRes,
    discRes,
    policyRes,
    discMapRes,
    fwMapRes,
    packRes,
  ] = await Promise.all([
    admin.from("efs_validation_rules").select("*").eq("status", "active"),
    admin.from("efs_structure_nodes").select("id, node_code, node_kind, path, status"),
    admin.from("efs_structure_statements").select("id, statement_code, statement_type, name"),
    admin
      .from("efs_statement_instances")
      .select("id, statement_type, title, lines, snapshot_version_id, content_hash, fact_snapshot_id")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id),
    snapshot_version_id
      ? admin
          .from("efs_snapshot_versions")
          .select("*, efs_fact_snapshots(id, content_hash, sealed_at)")
          .eq("id", snapshot_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("efs_working_papers")
      .select("id, title, status, structure_node_id")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id),
    admin
      .from("efs_supporting_evidence")
      .select("id, title, structure_node_id")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id),
    admin
      .from("efs_cross_references")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id)
      .eq("status", "active"),
    admin.from("efs_attachment_points").select("id, kind_code, status, structure_node_id, disclosure_node_id, reserved_artefact_ref"),
    admin
      .from("efs_disclosure_instances")
      .select("id, disclosure_code, title, status, requirement_level, structure_node_id")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id),
    admin
      .from("efs_accounting_policy_sets")
      .select("id, title, status, framework_pack_id")
      .eq("workspace_id", workspace_id)
      .eq("company_id", company_id),
    framework_pack_id
      ? admin
          .from("efs_framework_disclosure_mappings")
          .select("disclosure_code, requirement_level, template_id")
          .eq("framework_pack_id", framework_pack_id)
      : Promise.resolve({ data: [] }),
    framework_pack_id
      ? admin
          .from("efs_framework_validation_mappings")
          .select("*, efs_validation_rules(rule_code, name, default_severity, engine_scope, category)")
          .eq("framework_pack_id", framework_pack_id)
          .eq("enabled", true)
      : Promise.resolve({ data: [] }),
    framework_pack_id
      ? admin.from("efs_framework_packs").select("id, framework_key, version_id, label").eq("id", framework_pack_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { data: evidenceRefs } = await admin
    .from("efs_evidence_references")
    .select("id, evidence_id, working_paper_id, lead_schedule_id")
    .eq("company_id", company_id);

  const snapshotVersion = snapRes.data || null;
  const factSnapshot = snapshotVersion?.efs_fact_snapshots || null;

  let statementInstances = stmtInstRes.data || [];
  if (snapshot_version_id) {
    statementInstances = statementInstances.filter((s) => s.snapshot_version_id === snapshot_version_id);
  } else {
    // latest per type
    const map = new Map();
    for (const s of statementInstances) {
      if (!map.has(s.statement_type)) map.set(s.statement_type, s);
    }
    statementInstances = [...map.values()];
  }

  const rules = rulesRes.data || [];
  const rulesByCode = Object.fromEntries(rules.map((r) => [r.rule_code, r]));

  const fwMaps = (fwMapRes.data || []).map((m) => ({
    ...m,
    rule_code: m.efs_validation_rules?.rule_code,
  }));

  return {
    rules,
    rulesByCode,
    structureNodes: nodesRes.data || [],
    structureStatements: statementsStructRes.data || [],
    statementInstances,
    snapshotVersion,
    factSnapshot: Array.isArray(factSnapshot) ? factSnapshot[0] : factSnapshot,
    workingPapers: wpRes.data || [],
    evidence: evRes.data || [],
    evidenceRefs: evidenceRefs || [],
    crossReferences: xrefRes.data || [],
    attachmentPoints: apRes.data || [],
    disclosureInstances: discRes.data || [],
    policySets: policyRes.data || [],
    disclosureMappings: discMapRes.data || [],
    frameworkMappings: fwMaps,
    frameworkPack: packRes.data || null,
    frameworkKey: packRes.data?.framework_key || null,
  };
}
