/**
 * Professional Statutory Document composer (V14.0 / V15.0).
 *
 * Consumes the CanonicalDocumentView ONLY and lays out a client-ready statutory
 * Annual Financial Statements. V15.0 sequencing follows the Composition Engine
 * phases: Front Matter → Primary Statements → Accounting Policies → Notes →
 * Supplementary → Approval. Formatting spacing derives from composition metadata.
 */
import {
  asciiOnly,
  assemblePdf,
  CONTENT_L,
  CONTENT_R,
  CONTENT_TOP,
  PAGE_H,
  PAGE_W,
  PdfPage,
  textWidth,
  wrapText,
} from './pdfKit';
import { LayoutEngine, TYPE, type DocMeta } from './layoutEngine';
import { renderFinancialTable } from './tableEngine';
import { professionalLineLabel } from '../afsProfessionalPdf';
import {
  documentHasComparatives,
  formatStatementFigure,
  isTotalRole,
  lineIndent,
  lineRole,
  reportingYears,
  type LineRole,
} from '../statementPresentation';
import type {
  CanonicalDocumentView,
  CanonicalNote,
  CanonicalSignature,
  CanonicalStatement,
} from '../canonicalDocumentView';
import { renderCorporateInformationPresentationPdf } from './corporateInformationPdf';
import {
  approvalIntro,
  auditorsReportParagraphs,
  directorsReportParagraphs,
  directorsResponsibilitiesParagraphs,
  supplementaryScheduleParagraphs,
} from '../statutoryFrontMatter';
import type { EfsStatementLine } from '../../api';
import { spacingAfterPx } from '../../composition/publicationHints';

const NOTES_SECTION_TITLE = 'Notes to the Financial Statements';
const POLICIES_SECTION_TITLE = 'Significant Accounting Policies';

type TocEntry = { label: string; bodyIndex: number; page: number; indent?: number };

type StatementLine = EfsStatementLine;

/** The notes' anchor names, shared by the heading and every link to it. */
export function noteAnchor(noteNumber: number | string): string {
  return `note-${noteNumber}`;
}

function sectionAnchor(index: number): string {
  return `section-${index}`;
}

/**
 * One primary statement, laid out as an annual financial statement is:
 *
 *   label ............................ Notes     2026          2025
 *                                                   R             R
 *
 * The current year sits immediately after the notes and the comparative at
 * the margin. Totals carry a rule above their figures and the figure the
 * statement exists to state is double-ruled beneath. A note number is a link
 * to the note it names.
 */
function renderStatement(
  engine: LayoutEngine,
  stmt: CanonicalStatement,
  view: CanonicalDocumentView,
  showComp: boolean,
): void {
  engine.statementTitleBlock(stmt.title, stmt.periodCaption);
  engine.paragraph(view.currencyLabel, { size: TYPE.caption, font: 'oblique', gray: 0.4, spacingAfter: 8 });

  if (!stmt.lines.length) {
    engine.paragraph(
      'Figures will be presented in this statement once the trial balance for the engagement has been captured and the statement has been prepared.',
      { size: TYPE.caption, gray: 0.4 },
    );
    return;
  }

  const size = 9.5;
  const leading = size * 1.6;
  const amountColW = 88;
  const colGap = 14;
  const noteColW = 30;
  const years = reportingYears(view.period ?? { label: view.presentation.reportingPeriodLabel });
  const comparativeRight = CONTENT_R;
  const currentRight = showComp ? CONTENT_R - amountColW - colGap : CONTENT_R;
  const noteCenter = currentRight - amountColW - colGap - noteColW / 2;
  const labelRight = noteCenter - noteColW / 2 - 6;
  const figureColumns = showComp ? [currentRight, comparativeRight] : [currentRight];
  // Rules sit under the figures only, and only where there is a figure: a
  // rule over a blank reads as a total of nothing.
  const ruleUnder = (y: number, width: number, line: StatementLine, gray = 0.12) => {
    const values = showComp ? [line.amount, line.prior_amount] : [line.amount];
    figureColumns.forEach((right, i) => {
      if (values[i] == null) return;
      engine.page.line(right - amountColW + 12, y, right, y, width, gray);
    });
  };

  // Column headings: Notes, then the current year, then the comparative.
  engine.ensure(leading * 2.4);
  engine.page.textCenter(noteCenter, engine.y, 'Notes', { size: TYPE.caption, font: 'bold', gray: 0.35 });
  engine.page.textRight(currentRight, engine.y, years.current, { size: TYPE.caption, font: 'bold' });
  if (showComp) {
    engine.page.textRight(comparativeRight, engine.y, years.comparative, { size: TYPE.caption, font: 'bold' });
  }
  engine.y -= TYPE.caption * 1.15;
  for (const right of figureColumns) {
    engine.page.textRight(right, engine.y, 'R', { size: TYPE.small, font: 'oblique', gray: 0.45 });
  }
  engine.y -= TYPE.small * 0.9;
  engine.page.line(CONTENT_L, engine.y + 2, CONTENT_R, engine.y + 2, 0.8, 0.2);
  engine.y -= 9;

  let previous: LineRole | null = null;
  for (const raw of stmt.lines) {
    const line = raw as StatementLine;
    const role = lineRole(line);
    const heading = role === 'heading';
    const totalled = isTotalRole(role);
    const font = heading || totalled ? 'bold' : 'regular';
    const indent = heading ? 0 : lineIndent(line, role) * 12;
    const label = professionalLineLabel(line.label);
    const lines = wrapText(label, Math.max(80, labelRight - CONTENT_L - indent), size, font);
    const rowH = Math.max(1, lines.length) * leading;

    // A section heading opens with air above it, except at the top.
    const before = heading && previous != null ? leading * 0.45 : totalled ? 3 : 0;
    engine.ensure(rowH + before + (role === 'grand_total' ? 8 : 0));
    engine.y -= before;

    if (totalled) ruleUnder(engine.y + size * 1.05, 0.6, line, 0.3);

    const firstY = engine.y;
    lines.forEach((ln, i) => {
      engine.page.text(CONTENT_L + indent, firstY - i * leading, ln, { size, font });
    });

    if (!heading) {
      const noteRef =
        role === 'item' && line.note_ref != null && line.note_ref !== '' ? String(line.note_ref) : '';
      if (noteRef) {
        engine.page.textCenter(noteCenter, firstY, noteRef, { size, gray: 0.2 });
        // The number is the link: a reader clicks "5" and lands on Note 5.
        const w = Math.max(14, textWidth(noteRef, size) + 8);
        engine.page.link(noteCenter - w / 2, firstY - 3, noteCenter + w / 2, firstY + size, noteAnchor(noteRef));
      }
      engine.page.textRight(currentRight, firstY, formatStatementFigure(line.amount, role), { size, font });
      if (showComp) {
        engine.page.textRight(comparativeRight, firstY, formatStatementFigure(line.prior_amount, role), {
          size,
          font,
        });
      }
    }

    engine.y -= rowH;
    if (role === 'grand_total') {
      const y = engine.y + leading * 0.52;
      ruleUnder(y, 0.8, line);
      ruleUnder(y - 2.2, 0.8, line);
      engine.y -= 8;
    } else if (totalled) {
      engine.y -= 3;
    }
    previous = role;
  }
}

function renderSignature(engine: LayoutEngine, sig: CanonicalSignature): void {
  engine.ensure(TYPE.body * 9);
  engine.subHeading(sig.label);
  engine.spacer(18);
  engine.page.line(CONTENT_L, engine.y, CONTENT_L + 200, engine.y, 0.55, 0.35);
  engine.y -= TYPE.body * 1.15;
  engine.paragraph(sig.signatureDisplay, { size: TYPE.caption, gray: 0.45, spacingAfter: 2 });
  engine.paragraph(sig.nameDisplay, { size: TYPE.body, spacingAfter: 1 });
  engine.paragraph(sig.positionDisplay, { size: TYPE.caption, gray: 0.4, spacingAfter: 1 });
  engine.paragraph(sig.dateDisplay, { size: TYPE.caption, gray: 0.4, spacingAfter: 14 });
}

function statutoryParagraphs(engine: LayoutEngine, paragraphs: string[]): void {
  for (const p of paragraphs) engine.paragraph(p, { spacingAfter: 7 });
}

function buildCover(view: CanonicalDocumentView, meta: DocMeta): PdfPage {
  const page = new PdfPage();
  const cx = PAGE_W / 2;
  const brand = view.presentation.branding;
  const primary = brand.primaryColor;
  const accent = brand.accentColor;

  // Premium banded cover — full-width accent bar at top, navy title block.
  if (brand.coverDesign === 'banded' || brand.coverDesign === 'framed') {
    page.rect(0, PAGE_H - 28, PAGE_W, 28, 0, accent);
    page.rect(0, PAGE_H - 34, PAGE_W, 6, 0, primary);
  } else {
    page.line(CONTENT_L, PAGE_H - 56, CONTENT_R, PAGE_H - 56, 1.2, 0, primary);
  }

  let y = 640;
  page.textCenter(cx, y, view.companyName, { size: TYPE.coverTitle, font: 'bold', color: primary });
  y -= 26;
  if (meta.registrationNumber) {
    page.textCenter(cx, y, `Registration number ${meta.registrationNumber}`, { size: 10, gray: 0.38 });
    y -= 16;
  }
  if (view.presentation.tradingName) {
    page.textCenter(cx, y, `Trading as ${view.presentation.tradingName}`, { size: 10, gray: 0.38 });
    y -= 16;
  }

  y -= 10;
  page.line(cx - 90, y, cx + 90, y, 1.1, 0, accent);
  y -= 36;

  page.textCenter(cx, y, view.presentation.documentTitle, {
    size: TYPE.coverSub,
    font: 'bold',
    color: primary,
  });
  y -= 22;
  page.textCenter(cx, y, view.presentation.coverTitle, { size: 11.5 });
  y -= 40;

  page.textCenter(cx, y, `Prepared in accordance with ${view.frameworkLabel}`, { size: 10.5 });
  y -= 16;
  page.textCenter(cx, y, view.currencyLabel, { size: 9.5, gray: 0.4 });

  // Brand mark at foot of cover — restrained.
  page.line(CONTENT_L, 118, CONTENT_R, 118, 0.7, 0, accent);
  page.textCenter(cx, 98, brand.brandName, { size: TYPE.caption, font: 'bold', color: primary });
  if (brand.tagline) {
    page.textCenter(cx, 86, brand.tagline, { size: TYPE.small, gray: 0.45 });
  }
  if (view.presentation.issueDateLong) {
    page.textCenter(cx, 72, view.presentation.issueDateLong, { size: TYPE.small, gray: 0.45 });
  }
  if (brand.coverDesign === 'banded' || brand.coverDesign === 'framed') {
    page.rect(0, 0, PAGE_W, 10, 0, accent);
  }
  return page;
}

function buildContents(entries: TocEntry[], pageCount: number, accent?: [number, number, number]): PdfPage[] {
  const perPage = 32;
  const pages: PdfPage[] = [];
  for (let i = 0; i < pageCount; i++) pages.push(new PdfPage());

  pages[0].text(CONTENT_L, CONTENT_TOP, 'Contents', { size: TYPE.sectionTitle, font: 'bold' });
  if (accent) {
    pages[0].line(CONTENT_L, CONTENT_TOP - 8, CONTENT_L + 56, CONTENT_TOP - 8, 1.3, 0, accent);
    pages[0].line(CONTENT_L + 60, CONTENT_TOP - 8, CONTENT_R, CONTENT_TOP - 8, 0.5, 0.72);
  } else {
    pages[0].line(CONTENT_L, CONTENT_TOP - 8, CONTENT_R, CONTENT_TOP - 8, 1.0, 0.18);
  }

  let idx = 0;
  for (const entry of entries) {
    const pageOf = Math.min(pages.length - 1, Math.floor(idx / perPage));
    const page = pages[pageOf];
    const rowOnPage = idx % perPage;
    const y = CONTENT_TOP - 32 - rowOnPage * 18;
    const indent = entry.indent ? entry.indent * 14 : 0;
    const label = asciiOnly(entry.label);
    const pageStr = String(entry.page);
    const labelW = textWidth(label, 10, indent ? 'regular' : 'bold');
    const pageW = textWidth(pageStr, 10, 'regular');
    page.text(CONTENT_L + indent, y, label, { size: 10, font: indent ? 'regular' : 'bold' });
    page.textRight(CONTENT_R, y, pageStr, { size: 10 });
    // Each line of the contents takes the reader to the page it names.
    page.link(CONTENT_L, y - 4, CONTENT_R, y + 11, sectionAnchor(idx));
    const leaderStart = CONTENT_L + indent + labelW + 6;
    const leaderEnd = CONTENT_R - pageW - 6;
    if (leaderEnd > leaderStart) {
      const dotW = textWidth('.', 10);
      const dots = Math.max(0, Math.floor((leaderEnd - leaderStart) / dotW));
      if (dots > 0) page.text(leaderStart, y, '.'.repeat(dots), { size: 10, gray: 0.55 });
    }
    idx += 1;
  }
  return pages;
}

/** Render the full statutory PDF document from the canonical view. */
export function renderStatutoryPdf(view: CanonicalDocumentView): string {
  const brand = view.presentation.branding;
  const meta: DocMeta = {
    companyName: view.companyName,
    registrationNumber: view.presentation.registrationNumber,
    documentTitle: view.presentation.documentTitle,
    periodLabel: view.presentation.reportingPeriodLabel,
    issueDateLong: view.presentation.issueDateLong,
    brand: {
      creditLine: brand.footer.creditLine,
      headerRule: {
        show: brand.header.showRule,
        color: brand.header.ruleColor,
        width: brand.header.ruleWidth,
      },
      footerRule: {
        show: brand.footer.showRule,
        color: brand.footer.ruleColor,
        width: brand.footer.ruleWidth,
      },
    },
  };
  const engine = new LayoutEngine(meta);
  const toc: TocEntry[] = [];
  const mark = (label: string, indent = 0) => {
    engine.anchor(sectionAnchor(toc.length));
    toc.push({ label, bodyIndex: engine.pageIndex, page: 0, indent });
  };
  const accent = brand.accentColor;

  // ── Directors' Responsibilities and Approval ──────────────────────────────
  const respTitle = "Directors' Responsibilities and Approval";
  engine.setSection(respTitle);
  mark(respTitle);
  engine.sectionTitleBlock(respTitle, accent);
  statutoryParagraphs(engine, directorsResponsibilitiesParagraphs(view));

  // ── Directors' Report ─────────────────────────────────────────────────────
  engine.newPage();
  engine.setSection("Directors' Report");
  mark("Directors' Report");
  engine.sectionTitleBlock("Directors' Report", accent);
  for (const block of directorsReportParagraphs(view)) {
    if (block.heading) engine.subHeading(block.heading);
    engine.paragraph(block.body, { spacingAfter: 7 });
  }

  // ── Independent Auditor's Report ──────────────────────────────────────────
  engine.newPage();
  engine.setSection("Independent Auditor's Report");
  mark("Independent Auditor's Report");
  engine.sectionTitleBlock("Independent Auditor's Report", accent);
  statutoryParagraphs(engine, auditorsReportParagraphs(view));

  // ── Corporate Information (Phase 1) ───────────────────────────────────────
  const corpSection = view.composition?.sequencedSections.find(
    (s) => s.kind === 'corporate_information',
  );
  if (corpSection?.corporatePresentation?.rows?.length) {
    engine.newPage();
    engine.setSection('Corporate Information');
    mark('Corporate Information');
    renderCorporateInformationPresentationPdf(engine, corpSection.corporatePresentation, accent);
  } else if (corpSection?.narratives?.length) {
    engine.newPage();
    engine.setSection('Corporate Information');
    mark('Corporate Information');
    engine.sectionTitleBlock('Corporate Information', accent);
    for (const n of corpSection.narratives) {
      engine.paragraph(n.text, {
        spacingAfter: spacingAfterPx(view.composition.publicationHints, 'section') / 2,
      });
    }
  }

  // ── Primary statements (Phase 2 — each on its own page) ───────────────────
  const hints = view.composition?.publicationHints;
  // Every statement carries the same two columns, decided once for the set.
  const showComp = documentHasComparatives(view.statements);
  for (const stmt of view.statements) {
    if (hints?.pageBreaks.eachPrimaryStatement !== false) engine.newPage();
    engine.setSection(stmt.title);
    mark(stmt.title);
    renderStatement(engine, stmt, view, showComp);
    engine.spacer(hints ? spacingAfterPx(hints, 'statement') : 8);
  }

  // ── Accounting Policies (Phase 3 — separate from notes) ───────────────────
  if (hints?.pageBreaks.beforeAccountingPolicies !== false) engine.newPage();
  engine.setSection(POLICIES_SECTION_TITLE);
  mark(POLICIES_SECTION_TITLE);
  engine.sectionTitleBlock(POLICIES_SECTION_TITLE, accent);
  engine.paragraph(
    `The following accounting policies are consistent with ${view.frameworkLabel} and have been applied in preparing these annual financial statements.`,
    { spacingAfter: hints ? spacingAfterPx(hints, 'policy') : 10 },
  );
  const policies = view.accountingPolicies || [];
  if (!policies.length) {
    engine.paragraph(
      `Significant accounting policies are applied in accordance with ${view.frameworkLabel}.`,
      { spacingAfter: 8 },
    );
  } else {
    const policySpacing = hints ? spacingAfterPx(hints, 'policy') : 10;
    for (const policy of policies) {
      // A policy short enough for one page is kept on one page.
      engine.keepTogether(
        engine.measure((e) => {
          e.subHeading(policy.title);
          e.paragraph(policy.body, { spacingAfter: policySpacing });
        }),
      );
      engine.subHeading(policy.title);
      engine.paragraph(policy.body, { spacingAfter: policySpacing });
    }
  }

  // ── Notes (Phase 4) ───────────────────────────────────────────────────────
  if (hints?.pageBreaks.beforeNotes !== false) engine.newPage();
  engine.setSection(NOTES_SECTION_TITLE);
  mark(NOTES_SECTION_TITLE);
  engine.sectionTitleBlock(NOTES_SECTION_TITLE, accent);
  // Each note is measured before it is placed, so the page breaks fall where
  // a reader expects them rather than wherever the space ran out:
  //   - a note that fits on a page is never split: it moves to the next page;
  //   - a longer note starts here only if its heading and first block fit;
  //   - a table that fits on a page is never split, and a longer one repeats
  //     its header row under a "(continued)" line;
  //   - a note the preparer asked to start on a new page does, and no note
  //     ever leaves a blank page behind it.
  const tableTint = { headerTint: brand.accentTint };
  const renderBlock = (e: LayoutEngine, block: CanonicalNote['blocks'][number]) => {
    if (block.type === 'paragraph') {
      e.paragraph(block.text, { font: block.bold ? 'bold' : 'regular', spacingAfter: 6 });
    } else {
      if (block.title) e.subHeading(block.title);
      renderFinancialTable(e, block.rows, tableTint);
    }
  };
  for (const note of view.notes) {
    const whole = engine.measure((e) => {
      e.noteHeading(note.heading);
      note.blocks.forEach((b) => renderBlock(e, b));
    });
    if (note.pageBreakBefore && !engine.atPageTop) {
      engine.newPage();
    } else if (whole <= engine.pageCapacity) {
      engine.keepTogether(whole);
    } else {
      const lead = engine.measure((e) => {
        e.noteHeading(note.heading);
        if (note.blocks[0]) renderBlock(e, note.blocks[0]);
      });
      engine.keepTogether(lead);
    }

    engine.noteHeading(note.heading, noteAnchor(note.noteNumber));
    // Only once the heading is down does a new page need a "(continued)" line.
    engine.setContinuation(note.heading);
    note.blocks.forEach((block) => {
      if (block.type === 'table') engine.keepTogether(engine.measure((e) => renderBlock(e, block)));
      renderBlock(engine, block);
    });
    engine.setContinuation(null);
    engine.spacer(hints ? spacingAfterPx(hints, 'note') : 12);
  }

  // ── Supplementary schedules (Phase 5) ─────────────────────────────────────
  if (hints?.pageBreaks.beforeSupplementary !== false) engine.newPage();
  engine.setSection('Supplementary Information');
  mark('Supplementary Information');
  engine.sectionTitleBlock('Supplementary Information', accent);
  statutoryParagraphs(engine, supplementaryScheduleParagraphs());

  // ── Signatures (Phase 6) ──────────────────────────────────────────────────
  if (view.signatures.length) {
    if (hints?.pageBreaks.beforeApproval !== false) engine.newPage();
    engine.setSection('Approval of Annual Financial Statements');
    mark('Approval of Annual Financial Statements');
    engine.sectionTitleBlock('Approval of Annual Financial Statements', accent);
    engine.paragraph(approvalIntro(), {
      spacingAfter: hints ? spacingAfterPx(hints, 'section') : 14,
    });
    for (const sig of view.signatures) renderSignature(engine, sig);
  }

  // ── Front matter + finalize ───────────────────────────────────────────────
  const tocPageCount = Math.max(1, Math.ceil(toc.length / 32));
  const frontCount = 1 + tocPageCount;
  toc.forEach((e) => {
    e.page = frontCount + e.bodyIndex + 1;
  });

  const cover = buildCover(view, meta);
  const contentsPages = buildContents(toc, tocPageCount, accent);
  const front = [
    { page: cover, section: '', header: false },
    ...contentsPages.map((p) => ({ page: p, section: 'Contents', header: true })),
  ];

  const pages = engine.finalize(front);
  return assemblePdf(pages);
}
