/**
 * What prints in a note, and where the page breaks fall.
 *
 * Framework notes carry every line the framework might ask for. A line that is
 * nothing but placeholders is held back until the preparer fills it in or
 * switches it on, and the preparer can switch any line either way. Notes are
 * measured before they are placed, so one that fits on a page is never split.
 */
import { describe, expect, it } from 'vitest';
import {
  applyLineChoices,
  isPlaceholderLine,
  lineKey,
} from '../../src/lib/financialStatements/publication/lineItems';
import { LayoutEngine } from '../../src/lib/financialStatements/publication/render/layoutEngine';
import { CONTENT_BOTTOM } from '../../src/lib/financialStatements/publication/render/pdfKit';
import { emptyOverrides, type DocOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { buildV16SampleModel } from '../../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import { renderStatutoryPdf } from '../../src/lib/financialStatements/publication/render/statutoryPdf';

const table = (rows: string[][]) => ({ type: 'table' as const, title: 'Categories of financial instruments', rows });

describe('lines that print', () => {
  const rows = [
    ['Description', '2026', '2025'],
    ['Trade and other receivables', '740 650,00', '248 000,00'],
    ['Basic financial assets at amortised cost - other', '[ — ]', '[ — ]'],
    ['Financial assets at fair value', '[ - ]', ''],
  ];

  it('knows a line with a figure still waiting for input', () => {
    expect(isPlaceholderLine(rows[2])).toBe(true);
    expect(isPlaceholderLine(rows[3])).toBe(true);
    expect(isPlaceholderLine(rows[1])).toBe(false);
    // Only the closing balance known: not yet a movement analysis.
    expect(isPlaceholderLine(['Borrowings', '[ — ]', '[ — ]', '1 405 000,00'])).toBe(true);
    // A blank line is not a placeholder: it may be a caption.
    expect(isPlaceholderLine(['Cost', '', ''])).toBe(false);
  });

  it('holds placeholder lines back by default and prints the rest', () => {
    const { blocks, items } = applyLineChoices('DISC.FININST', [table(rows)], {});
    expect((blocks[0] as { rows: string[][] }).rows.map((r) => r[0])).toEqual([
      'Description',
      'Trade and other receivables',
    ]);
    expect(items.filter((i) => !i.printed).map((i) => i.label)).toEqual([
      'Basic financial assets at amortised cost - other',
      'Financial assets at fair value',
    ]);
  });

  it('prints or withholds any line the preparer chooses', () => {
    const on = lineKey('DISC.FININST', 'Categories of financial instruments', 'Financial assets at fair value');
    const off = lineKey('DISC.FININST', 'Categories of financial instruments', 'Trade and other receivables');
    const { blocks } = applyLineChoices('DISC.FININST', [table(rows)], { [on]: true, [off]: false });
    expect((blocks[0] as { rows: string[][] }).rows.map((r) => r[0])).toEqual([
      'Description',
      'Financial assets at fair value',
    ]);
  });

  it('leaves out a table with nothing left to print, heading and all', () => {
    const empty = table([rows[0], rows[2], rows[3]]);
    const { blocks } = applyLineChoices('DISC.FININST', [{ type: 'paragraph', text: 'Intro' }, empty], {});
    expect(blocks).toEqual([{ type: 'paragraph', text: 'Intro' }]);
  });

  it('keeps lines apart that share wording in one table', () => {
    const { items } = applyLineChoices('DISC.X', [table([rows[0], ['Land', '1', '1'], ['Land', '2', '2']])], {});
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });

  it('prints no placeholder in the document unless someone switches it on', () => {
    const model = buildV16SampleModel();
    const view = prepareCanonicalDocumentView(model, emptyOverrides());
    const printed = view.notes.flatMap((n) => n.blocks).filter((b) => b.type === 'table');
    for (const b of printed) {
      for (const row of (b as { rows: string[][] }).rows.slice(1)) expect(isPlaceholderLine(row)).toBe(false);
    }
    const heldBack = view.notes.flatMap((n) => n.lineItems).filter((i) => i.placeholder);
    expect(heldBack.length).toBeGreaterThan(0);

    // Switch one on and it prints.
    const choice = heldBack[0];
    const overrides: DocOverrides = { ...emptyOverrides(), lines: { [choice.key]: true } };
    const again = prepareCanonicalDocumentView(model, overrides);
    const labels = again.notes
      .flatMap((n) => n.blocks)
      .flatMap((b) => (b.type === 'table' ? b.rows.map((r) => r[0]) : []));
    expect(labels).toContain(choice.label);
  });
});

describe('where the page breaks fall', () => {
  const meta = {
    companyName: 'Test Co',
    registrationNumber: null,
    documentTitle: 'AFS',
    periodLabel: '2026',
    issueDateLong: '',
  };

  it('moves a block that fits on a page, rather than splitting it', () => {
    const engine = new LayoutEngine(meta);
    engine.y = CONTENT_BOTTOM + 100;
    engine.keepTogether(300);
    expect(engine.pageIndex).toBe(1);
    expect(engine.atPageTop).toBe(true);
  });

  it('lets a block taller than a page flow, rather than leave a blank gap', () => {
    const engine = new LayoutEngine(meta);
    engine.y = CONTENT_BOTTOM + 100;
    engine.keepTogether(engine.pageCapacity + 50);
    expect(engine.pageIndex).toBe(0);
  });

  it('never starts a page it is already at the top of', () => {
    const engine = new LayoutEngine(meta);
    engine.keepTogether(engine.pageCapacity);
    expect(engine.pageIndex).toBe(0);
  });

  it('measures without drawing or breaking pages', () => {
    const engine = new LayoutEngine(meta);
    const height = engine.measure((e) => {
      for (let i = 0; i < 200; i += 1) e.paragraph(`Line ${i}`);
    });
    expect(height).toBeGreaterThan(engine.pageCapacity);
    expect(engine.pageIndex).toBe(0);
  });

  it('never prints a note heading under its own "(continued)" line', () => {
    const pdf = renderStatutoryPdf(prepareCanonicalDocumentView(buildV16SampleModel(), emptyOverrides()));
    const pages = pdf.split(/\/Type \/Page /);
    for (const page of pages) {
      const texts = [...page.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map((m) => m[1]);
      const continued = texts.find((t) => t.endsWith(' (continued)'));
      if (!continued) continue;
      const heading = continued.replace(/ \(continued\)$/, '');
      expect(texts.includes(heading), `${heading} is continued, so it cannot start here`).toBe(false);
    }
  });
});
