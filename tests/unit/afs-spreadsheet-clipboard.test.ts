/**
 * The clipboard, and the one way it refuses to behave like Excel.
 *
 * Copy, cut and paste have to work the way they work everywhere else, including
 * to and from Excel itself. The exception is overwriting: a figure drawn from
 * the ledger is not the preparer's to replace by pasting over it. If a paste
 * could silently turn a linked cell into a typed-in number, the note would stop
 * agreeing with the trial balance and nothing on screen would say so.
 */
import { describe, it, expect } from 'vitest';
import {
  blockToTsv,
  clearBlock,
  describePaste,
  pasteBlock,
  readBlock,
  tsvToBlock,
} from '../../src/lib/financialStatements/disclosures/clipboard';
import { MONEY } from '../../src/lib/financialStatements/disclosures/types';
import type { Cell, DisclosureRow } from '../../src/lib/financialStatements/disclosures/types';

function cell(value: Cell['value'], origin: Cell['origin'] = 'manual', format = MONEY): Cell {
  return { value, origin, format };
}

/** A property note as the engine produces it: a label, a linked figure, a total. */
function rows(): DisclosureRow[] {
  return [
    { key: 'land', cells: [cell('Land and buildings', 'manual', {}), cell(1_200_000, 'linked'), cell(1_100_000, 'linked')] },
    { key: 'vehicles', cells: [cell('Motor vehicles', 'manual', {}), cell(340_000, 'linked'), cell(315_000, 'linked')] },
    {
      key: 'total',
      kind: 'total',
      cells: [
        cell('Carrying amount', 'manual', {}),
        { value: 1_540_000, origin: 'calculated', format: MONEY, sums: ['land', 'vehicles'] },
        { value: 1_415_000, origin: 'calculated', format: MONEY, sums: ['land', 'vehicles'] },
      ],
    },
  ];
}

describe('copying out', () => {
  it('writes tab-separated text, so it lands in Excel as a grid', () => {
    const tsv = blockToTsv(readBlock(rows(), { top: 0, left: 0, bottom: 1, right: 2 }));
    const lines = tsv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].split('\t')).toHaveLength(3);
    expect(lines[0]).toContain('Land and buildings');
  });

  it('copies the figure as it is displayed, separators and all', () => {
    const tsv = blockToTsv(readBlock(rows(), { top: 0, left: 1, bottom: 0, right: 1 }));
    // en-ZA separates thousands with a non-breaking space.
    expect(tsv.replace(/\u00a0/g, ' ')).toBe('1 200 000,00');
  });

  it('sends a nil as a blank rather than the dash it displays', () => {
    const nil: DisclosureRow[] = [{ key: 'n', cells: [cell(0, 'linked')] }];
    expect(blockToTsv(readBlock(nil, { top: 0, left: 0, bottom: 0, right: 0 }))).toBe('');
  });
});

describe('reading text from outside', () => {
  it('parses a block pasted from a spreadsheet', () => {
    const block = tsvToBlock('Retentions\t12 500,00\nDeposits\t3 000,00');
    expect(block).toHaveLength(2);
    expect(block[0][0].value).toBe('Retentions');
    expect(block[0][1].value).toBe(12500);
  });

  it('treats everything pasted in as the preparer’s own', () => {
    // Text from outside cannot claim to come from this ledger.
    const block = tsvToBlock('anything\t1');
    expect(block.flat().every((c) => c.origin === 'manual')).toBe(true);
  });
});

describe('pasting in', () => {
  it('fills cells the preparer owns', () => {
    const result = pasteBlock(rows(), { row: 0, col: 0 }, tsvToBlock('Freehold land'), { width: 3 });
    expect(result.rows[0].cells[0].value).toBe('Freehold land');
    expect(result.applied).toBe(1);
    expect(result.kept).toBe(0);
  });

  it('will not paste over a figure that comes from the ledger', () => {
    const before = rows();
    const result = pasteBlock(before, { row: 0, col: 1 }, tsvToBlock('999'), { width: 3 });
    expect(result.rows[0].cells[1].value).toBe(1_200_000);
    expect(result.rows[0].cells[1].origin).toBe('linked');
    expect(result.kept).toBe(1);
    expect(result.applied).toBe(0);
  });

  it('will not paste over a calculated total either', () => {
    const result = pasteBlock(rows(), { row: 2, col: 1 }, tsvToBlock('1'), { width: 3 });
    expect(result.rows[2].cells[1].value).toBe(1_540_000);
    expect(result.rows[2].cells[1].origin).toBe('calculated');
    expect(result.kept).toBe(1);
  });

  it('still takes the formatting onto a protected cell', () => {
    // Presentation is always the preparer's; only the figure is the ledger's.
    const block = [[{ value: 1, origin: 'manual' as const, format: { bold: true } }]];
    const result = pasteBlock(rows(), { row: 0, col: 1 }, block, { width: 3 });
    expect(result.rows[0].cells[1].format?.bold).toBe(true);
    expect(result.rows[0].cells[1].value).toBe(1_200_000);
  });

  it('says out loud what it refused', () => {
    const result = pasteBlock(rows(), { row: 0, col: 1 }, tsvToBlock('1\t2'), { width: 3 });
    const notice = describePaste(result);
    expect(notice?.protective).toBe(true);
    expect(notice?.message).toMatch(/keep their figure from the ledger/);
  });

  it('says nothing when nothing was refused', () => {
    const result = pasteBlock(rows(), { row: 0, col: 0 }, tsvToBlock('A'), { width: 3 });
    expect(describePaste(result)).toBeNull();
  });

  it('grows rows to fit, so a long schedule is not silently truncated', () => {
    const result = pasteBlock(rows(), { row: 2, col: 0 }, tsvToBlock('a\nb\nc\nd'), { width: 3 });
    expect(result.rows).toHaveLength(6);
    expect(result.addedRows).toBe(3);
    expect(result.rows[5].cells[0].value).toBe('d');
    // The rows it added are the preparer's to edit.
    expect(result.rows[5].cells[0].origin).toBe('manual');
  });

  it('clips a block wider than the table and counts what it dropped', () => {
    const result = pasteBlock(rows(), { row: 0, col: 2 }, tsvToBlock('a\tb\tc'), { width: 3 });
    expect(result.clippedColumns).toBe(2);
    expect(result.rows[0].cells).toHaveLength(3);
    expect(describePaste(result)?.message).toMatch(/wider than the table/);
  });

  it('leaves the original rows untouched', () => {
    const before = rows();
    pasteBlock(before, { row: 0, col: 0 }, tsvToBlock('changed'), { width: 3 });
    expect(before[0].cells[0].value).toBe('Land and buildings');
  });
});

describe('cutting and clearing', () => {
  it('empties the preparer’s cells and keeps the ledger’s', () => {
    const { rows: after, kept } = clearBlock(rows(), { top: 0, left: 0, bottom: 0, right: 2 });
    expect(after[0].cells[0].value).toBeNull();
    expect(after[0].cells[1].value).toBe(1_200_000);
    expect(kept).toBe(2);
  });
});

describe('a round trip inside the editor', () => {
  it('brings the formatting back with it', () => {
    const source: DisclosureRow[] = [
      { key: 'r', cells: [{ value: 'Heading', origin: 'manual', format: { bold: true, align: 'center' } }] },
    ];
    const block = readBlock(source, { top: 0, left: 0, bottom: 0, right: 0 });
    const target: DisclosureRow[] = [{ key: 't', cells: [{ value: null, origin: 'manual' }] }];
    const result = pasteBlock(target, { row: 0, col: 0 }, block, { width: 1 });
    expect(result.rows[0].cells[0].value).toBe('Heading');
    expect(result.rows[0].cells[0].format?.bold).toBe(true);
    expect(result.rows[0].cells[0].format?.align).toBe('center');
  });
});
