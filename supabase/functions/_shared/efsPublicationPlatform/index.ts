/**
 * EFS V6.5.3 / V6.10.3 — Enterprise Publication Platform
 * Assembles immutable Publication Packs from approved engagements only.
 * Never reads live GL. Never recalculates balances.
 * Does NOT implement XBRL / AI.
 * V6.10.3: Professional IFRS-for-SMEs PDF presentation (layout only).
 */
// @ts-nocheck
import { buildPackFingerprint, sha256Hex } from "../efsReviewWorkflow/index.ts";
import { zipSync, strToU8 } from "https://esm.sh/fflate@0.8.2?target=deno";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import {
  formatAmount,
  generateProfessionalAfsPdf,
  humanFrameworkLabel,
  numberDisclosures,
  professionalStatementTitle,
  statementPeriodCaption,
} from "./afsProfessionalPdf.ts";
import { hydrateWorkspaceFromMasterData } from "../efsCorporateInformation/hydration.ts";

async function sha256Bytes(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function publicationEnabled() {
  const v = (Deno.env.get("EFS_PUBLICATION") ?? "true").toLowerCase();
  return v === "true" || v === "1";
}

export async function appendPublicationHistory(admin, row) {
  const { error } = await admin.from("efs_publication_history").insert(row);
  if (error) throw error;
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function canonicalJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Canonical tabular export — single source for PDF, Word, Excel amounts.
 */
export function extractCanonicalTables(pack) {
  const statements = pack.statements || [];
  const tables = [];

  for (const stmt of statements) {
    const rows = (stmt.lines || []).map((ln) => ({
      statement_type: stmt.statement_type,
      line_code: ln.line_code,
      label: ln.label,
      section: ln.section || "",
      amount: round2(ln.amount),
      is_total: !!ln.is_total,
    }));
    tables.push({
      statement_type: stmt.statement_type,
      title: stmt.title || stmt.statement_type,
      rows,
    });
  }

  const disclosures = (pack.disclosures || [])
    .filter((d) => d.status !== "superseded")
    .map((d) => ({
      disclosure_code: d.disclosure_code,
      title: d.title,
      status: d.status,
    }));

  const working_papers = (pack.working_papers || []).map((w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    reference_code: w.reference_code || null,
  }));

  return { tables, disclosures, working_papers };
}

export function buildCanonicalAmountHash(pack) {
  const { tables } = extractCanonicalTables(pack);
  const amounts = tables.flatMap((t) =>
    t.rows.map((r) => `${r.statement_type}|${r.line_code}|${r.amount}`),
  );
  return amounts.sort().join("\n");
}

export async function buildPublicationFingerprint(pack) {
  const canonical = {
    pack_fingerprint: pack.provenance?.pack_fingerprint || null,
    snapshot_version_id: pack.provenance?.snapshot_version_id || null,
    validation_run_id: pack.provenance?.validation_run_id || null,
    statements: (pack.statements || []).map((s) => ({
      t: s.statement_type,
      h: s.content_hash,
      lines: (s.lines || []).map((l) => ({ c: l.line_code, a: round2(l.amount) })),
    })),
    disclosures: (pack.disclosures || []).map((d) => ({
      c: d.disclosure_code,
      h: d.content_hash || null,
    })),
    working_papers: (pack.working_papers || []).map((w) => ({
      id: w.id,
      s: w.status,
      h: w.content_hash || null,
    })),
    signoffs: (pack.signoffs || []).map((s) => ({
      role: s.signer_role,
      hash: s.signature_hash,
    })),
    mutates_accounting: false,
  };
  return sha256Hex(canonical);
}

export async function assemblePublicationPack(admin, { company_id, workspace_id, pack_review }) {
  const workspaceId = workspace_id;
  const snapshotVersionId = pack_review.snapshot_version_id;
  const validationRunId = pack_review.validation_run_id;

  if (!snapshotVersionId) throw new Error("Pack review missing snapshot_version_id.");

  const [
    { data: workspace },
    { data: snapshotVersion },
    { data: statements },
    { data: disclosures },
    { data: workingPapers },
    { data: signoffs },
    { data: validationRun },
    { data: factSnapshot },
    { data: engagementInfo },
    { data: company },
    { data: masterData },
  ] = await Promise.all([
    admin
      .from("efs_reporting_workspaces")
      .select("*, efs_reporting_periods(*), efs_framework_bindings(*, efs_framework_packs(*, efs_frameworks(*)))")
      .eq("id", workspaceId)
      .eq("company_id", company_id)
      .single(),
    admin
      .from("efs_snapshot_versions")
      .select("*")
      .eq("id", snapshotVersionId)
      .eq("company_id", company_id)
      .single(),
    admin
      .from("efs_statement_instances")
      .select("id, statement_type, title, lines, content_hash, fact_snapshot_id, generated_at")
      .eq("workspace_id", workspaceId)
      .eq("company_id", company_id)
      .eq("snapshot_version_id", snapshotVersionId),
    admin
      .from("efs_disclosure_instances")
      .select("id, disclosure_code, title, status, content_hash, structure_node_id")
      .eq("workspace_id", workspaceId)
      .eq("company_id", company_id)
      .neq("status", "superseded"),
    admin
      .from("efs_working_papers")
      .select("id, title, status, content_hash, reference_code, structure_node_id")
      .eq("workspace_id", workspaceId)
      .eq("company_id", company_id),
    admin
      .from("efs_pack_review_signoffs")
      .select("id, signer_role, signature_hash, signed_at, stage")
      .eq("pack_review_id", pack_review.id)
      .eq("company_id", company_id),
    validationRunId
      ? admin.from("efs_validation_runs").select("*").eq("id", validationRunId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("efs_fact_snapshots")
      .select("id, content_hash, sealed_at, period_start, period_end, source_rpc_refs, canonical_tb_id, dataset")
      .eq("snapshot_version_id", snapshotVersionId)
      .maybeSingle(),
    admin
      .from("efs_engagement_general_information")
      .select("registered_name, trading_name, reporting_framework, reporting_currency")
      .eq("workspace_id", workspaceId)
      .eq("company_id", company_id)
      .maybeSingle(),
    admin.from("companies").select("id, name").eq("id", company_id).maybeSingle(),
    admin
      .from("efs_company_master_data")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle(),
  ]);

  if (!workspace) throw new Error("Workspace not found.");
  if (!snapshotVersion) throw new Error("Snapshot version not found.");
  if (!factSnapshot) throw new Error("Sealed fact snapshot required — live GL is forbidden.");

  const expectedTypes = ["financial_position", "financial_performance", "cash_flows", "changes_in_equity"];
  const present = new Set((statements || []).map((s) => s.statement_type));
  for (const t of expectedTypes) {
    if (!present.has(t)) throw new Error(`Missing approved statement instance: ${t}`);
  }

  if (!validationRun?.ready_for_review || Number(validationRun?.blocking_count || 0) > 0) {
    throw new Error("Validation must be PASS (ready_for_review, no blocking issues).");
  }

  const { fingerprint: packFingerprint } = await buildPackFingerprint(admin, {
    company_id,
    workspace_id: workspaceId,
    validation_run_id: validationRunId,
    snapshot_version_id: snapshotVersionId,
  });

  if (pack_review.pack_fingerprint && pack_review.pack_fingerprint !== packFingerprint) {
    throw new Error("Pack fingerprint mismatch — engagement content changed since review sign-off.");
  }

  const period = workspace.efs_reporting_periods;
  const framework = workspace.efs_framework_bindings?.efs_framework_packs;
  const hydratedEngagement = hydrateWorkspaceFromMasterData(
    engagementInfo,
    masterData || null,
  );
  const companyName =
    hydratedEngagement?.registered_name ||
    hydratedEngagement?.trading_name ||
    company?.name ||
    workspace.name;

  const pack = {
    schema_version: "6.5.3",
    engagement: {
      workspace_id: workspaceId,
      workspace_name: workspace.name,
      company_id,
      company_name: companyName,
      reporting_period: period
        ? {
            period_key: period.period_key,
            label: period.label,
            start_date: period.start_date,
            end_date: period.end_date,
          }
        : null,
      framework: framework
        ? {
            framework_key: framework.framework_key,
            version_id: framework.version_id,
            label: framework.label,
            name: framework.efs_frameworks?.name || null,
          }
        : null,
    },
    provenance: {
      pack_review_id: pack_review.id,
      pack_fingerprint: packFingerprint,
      snapshot_version_id: snapshotVersionId,
      snapshot_content_hash: snapshotVersion.content_hash,
      fact_snapshot_id: factSnapshot.id,
      fact_snapshot_hash: factSnapshot.content_hash,
      validation_run_id: validationRunId,
      validation_status: validationRun?.status || null,
      live_gl: false,
      mutates_accounting: false,
      // FRP V7.0.0 — Document Composer audit envelope (additive)
      document_composer: {
        schema_version: "7.0.0",
        composer: "efs_document_composer",
        canonical_tb_id: factSnapshot.canonical_tb_id || factSnapshot.dataset?.canonical_trial_balance?.id || null,
        source_kind:
          factSnapshot.dataset?.canonical_trial_balance?.source_kind ||
          (factSnapshot.canonical_tb_id ? "canonical_tb" : "legacy_direct"),
        trace: [
          "journal_or_import",
          "ledger_or_mapping",
          "trial_balance",
          "canonical_trial_balance",
          "financial_reporting_engine",
          "statement_line",
          "document_composer",
          "export",
        ],
      },
    },
    statements: statements || [],
    disclosures: disclosures || [],
    working_papers: workingPapers || [],
    signoffs: signoffs || [],
    validation: validationRun
      ? {
          id: validationRun.id,
          status: validationRun.status,
          ready_for_review: validationRun.ready_for_review,
          blocking_count: validationRun.blocking_count,
        }
      : null,
  };

  const publicationFingerprint = await buildPublicationFingerprint(pack);
  const contentHash = await sha256Hex(pack);
  const publicationSealHash = await sha256Hex({
    publication_fingerprint: publicationFingerprint,
    content_hash: contentHash,
    pack_fingerprint: packFingerprint,
    sealed_at: new Date().toISOString(),
  });

  return {
    pack,
    packFingerprint,
    publicationFingerprint,
    contentHash,
    publicationSealHash,
    metadata: {
      title: `Annual Financial Statements — ${companyName}`,
      company_name: companyName,
      framework_key: framework?.framework_key || null,
      framework_label:
        framework?.efs_frameworks?.name ||
        (framework?.framework_key === "IFRS_SME" ? "IFRS for SMEs" : framework?.label) ||
        null,
      period_key: period?.period_key || null,
      period_label: period?.label || null,
      period_start: period?.start_date || null,
      period_end: period?.end_date || null,
      reporting_currency: engagementInfo?.reporting_currency || "ZAR",
      generated_by_platform: "AdminLess Fin EFS Publication Platform V6.10.3",
      formats: ["pdf", "docx", "xlsx"],
    },
  };
}

function escapeXml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Professional Annual Financial Statements PDF — IFRS for SMEs presentation.
 * Deterministic from sealed canonical tables; no live GL; no debug identifiers.
 */
export function generatePdfArtifact(pack) {
  return generateProfessionalAfsPdf(pack, extractCanonicalTables);
}

/**
 * DOCX from canonical tables — professional captions; no debug identifiers.
 */
export function generateDocxArtifact(pack) {
  const meta = pack.metadata || {};
  const { tables, disclosures } = extractCanonicalTables(pack);
  const period = pack.engagement?.reporting_period || {};
  const paragraphs = [];

  const addPara = (text, bold = false) => {
    const rPr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
    paragraphs.push(
      `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`,
    );
  };

  addPara(meta.company_name || pack.engagement?.company_name || "Reporting Entity", true);
  addPara(meta.title || "Annual Financial Statements", true);
  addPara(humanFrameworkLabel(pack, meta));
  addPara(period.label || meta.period_label || "—");
  addPara("");

  for (const table of tables) {
    addPara(professionalStatementTitle(table.statement_type, table.title), true);
    addPara(statementPeriodCaption(table.statement_type, period));
    for (const row of table.rows) {
      addPara(`${row.label}: ${formatAmount(row.amount)}`);
    }
    addPara("");
  }

  const notes = numberDisclosures(disclosures);
  if (notes.length) {
    addPara("Notes to the Annual Financial Statements", true);
    for (const n of notes) addPara(n.heading);
  }

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${paragraphs.join("")}</w:body></w:document>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`;

  const zipped = zipSync({
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rels),
    "word/document.xml": strToU8(documentXml),
  });

  return new Uint8Array(zipped);
}

/**
 * XLSX workbook from canonical tables — same amounts as PDF/Word.
 */
export function generateXlsxArtifact(pack) {
  const { tables, disclosures } = extractCanonicalTables(pack);
  const wb = XLSX.utils.book_new();

  const cover = [
    ["Annual Financial Statements"],
    ["Entity", pack.metadata?.company_name || pack.engagement?.company_name || ""],
    ["Reporting framework", humanFrameworkLabel(pack, pack.metadata || {})],
    ["Period", pack.engagement?.reporting_period?.label || ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cover), "Cover");

  for (const table of tables) {
    const sheetName = professionalStatementTitle(table.statement_type, table.title).slice(0, 31);
    const rows = [["Label", "Amount"]];
    for (const r of table.rows) {
      rows.push([r.label, r.amount]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }

  const notes = numberDisclosures(disclosures);
  if (notes.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Note", "Title"],
        ...notes.map((n) => [n.noteNumber, n.title]),
      ]),
      "Notes",
    );
  }

  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Uint8Array(out);
}

export async function generateAllArtifacts(pack) {
  const pdf = generatePdfArtifact(pack);
  const docx = generateDocxArtifact(pack);
  const xlsx = generateXlsxArtifact(pack);

  const artifacts = [
    { format: "pdf", bytes: pdf },
    { format: "docx", bytes: docx },
    { format: "xlsx", bytes: xlsx },
  ];

  const withHashes = [];
  for (const a of artifacts) {
    withHashes.push({
      format: a.format,
      bytes: a.bytes,
      content_hash: await sha256Bytes(a.bytes),
      byte_size: a.bytes.length,
    });
  }
  return withHashes;
}

/**
 * Render a single format from a sealed publication pack dataset.
 * Used at download time so presentation upgrades do not mutate immutable artefacts.
 */
export function renderArtifactBytes(pack, format) {
  if (format === "pdf") return generatePdfArtifact(pack);
  if (format === "docx") return generateDocxArtifact(pack);
  if (format === "xlsx") return generateXlsxArtifact(pack);
  throw new Error(`Unsupported publication format: ${format}`);
}

export { bytesToBase64 };

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function executePublication(admin, {
  company_id,
  workspace_id,
  pack_review,
  user_id,
}) {
  if (!publicationEnabled()) {
    throw new Error("Publication platform is disabled (EFS_PUBLICATION).");
  }
  if (pack_review.stage !== "publication_ready" && pack_review.stage !== "published") {
    throw new Error("Publication requires stage publication_ready.");
  }
  if (pack_review.publication_executed) {
    // Idempotent re-export: return existing sealed artifact metadata (bytes are
    // presentation-rendered at download time from the immutable pack dataset).
    const { data: existingRecord } = await admin
      .from("efs_publication_records")
      .select("id, publication_pack_id, status, executed_at")
      .eq("pack_review_id", pack_review.id)
      .eq("status", "completed")
      .order("executed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!existingRecord) {
      throw new Error("Publication marked executed but no completed record found.");
    }
    const { data: artifacts } = await admin
      .from("efs_publication_artifacts")
      .select("id, format, content_hash, byte_size, generated_at, publication_record_id, publication_pack_id")
      .eq("publication_record_id", existingRecord.id)
      .eq("company_id", company_id);
    return {
      publication_executed: true,
      publication_record_id: existingRecord.id,
      publication_pack_id: existingRecord.publication_pack_id,
      artifacts: artifacts || [],
      idempotent_replay: true,
      mutates_accounting: false,
      live_gl: false,
    };
  }

  const { data: partnerSign } = await admin
    .from("efs_pack_review_signoffs")
    .select("id")
    .eq("pack_review_id", pack_review.id)
    .eq("signer_role", "partner")
    .limit(1);
  if (!partnerSign?.length) throw new Error("Partner digital sign-off required.");

  const { data: existingRecord } = await admin
    .from("efs_publication_records")
    .select("id")
    .eq("pack_review_id", pack_review.id)
    .eq("status", "completed")
    .maybeSingle();
  if (existingRecord) throw new Error("Publication record already exists.");

  const assembled = await assemblePublicationPack(admin, {
    company_id,
    workspace_id,
    pack_review,
  });

  const packRow = {
    company_id,
    workspace_id,
    pack_review_id: pack_review.id,
    snapshot_version_id: pack_review.snapshot_version_id,
    validation_run_id: pack_review.validation_run_id,
    version_no: 1,
    pack_fingerprint: assembled.packFingerprint,
    publication_fingerprint: assembled.publicationFingerprint,
    publication_seal_hash: assembled.publicationSealHash,
    content_hash: assembled.contentHash,
    dataset: {
      ...assembled.pack,
      metadata: assembled.metadata,
      provenance: {
        ...assembled.pack.provenance,
        publication_fingerprint: assembled.publicationFingerprint,
        publication_seal_hash: assembled.publicationSealHash,
        content_hash: assembled.contentHash,
      },
    },
    metadata: assembled.metadata,
    status: "sealed",
    sealed_by: user_id,
    mutates_accounting: false,
  };

  const { data: pubPack, error: packErr } = await admin
    .from("efs_publication_packs")
    .insert(packRow)
    .select()
    .single();
  if (packErr) throw packErr;

  const packForRender = pubPack.dataset;
  const artifacts = await generateAllArtifacts(packForRender);

  const { data: pubRecord, error: recErr } = await admin
    .from("efs_publication_records")
    .insert({
      company_id,
      workspace_id,
      pack_review_id: pack_review.id,
      publication_pack_id: pubPack.id,
      publication_fingerprint: assembled.publicationFingerprint,
      status: "completed",
      executed_by: user_id,
      archive_status: "archived",
      archived_at: new Date().toISOString(),
      mutates_accounting: false,
    })
    .select()
    .single();
  if (recErr) throw recErr;

  const artifactRows = [];
  for (const a of artifacts) {
    artifactRows.push({
      company_id,
      publication_record_id: pubRecord.id,
      publication_pack_id: pubPack.id,
      format: a.format,
      content_hash: a.content_hash,
      byte_size: a.byte_size,
      content_base64: bytesToBase64(a.bytes),
    });
  }

  const { data: storedArtifacts, error: artErr } = await admin
    .from("efs_publication_artifacts")
    .insert(artifactRows)
    .select("id, format, content_hash, byte_size, generated_at");
  if (artErr) throw artErr;

  await admin
    .from("efs_pack_reviews")
    .update({
      publication_executed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pack_review.id);

  await admin
    .from("efs_snapshot_versions")
    .update({
      status: "publication_bound",
      updated_at: new Date().toISOString(),
    })
    .eq("id", pack_review.snapshot_version_id)
    .eq("company_id", company_id);

  await admin
    .from("efs_reporting_workspaces")
    .update({
      status: "published",
      progress_pct: 100,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspace_id)
    .eq("company_id", company_id);

  await admin
    .from("efs_publication_packs")
    .update({ status: "archived", archived_at: new Date().toISOString() })
    .eq("id", pubPack.id);

  await appendPublicationHistory(admin, {
    company_id,
    workspace_id,
    publication_record_id: pubRecord.id,
    publication_pack_id: pubPack.id,
    event_type: "publication.executed",
    actor_user_id: user_id,
    message: "Publication pack sealed — PDF, Word, Excel archived",
    payload: {
      publication_fingerprint: assembled.publicationFingerprint,
      artifacts: (storedArtifacts || []).map((a) => ({
        format: a.format,
        content_hash: a.content_hash,
        byte_size: a.byte_size,
      })),
      mutates_accounting: false,
      live_gl: false,
    },
  });

  return {
    publication_pack: pubPack,
    publication_record: pubRecord,
    artifacts: storedArtifacts,
    publication_fingerprint: assembled.publicationFingerprint,
    publication_seal_hash: assembled.publicationSealHash,
    publication_executed: true,
    mutates_accounting: false,
    live_gl: false,
  };
}

export async function getPublicationDashboard(admin, { company_id, workspace_id }) {
  const { data: review } = await admin
    .from("efs_pack_reviews")
    .select("*")
    .eq("workspace_id", workspace_id)
    .eq("company_id", company_id)
    .eq("status", "open")
    .maybeSingle();

  const { data: records } = await admin
    .from("efs_publication_records")
    .select("*, efs_publication_packs(id, publication_fingerprint, publication_seal_hash, metadata, status)")
    .eq("workspace_id", workspace_id)
    .eq("company_id", company_id)
    .order("executed_at", { ascending: false })
    .limit(5);

  const latestRecord = records?.[0] || null;
  let artifacts = [];
  if (latestRecord) {
    const { data: arts } = await admin
      .from("efs_publication_artifacts")
      .select("id, format, content_hash, byte_size, generated_at")
      .eq("publication_record_id", latestRecord.id)
      .eq("company_id", company_id);
    artifacts = arts || [];
  }

  const { data: history } = await admin
    .from("efs_publication_history")
    .select("id, event_type, message, created_at")
    .eq("workspace_id", workspace_id)
    .eq("company_id", company_id)
    .order("created_at", { ascending: false })
    .limit(20);

  const ready =
    review?.stage === "publication_ready" &&
    !review?.publication_executed &&
    publicationEnabled();

  return {
    review: review || null,
    publication_ready: ready,
    publication_executed: !!review?.publication_executed,
    latest_record: latestRecord,
    artifacts,
    history: history || [],
    records: records || [],
    mutates_accounting: false,
    live_gl: false,
    publication: publicationEnabled(),
    xbrl: false,
    ai: false,
  };
}
