/**
 * What the editor shows, the preview and the PDF must print.
 *
 * The generated disclosures store a row as `{ cells: [...] }`, each cell
 * carrying its own value, origin and money format. The reader that feeds the
 * preview, the workspace PDF and the published DOCX only understood bare arrays
 * and plain keyed objects: given a disclosure row it looked up column labels as
 * if they were object keys, found nothing, and printed a grid of empty strings.
 *
 * So a property note that was populated on screen printed blank — and the two
 * places a reviewer would look to check the note disagreed with each other.
 *
 * There were two copies of this reader, character for character, and the PDF
 * went through the one that was not fixed first. They are now one function, and
 * this is where its behaviour is pinned.
 */
import { describe, it, expect } from 'vitest';
import { tableToCompositionRows as tableToRows } from '../../src/lib/financialStatements/composition/disclosureComponents';
import { MONEY } from '../../src/lib/financialStatements/disclosures/types';

const columns = [
  { label: 'Description', width: 240, align: 'left' },
  { label: '2026', width: 120, align: 'right', basis: 'closing' },
  { label: '2025', width: 120, align: 'right', basis: 'prior' },
];

const disclosureRows = [
  {
    key: 'land',
    cells: [
      { value: 'Land and buildings', origin: 'manual', format: { align: 'left' } },
      { value: 1_200_000, origin: 'linked', format: MONEY },
      { value: 1_100_000, origin: 'linked', format: MONEY },
    ],
  },
  {
    key: 'depreciation',
    cells: [
      { value: 'Accumulated depreciation', origin: 'manual', format: { align: 'left' } },
      { value: -85_000, origin: 'linked', format: MONEY },
      { value: 0, origin: 'linked', format: MONEY },
    ],
  },
];

describe('a generated disclosure table on its way to the page', () => {
  it('prints its figures instead of a grid of blanks', () => {
    const out = tableToRows(columns, disclosureRows);
    expect(out[0]).toEqual(['Description', '2026', '2025']);
    expect(out[1][0]).toBe('Land and buildings');
    expect(out[1][1].replace(/\u00a0/g, ' ')).toBe('1 200 000,00');
    expect(out).toHaveLength(3);
  });

  it('keeps the conventions of a set of financial statements', () => {
    const out = tableToRows(columns, disclosureRows);
    // A negative in brackets, a nil as a dash — the same as in the editor.
    expect(out[2][1].replace(/\u00a0/g, ' ')).toBe('(85 000,00)');
    expect(out[2][2]).toBe('–');
  });

  it('lines the columns up under a merged cell', () => {
    const merged = [
      {
        key: 'heading',
        cells: [
          { value: 'Cost', origin: 'manual', colSpan: 2 },
          { value: null, origin: 'manual', colSpan: 0 },
          { value: null, origin: 'manual' },
        ],
      },
    ];
    expect(tableToRows(columns, merged)[1]).toEqual(['Cost', '', '']);
  });

  it('still reads the shapes stored before the disclosure engine', () => {
    // Older tables were arrays of strings, or objects keyed by column label.
    expect(tableToRows(['A', 'B'], [['one', 'two']])[1]).toEqual(['one', 'two']);
    expect(tableToRows([{ label: 'A' }], [{ A: 'kept' }])[1]).toEqual(['kept']);
  });

  it('prints a row the preparer added in the editor', () => {
    const withAuthored = [
      ...disclosureRows,
      { key: 'pasted-1', cells: [{ value: 'Retention debtor', origin: 'manual' }] },
    ];
    const out = tableToRows(columns, withAuthored);
    expect(out[3]).toEqual(['Retention debtor']);
  });
});
