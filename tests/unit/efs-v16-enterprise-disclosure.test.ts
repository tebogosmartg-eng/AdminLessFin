/**
 * V16.0 — Enterprise Disclosure Composition Engine regression suite.
 */
import { describe, expect, it } from 'vitest';
import {
  composeDocument,
  buildDisclosureLibraryComponents,
  buildEnterpriseDisclosures,
  buildMovementSchedule,
  evaluateConditionalDisclosures,
  inferDisclosureArchetype,
  MOVEMENT_SCHEDULE_DEFINITIONS,
  validateCompositionDocument,
  validateMovementRow,
  enterpriseDisclosureToBlocks,
  disclosureCodeForLine,
  computeCompositionNoteNumbering,
} from '../../src/lib/financialStatements/composition';
import { buildV16SampleModel } from '../../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import { writeV16DisclosureEvidence } from '../../tools/efs-v16-disclosure-evidence';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import { buildCanonicalPublishPackage } from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';
import type { DocNoteNode } from '../../src/lib/financialStatements/document/documentModel';

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

describe('V16.0 — Enterprise Disclosure Object Model', () => {
  it('composes version 16.0 with enterprise disclosure objects', () => {
    const doc = composeDocument(buildV16SampleModel(), emptyOverrides());
    expect(doc.version).toBe('16.0');
    expect(doc.enterpriseDisclosures.length).toBeGreaterThan(5);
    expect(doc.enterpriseDisclosures.every((d) => d.archetype)).toBe(true);
    expect(doc.enterpriseDisclosures.every((d) => d.sections.length >= 0)).toBe(true);
  });

  it('builds disclosures from reusable library components — not plain text', () => {
    const model = buildV16SampleModel();
    const doc = composeDocument(model, emptyOverrides());
    const ppe = doc.enterpriseDisclosures.find((d) => d.disclosureCode === 'DISC.PPE');
    expect(ppe).toBeTruthy();
    const componentCount = ppe!.sections.reduce((a, s) => a + s.libraryComponents.length, 0);
    expect(componentCount).toBeGreaterThan(0);
    expect(ppe!.sections.some((s) => s.libraryComponents.length > 0)).toBe(true);
  });

  it('assigns disclosure archetypes from content and links', () => {
    expect(inferDisclosureArchetype('DISC.PPE', true, false)).toBe('movement_schedule');
    expect(inferDisclosureArchetype('DISC.TAX', false, true)).toBe('tax_reconciliation');
    expect(inferDisclosureArchetype('DISC.RELATEDPARTY', false, false)).toBe('related_party');
    expect(inferDisclosureArchetype('DISC.REVENUE', false, false)).toBe('general');
  });
});

describe('V16.0 — Disclosure Component Library', () => {
  it('maps note content to typed library components', () => {
    const note: DocNoteNode = {
      id: 'n-test',
      kind: 'note',
      disclosure_code: 'DISC.PPE',
      title: 'Property, plant and equipment',
      status: 'draft',
      requirement_level: 'required',
      sort_order: 10,
      sections: [{ id: 's1', section_code: 'body', title: 'Carrying amounts', body: 'PPE is stated at cost.', sort_order: 1 }],
      paragraphs: [{ id: 'p1', paragraph_code: 'P1', body: 'Significant estimate: useful lives.', sort_order: 1 }],
      tables: [
        {
          id: 't1',
          table_code: 'DISC.PPE.MOVEMENT',
          title: 'Movement in property, plant and equipment',
          columns_json: ['', 'Opening', 'Additions', 'Closing'],
          rows_json: [['Land', '1000', '200', '1200']],
          sort_order: 1,
        },
      ],
    };
    const library = buildDisclosureLibraryComponents(note);
    expect(library.some((c) => c.componentKind === 'movement_table')).toBe(true);
    expect(library.some((c) => c.componentKind === 'estimate')).toBe(true);
  });
});

describe('V16.0 — Movement Schedule Engine', () => {
  it('defines asset-agnostic movement schedule definitions', () => {
    expect(MOVEMENT_SCHEDULE_DEFINITIONS.length).toBeGreaterThanOrEqual(10);
    const codes = MOVEMENT_SCHEDULE_DEFINITIONS.map((d) => d.scheduleCode);
    expect(codes).toContain('SCH.PPE.MOVEMENT');
    expect(codes).toContain('SCH.EQUITY.MOVEMENT');
    expect(codes).toContain('SCH.LEASE.MOVEMENT');
    expect(codes).toContain('SCH.DEFTAX.MOVEMENT');
  });

  it('validates movement row reconciliation', () => {
    const result = validateMovementRow(
      {
        rowCode: 'test',
        label: 'Test',
        values: { opening: 100, additions: 50, closing: 150 },
      },
      ['opening', 'additions', 'closing'],
    );
    expect(result.passed).toBe(true);

    const fail = validateMovementRow(
      {
        rowCode: 'test',
        label: 'Test',
        values: { opening: 100, additions: 50, closing: 200 },
      },
      ['opening', 'additions', 'closing'],
    );
    expect(fail.passed).toBe(false);
  });

  it('builds movement schedules from facts', () => {
    const def = MOVEMENT_SCHEDULE_DEFINITIONS.find((d) => d.scheduleCode === 'SCH.PPE.MOVEMENT')!;
    const facts = new Map([['sfp.ppe', 8500000]]);
    const schedule = buildMovementSchedule(def, { facts, closingLineCode: 'sfp.ppe' });
    expect(schedule.rows.some((r) => r.isTotal && r.values.closing === 8500000)).toBe(true);
  });

  it('attaches movement schedules to PPE disclosure', () => {
    const doc = composeDocument(buildV16SampleModel(), emptyOverrides());
    const ppe = doc.enterpriseDisclosures.find((d) => d.disclosureCode === 'DISC.PPE');
    expect(ppe?.movementSchedules.length).toBeGreaterThan(0);
  });
});

describe('V16.0 — Conditional Disclosure Engine', () => {
  it('evaluates conditional activation from entity facts', () => {
    const model = buildV16SampleModel();
    const result = evaluateConditionalDisclosures(model);
    expect(result.activated.length).toBeGreaterThan(0);
    expect(result.conditions).toBeTruthy();
  });

  it('continues automatic renumbering when disclosures are hidden', () => {
    const model = buildV16SampleModel();
    const numbering = computeCompositionNoteNumbering(model.notes, emptyOverrides());
    const mid = numbering.visible[2];
    const overrides = { ...emptyOverrides(), hidden: { [mid.note.id]: true } };
    const next = computeCompositionNoteNumbering(model.notes, overrides);
    expect(next.visible.every((v, i) => v.noteNumber === i + 1)).toBe(true);
  });
});

describe('V16.0 — Cross References and Linking', () => {
  it('links statement lines to disclosures automatically', () => {
    expect(disclosureCodeForLine('sfp.ppe')).toBe('DISC.PPE');
    const doc = composeDocument(buildV16SampleModel(), emptyOverrides());
    const ppe = doc.enterpriseDisclosures.find((d) => d.disclosureCode === 'DISC.PPE');
    expect(ppe?.links.policyCodes).toContain('POL.PPE');
    expect(ppe?.links.scheduleCodes).toContain('SCH.PPE.MOVEMENT');
    expect(ppe?.crossReferences.length).toBeGreaterThan(0);
  });

  it('injects note references onto face statements', () => {
    const view = prepareCanonicalDocumentView(buildV16SampleModel(), emptyOverrides());
    const sfp = view.statements.find((s) => s.statement_type === 'financial_position')!;
    const ppe = sfp.lines.find((l) => l.line_code === 'sfp.ppe');
    expect(Number(ppe?.note_ref)).toBeGreaterThan(0);
  });
});

describe('V16.0 — Comparative Information', () => {
  it('supports comparative period metadata on disclosures', () => {
    const doc = composeDocument(buildV16SampleModel(), emptyOverrides());
    const withComparatives = doc.enterpriseDisclosures.filter(
      (d) => d.comparatives.priorPeriodLabel != null,
    );
    expect(withComparatives.length).toBeGreaterThan(0);
  });
});

describe('V16.0 — Validation', () => {
  it('validates enterprise disclosure composition', () => {
    const doc = composeDocument(buildV16SampleModel(), emptyOverrides());
    const result = validateCompositionDocument(doc);
    expect(result.summary.disclosureCount).toBe(doc.enterpriseDisclosures.length);
    expect(result.summary.movementScheduleCount).toBeGreaterThan(0);
  });
});

describe('V16.0 — Publication from Metadata', () => {
  it('renders disclosures from enterprise objects via canonical view', () => {
    const model = buildV16SampleModel();
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    expect(view.composition.version).toBe('16.0');
    expect(view.composition.enterpriseDisclosures.length).toBeGreaterThan(0);

    const ppeNote = view.notes.find((n) => /property, plant/i.test(n.title));
    expect(ppeNote?.blocks.length).toBeGreaterThan(0);
  });

  it('flattens enterprise disclosure to publication blocks', () => {
    const doc = composeDocument(buildV16SampleModel(), emptyOverrides());
    const ppe = doc.enterpriseDisclosures.find((d) => d.disclosureCode === 'DISC.PPE')!;
    const blocks = enterpriseDisclosureToBlocks(ppe);
    expect(blocks.some((b) => b.type === 'paragraph')).toBe(true);
    expect(blocks.some((b) => b.type === 'table')).toBe(true);
  });

  it('publishes PDF and DOCX with no regression', () => {
    const model = buildV16SampleModel();
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    const pkg = buildCanonicalPublishPackage(model, emptyOverrides());
    expect(pkg.pdfBytes.length).toBeGreaterThan(1000);
    expect(pkg.docxBytes.length).toBeGreaterThan(1000);
    expect(pkg.structureFingerprint).toBe(view.structureFingerprint);

    const pdfText = decodePdfText(pkg.pdfBytes);
    expect(pdfText).toContain('Significant Accounting Policies');
    expect(pdfText).toContain('Notes to the Financial Statements');
    expect(pdfText).toMatch(/Note \d+\./);
    expect(pdfText).toContain('Meridian Enterprise Disclosure');
  });

  it('writes V16 disclosure evidence pack', () => {
    const evidence = writeV16DisclosureEvidence();
    expect(evidence.version).toBe('16.0');
    expect(evidence.decision).toBe('READY FOR CERTIFICATION');
    expect(evidence.disclosureCount).toBeGreaterThan(5);
    expect(evidence.movementScheduleCount).toBeGreaterThan(0);
    expect(evidence.pdfBytes).toBeGreaterThan(1000);
  });
});
