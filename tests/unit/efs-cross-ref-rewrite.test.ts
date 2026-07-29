/**
 * Phase B — Cross-reference rewrite regression (TAS V11.2 / Controlled Impl V11.4).
 *
 * Render-time only: stored paragraph bodies must remain unchanged.
 *
 * Note ordering follows `numberDisclosures` (publication helper). Fixtures use
 * unknown disclosure codes with alphabetically sequential titles so structural
 * numbers are deterministic (Note 1…N).
 */
import { describe, expect, it } from 'vitest';
import type { DocumentModel, DocNoteNode } from '../../src/lib/financialStatements/document/documentModel';
import {
  buildNoteNumberResolution,
  rewriteCrossReferenceText,
  collectCrossReferenceIssues,
} from '../../src/lib/financialStatements/document/crossRefRewrite';
import { emptyOverrides, type DocOverrides } from '../../src/lib/financialStatements/document/documentStore';
import {
  generateWorkspaceAfsPdf,
  workspacePdfToBytes,
} from '../../src/lib/financialStatements/publication/afsWorkspacePdf';

function makeNote(
  partial: Partial<DocNoteNode> & Pick<DocNoteNode, 'id' | 'disclosure_code' | 'title' | 'sort_order'>,
): DocNoteNode {
  return {
    kind: 'note',
    status: 'draft',
    requirement_level: 'required',
    sections: [],
    paragraphs: [],
    tables: [],
    ...partial,
  };
}

/**
 * Eight notes with unknown DISC codes + titles Note Topic 01…08 so canonical
 * title sort yields structural numbers 1–8. Topic 08 = PPE; Topic 07 = Revenue.
 */
function eightNotes(revenueBody: string): DocNoteNode[] {
  const topics = [
    'Note Topic 01 Basis',
    'Note Topic 02 Policies',
    'Note Topic 03 Judgements',
    'Note Topic 04 Cash',
    'Note Topic 05 Receivables',
    'Note Topic 06 Inventories',
    'Note Topic 07 Revenue',
    'Note Topic 08 Property Plant & Equipment',
  ];
  return topics.map((title, idx) => {
    const n = idx + 1;
    const id = `note-${n}`;
    return makeNote({
      id,
      disclosure_code: `DISC.TOPIC_${String(n).padStart(2, '0')}`,
      title,
      sort_order: n * 10,
      paragraphs: [
        {
          id: `${id}-p1`,
          paragraph_code: 'P1',
          body: n === 7 ? revenueBody : `${title} disclosure.`,
          sort_order: 1,
        },
      ],
    });
  });
}

function modelWithNotes(notes: DocNoteNode[]): DocumentModel {
  return {
    companyId: 'co-1',
    workspaceId: 'ws-xref-1',
    workspaceName: 'Cross-ref engagement',
    frameworkPackId: 'pack-1',
    frameworkKey: 'IFRS_SME',
    frameworkLabel: 'IFRS for SMEs',
    entity: {
      registered_name: 'XRef Entity (Pty) Ltd',
      reporting_currency: 'ZAR',
    } as DocumentModel['entity'],
    period: {
      label: 'FY2026',
      start_date: '2025-04-01',
      end_date: '2026-03-31',
    },
    statements: [
      {
        id: 'financial_position',
        kind: 'statement',
        statement_type: 'financial_position',
        title: 'Statement of Financial Position',
        lines: [],
        populated: false,
      },
      {
        id: 'financial_performance',
        kind: 'statement',
        statement_type: 'financial_performance',
        title: 'Statement of Profit or Loss and Other Comprehensive Income',
        lines: [],
        populated: false,
      },
      {
        id: 'changes_in_equity',
        kind: 'statement',
        statement_type: 'changes_in_equity',
        title: 'Statement of Changes in Equity',
        lines: [],
        populated: false,
      },
      {
        id: 'cash_flows',
        kind: 'statement',
        statement_type: 'cash_flows',
        title: 'Statement of Cash Flows',
        lines: [],
        populated: false,
      },
    ],
    policySets: [],
    notes,
    crossReferences: [],
    signatures: [],
    trialBalanceCaptured: false,
  };
}

function decodePdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  const matches = [...raw.matchAll(/\((?:\\.|[^\\)])*\)/g)];
  return matches
    .map((m) =>
      m[0]
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\([()\\])/g, '$1'),
    )
    .join('\n');
}

describe('Phase B — Cross-reference resolution map', () => {
  it('maps baseline→display when a middle note is hidden (Note 8 → Note 7)', () => {
    const notes = eightNotes('Refer to Note 8.');
    const baseline = buildNoteNumberResolution(notes, emptyOverrides());
    expect(baseline.noteIdToBaseline.get('note-8')).toBe(8);
    expect(baseline.noteIdToBaseline.get('note-4')).toBe(4);

    const overrides: DocOverrides = {
      ...emptyOverrides(),
      hidden: { 'note-4': true },
    };
    const resolution = buildNoteNumberResolution(notes, overrides);
    expect(resolution.baselineToCurrent.get(8)).toBe(7);
    expect(resolution.hiddenBaselineNumbers).toContain(4);
    expect(resolution.noteIdToCurrent.get('note-8')).toBe(7);
  });

  it('restores identity mapping when the hidden note is restored', () => {
    const notes = eightNotes('Refer to Note 8.');
    const hidden: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };
    const restored = emptyOverrides();
    expect(buildNoteNumberResolution(notes, hidden).baselineToCurrent.get(8)).toBe(7);
    expect(buildNoteNumberResolution(notes, restored).baselineToCurrent.get(8)).toBe(8);
  });
});

describe('Phase B — Rewrite behaviour (non-mutating)', () => {
  it('rewrites Refer to Note 8 → Note 7 after hide without mutating source prose', () => {
    const source = 'Refer to Note 8.';
    const notes = eightNotes(source);
    const overrides: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };
    const resolution = buildNoteNumberResolution(notes, overrides);
    const rewritten = rewriteCrossReferenceText(source, resolution, notes);
    expect(rewritten).toBe('Refer to Note 7.');
    expect(notes.find((n) => n.id === 'note-7')!.paragraphs[0].body).toBe(source);
  });

  it('rewrites multiple and nested references in one pass', () => {
    const source =
      'See Note 3 and Note 8. Also refer to Note 8 - Note Topic 08 Property Plant & Equipment.';
    const notes = eightNotes(source);
    const overrides: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };
    const resolution = buildNoteNumberResolution(notes, overrides);
    const rewritten = rewriteCrossReferenceText(source, resolution, notes);
    expect(rewritten).toContain('Note 3');
    expect(rewritten).toMatch(/Note 7/);
    expect(rewritten).not.toMatch(/Note 8\b/);
    expect(rewritten).toMatch(/Note 7\s*[-–—]\s*Note Topic 08 Property Plant & Equipment/);
  });

  it('rewrites after reorder using structural baseline numbers', () => {
    const source = 'Refer to Note 8.';
    const notes = eightNotes(source);
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      order: {
        'note-8': 1,
        'note-1': 2,
        'note-2': 3,
        'note-3': 4,
        'note-4': 5,
        'note-5': 6,
        'note-6': 7,
        'note-7': 8,
      },
    };
    const resolution = buildNoteNumberResolution(notes, overrides);
    expect(resolution.baselineToCurrent.get(8)).toBe(1);
    expect(rewriteCrossReferenceText(source, resolution, notes)).toBe('Refer to Note 1.');
  });

  it('insert note: title-qualified references follow the target note identity', () => {
    const source = 'Refer to Note 8 - Note Topic 08 Property Plant & Equipment.';
    const base = eightNotes(source);
    const inserted = makeNote({
      id: 'note-insert',
      disclosure_code: 'DISC.TOPIC_00',
      title: 'Note Topic 00 Inserted',
      sort_order: 5,
      paragraphs: [{ id: 'ins-p', paragraph_code: 'P1', body: 'Inserted.', sort_order: 1 }],
    });
    const notes = [...base, inserted];
    const resolution = buildNoteNumberResolution(notes, emptyOverrides());
    const ppeCurrent = resolution.noteIdToCurrent.get('note-8');
    expect(ppeCurrent).toBeTypeOf('number');
    const rewritten = rewriteCrossReferenceText(source, resolution, notes);
    expect(rewritten).toBe(
      `Refer to Note ${ppeCurrent} - Note Topic 08 Property Plant & Equipment.`,
    );
    expect(notes.find((n) => n.id === 'note-7')!.paragraphs[0].body).toBe(source);
  });
});

describe('Phase B — Preview = PDF with rewrite', () => {
  it('Preview bytes equal Download bytes after hide rewrite', () => {
    const notes = eightNotes('Refer to Note 8.');
    const model = modelWithNotes(notes);
    const overrides: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };
    const pdf = generateWorkspaceAfsPdf(model, overrides);
    const preview = workspacePdfToBytes(pdf);
    const download = workspacePdfToBytes(pdf);
    expect(preview).toEqual(download);
    const text = decodePdfText(preview);
    expect(text).toMatch(/Refer to Note 7/);
    expect(text).not.toMatch(/Refer to Note 8/);
    expect(model.notes.find((n) => n.id === 'note-7')!.paragraphs[0].body).toBe('Refer to Note 8.');
  });

  it('restoring a note returns rendered reference to baseline number', () => {
    const notes = eightNotes('Refer to Note 8.');
    const model = modelWithNotes(notes);
    const hidden: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };
    const restored = emptyOverrides();
    const hiddenText = decodePdfText(workspacePdfToBytes(generateWorkspaceAfsPdf(model, hidden)));
    const restoredText = decodePdfText(workspacePdfToBytes(generateWorkspaceAfsPdf(model, restored)));
    expect(hiddenText).toMatch(/Refer to Note 7/);
    expect(restoredText).toMatch(/Refer to Note 8/);
  });
});

describe('Phase B — Advisory validation', () => {
  it('flags prose that still cites a hidden baseline note number', () => {
    const notes = eightNotes('See also Note 4 for cash balances.');
    // Put the hidden-target citation on note-7 body
    notes.find((n) => n.id === 'note-7')!.paragraphs[0].body = 'See also Note 4 for cash balances.';
    const overrides: DocOverrides = { ...emptyOverrides(), hidden: { 'note-4': true } };
    const issues = collectCrossReferenceIssues(notes, overrides);
    expect(issues.some((i) => i.id === 'XREF.HIDDEN.4' && !i.pass)).toBe(true);
    expect(issues.some((i) => i.id === 'XREF.REWRITE' && i.pass)).toBe(true);
  });
});
