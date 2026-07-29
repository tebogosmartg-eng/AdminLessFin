/**
 * EFS V6.4.3 — Working Paper Platform helpers (edge)
 * Attachment parent = Structure Node via attachment_point only.
 */
// @ts-nocheck

export async function resolveStructureAttachmentPoint(admin, { structure_node_id, kind_code }) {
  if (!structure_node_id) throw new Error("structure_node_id is required.");
  if (!kind_code) throw new Error("kind_code is required.");
  const { data: rows, error } = await admin
    .from("efs_attachment_points")
    .select("*, efs_structure_nodes(id, node_code, node_kind, path, status)")
    .eq("structure_node_id", structure_node_id)
    .eq("kind_code", kind_code)
    .eq("status", "open")
    .is("reserved_artefact_ref", null)
    .limit(1);
  if (error) throw error;
  const ap = rows?.[0];
  if (!ap) {
    throw new Error(`No open ${kind_code} attachment point on structure node ${structure_node_id}`);
  }
  if (!ap.structure_node_id) {
    throw new Error(`${kind_code} requires a Statement Structure node attachment point`);
  }
  return ap;
}

export async function appendReviewHistory(admin, row) {
  const { error } = await admin.from("efs_review_history").insert(row);
  if (error) throw error;
}

export async function sha256Hex(payload) {
  const data = new TextEncoder().encode(typeof payload === "string" ? payload : JSON.stringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
