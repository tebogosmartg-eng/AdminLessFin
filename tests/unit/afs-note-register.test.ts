/**
 * One note numbering for the whole set of financial statements.
 *
 * The navigator, the Editor's statements, the Live Preview, the PDF and the
 * Word document all read their note numbers from the note register. These
 * tests hold the register to what the printed document actually contains:
 * numbers 1 to N with no gaps, statement references that land on a printed
 * note, and links in the PDF that jump to the note they name.
 */
import { describe, expect, it } from 'vitest';
import { emptyOverrides, type DocOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { buildNoteRegister } from '../../src/lib/financialStatements/document/noteRegister';
import type { DocumentModel } from '../../src/lib/financialStatements/document/documentModel';
import { buildV16SampleModel } from '../../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import {
  allRegressionScenarioIds,
  buildRegressionScenarioModel,
} from '../../src/lib/financialStatements/reportingIntelligence';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import { renderStatutoryPdf } from '../../src/lib/financialStatements/publication/render/statutoryPdf';
import { disclosureCodeForLine } from '../../src/lib/financialStatements/composition/disclosureLinking';
import {
  documentHasComparatives,
  formatStatementFigure,
  lineRole,
  parseFigure,
  presentTableRows,
  reportingYears,
} from '../../src/lib/financialStatements/publication/statementPresentation';

function printedNumbers(model: DocumentModel, overrides: DocOverrides) {
  const view = prepareCanonicalDocumentView(model, overrides);
  return view.notes.map((n) => ({ id: n.id, noteNumber: n.noteNumber, heading: n.heading }));
}

function statementRefs(model: DocumentModel, overrides: DocOverrides) {
  const view = prepareCanonicalDocumentView(model, overrides);
  return view.statements.flatMap((s) =>
    s.lines
      .filter((l) => l.note_ref != null && l.note_ref !== '')
      .map((l) => ({ statement: s.statement_type, line: l.line_code, ref: Number(l.note_ref) })),
  );
}

const scenarios = (): Array<[string, DocumentModel]> => [
  ['v16 sample', buildV16SampleModel()],
  ...allRegressionScenarioIds().map((id) => [id, buildRegressionScenarioModel(id)] as [string, DocumentModel]),
];

describe('the note register is the printed numbering', () => {
  it.each(scenarios())('%s: the register and the printed document agree, 1 to N', (_name, model) => {
    const overrides = emptyOverrides();
    const register = buildNoteRegister(model, overrides);
    const printed = printedNumbers(model, overrides);

    expect(register.notes.map((n) => [n.id, n.noteNumber])).toEqual(printed.map((n) => [n.id, n.noteNumber]));
    expect(register.notes.map((n) => n.noteNumber)).toEqual(register.notes.map((_, i) => i + 1));
    for (const n of printed) expect(n.heading.startsWith(`Note ${n.noteNumber}. `)).toBe(true);
  });

  it.each(scenarios())('%s: every statement reference lands on a printed note that explains it', (_name, model) => {
    const overrides = emptyOverrides();
    const register = buildNoteRegister(model, overrides);
    const refs = statementRefs(model, overrides);
    for (const r of refs) {
      const note = register.notes.find((n) => n.noteNumber === r.ref);
      expect(note, `${r.statement} ${r.line} refers to Note ${r.ref}`).toBeDefined();
      expect(register.forLine(r.line)?.id).toBe(note!.id);
    }
  });

  it('hiding a referenced note renumbers the rest and leaves no reference to it', () => {
    const model = buildV16SampleModel();
    const before = buildNoteRegister(model, emptyOverrides());
    const ppe = before.byCode.get('DISC.PPE');
    expect(ppe).toBeDefined();
    expect(statementRefs(model, emptyOverrides()).some((r) => r.line === 'sfp.ppe')).toBe(true);

    const hidden: DocOverrides = { ...emptyOverrides(), hidden: { [ppe!.id]: true } };
    const after = buildNoteRegister(model, hidden);
    expect(after.byId.has(ppe!.id)).toBe(false);
    expect(after.notes.map((n) => n.noteNumber)).toEqual(after.notes.map((_, i) => i + 1));
    // The statement line no longer points anywhere, rather than at a note that is not there.
    expect(statementRefs(model, hidden).some((r) => r.line === 'sfp.ppe')).toBe(false);
    // Every note after it moved up by one, and the statements followed.
    for (const n of after.notes) {
      const was = before.byId.get(n.id)!.noteNumber;
      expect(n.noteNumber).toBe(was > ppe!.noteNumber ? was - 1 : was);
    }
    for (const r of statementRefs(model, hidden)) {
      expect(after.notes.some((n) => n.noteNumber === r.ref)).toBe(true);
    }
  });

  it('moving a note renumbers it and every reference to it', () => {
    const model = buildV16SampleModel();
    const before = buildNoteRegister(model, emptyOverrides());
    const ids = before.notes.map((n) => n.id);
    // Move the last note to the front, as the properties panel would.
    const moved = [ids[ids.length - 1], ...ids.slice(0, -1)];
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      order: Object.fromEntries(moved.map((id, i) => [id, i])),
    };
    const after = buildNoteRegister(model, overrides);
    expect(after.notes.map((n) => n.id)).toEqual(moved);
    expect(after.notes.map((n) => n.noteNumber)).toEqual(moved.map((_, i) => i + 1));
    expect(printedNumbers(model, overrides).map((n) => n.id)).toEqual(moved);
    for (const r of statementRefs(model, overrides)) {
      expect(after.forLine(r.line)?.noteNumber).toBe(r.ref);
    }
  });

  it('placing a paragraph inside a note does not renumber the notes', () => {
    const model = buildV16SampleModel();
    const before = buildNoteRegister(model, emptyOverrides());
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      order: { 'DISC.PPE:paragraph:P1': 20, 'DISC.PPE:paragraph:P2': 10 },
    };
    const after = buildNoteRegister(model, overrides);
    expect(after.notes.map((n) => [n.id, n.noteNumber])).toEqual(before.notes.map((n) => [n.id, n.noteNumber]));
  });

  it('an arranged order leaves no gap where the engine withholds a note', () => {
    // Pick a scenario in which the engine withholds at least one note.
    const found = scenarios().find(([, m]) => buildNoteRegister(m, emptyOverrides()).withheld.size > 0);
    expect(found, 'a scenario with a withheld note').toBeDefined();
    const model = found![1];
    const everyNote = model.notes.map((n) => n.id);
    const overrides: DocOverrides = {
      ...emptyOverrides(),
      order: Object.fromEntries(everyNote.map((id, i) => [id, i])),
    };
    const register = buildNoteRegister(model, overrides);
    expect(register.notes.map((n) => n.noteNumber)).toEqual(register.notes.map((_, i) => i + 1));
    const printed = printedNumbers(model, overrides);
    expect(printed.map((n) => n.noteNumber)).toEqual(printed.map((_, i) => i + 1));
    for (const id of register.withheld.keys()) expect(register.byId.has(id)).toBe(false);
  });
});

describe('statement lines find the note that explains them', () => {
  it('prefers the note that exists, and never names one that does not', () => {
    expect(disclosureCodeForLine('sfp.cash', ['DISC.CASH', 'DISC.CASHFLOW'])).toBe('DISC.CASH');
    expect(disclosureCodeForLine('sfp.cash', ['DISC.CASHFLOW'])).toBe('DISC.CASHFLOW');
    expect(disclosureCodeForLine('sfp.cash', ['DISC.PPE'])).toBeNull();
    expect(disclosureCodeForLine('sfp.issued_capital', ['DISC.SHARECAPITAL'])).toBe('DISC.SHARECAPITAL');
    expect(disclosureCodeForLine('perf.operating_expenses', ['DISC.OPERATINGEXPENSES'])).toBe(
      'DISC.OPERATINGEXPENSES',
    );
    // Section subtotals are not the operating-expense line.
    expect(disclosureCodeForLine('perf.expenses.operating_expenses.subtotal', ['DISC.OPERATINGEXPENSES'])).toBeNull();
  });
});

describe('the printed document links each note reference to its note', () => {
  type TextOp = { x: number; y: number; text: string };

  function parsePdf(pdf: string) {
    const objects = new Map<number, string>();
    for (const m of pdf.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) objects.set(Number(m[1]), m[2]);
    const kids = /\/Kids \[ ([^\]]+) \]/.exec(objects.get(2)!)![1].match(/\d+(?= 0 R)/g)!.map(Number);
    return kids.map((pageId) => {
      const body = objects.get(pageId)!;
      const content = objects.get(Number(/\/Contents (\d+) 0 R/.exec(body)![1]))!;
      const texts: TextOp[] = [...content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj/g)].map(
        (t) => ({ x: Number(t[1]), y: Number(t[2]), text: t[3] }),
      );
      const annotIds = (/\/Annots \[([^\]]*)\]/.exec(body)?.[1].match(/\d+(?= 0 R)/g) || []).map(Number);
      const links = annotIds.map((id) => {
        const a = objects.get(id)!;
        const rect = /\/Rect \[([^\]]+)\]/.exec(a)![1].split(' ').map(Number);
        return { rect, destPage: Number(/\/Dest \[(\d+) 0 R/.exec(a)![1]) };
      });
      return { pageId, texts, links };
    });
  }

  it('every note number on a statement jumps to the page carrying that note', () => {
    const model = buildV16SampleModel();
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    const pages = parsePdf(renderStatutoryPdf(view));
    const byId = new Map(pages.map((p) => [p.pageId, p]));

    let checked = 0;
    for (const page of pages) {
      for (const link of page.links) {
        const [x1, y1, x2, y2] = link.rect;
        const label = page.texts.find((t) => t.x >= x1 - 1 && t.x <= x2 && t.y >= y1 && t.y <= y2);
        if (!label || !/^\d+$/.test(label.text)) continue; // a contents entry
        const target = byId.get(link.destPage)!;
        expect(
          target.texts.some((t) => t.text.startsWith(`Note ${label.text}. `)),
          `link "${label.text}" lands on its note`,
        ).toBe(true);
        checked += 1;
      }
    }
    const refs = view.statements.flatMap((s) =>
      s.lines.filter((l) => lineRole(l) === 'item' && l.note_ref != null && l.note_ref !== ''),
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(checked).toBe(refs.length);
  });
});

describe('statement presentation', () => {
  it('heads the columns with the current year and then the one before it', () => {
    expect(reportingYears({ end_date: '2027-02-28' })).toEqual({ current: '2027', comparative: '2026' });
    expect(reportingYears({ label: 'FY2026' })).toEqual({ current: '2026', comparative: '2025' });
    expect(reportingYears(null)).toEqual({ current: 'Current year', comparative: 'Prior year' });
  });

  it('tells headings, items, subtotals, totals and grand totals apart', () => {
    expect(lineRole({ line_code: 'sfp.assets.current_assets', label: 'Current Assets', is_header: true })).toBe('heading');
    expect(lineRole({ line_code: 'sfp.cash', label: 'Cash' })).toBe('item');
    expect(lineRole({ line_code: 'sfp.assets.current_assets.subtotal', label: 'Total Current Assets' })).toBe('subtotal');
    expect(lineRole({ line_code: 'sfp.total_liabilities', label: 'Total Liabilities' })).toBe('total');
    expect(lineRole({ line_code: 'sfp.total_assets', label: 'Total Assets', is_total: true })).toBe('grand_total');
    expect(lineRole({ line_code: 'perf.result', label: 'Profit', is_grand_total: true })).toBe('grand_total');
    expect(lineRole({ line_code: 'eq.opening', label: 'Opening Equity', is_total: true })).toBe('item');
    expect(lineRole({ line_code: 'eq.closing', label: 'Closing Equity', is_total: true })).toBe('grand_total');
  });

  it('writes a figure the way the notes write it', () => {
    const plain = (s: string) => s.replace(/\u00a0/g, ' ');
    expect(plain(formatStatementFigure(2540000, 'item'))).toBe('2 540 000,00');
    expect(plain(formatStatementFigure(-1819850, 'total'))).toBe('(1 819 850,00)');
    expect(formatStatementFigure(0, 'item')).toBe('–');
    // Not stated is not the same claim as nil.
    expect(formatStatementFigure(null, 'total')).toBe('');
    expect(formatStatementFigure(100, 'heading')).toBe('');
  });

  it('gives every statement the comparative column when the set has one', () => {
    expect(
      documentHasComparatives([
        { lines: [{ prior_amount: null }] },
        { lines: [{ prior_amount: 5 }] },
      ]),
    ).toBe(true);
    expect(documentHasComparatives([{ lines: [{ prior_amount: 5, is_header: true }] }])).toBe(false);
  });

  it('reads a printed figure back as the figure it is', () => {
    // Stripping all but digits once turned 2 540 000,00 into 254 000 000.
    expect(parseFigure('2 540 000,00')).toBe(2540000);
    expect(parseFigure('2,540,000.00')).toBe(2540000);
    expect(parseFigure('(140 000,00)')).toBe(-140000);
    expect(parseFigure('[ — ]')).toBeNull();
    expect(parseFigure('Land')).toBeNull();
  });

  it('prints a framework table with years and the document figures, leaving words alone', () => {
    const rows = presentTableRows(
      [
        ['Description', 'Current year', 'Prior year'],
        ['Trade receivables', '740,650.00', '(248,000.00)'],
        ['Useful life (years)', '5', '2025'],
      ],
      { current: '2026', comparative: '2025' },
    );
    expect(rows[0]).toEqual(['Description', '2026', '2025']);
    expect(rows[1].map((c) => c.replace(/\u00a0/g, ' '))).toEqual(['Trade receivables', '740 650,00', '(248 000,00)']);
    expect(rows[2]).toEqual(['Useful life (years)', '5', '2025']);
  });
});
