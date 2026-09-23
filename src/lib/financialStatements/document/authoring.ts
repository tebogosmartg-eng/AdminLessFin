/**
 * Saving a piece of the financial statements.
 *
 * The document is two things at once. Most of it is generated: the framework
 * supplies the wording and the accounting records supply the figures, and it is
 * recomposed on every load so it stays in step with the ledger. Generated
 * content therefore has no row of its own, and its id is synthetic
 * ("fw:para:IFRS_SME:DISC.PPE:1", or "<note-uuid>:P1" where a note exists but
 * was empty).
 *
 * The rest is authored — a sentence the accountant rewrote, a table they
 * corrected. That has to survive, both a refresh and a rebuild from accounting.
 *
 * So an edit to generated content is the moment it becomes authored: the edge
 * creates the row, and from then on it is updated in place and left alone when
 * the statements are regenerated. Callers do not need to know which case they
 * are in — they pass the note and the content code, and this picks the route.
 */
import { invokeFinancialStatements } from '../api';
import type { DocNoteNode } from './documentModel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when this id is a real database row rather than generated content. */
export function isStoredRow(id: string | null | undefined): boolean {
  return !!id && UUID.test(id);
}

export type NoteContentKind = 'section' | 'paragraph' | 'table';

export type SaveNoteContentParams = {
  companyId: string;
  workspaceId: string;
  frameworkPackId?: string | null;
  note: Pick<DocNoteNode, 'id' | 'disclosure_code' | 'title' | 'sort_order'>;
  kind: NoteContentKind;
  /** The row id, or a synthetic id for content the framework generated. */
  id: string;
  /** section_code / paragraph_code / table_code — stable across regeneration. */
  code: string;
  title?: string;
  body?: string;
  rows_json?: unknown[];
  columns_json?: unknown[];
  sortOrder?: number;
};

const UPDATE_METHOD: Record<NoteContentKind, string> = {
  section: 'UPDATE_DISCLOSURE_SECTION',
  paragraph: 'UPDATE_DISCLOSURE_PARAGRAPH',
  table: 'UPDATE_DISCLOSURE_TABLE',
};

export type SaveNoteContentResult = {
  /** True when this edit created the row — the content is now the author's. */
  materialised: boolean;
  /**
   * The note's real row. A generated note has a synthetic id until someone
   * edits it; once it has been stored, anything holding the old id — the
   * navigator's selection, most of all — has to be told the new one.
   */
  disclosureInstanceId?: string;
};

export async function saveNoteContent(
  params: SaveNoteContentParams,
): Promise<SaveNoteContentResult> {
  const { companyId, workspaceId, note, kind, id, code } = params;

  if (isStoredRow(id)) {
    const payload: Record<string, unknown> = {};
    if (kind === 'section') {
      payload.section_id = id;
      payload.title = params.title;
      payload.body = params.body;
    } else if (kind === 'paragraph') {
      payload.paragraph_id = id;
      payload.body = params.body;
    } else {
      payload.table_id = id;
      payload.title = params.title;
      payload.rows_json = params.rows_json;
      if (params.columns_json) payload.columns_json = params.columns_json;
    }
    await invokeFinancialStatements(companyId, UPDATE_METHOD[kind], payload);
    return { materialised: false };
  }

  const res = await invokeFinancialStatements<{
    materialised?: boolean;
    disclosure_instance_id?: string;
  }>(
    companyId,
    'SAVE_AUTHORED_CONTENT',
    {
      workspace_id: workspaceId,
      framework_pack_id: params.frameworkPackId ?? undefined,
      disclosure_code: note.disclosure_code,
      note_title: note.title,
      content_kind: kind,
      content_code: code,
      title: params.title,
      body: params.body,
      rows_json: params.rows_json,
      columns_json: params.columns_json,
      sort_order: params.sortOrder ?? note.sort_order,
    },
  );
  return {
    materialised: res?.materialised !== false,
    disclosureInstanceId: res?.disclosure_instance_id,
  };
}
