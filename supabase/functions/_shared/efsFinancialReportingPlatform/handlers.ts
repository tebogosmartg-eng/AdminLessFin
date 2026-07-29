/**
 * EFS FRP V7.0.0 — Edge handlers for Canonical Trial Balance / Import / Mapping
 * Invoked from financial-statements switch; additive only.
 */
// @ts-nocheck
import {
  FRP_SCHEMA_VERSION,
  frpEnabled,
  sha256Hex,
  parseCsvTrialBalance,
  normalizeImportedRows,
  matchMappingRule,
  normalizeAccountType,
  applySignRule,
  inferBalanceFromRow,
  inferCanonicalClosingBalance,
  buildNativeCanonicalLines,
  buildImportedCanonicalLines,
  validateCanonicalLines,
  projectCanonicalTbToFactDataset,
  DEFAULT_TYPE_TAXONOMY,
  buildDocumentComposerProvenance,
  assertUniqueAccountCodes,
} from "./index.ts";

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

async function persistCanonicalTb(admin, {
  company_id,
  workspace_id,
  reporting_period_id,
  snapshot_version_id,
  source_id,
  source_kind,
  period_start,
  period_end,
  prior_as_of,
  lines,
  provenance,
  sealed_by,
  seal = true,
}) {
  const validation = validateCanonicalLines(lines);
  if (!validation.ok) {
    const msg = validation.issues.map((i) => i.message).join("; ");
    throw new Error(`Canonical Trial Balance validation failed: ${msg}`);
  }

  const hashPayload = {
    schema_version: FRP_SCHEMA_VERSION,
    source_kind,
    period_start,
    period_end,
    lines: lines.map((l) => ({
      line_key: l.line_key,
      account_type: l.account_type,
      closing_balance: l.closing_balance,
      opening_balance: l.opening_balance,
      period_activity: l.period_activity,
      taxonomy_line_code: l.taxonomy_line_code,
    })),
  };
  const content_hash = await sha256Hex(hashPayload);

  const { data: ctb, error: ctbErr } = await admin
    .from("efs_canonical_trial_balances")
    .insert({
      company_id,
      workspace_id,
      reporting_period_id,
      snapshot_version_id: snapshot_version_id || null,
      source_id,
      source_kind,
      schema_version: FRP_SCHEMA_VERSION,
      period_start,
      period_end,
      prior_as_of: prior_as_of || null,
      content_hash: seal ? content_hash : null,
      status: seal ? "sealed" : "draft",
      line_count: lines.length,
      validation_summary: validation,
      provenance: { ...provenance, schema_version: FRP_SCHEMA_VERSION },
      sealed_by: seal ? sealed_by : null,
      sealed_at: seal ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (ctbErr) throw ctbErr;

  const lineRows = lines.map((l) => ({
    company_id,
    canonical_tb_id: ctb.id,
    line_key: l.line_key,
    account_code: l.account_code || null,
    account_name: l.account_name,
    account_type: l.account_type,
    taxonomy_line_code: l.taxonomy_line_code || null,
    opening_balance: round2(l.opening_balance),
    closing_balance: round2(l.closing_balance),
    period_activity: round2(l.period_activity),
    debit: round2(l.debit || 0),
    credit: round2(l.credit || 0),
    sign_rule_applied: l.sign_rule_applied || "as_is",
    source_ref: l.source_ref || {},
    sort_order: l.sort_order ?? 0,
  }));

  const { error: lineErr } = await admin.from("efs_canonical_tb_lines").insert(lineRows);
  if (lineErr) throw lineErr;

  await admin
    .from("efs_ctb_sources")
    .update({
      status: seal ? "sealed" : "mapped",
      snapshot_version_id: snapshot_version_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", source_id)
    .eq("company_id", company_id);

  return { ctb, validation, content_hash };
}

export async function handleFrpMethod({
  method,
  body,
  company_id,
  user,
  admin,
  writeAudit,
  writeActivity,
  throwDbError,
  logDbResult,
}) {
  if (!frpEnabled() && method.startsWith("FRP_")) {
    throw new Error("Financial Reporting Platform (Canonical TB) is disabled (EFS_FRP_CANONICAL_TB).");
  }

  switch (method) {
    case "FRP_CREATE_SOURCE": {
      if (!body.workspace_id || !body.reporting_period_id || !body.source_kind) {
        throw new Error("workspace_id, reporting_period_id and source_kind are required.");
      }
      const { data, error } = await admin
        .from("efs_ctb_sources")
        .insert({
          company_id,
          workspace_id: body.workspace_id,
          reporting_period_id: body.reporting_period_id,
          snapshot_version_id: body.snapshot_version_id || null,
          source_kind: body.source_kind,
          source_system: body.source_system || (body.source_kind === "native_gl" ? "adminless" : "csv"),
          label: body.label || (body.source_kind === "native_gl" ? "Native General Ledger" : "Imported Trial Balance"),
          status: "draft",
          metadata: body.metadata || {},
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return { source: data };
    }

    case "FRP_LIST_SOURCES": {
      let q = admin
        .from("efs_ctb_sources")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false });
      if (body.workspace_id) q = q.eq("workspace_id", body.workspace_id);
      const { data, error } = await q;
      if (error) throw error;
      return { sources: data || [] };
    }

    case "FRP_IMPORT_TRIAL_BALANCE": {
      if (!body.source_id) throw new Error("source_id is required.");
      const { data: source, error: sErr } = await admin
        .from("efs_ctb_sources")
        .select("*")
        .eq("id", body.source_id)
        .eq("company_id", company_id)
        .single();
      if (sErr || !source) throw new Error("CTB source not found.");
      if (source.source_kind !== "imported_tb") {
        throw new Error("FRP_IMPORT_TRIAL_BALANCE requires source_kind=imported_tb.");
      }

      let rows;
      const format = body.format || (body.csv_text ? "csv" : "json_rows");
      if (body.csv_text) {
        rows = parseCsvTrialBalance(body.csv_text);
      } else if (Array.isArray(body.rows)) {
        rows = normalizeImportedRows(body.rows);
      } else {
        throw new Error("Provide csv_text or rows[] for Trial Balance import.");
      }
      if (!rows.length) throw new Error("No Trial Balance lines parsed.");
      // Belt-and-suspenders: parse/normalize already assert uniqueness; re-check before insert.
      assertUniqueAccountCodes(rows);

      const { data: imp, error: iErr } = await admin
        .from("efs_tb_imports")
        .insert({
          company_id,
          source_id: source.id,
          file_name: body.file_name || null,
          format,
          period_start: body.period_start || null,
          period_end: body.period_end || null,
          raw_text: body.csv_text ? String(body.csv_text).slice(0, 500000) : null,
          parse_summary: { line_count: rows.length, format },
          status: "parsed",
          created_by: user.id,
        })
        .select()
        .single();
      if (iErr) throw iErr;

      const lineRows = rows.map((r) => ({
        company_id,
        import_id: imp.id,
        row_number: r.row_number || 0,
        source_account_code: r.source_account_code || null,
        source_account_name: r.source_account_name,
        source_account_type: r.source_account_type || null,
        debit: round2(r.debit || 0),
        credit: round2(r.credit || 0),
        balance: r.balance != null ? round2(r.balance) : null,
        period_activity: r.period_activity != null ? round2(r.period_activity) : null,
        opening_balance: r.opening_balance != null ? round2(r.opening_balance) : null,
        raw_row: r.raw_row || {},
        mapping_status: "unmapped",
      }));
      const { error: lErr } = await admin.from("efs_tb_import_lines").insert(lineRows);
      if (lErr) throw lErr;

      await admin
        .from("efs_ctb_sources")
        .update({ status: "imported", updated_at: new Date().toISOString() })
        .eq("id", source.id);

      await writeAudit(admin, {
        company_id,
        entity_type: "efs_tb_imports",
        entity_id: imp.id,
        action: "frp.tb_imported",
        actor_user_id: user.id,
        after_state: { line_count: rows.length, format, source_system: source.source_system },
      });

      return { import: imp, line_count: rows.length };
    }

    case "FRP_ENSURE_MAPPING_SET": {
      if (!body.framework_pack_id) throw new Error("framework_pack_id is required.");
      const source_system = body.source_system || "csv";
      const version_label = body.version_label || "v1";
      const { data: existing } = await admin
        .from("efs_frp_mapping_sets")
        .select("*")
        .eq("company_id", company_id)
        .eq("framework_pack_id", body.framework_pack_id)
        .eq("source_system", source_system)
        .eq("version_label", version_label)
        .maybeSingle();
      if (existing) return { mapping_set: existing };

      const { data, error } = await admin
        .from("efs_frp_mapping_sets")
        .insert({
          company_id,
          framework_pack_id: body.framework_pack_id,
          source_system,
          version_label,
          label: body.label || `${source_system} mapping ${version_label}`,
          status: "published",
        })
        .select()
        .single();
      if (error) throw error;
      return { mapping_set: data };
    }

    case "FRP_UPSERT_MAPPING_RULE": {
      if (!body.mapping_set_id || !body.match_kind || !body.match_value) {
        throw new Error("mapping_set_id, match_kind and match_value are required.");
      }
      const row = {
        company_id,
        mapping_set_id: body.mapping_set_id,
        match_kind: body.match_kind,
        match_value: body.match_value,
        taxonomy_line_code: body.taxonomy_line_code || null,
        canonical_account_type: body.canonical_account_type || null,
        sign_rule: body.sign_rule || "as_is",
        priority: body.priority ?? 100,
        active: body.active !== false,
      };
      if (body.id) {
        const { data, error } = await admin
          .from("efs_frp_mapping_rules")
          .update(row)
          .eq("id", body.id)
          .eq("company_id", company_id)
          .select()
          .single();
        if (error) throw error;
        return { rule: data };
      }
      const { data, error } = await admin.from("efs_frp_mapping_rules").insert(row).select().single();
      if (error) throw error;
      return { rule: data };
    }

    case "FRP_LIST_MAPPING_RULES": {
      if (!body.mapping_set_id) throw new Error("mapping_set_id is required.");
      const { data, error } = await admin
        .from("efs_frp_mapping_rules")
        .select("*")
        .eq("company_id", company_id)
        .eq("mapping_set_id", body.mapping_set_id)
        .order("priority", { ascending: true });
      if (error) throw error;
      return { rules: data || [] };
    }

    case "FRP_RUN_MAPPING_ENGINE": {
      if (!body.import_id) throw new Error("import_id is required.");
      const { data: imp, error: iErr } = await admin
        .from("efs_tb_imports")
        .select("*, efs_ctb_sources(*)")
        .eq("id", body.import_id)
        .eq("company_id", company_id)
        .single();
      if (iErr || !imp) throw new Error("Import not found.");

      let rules = [];
      if (body.mapping_set_id) {
        const { data: ruleRows } = await admin
          .from("efs_frp_mapping_rules")
          .select("*")
          .eq("mapping_set_id", body.mapping_set_id)
          .eq("company_id", company_id)
          .eq("active", true);
        rules = ruleRows || [];
      }

      // Seed type-level defaults when no explicit rules
      if (!rules.length) {
        rules = Object.entries(DEFAULT_TYPE_TAXONOMY).map(([account_type, taxonomy_line_code], i) => ({
          match_kind: "account_type",
          match_value: account_type,
          taxonomy_line_code,
          canonical_account_type: account_type,
          sign_rule: "as_is",
          priority: 500 + i,
          active: true,
        }));
      }

      const { data: lines, error: lErr } = await admin
        .from("efs_tb_import_lines")
        .select("*")
        .eq("import_id", body.import_id)
        .eq("company_id", company_id)
        .order("row_number", { ascending: true });
      if (lErr) throw lErr;

      let auto = 0;
      let queued = 0;
      for (const line of lines || []) {
        const rule = matchMappingRule(line, rules);
        if (rule) {
          const account_type =
            normalizeAccountType(rule.canonical_account_type) ||
            normalizeAccountType(line.source_account_type) ||
            normalizeAccountType(rule.match_kind === "account_type" ? rule.match_value : null);
          // Balance sign is finalized here once account type is known from mapping.
          const signed = applySignRule(
            inferCanonicalClosingBalance(line, account_type),
            rule.sign_rule || "as_is",
          );
          await admin
            .from("efs_tb_import_lines")
            .update({
              mapping_status: "auto_mapped",
              taxonomy_line_code: rule.taxonomy_line_code || (account_type ? DEFAULT_TYPE_TAXONOMY[account_type] : null),
              canonical_account_type: account_type,
              sign_rule_applied: signed.rule,
              balance: signed.amount,
            })
            .eq("id", line.id);
          auto++;
        } else {
          await admin
            .from("efs_tb_import_lines")
            .update({ mapping_status: "unmapped" })
            .eq("id", line.id);
          await admin.from("efs_frp_mapping_queue").upsert(
            {
              company_id,
              import_id: body.import_id,
              import_line_id: line.id,
              suggested_taxonomy_line_code: null,
              suggested_account_type: normalizeAccountType(line.source_account_type),
              status: "pending",
            },
            { onConflict: "import_line_id" },
          );
          queued++;
        }
      }

      await admin
        .from("efs_tb_imports")
        .update({
          status: queued > 0 ? "mapping" : "mapped",
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.import_id);

      if (queued === 0) {
        await admin
          .from("efs_ctb_sources")
          .update({ status: "mapped", updated_at: new Date().toISOString() })
          .eq("id", imp.source_id);
      }

      return {
        import_id: body.import_id,
        auto_mapped: auto,
        queued,
        status: queued > 0 ? "mapping" : "mapped",
      };
    }

    case "FRP_LIST_MAPPING_QUEUE": {
      if (!body.import_id) throw new Error("import_id is required.");
      const { data, error } = await admin
        .from("efs_frp_mapping_queue")
        .select("*, efs_tb_import_lines(*)")
        .eq("company_id", company_id)
        .eq("import_id", body.import_id)
        .eq("status", body.status || "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return { queue: data || [] };
    }

    case "FRP_RESOLVE_MAPPING_QUEUE_ITEM": {
      if (!body.queue_id) throw new Error("queue_id is required.");
      const { data: item, error: qErr } = await admin
        .from("efs_frp_mapping_queue")
        .select("*")
        .eq("id", body.queue_id)
        .eq("company_id", company_id)
        .single();
      if (qErr || !item) throw new Error("Mapping queue item not found.");

      if (body.action === "skip") {
        const { data, error } = await admin
          .from("efs_frp_mapping_queue")
          .update({
            status: "skipped",
            resolved_by: user.id,
            resolved_at: new Date().toISOString(),
            note: body.note || null,
          })
          .eq("id", item.id)
          .select()
          .single();
        if (error) throw error;
        await admin
          .from("efs_tb_import_lines")
          .update({ mapping_status: "excluded" })
          .eq("id", item.import_line_id);
        return { queue_item: data };
      }

      const account_type = normalizeAccountType(body.canonical_account_type);
      if (!account_type) throw new Error("canonical_account_type is required to resolve mapping.");
      const taxonomy =
        body.taxonomy_line_code || DEFAULT_TYPE_TAXONOMY[account_type];
      const sign_rule = body.sign_rule || "as_is";

      const { data: line } = await admin
        .from("efs_tb_import_lines")
        .select("*")
        .eq("id", item.import_line_id)
        .single();
      const signed = applySignRule(
        inferCanonicalClosingBalance(line || {}, account_type),
        sign_rule,
      );

      await admin
        .from("efs_tb_import_lines")
        .update({
          mapping_status: "manual_mapped",
          taxonomy_line_code: taxonomy,
          canonical_account_type: account_type,
          sign_rule_applied: signed.rule,
          balance: signed.amount,
        })
        .eq("id", item.import_line_id);

      const { data, error } = await admin
        .from("efs_frp_mapping_queue")
        .update({
          status: "resolved",
          resolved_taxonomy_line_code: taxonomy,
          resolved_account_type: account_type,
          resolved_sign_rule: sign_rule,
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          note: body.note || null,
        })
        .eq("id", item.id)
        .select()
        .single();
      if (error) throw error;

      // If queue empty → mark import mapped
      const { count } = await admin
        .from("efs_frp_mapping_queue")
        .select("id", { count: "exact", head: true })
        .eq("import_id", item.import_id)
        .eq("status", "pending");
      if ((count || 0) === 0) {
        const { data: imp } = await admin
          .from("efs_tb_imports")
          .update({ status: "mapped", updated_at: new Date().toISOString() })
          .eq("id", item.import_id)
          .select("source_id")
          .single();
        if (imp?.source_id) {
          await admin
            .from("efs_ctb_sources")
            .update({ status: "mapped", updated_at: new Date().toISOString() })
            .eq("id", imp.source_id);
        }
      }

      return { queue_item: data };
    }

    case "FRP_SEAL_CANONICAL_TB_FROM_IMPORT": {
      if (!body.import_id) throw new Error("import_id is required.");
      const { data: imp, error: iErr } = await admin
        .from("efs_tb_imports")
        .select("*, efs_ctb_sources(*)")
        .eq("id", body.import_id)
        .eq("company_id", company_id)
        .single();
      if (iErr || !imp) throw new Error("Import not found.");
      const source = imp.efs_ctb_sources;
      if (!source) throw new Error("CTB source missing on import.");

      const { count: pending } = await admin
        .from("efs_frp_mapping_queue")
        .select("id", { count: "exact", head: true })
        .eq("import_id", body.import_id)
        .eq("status", "pending");
      if ((pending || 0) > 0) {
        throw new Error(`Cannot seal Canonical TB: ${pending} mapping queue item(s) still pending.`);
      }

      const { data: mappedLines, error: mErr } = await admin
        .from("efs_tb_import_lines")
        .select("*")
        .eq("import_id", body.import_id)
        .neq("mapping_status", "excluded")
        .order("row_number", { ascending: true });
      if (mErr) throw mErr;

      const untyped = (mappedLines || []).filter(
        (l) => !normalizeAccountType(l.canonical_account_type) && !normalizeAccountType(l.source_account_type),
      );
      if (untyped.length) {
        throw new Error(`${untyped.length} import line(s) lack canonical account type.`);
      }

      const lines = buildImportedCanonicalLines(mappedLines || []);
      const period = await admin
        .from("efs_reporting_periods")
        .select("*")
        .eq("id", source.reporting_period_id)
        .single();
      const periodRow = period.data;
      if (!periodRow) throw new Error("Reporting period not found.");

      const period_start = imp.period_start || periodRow.start_date;
      const period_end = imp.period_end || periodRow.end_date;
      const priorDate = new Date(period_start);
      priorDate.setDate(priorDate.getDate() - 1);
      const prior_as_of = priorDate.toISOString().slice(0, 10);

      const { ctb, validation, content_hash } = await persistCanonicalTb(admin, {
        company_id,
        workspace_id: source.workspace_id,
        reporting_period_id: source.reporting_period_id,
        snapshot_version_id: body.snapshot_version_id || source.snapshot_version_id,
        source_id: source.id,
        source_kind: "imported_tb",
        period_start,
        period_end,
        prior_as_of,
        lines,
        provenance: {
          import_id: body.import_id,
          source_system: source.source_system,
          period_key: periodRow.period_key,
        },
        sealed_by: user.id,
        seal: true,
      });

      await admin
        .from("efs_tb_imports")
        .update({ status: "sealed", updated_at: new Date().toISOString() })
        .eq("id", body.import_id);

      await writeActivity(admin, {
        company_id,
        workspace_id: source.workspace_id,
        actor_user_id: user.id,
        event_type: "frp.canonical_tb_sealed",
        message: `Canonical Trial Balance sealed from import (${lines.length} lines)`,
        payload: { canonical_tb_id: ctb.id, content_hash, source_kind: "imported_tb" },
      });

      return { canonical_trial_balance: ctb, validation, line_count: lines.length };
    }

    case "FRP_GET_CANONICAL_TB": {
      if (!body.canonical_tb_id) throw new Error("canonical_tb_id is required.");
      const { data: ctb, error } = await admin
        .from("efs_canonical_trial_balances")
        .select("*")
        .eq("id", body.canonical_tb_id)
        .eq("company_id", company_id)
        .single();
      if (error || !ctb) throw new Error("Canonical Trial Balance not found.");
      const { data: lines } = await admin
        .from("efs_canonical_tb_lines")
        .select("*")
        .eq("canonical_tb_id", ctb.id)
        .order("sort_order", { ascending: true });
      return { canonical_trial_balance: ctb, lines: lines || [] };
    }

    case "FRP_LIST_CANONICAL_TB": {
      let q = admin
        .from("efs_canonical_trial_balances")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false });
      if (body.workspace_id) q = q.eq("workspace_id", body.workspace_id);
      if (body.snapshot_version_id) q = q.eq("snapshot_version_id", body.snapshot_version_id);
      const { data, error } = await q;
      if (error) throw error;
      return { canonical_trial_balances: data || [] };
    }

    case "FRP_PROJECT_TO_FACT_SNAPSHOT": {
      // Seal Fact Snapshot from an already-sealed Canonical TB (import path)
      if (!body.canonical_tb_id || !body.snapshot_version_id) {
        throw new Error("canonical_tb_id and snapshot_version_id are required.");
      }

      const { data: version, error: vErr } = await admin
        .from("efs_snapshot_versions")
        .select("*, efs_reporting_snapshots!efs_snapshot_versions_snapshot_id_fkey(*, efs_reporting_periods(*))")
        .eq("id", body.snapshot_version_id)
        .eq("company_id", company_id)
        .single();
      if (vErr || !version) throw new Error("Snapshot Version not found.");
      if (version.status !== "draft" && version.status !== "created") {
        throw new Error(`Cannot project into Snapshot Version in status ${version.status}`);
      }

      const { data: existingFact } = await admin
        .from("efs_fact_snapshots")
        .select("id")
        .eq("snapshot_version_id", version.id)
        .maybeSingle();
      if (existingFact) {
        throw new Error("Fact Snapshot already sealed for this version. Create a successor version.");
      }

      const { data: ctb, error: cErr } = await admin
        .from("efs_canonical_trial_balances")
        .select("*")
        .eq("id", body.canonical_tb_id)
        .eq("company_id", company_id)
        .single();
      if (cErr || !ctb) throw new Error("Canonical Trial Balance not found.");
      if (ctb.status !== "sealed") throw new Error("Canonical Trial Balance must be sealed before projection.");

      const { data: lines } = await admin
        .from("efs_canonical_tb_lines")
        .select("*")
        .eq("canonical_tb_id", ctb.id)
        .order("sort_order", { ascending: true });

      const dataset = projectCanonicalTbToFactDataset({
        company_id,
        canonical_tb: ctb,
        lines: lines || [],
        cash_flow: body.cash_flow || [],
        source_rpc_refs: [
          {
            origin: "canonical_trial_balance",
            canonical_tb_id: ctb.id,
            source_kind: ctb.source_kind,
          },
        ],
      });
      const content_hash = await sha256Hex(dataset);

      const { data: fact, error: fErr } = await admin
        .from("efs_fact_snapshots")
        .insert({
          company_id,
          snapshot_version_id: version.id,
          sealed_by: user.id,
          content_hash,
          period_start: ctb.period_start,
          period_end: ctb.period_end,
          prior_as_of: ctb.prior_as_of,
          source_rpc_refs: dataset.source_rpc_refs,
          dataset,
          canonical_tb_id: ctb.id,
        })
        .select()
        .single();
      if (fErr) throw fErr;

      await admin
        .from("efs_canonical_trial_balances")
        .update({
          snapshot_version_id: version.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ctb.id);

      await admin
        .from("efs_snapshot_versions")
        .update({
          content_hash,
          extract_summary: {
            account_count: (lines || []).length,
            period_start: ctb.period_start,
            period_end: ctb.period_end,
            content_hash,
            canonical_tb_id: ctb.id,
            source_kind: ctb.source_kind,
          },
          source_rpc_refs: dataset.source_rpc_refs,
          status: "draft",
        })
        .eq("id", version.id);

      const composer = buildDocumentComposerProvenance({
        canonical_tb_id: ctb.id,
        fact_snapshot_id: fact.id,
        snapshot_version_id: version.id,
        source_kind: ctb.source_kind,
      });

      return { fact_snapshot: fact, canonical_tb_id: ctb.id, document_composer: composer };
    }

    case "FRP_GET_DOCUMENT_COMPOSER_PROVENANCE": {
      return {
        document_composer: buildDocumentComposerProvenance({
          canonical_tb_id: body.canonical_tb_id || null,
          fact_snapshot_id: body.fact_snapshot_id || null,
          snapshot_version_id: body.snapshot_version_id || null,
          statement_instance_ids: body.statement_instance_ids || [],
          publication_pack_id: body.publication_pack_id || null,
          source_kind: body.source_kind || null,
        }),
      };
    }

    default:
      return null;
  }
}

/**
 * Build + seal Canonical TB from native GL extract rows, then return projection inputs.
 * Used by EXTRACT_FACT_SNAPSHOT when FRP is enabled.
 */
export async function sealNativeCanonicalTbAndProject({
  admin,
  company_id,
  user,
  workspace_id,
  reporting_period_id,
  snapshot_version_id,
  period_start,
  period_end,
  prior_as_of,
  period_key,
  closingBalances,
  openingBalances,
  periodActivity,
  cash_flow,
  source_rpc_refs,
  typeMap,
  writeActivity,
}) {
  // Ensure / reuse native source binding for this version
  let source;
  {
    const { data: existing } = await admin
      .from("efs_ctb_sources")
      .select("*")
      .eq("company_id", company_id)
      .eq("workspace_id", workspace_id)
      .eq("snapshot_version_id", snapshot_version_id)
      .eq("source_kind", "native_gl")
      .maybeSingle();
    if (existing) {
      source = existing;
    } else {
      const { data, error } = await admin
        .from("efs_ctb_sources")
        .insert({
          company_id,
          workspace_id,
          reporting_period_id,
          snapshot_version_id,
          source_kind: "native_gl",
          source_system: "adminless",
          label: "Native General Ledger",
          status: "draft",
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      source = data;
    }
  }

  const lines = buildNativeCanonicalLines({
    closingBalances,
    openingBalances,
    periodActivity,
    typeMap,
  });

  const { ctb, validation, content_hash } = await persistCanonicalTb(admin, {
    company_id,
    workspace_id,
    reporting_period_id,
    snapshot_version_id,
    source_id: source.id,
    source_kind: "native_gl",
    period_start,
    period_end,
    prior_as_of,
    lines,
    provenance: {
      period_key,
      extract_path: "EXTRACT_FACT_SNAPSHOT",
      source_system: "adminless",
    },
    sealed_by: user.id,
    seal: true,
  });

  const dataset = projectCanonicalTbToFactDataset({
    company_id,
    canonical_tb: ctb,
    lines,
    cash_flow,
    source_rpc_refs,
  });

  if (writeActivity) {
    await writeActivity(admin, {
      company_id,
      workspace_id,
      actor_user_id: user.id,
      event_type: "frp.canonical_tb_sealed",
      message: `Canonical Trial Balance sealed from native GL (${lines.length} lines)`,
      payload: { canonical_tb_id: ctb.id, content_hash, source_kind: "native_gl" },
    });
  }

  return { ctb, dataset, validation, content_hash: await sha256Hex(dataset) };
}

export { frpEnabled, persistCanonicalTb };
