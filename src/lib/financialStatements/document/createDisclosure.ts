/**
 * Company-specific disclosure authoring (V12.2 / Final Release Blocker).
 *
 * Lets accountants create a NEW engagement-owned disclosure note from within the
 * Document Workspace, reusing the existing `CREATE_DISCLOSURE_INSTANCE` edge API
 * (no backend redesign). The new disclosure is persisted server-side, so it
 * loads back through `loadDocumentModel` and behaves exactly like a
 * framework-assembled disclosure: editable, hideable, reorderable, numbered,
 * cross-referenced, previewed and published.
 *
 * Framework-generated content (`source: 'framework'`) remains an immutable
 * template; company disclosures are separate server rows (`source:
 * 'engagement'`).
 */
import { invokeFinancialStatements } from '../api';
import { computeNoteNumbering } from './renumber';
import type { DocNoteNode } from './documentModel';
import type { DocOverrides } from './documentStore';

/** Minimal shape of a listed disclosure instance needed for attachment reuse. */
export type RawInstanceStructure = {
  disclosure_code?: string | null;
  efs_structure_nodes?: {
    node_code?: string | null;
    node_kind?: string | null;
    path?: string | null;
  } | null;
};

export type DisclosurePlacement =
  | { position: 'beginning' }
  | { position: 'end' }
  | { position: 'after'; afterNoteId: string };

export const COMPANY_DISCLOSURE_PREFIX = 'DISC.COMPANY.';

/**
 * Pick a statement-structure node code to attach a new note to, by reusing the
 * structure node of an existing disclosure. The edge API requires a valid
 * `structure_node_code`; reusing an existing one avoids any backend change.
 */
export function pickNotesStructureNodeCode(instances: RawInstanceStructure[]): string | null {
  const withCode = instances.filter((i) => i.efs_structure_nodes?.node_code);
  if (withCode.length === 0) return null;
  const noteLike = withCode.find((i) => {
    const kind = String(i.efs_structure_nodes?.node_kind || '').toLowerCase();
    const path = String(i.efs_structure_nodes?.path || '').toLowerCase();
    return kind.includes('note') || kind.includes('disclosure') || path.includes('note');
  });
  return (noteLike || withCode[0]).efs_structure_nodes?.node_code ?? null;
}

/** Generate a unique company-specific disclosure code. */
export function nextCompanyDisclosureCode(existingCodes: string[]): string {
  const used = new Set(existingCodes.map((c) => String(c || '').toUpperCase()));
  let n = 1;
  let code = `${COMPANY_DISCLOSURE_PREFIX}${String(n).padStart(2, '0')}`;
  while (used.has(code.toUpperCase())) {
    n += 1;
    code = `${COMPANY_DISCLOSURE_PREFIX}${String(n).padStart(2, '0')}`;
  }
  return code;
}

export type CreateDisclosurePayload = {
  workspace_id: string;
  structure_node_code: string;
  title: string;
  disclosure_code: string;
  disclosure_kind: string;
  requirement_level: string;
  sort_order: number;
  framework_pack_id?: string | null;
};

export function buildCreateDisclosurePayload(args: {
  workspaceId: string;
  structureNodeCode: string;
  title: string;
  disclosureCode: string;
  disclosureKind?: string;
  sortOrder?: number;
  frameworkPackId?: string | null;
}): CreateDisclosurePayload {
  return {
    workspace_id: args.workspaceId,
    structure_node_code: args.structureNodeCode,
    title: args.title.trim() || 'Company-specific disclosure',
    disclosure_code: args.disclosureCode,
    disclosure_kind: args.disclosureKind || 'note',
    requirement_level: 'required',
    sort_order: args.sortOrder ?? 900,
    framework_pack_id: args.frameworkPackId ?? null,
  };
}

/**
 * Build an explicit order map that inserts the new note at the requested slot
 * while preserving the current visible sequence for all other notes. This fully
 * controls canonical numbering via `documentStore.order`.
 */
export function buildInsertionOrder(
  notes: DocNoteNode[],
  overrides: DocOverrides,
  newNoteId: string,
  placement: DisclosurePlacement,
): Record<string, number> {
  const { visible } = computeNoteNumbering(notes, overrides);
  const orderedIds = visible.map((v) => v.note.id).filter((id) => id !== newNoteId);

  let index: number;
  if (placement.position === 'beginning') {
    index = 0;
  } else if (placement.position === 'after') {
    const at = orderedIds.indexOf(placement.afterNoteId);
    index = at < 0 ? orderedIds.length : at + 1;
  } else {
    index = orderedIds.length;
  }

  const finalIds = [...orderedIds.slice(0, index), newNoteId, ...orderedIds.slice(index)];
  const map: Record<string, number> = {};
  finalIds.forEach((id, i) => {
    map[id] = i;
  });
  return map;
}

/** Resolve the attachment structure node code from existing disclosures. */
export async function resolveNotesStructureNodeCode(
  companyId: string,
  workspaceId: string,
): Promise<string | null> {
  const instances = await invokeFinancialStatements<RawInstanceStructure[]>(
    companyId,
    'LIST_DISCLOSURE_INSTANCES',
    { workspace_id: workspaceId },
  ).catch(() => [] as RawInstanceStructure[]);
  return pickNotesStructureNodeCode(instances || []);
}

/** Create the disclosure server-side via the existing API; returns the new id. */
export async function createCompanyDisclosure(args: {
  companyId: string;
  workspaceId: string;
  title: string;
  disclosureCode: string;
  structureNodeCode: string;
  disclosureKind?: string;
  sortOrder?: number;
  frameworkPackId?: string | null;
}): Promise<{ id: string; disclosure_code: string }> {
  const payload = buildCreateDisclosurePayload({
    workspaceId: args.workspaceId,
    structureNodeCode: args.structureNodeCode,
    title: args.title,
    disclosureCode: args.disclosureCode,
    disclosureKind: args.disclosureKind,
    sortOrder: args.sortOrder,
    frameworkPackId: args.frameworkPackId,
  });
  const inst = await invokeFinancialStatements<{ id: string; disclosure_code?: string }>(
    args.companyId,
    'CREATE_DISCLOSURE_INSTANCE',
    payload,
  );
  return { id: inst.id, disclosure_code: inst.disclosure_code || args.disclosureCode };
}
