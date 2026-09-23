/**
 * Editing generated content used to fail.
 *
 * The framework composes narrative and tables on every load, so they have no
 * database row and their ids are synthetic. Those ids were being sent as
 * `paragraph_id` / `table_id` to handlers that match on a uuid column, so every
 * edit to generated wording came back "Paragraph not found." These tests pin the
 * routing: a real row is updated in place, generated content is materialised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/financialStatements/api', () => ({
  invokeFinancialStatements: invoke,
}));

import { isStoredRow, saveNoteContent } from '../../src/lib/financialStatements/document/authoring';

const NOTE = {
  id: 'fw:note:IFRS_SME:DISC.PPE',
  disclosure_code: 'DISC.PPE',
  title: 'Property, plant and equipment',
  sort_order: 40,
};

const REAL_UUID = '6f3a1c2e-9b7d-4a51-8f2c-0d5e7a1b3c49';

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue({});
});

describe('isStoredRow', () => {
  it('recognises a database row', () => {
    expect(isStoredRow(REAL_UUID)).toBe(true);
  });

  it('rejects the ids the framework engine generates', () => {
    expect(isStoredRow('fw:para:IFRS_SME:DISC.PPE:1')).toBe(false);
    expect(isStoredRow('fw:table:GRAP:DISC.HERITAGE')).toBe(false);
    // An empty server note enriched with standard wording.
    expect(isStoredRow(`${REAL_UUID}:P1`)).toBe(false);
    expect(isStoredRow(undefined)).toBe(false);
  });
});

describe('saveNoteContent', () => {
  it('updates a real paragraph in place', async () => {
    const res = await saveNoteContent({
      companyId: 'c1',
      workspaceId: 'w1',
      note: NOTE,
      kind: 'paragraph',
      id: REAL_UUID,
      code: 'P1',
      body: 'Rewritten.',
    });
    expect(res.materialised).toBe(false);
    expect(invoke).toHaveBeenCalledWith('c1', 'UPDATE_DISCLOSURE_PARAGRAPH', {
      paragraph_id: REAL_UUID,
      body: 'Rewritten.',
    });
  });

  it('materialises generated narrative rather than sending a synthetic id', async () => {
    invoke.mockResolvedValue({ materialised: true });
    const res = await saveNoteContent({
      companyId: 'c1',
      workspaceId: 'w1',
      frameworkPackId: 'pack-1',
      note: NOTE,
      kind: 'paragraph',
      id: 'fw:para:IFRS_SME:DISC.PPE:1',
      code: 'P1',
      body: 'Our own wording.',
    });
    expect(res.materialised).toBe(true);

    const [, method, payload] = invoke.mock.calls[0];
    expect(method).toBe('SAVE_AUTHORED_CONTENT');
    // The note is identified by its framework code, never by the synthetic id.
    expect(payload).toMatchObject({
      workspace_id: 'w1',
      framework_pack_id: 'pack-1',
      disclosure_code: 'DISC.PPE',
      content_kind: 'paragraph',
      content_code: 'P1',
      body: 'Our own wording.',
    });
    expect(JSON.stringify(payload)).not.toContain('fw:para');
  });

  it('materialises a generated table with its rows and headings', async () => {
    await saveNoteContent({
      companyId: 'c1',
      workspaceId: 'w1',
      note: NOTE,
      kind: 'table',
      id: 'fw:table:IFRS_SME:DISC.PPE',
      code: 'T1',
      title: 'Reconciliation of carrying amount',
      rows_json: [['Opening', '400']],
      columns_json: ['', '2026'],
    });
    const [, method, payload] = invoke.mock.calls[0];
    expect(method).toBe('SAVE_AUTHORED_CONTENT');
    expect(payload).toMatchObject({
      content_kind: 'table',
      content_code: 'T1',
      rows_json: [['Opening', '400']],
      columns_json: ['', '2026'],
    });
  });

  it('routes an enriched-but-unsaved section through materialisation', async () => {
    await saveNoteContent({
      companyId: 'c1',
      workspaceId: 'w1',
      note: NOTE,
      kind: 'section',
      id: `${REAL_UUID}:policy`,
      code: 'policy',
      title: 'Measurement policy',
      body: 'Cost less accumulated depreciation.',
    });
    expect(invoke.mock.calls[0][1]).toBe('SAVE_AUTHORED_CONTENT');
  });

  it('updates a real table through the existing handler', async () => {
    await saveNoteContent({
      companyId: 'c1',
      workspaceId: 'w1',
      note: NOTE,
      kind: 'table',
      id: REAL_UUID,
      code: 'T1',
      title: 'Reconciliation',
      rows_json: [['Opening', '400']],
    });
    expect(invoke).toHaveBeenCalledWith('c1', 'UPDATE_DISCLOSURE_TABLE', {
      table_id: REAL_UUID,
      title: 'Reconciliation',
      rows_json: [['Opening', '400']],
    });
  });
});
