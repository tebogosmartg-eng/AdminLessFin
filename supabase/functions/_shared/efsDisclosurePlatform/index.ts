/**
 * EFS V6.4.4 — Disclosure Platform helpers (edge)
 * Attachment parent = Statement Structure node via note_placeholder attachment point.
 * Does not implement Validation / Review Workflow / Publication / XBRL / AI.
 */
// @ts-nocheck

/**
 * Ensure an open note_placeholder socket remains available after binding one.
 * Unique on (disclosure_node_id, kind_code) when disclosure_node_id is set —
 * never insert a duplicate; reopen existing or create structure-only socket.
 */
export async function ensureOpenNotePlaceholder(admin, { structure_node_id, disclosure_node_id }) {
  if (!structure_node_id) return null;

  // Prefer an already-open unused socket on this structure node
  let q = admin
    .from("efs_attachment_points")
    .select("id")
    .eq("structure_node_id", structure_node_id)
    .eq("kind_code", "note_placeholder")
    .eq("status", "open")
    .is("reserved_artefact_ref", null);
  if (disclosure_node_id) q = q.eq("disclosure_node_id", disclosure_node_id);
  const { data: openRows, error: openErr } = await q.limit(1);
  if (openErr) throw openErr;
  if (openRows?.[0]) return openRows[0];

  // If disclosure-scoped unique row exists but is bound, leave it — create structure-only open socket
  const insertRow = {
    kind_code: "note_placeholder",
    structure_node_id,
    disclosure_node_id: null,
    status: "open",
  };
  const { data: created, error: cErr } = await admin
    .from("efs_attachment_points")
    .insert(insertRow)
    .select("id")
    .single();
  if (cErr) {
    // Race / unique: treat as non-fatal for assemble idempotency
    if (String(cErr.code) === "23505" || /duplicate/i.test(cErr.message || "")) {
      return null;
    }
    throw cErr;
  }
  return created;
}

export async function resolveNoteAttachmentPoint(admin, { structure_node_id, disclosure_node_id }) {
  if (!structure_node_id) throw new Error("structure_node_id is required for disclosure attachment.");

  // Prefer exact structure (+ optional disclosure) open socket
  let q = admin
    .from("efs_attachment_points")
    .select("*, efs_structure_nodes(id, node_code, node_kind, path, status), efs_disclosure_nodes(id, disclosure_code, name)")
    .eq("structure_node_id", structure_node_id)
    .eq("kind_code", "note_placeholder")
    .eq("status", "open")
    .is("reserved_artefact_ref", null);
  if (disclosure_node_id) q = q.eq("disclosure_node_id", disclosure_node_id);
  const { data: rows, error } = await q.limit(1);
  if (error) throw error;
  let ap = rows?.[0];

  // Fall back to any open structure-bound note_placeholder on this node
  if (!ap) {
    const { data: fallback, error: fErr } = await admin
      .from("efs_attachment_points")
      .select("*, efs_structure_nodes(id, node_code, node_kind, path, status), efs_disclosure_nodes(id, disclosure_code, name)")
      .eq("structure_node_id", structure_node_id)
      .eq("kind_code", "note_placeholder")
      .eq("status", "open")
      .is("reserved_artefact_ref", null)
      .limit(1);
    if (fErr) throw fErr;
    ap = fallback?.[0];
  }

  if (!ap) {
    // Unique (disclosure_node_id, kind_code) — never insert disclosure-scoped duplicate.
    // Always create a structure-only open socket when none is available.
    const insertRow = {
      kind_code: "note_placeholder",
      structure_node_id,
      disclosure_node_id: null,
      status: "open",
    };
    const { data: created, error: cErr } = await admin
      .from("efs_attachment_points")
      .insert(insertRow)
      .select("*, efs_structure_nodes(id, node_code, node_kind, path, status), efs_disclosure_nodes(id, disclosure_code, name)")
      .single();
    if (cErr) {
      // Last resort: reuse any existing point on this structure node (bound OK for assemble bind overwrite path)
      const { data: anyAp, error: aErr } = await admin
        .from("efs_attachment_points")
        .select("*, efs_structure_nodes(id, node_code, node_kind, path, status), efs_disclosure_nodes(id, disclosure_code, name)")
        .eq("structure_node_id", structure_node_id)
        .eq("kind_code", "note_placeholder")
        .order("created_at", { ascending: false })
        .limit(1);
      if (aErr || !anyAp?.[0]) throw cErr;
      ap = anyAp[0];
      // Re-open for binding if previously bound
      if (ap.status !== "open" || ap.reserved_artefact_ref) {
        const { data: reopened, error: rErr } = await admin
          .from("efs_attachment_points")
          .update({ status: "open", reserved_artefact_ref: null })
          .eq("id", ap.id)
          .select("*, efs_structure_nodes(id, node_code, node_kind, path, status), efs_disclosure_nodes(id, disclosure_code, name)")
          .single();
        if (rErr) throw rErr;
        ap = reopened;
      }
    } else {
      ap = created;
    }
  }
  if (!ap.structure_node_id) {
    throw new Error("Disclosure requires a Statement Structure node attachment point");
  }
  return ap;
}

export async function resolveCrossReferenceAttachmentPoint(admin, { structure_node_id, disclosure_node_id }) {
  if (!structure_node_id && !disclosure_node_id) {
    return null;
  }
  let q = admin
    .from("efs_attachment_points")
    .select("*")
    .eq("kind_code", "cross_reference")
    .eq("status", "open")
    .is("reserved_artefact_ref", null);
  if (structure_node_id) q = q.eq("structure_node_id", structure_node_id);
  if (disclosure_node_id) q = q.eq("disclosure_node_id", disclosure_node_id);
  const { data: rows, error } = await q.limit(1);
  if (error) throw error;
  if (rows?.[0]) return rows[0];

  const { data: created, error: cErr } = await admin
    .from("efs_attachment_points")
    .insert({
      kind_code: "cross_reference",
      structure_node_id: structure_node_id ?? null,
      disclosure_node_id: disclosure_node_id ?? null,
      status: "open",
    })
    .select("*")
    .single();
  if (cErr) throw cErr;
  return created;
}

export async function sha256Hex(payload) {
  const data = new TextEncoder().encode(typeof payload === "string" ? payload : JSON.stringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function resolveStructureNodeByCode(admin, node_code) {
  if (!node_code) return null;
  const { data, error } = await admin
    .from("efs_structure_nodes")
    .select("id, node_code, node_kind, path, status")
    .eq("node_code", node_code)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function resolveDisclosureNodeByCode(admin, disclosure_code) {
  if (!disclosure_code) return null;
  const { data, error } = await admin
    .from("efs_disclosure_nodes")
    .select("id, disclosure_code, name")
    .eq("disclosure_code", disclosure_code)
    .maybeSingle();
  if (error) throw error;
  return data;
}
