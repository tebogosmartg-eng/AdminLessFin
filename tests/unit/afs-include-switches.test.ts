/**
 * The preparer decides what the AFS contains. The engine proposes a default —
 * a note the materiality rules withhold, a policy the books give no occasion
 * for — and every one of those can be switched on (or off) in the editor,
 * and the switch reaches every output.
 */
import { describe, expect, it } from 'vitest';
import { buildV16SampleModel } from '../../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import {
  emptyOverrides,
  includeKey,
  lineLabelKey,
  scheduleLineKey,
  type DocOverrides,
} from '../../src/lib/financialStatements/document/documentStore';
import type { DocumentModel } from '../../src/lib/financialStatements/document/documentModel';
import { prepareCanonicalDocumentView } from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import { buildCanonicalPublishPackage } from '../../src/lib/financialStatements/publication/canonicalDocumentPublish';
import { buildNoteRegister } from '../../src/lib/financialStatements/document/noteRegister';

const withChoices = (choices: Partial<DocOverrides>): DocOverrides => ({ ...emptyOverrides(), ...choices });

function model(): DocumentModel {
  const m = buildV16SampleModel();
  return {
    ...m,
    detailedIncomeStatement: {
      id: 'supp:detailed-income-statement',
      title: 'Detailed Income Statement',
      rows: [
        ['', '', ''],
        ['Revenue', '', ''],
        ['Sales', '1 000', '900'],
      ],
      kinds: ['columns', 'header', 'data'],
    },
  };
}

function decodePdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString('latin1');
  return [...raw.matchAll(/\((?:\\.|[^\\)])*\)/g)]
    .map((m) => m[0].slice(1, -1).replace(/\\([()\\])/g, '$1'))
    .join('\n');
}

describe('Notes: every note can be switched on or off', () => {
  it('a note the books do not call for is available, off by default, and prints once switched on', () => {
    const m = model();
    const off = m.notes.find((n) => n.applies === false);
    expect(off, 'the sample carries an optional note whose condition is unmet').toBeDefined();

    const byDefault = prepareCanonicalDocumentView(m, emptyOverrides());
    expect(byDefault.notes.some((n) => n.disclosureCode === off!.disclosure_code)).toBe(false);
    // The register tells the preparer why, and that they may switch it on.
    const reg = buildNoteRegister(m, emptyOverrides());
    expect(reg.withheld.get(off!.id)).toMatch(/Switch it on/);

    const on = withChoices({ include: { [includeKey('note', off!.disclosure_code)]: true } });
    const view = prepareCanonicalDocumentView(m, on);
    expect(view.notes.some((n) => n.disclosureCode === off!.disclosure_code)).toBe(true);
  });

  it('a note the engine withheld prints when the preparer switches it on', () => {
    const m = model();
    // The basis of preparation is presented within the policies by default.
    const basis = m.notes.find((n) => n.disclosure_code === 'DISC.BASIS');
    expect(basis).toBeDefined();
    expect(prepareCanonicalDocumentView(m, emptyOverrides()).notes.some((n) => n.disclosureCode === 'DISC.BASIS')).toBe(false);
    const view = prepareCanonicalDocumentView(
      m,
      withChoices({ include: { [includeKey('note', 'DISC.BASIS')]: true } }),
    );
    expect(view.notes.some((n) => n.disclosureCode === 'DISC.BASIS')).toBe(true);
  });

  it('a note that is only available, switched off, changes nothing that prints', () => {
    const m = model();
    // The framework's first-time adoption note is in the document, off.
    const fta = m.notes.find((n) => /transition|first.?time|fta/i.test(n.disclosure_code));
    expect(fta?.applies).toBe(false);
    const text = JSON.stringify(prepareCanonicalDocumentView(m, emptyOverrides()).notes);
    expect(text).not.toContain('First-time adoption adjustments');
  });

  it('a printed note switched off is left out, and the rest renumber', () => {
    const m = model();
    const before = prepareCanonicalDocumentView(m, emptyOverrides());
    const first = before.notes[0];
    const view = prepareCanonicalDocumentView(
      m,
      withChoices({ include: { [includeKey('note', first.disclosureCode!)]: false } }),
    );
    expect(view.notes.some((n) => n.disclosureCode === first.disclosureCode)).toBe(false);
    expect(view.notes.length).toBe(before.notes.length - 1);
  });
});

describe('Policies: every framework policy is available', () => {
  it('a policy the books give no occasion for is off by default and prints once switched on', () => {
    const m = model();
    const off = m.policySets[0].policies.find((p) => p.applies === false);
    expect(off).toBeDefined();
    const titles = (v: ReturnType<typeof prepareCanonicalDocumentView>) =>
      v.accountingPolicies.map((p) => p.title).join('|');
    expect(titles(prepareCanonicalDocumentView(m, emptyOverrides()))).not.toContain(off!.title);
    const view = prepareCanonicalDocumentView(
      m,
      withChoices({ include: { [includeKey('policy', off!.policy_code)]: true } }),
    );
    expect(titles(view)).toContain(off!.title);
  });

  it('a printed policy switched off is left out', () => {
    const m = model();
    const printed = prepareCanonicalDocumentView(m, emptyOverrides()).accountingPolicies;
    const target = printed[printed.length - 1];
    const code = m.policySets[0].policies.find((p) => p.id === target.id)!.policy_code;
    const view = prepareCanonicalDocumentView(
      m,
      withChoices({ include: { [includeKey('policy', code)]: false } }),
    );
    expect(view.accountingPolicies.some((p) => p.id === target.id)).toBe(false);
  });
});

describe('Everything printed is editable', () => {
  it('a renamed statement line prints under the new caption; its figure is unchanged', () => {
    const m = model();
    const view = prepareCanonicalDocumentView(
      m,
      withChoices({ lineLabels: { [lineLabelKey('financial_position', 'sfp.inventories')]: 'Stock on hand' } }),
    );
    const sfp = view.statements.find((s) => s.statement_type === 'financial_position')!;
    const line = sfp.lines.find((l) => l.line_code === 'sfp.inventories')!;
    expect(line.label).toBe('Stock on hand');
    expect(line.amount).toBe(2100000);
  });

  it('the detailed income statement can be retitled, recaptioned or switched off', () => {
    const m = model();
    const id = 'supp:detailed-income-statement';
    const renamed = prepareCanonicalDocumentView(
      m,
      withChoices({
        titleOverrides: { [id]: 'Detailed statement of profit or loss' },
        lineLabels: { [scheduleLineKey(id, 'Sales')]: 'Sale of goods' },
      }),
    );
    const schedule = renamed.composition!.supplementarySchedules![0];
    expect(schedule.title).toBe('Detailed statement of profit or loss');
    expect(schedule.rows[2]).toEqual(['Sale of goods', '1 000', '900']);

    const off = prepareCanonicalDocumentView(m, withChoices({ include: { [includeKey('schedule', id)]: false } }));
    expect(off.composition!.supplementarySchedules).toHaveLength(0);
  });

  it("a policy's table and closing wording can be replaced or removed", () => {
    const m = model();
    const target = prepareCanonicalDocumentView(m, emptyOverrides()).accountingPolicies[1];
    const code = m.policySets[0].policies.find((p) => p.id === target.id)!.policy_code.toUpperCase();
    const view = prepareCanonicalDocumentView(
      m,
      withChoices({
        policyParts: {
          [code]: { table: [['Item', 'Useful life'], ['Vehicles', '5 years']], bodyAfter: 'Land is not depreciated.' },
        },
      }),
    );
    const p = view.accountingPolicies.find((x) => x.id === target.id)!;
    expect(p.table).toEqual([['Item', 'Useful life'], ['Vehicles', '5 years']]);
    expect(p.bodyAfter).toBe('Land is not depreciated.');
  });

  it('a front section switched off does not print; one retitled prints its new title', () => {
    const m = model();
    const choices = withChoices({
      include: { [includeKey('section', 'front:directors_report')]: false },
      titleOverrides: { 'front:independent_auditor': "Accounting Officer's Report" },
    });
    const view = prepareCanonicalDocumentView(m, choices);
    expect(view.frontMatter.directorsReport.included).toBe(false);
    expect(view.frontMatter.practitionerReport.title).toBe("Accounting Officer's Report");
    const text = decodePdfText(buildCanonicalPublishPackage(m, choices).pdfBytes);
    expect(text).not.toContain("Directors' Report");
    expect(text).toContain("Accounting Officer's Report");
  });
});
