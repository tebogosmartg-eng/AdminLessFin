/**
 * The narrative front matter is content the preparation engine owns.
 *
 * By default every section carries the generated statutory wording. When the
 * preparer writes their own, the engagement stores it, the view resolves it,
 * and both renderers print exactly that — the renderers take no wording
 * decisions of their own.
 */
import { describe, expect, it } from 'vitest';
import { emptyOverrides } from '../../src/lib/financialStatements/document/documentStore';
import { buildV16SampleModel } from '../../src/lib/financialStatements/composition/fixtures/v16SampleModel';
import {
  practitionerReportTitle,
  prepareCanonicalDocumentView,
} from '../../src/lib/financialStatements/publication/canonicalDocumentView';
import { renderStatutoryPdf } from '../../src/lib/financialStatements/publication/render/statutoryPdf';

describe('narrative front matter', () => {
  it('carries the generated statutory wording until the preparer writes their own', () => {
    const view = prepareCanonicalDocumentView(buildV16SampleModel(), emptyOverrides());
    expect(view.frontMatter.responsibilities.authored).toBe(false);
    expect(view.frontMatter.responsibilities.blocks.length).toBeGreaterThanOrEqual(4);
    expect(view.frontMatter.directorsReport.authored).toBe(false);
    expect(view.frontMatter.directorsReport.blocks.some((b) => /nature of business/i.test(b.heading ?? ''))).toBe(
      true,
    );
    expect(view.frontMatter.approval.blocks[0].body).toMatch(/approved by the board/i);
  });

  it('prints the wording the preparer saved, word for word', () => {
    const overrides = emptyOverrides();
    overrides.narratives['front:directors_report'] = [
      { body: 'The directors submit their report for the year.' },
      { heading: '1. Dividends', body: 'A dividend of R777 was declared during the year under review.' },
    ];
    const view = prepareCanonicalDocumentView(buildV16SampleModel(), overrides);
    expect(view.frontMatter.directorsReport.authored).toBe(true);
    expect(view.frontMatter.directorsReport.blocks).toHaveLength(2);
    expect(view.frontMatter.directorsReport.blocks[1].heading).toBe('1. Dividends');

    const pdf = renderStatutoryPdf(view);
    expect(pdf).toContain('A dividend of R777 was declared during the year under review.');
    // The other sections keep their generated wording.
    expect(view.frontMatter.responsibilities.authored).toBe(false);
  });

  it('returns to the generated wording when the authored text is cleared', () => {
    const overrides = emptyOverrides();
    overrides.narratives['front:directors_report'] = [];
    const view = prepareCanonicalDocumentView(buildV16SampleModel(), overrides);
    expect(view.frontMatter.directorsReport.authored).toBe(false);
    expect(view.frontMatter.directorsReport.blocks.length).toBeGreaterThan(1);
  });

  it('titles the practitioner report by the level of assurance', () => {
    expect(practitionerReportTitle('Audited')).toBe("Independent Auditor's Report");
    expect(practitionerReportTitle('Independently reviewed')).toBe("Independent Reviewer's Report");
    expect(practitionerReportTitle('Compilation engagement')).toBe("Practitioner's Compilation Report");
    expect(practitionerReportTitle('')).toBe("Independent Auditor's Report");
  });

  it('honours a title override on a front-matter section', () => {
    const overrides = emptyOverrides();
    overrides.titleOverrides['front:independent_auditor'] = "Accounting Officer's Report";
    const view = prepareCanonicalDocumentView(buildV16SampleModel(), overrides);
    expect(view.frontMatter.practitionerReport.title).toBe("Accounting Officer's Report");
  });
});
