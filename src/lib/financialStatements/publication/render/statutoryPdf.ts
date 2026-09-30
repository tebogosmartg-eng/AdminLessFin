/**
 * Professional Statutory Document composer (V14.0 / V15.0 / V18 presentation).
 *
 * Consumes the CanonicalDocumentView ONLY and lays out a client-ready statutory
 * Annual Financial Statements to the standard of a professionally published
 * South African set: an unbranded cover carrying the practitioner, general
 * information first, an index with page ranges, a running header repeating the
 * company and the section on every page, a "Figures in Rand" band over every
 * statement and notes page, whole-Rand figures, and supplementary schedules
 * fenced off behind their own disclaimer.
 */
import {
  asciiOnly,
  assemblePdf,
  CONTENT_L,
  CONTENT_R,
  CONTENT_TOP,
  CONTENT_W,
  PAGE_W,
  PdfPage,
  textWidth,
  wrapText,
} from './pdfKit';
import { LayoutEngine, TYPE, type DocMeta, type PageBand } from './layoutEngine';
import { renderNoteTable } from './tableEngine';
import { professionalLineLabel } from '../afsProfessionalPdf';
import {
  documentHasComparatives,
  formatStatementFigure,
  isTotalRole,
  lineIndent,
  lineNegatesFigure,
  lineRole,
  reportingYears,
  type LineRole,
  type ReportingYears,
} from '../statementPresentation';
import type {
  CanonicalDocumentView,
  CanonicalNote,
  CanonicalSignature,
  CanonicalStatement,
} from '../canonicalDocumentView';
import { renderCorporateInformationPresentationPdf } from './corporateInformationPdf';
import { practitionerFirmLines, SUPPLEMENTARY_DISCLAIMER } from '../statutoryFrontMatter';
import type { EfsStatementLine } from '../../api';

const NOTES_SECTION_TITLE = 'Notes to the Annual Financial Statements';
const POLICIES_SECTION_TITLE = 'Accounting Policies';

type TocEntry = {
  label: string;
  bodyIndex: number;
  page: number;
  endPage: number;
  anchorIndex: number;
  supplementary?: boolean;
};

type StatementLine = EfsStatementLine;

/** The notes' anchor names, shared by the heading and every link to it. */
export function noteAnchor(noteNumber: number | string): string {
  return `note-${noteNumber}`;
}

function sectionAnchor(index: number): string {
  return `section-${index}`;
}

function lcFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** "Statement of Financial Position as at 28 February 2027" for the header. */
function statementHeaderTitle(stmt: CanonicalStatement): string {
  if (stmt.statement_type === 'financial_position' && stmt.periodCaption) {
    return `${stmt.title} ${lcFirst(stmt.periodCaption)}`;
  }
  return stmt.title;
}

/** The "Figures in Rand … Note(s) 2027 2026" band a statement page repeats. */
/** A band's height: its two rules and a line of white space below. */
const BAND_HEIGHT = 34;

function statementBand(
  years: ReportingYears,
  cols: { noteCenter: number; figureRights: number[] },
): PageBand {
  return (page, topY) => {
    page.line(CONTENT_L, topY, CONTENT_R, topY, 0.7, 0.25);
    const textY = topY - 11;
    page.text(CONTENT_L, textY, 'Figures in Rand', { size: TYPE.caption, gray: 0.25 });
    page.textCenter(cols.noteCenter, textY, 'Note(s)', { size: TYPE.caption, gray: 0.25 });
    const labels = [years.current, years.comparative];
    cols.figureRights.forEach((right, i) => {
      page.textRight(right, textY, labels[i] ?? '', { size: TYPE.caption, font: 'bold' });
    });
    page.line(CONTENT_L, textY - 4.5, CONTENT_R, textY - 4.5, 0.7, 0.25);
    return BAND_HEIGHT;
  };
}

/** The notes' band: no note column, the years over the same columns as the statements'. */
function notesBand(years: ReportingYears, showComp: boolean): PageBand {
  const rights = statementColumns(showComp).figureRights;
  return (page, topY) => {
    page.line(CONTENT_L, topY, CONTENT_R, topY, 0.7, 0.25);
    const textY = topY - 11;
    page.text(CONTENT_L, textY, 'Figures in Rand', { size: TYPE.caption, gray: 0.25 });
    const labels = [years.current, years.comparative];
    rights.forEach((right, i) => {
      page.textRight(right, textY, labels[i] ?? '', { size: TYPE.caption, font: 'bold' });
    });
    page.line(CONTENT_L, textY - 4.5, CONTENT_R, textY - 4.5, 0.7, 0.25);
    return BAND_HEIGHT;
  };
}

/** A band that says only what the figures are — used by the equity matrix. */
function figuresBand(): PageBand {
  return (page, topY) => {
    page.line(CONTENT_L, topY, CONTENT_R, topY, 0.7, 0.25);
    page.text(CONTENT_L, topY - 11, 'Figures in Rand', { size: TYPE.caption, gray: 0.25 });
    page.line(CONTENT_L, topY - 15.5, CONTENT_R, topY - 15.5, 0.7, 0.25);
    return BAND_HEIGHT;
  };
}

/** Column geometry shared by a statement's band and its rows. */
function statementColumns(showComp: boolean) {
  const amountColW = 88;
  const colGap = 14;
  const noteColW = 30;
  const comparativeRight = CONTENT_R;
  const currentRight = showComp ? CONTENT_R - amountColW - colGap : CONTENT_R;
  const noteCenter = currentRight - amountColW - colGap - noteColW / 2;
  const labelRight = noteCenter - noteColW / 2 - 6;
  const figureRights = showComp ? [currentRight, comparativeRight] : [currentRight];
  return { amountColW, currentRight, comparativeRight, noteCenter, labelRight, figureRights };
}

/**
 * One primary statement, laid out as a published annual financial statement:
 * the running header names the statement, the band carries "Figures in Rand"
 * with the note column and the years — current first — and the rows follow
 * with rules under the figures of totals and a double rule under the figure
 * the statement exists to state. A note number is a link to the note.
 */
function renderStatement(
  engine: LayoutEngine,
  stmt: CanonicalStatement,
  showComp: boolean,
): void {
  if (!stmt.lines.length) {
    engine.paragraph(
      'Figures will be presented in this statement once the trial balance for the engagement has been captured and the statement has been prepared.',
      { size: TYPE.caption, gray: 0.4 },
    );
    return;
  }

  const size = 9.5;
  const leading = size * 1.6;
  const cols = statementColumns(showComp);
  // Rules sit under the figures only, and only where there is a figure: a
  // rule over a blank reads as a total of nothing.
  const ruleUnder = (y: number, width: number, line: StatementLine, gray = 0.12) => {
    const values = showComp ? [line.amount, line.prior_amount] : [line.amount];
    cols.figureRights.forEach((right, i) => {
      if (values[i] == null) return;
      engine.page.line(right - cols.amountColW + 12, y, right, y, width, gray);
    });
  };

  let previous: LineRole | null = null;
  for (const raw of stmt.lines) {
    const line = raw as StatementLine;
    const role = lineRole(line);
    const heading = role === 'heading';
    const totalled = isTotalRole(role);
    const font = heading || totalled ? 'bold' : 'regular';
    const indent = heading ? 0 : lineIndent(line, role) * 12;
    const label = professionalLineLabel(line.label);
    const lines = wrapText(label, Math.max(80, cols.labelRight - CONTENT_L - indent), size, font);
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
        engine.page.textCenter(cols.noteCenter, firstY, noteRef, { size, gray: 0.2 });
        // The number is the link: a reader clicks "5" and lands on note 5.
        const w = Math.max(14, textWidth(noteRef, size) + 8);
        engine.page.link(
          cols.noteCenter - w / 2,
          firstY - 3,
          cols.noteCenter + w / 2,
          firstY + size,
          noteAnchor(noteRef),
        );
      }
      const negate = lineNegatesFigure(stmt.statement_type, line);
      engine.page.textRight(cols.currentRight, firstY, formatStatementFigure(line.amount, role, { negate }), {
        size,
        font,
      });
      if (showComp) {
        engine.page.textRight(
          cols.comparativeRight,
          firstY,
          formatStatementFigure(line.prior_amount, role, { negate }),
          { size, font },
        );
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

type EquityColumns = { capital?: number | null; retained?: number | null; total?: number | null };
type EquityLine = StatementLine & { columns?: EquityColumns };

/**
 * The Statement of Changes in Equity as a published set states it: one column
 * per component of equity — share capital where the company has it, retained
 * earnings, total equity — and both years' movements as rows between the
 * opening and closing balances.
 */
function renderEquityMatrix(engine: LayoutEngine, stmt: CanonicalStatement): void {
  const lines = stmt.lines as EquityLine[];
  const hasCapital = lines.some((l) => l.columns && l.columns.capital != null);
  const columns: Array<{ key: keyof EquityColumns; label: string }> = [
    ...(hasCapital ? [{ key: 'capital' as const, label: 'Share capital' }] : []),
    { key: 'retained', label: 'Retained earnings' },
    { key: 'total', label: 'Total equity' },
  ];

  const size = 9.5;
  const leading = size * 1.6;
  const colW = 84;
  const rights = columns.map((_, i) => CONTENT_R - (columns.length - 1 - i) * colW);
  const labelRight = rights[0] - colW - 8;

  // Component headings over the figure columns.
  engine.ensure(leading * 2);
  const headY = engine.y;
  columns.forEach((c, i) => {
    const words = wrapText(c.label, colW - 8, TYPE.caption, 'bold');
    words.forEach((w, j) => {
      engine.page.textRight(rights[i], headY - j * (TYPE.caption * 1.2), w, {
        size: TYPE.caption,
        font: 'bold',
      });
    });
  });
  engine.y -= leading * 1.4;
  engine.page.line(CONTENT_L, engine.y + size * 0.6, CONTENT_R, engine.y + size * 0.6, 0.7, 0.25);
  engine.y -= 4;

  const ruleAcross = (y: number, width: number, gray: number) => {
    engine.page.line(rights[0] - colW + 12, y, CONTENT_R, y, width, gray);
  };

  // Roles by line code, not by wording: a balance row is bold, a subtotal
  // of movements has a rule above it, and only the closing balance is
  // double-ruled.
  const roleOf = (line: EquityLine): 'balance' | 'subtotal' | 'grand_total' | 'item' => {
    const code = String(line.line_code || '');
    if (code === 'eq.closing') return 'grand_total';
    if (/^eq\.(prior_)?opening$/.test(code)) return 'balance';
    if (/(tci|owner_total)$/.test(code) || line.is_subtotal) return 'subtotal';
    return 'item';
  };
  lines.forEach((line, index) => {
    const kind = roleOf(line);
    const role = kind === 'grand_total' ? 'grand_total' : kind === 'item' ? 'item' : 'total';
    const totalled = kind !== 'item';
    const font = totalled ? 'bold' : 'regular';
    const label = professionalLineLabel(line.label);
    const wrapped = wrapText(label, Math.max(80, labelRight - CONTENT_L), size, font);
    const rowH = Math.max(1, wrapped.length) * leading;
    engine.ensure(rowH + (role === 'grand_total' ? 10 : totalled ? 4 : 0));
    // The first balance opens the statement; every later total is ruled off.
    if (totalled && !(kind === 'balance' && index === 0)) ruleAcross(engine.y + size * 1.05, 0.6, 0.3);
    const firstY = engine.y;
    wrapped.forEach((ln, i) => engine.page.text(CONTENT_L, firstY - i * leading, ln, { size, font }));
    columns.forEach((c, i) => {
      const value = line.columns ? line.columns[c.key] : c.key === 'total' ? line.amount : null;
      engine.page.textRight(rights[i], firstY, formatStatementFigure(value, role), { size, font });
    });
    engine.y -= rowH;
    if (role === 'grand_total') {
      const y = engine.y + leading * 0.52;
      ruleAcross(y, 0.8, 0.1);
      ruleAcross(y - 2.2, 0.8, 0.1);
      engine.y -= 8;
    } else if (totalled) {
      engine.y -= 3;
    }
  });
}


/**
 * A table inside a policy (depreciation method and useful life by class):
 * text columns, left-aligned under a ruled bold header, as a published set
 * prints it.
 */
function renderPolicyTable(engine: LayoutEngine, rows: string[][]): void {
  const [header, ...body] = rows;
  const size = TYPE.body;
  const leading = size * 1.45;
  const starts = [CONTENT_L, CONTENT_L + CONTENT_W * 0.55, CONTENT_L + CONTENT_W * 0.78];
  engine.ensure(leading * (body.length + 2));
  engine.spacer(2);
  header.forEach((h, i) => engine.page.text(starts[i] ?? CONTENT_L, engine.y, h, { size, font: 'bold' }));
  engine.page.line(CONTENT_L, engine.y - size * 0.45, CONTENT_R, engine.y - size * 0.45, 0.6, 0.3);
  engine.y -= leading * 1.1;
  for (const row of body) {
    row.forEach((cell, i) => engine.page.text(starts[i] ?? CONTENT_L, engine.y, cell, { size }));
    engine.y -= leading;
  }
  engine.spacer(6);
}

/** The directors' own signature lines on the responsibilities page. */
function renderDirectorApproval(engine: LayoutEngine, directors: string[]): void {
  engine.spacer(6);
  for (const name of directors) {
    engine.ensure(TYPE.body * 6);
    engine.spacer(22);
    engine.page.line(CONTENT_L, engine.y, CONTENT_L + 200, engine.y, 0.55, 0.35);
    engine.y -= TYPE.body * 1.3;
    engine.paragraph(name, { size: TYPE.body, spacingAfter: 1 });
    engine.paragraph('Director', { size: TYPE.caption, gray: 0.4, spacingAfter: 6 });
  }
}

/**
 * The cover of a statutory document: the entity, what the document is, and
 * the practitioner at the foot. No product branding — software does not sign
 * financial statements.
 */
function buildCover(view: CanonicalDocumentView, meta: DocMeta): PdfPage {
  const page = new PdfPage();
  const cx = PAGE_W / 2;

  let y = 620;
  page.textCenter(cx, y, asciiOnly(view.companyName).toUpperCase(), { size: 15, font: 'bold' });
  y -= 20;
  if (meta.registrationNumber) {
    page.textCenter(cx, y, `(Registration number ${meta.registrationNumber})`, { size: 10.5 });
    y -= 16;
  }
  if (view.presentation.tradingName) {
    page.textCenter(cx, y, `Trading as ${view.presentation.tradingName}`, { size: 10, gray: 0.35 });
    y -= 16;
  }
  y -= 6;
  page.textCenter(cx, y, view.presentation.documentTitle.toUpperCase(), { size: 12.5, font: 'bold' });
  y -= 18;
  page.textCenter(cx, y, view.presentation.coverTitle, { size: 11 });

  const firm = practitionerFirmLines(view);
  let fy = 120;
  for (const line of firm) {
    page.textCenter(cx, fy, line, { size: 9.5 });
    fy -= 13;
  }
  return page;
}

/**
 * The index: a lead-in sentence, each section with the page or page range it
 * occupies, and the supplementary schedules behind their own disclaimer.
 * Every line is a link to the page it names.
 */
function buildIndexPages(entries: TocEntry[], view: CanonicalDocumentView): PdfPage[] {
  const page = new PdfPage();
  let y = CONTENT_TOP;

  const lead =
    'The reports and statements set out below comprise the annual financial statements presented to the shareholders:';
  for (const line of wrapText(lead, CONTENT_W, TYPE.body)) {
    page.text(CONTENT_L, y, line, { size: TYPE.body });
    y -= TYPE.body * 1.42;
  }
  y -= 10;
  page.textRight(CONTENT_R, y, 'Page', { size: 10, font: 'bold' });
  y -= 20;

  const row = (entry: TocEntry) => {
    const label = asciiOnly(entry.label);
    const range = entry.endPage > entry.page ? `${entry.page} - ${entry.endPage}` : String(entry.page);
    page.text(CONTENT_L, y, label, { size: 10 });
    page.textRight(CONTENT_R, y, range, { size: 10 });
    page.link(CONTENT_L, y - 4, CONTENT_R, y + 11, sectionAnchor(entry.anchorIndex));
    y -= 19;
  };

  for (const entry of entries.filter((e) => !e.supplementary)) row(entry);

  const supp = entries.filter((e) => e.supplementary);
  if (supp.length) {
    y -= 8;
    const note = `The following supplementary information does not form part of the annual financial statements and is ${
      /audit/i.test(view.corporateInformation.levelOfAssurance.formatted || '') ? 'unaudited' : 'not reviewed'
    }:`;
    for (const line of wrapText(note, CONTENT_W, TYPE.body)) {
      page.text(CONTENT_L, y, line, { size: TYPE.body });
      y -= TYPE.body * 1.42;
    }
    y -= 8;
    for (const entry of supp) row(entry);
  }
  return [page];
}

/** Render the full statutory PDF document from the canonical view. */
export function renderStatutoryPdf(view: CanonicalDocumentView): string {
  const reportingLabel = view.presentation.reportingPeriodLabel;
  const meta: DocMeta = {
    companyName: view.companyName,
    registrationNumber: view.presentation.registrationNumber,
    documentTitle: view.presentation.documentTitle,
    periodLabel: reportingLabel,
    issueDateLong: view.presentation.issueDateLong,
    documentLine: `${view.presentation.documentTitle} for the ${lcFirst(reportingLabel)}`,
  };
  const engine = new LayoutEngine(meta);
  const toc: TocEntry[] = [];
  let anchorCount = 0;
  const mark = (label: string, opts: { list?: boolean; supplementary?: boolean } = {}) => {
    const anchorIndex = anchorCount++;
    engine.anchor(sectionAnchor(anchorIndex));
    if (opts.list !== false) {
      toc.push({
        label,
        bodyIndex: engine.pageIndex,
        page: 0,
        endPage: 0,
        anchorIndex,
        supplementary: opts.supplementary,
      });
    }
  };

  // ── General Information — the first page of a bound set ─────────────────
  const corpSection = view.composition?.sequencedSections.find(
    (s) => s.kind === 'corporate_information',
  );
  engine.setSection('General Information');
  mark('General Information', { list: false });
  if (corpSection?.corporatePresentation?.rows?.length) {
    renderCorporateInformationPresentationPdf(engine, corpSection.corporatePresentation);
  } else if (corpSection?.narratives?.length) {
    for (const n of corpSection.narratives) engine.paragraph(n.text, { spacingAfter: 6 });
  }
  const generalInfoEndIndex = engine.pageIndex;

  // ── Narrative front matter — the wording the preparation engine resolved:
  //    authored where the preparer wrote it, generated statutory text
  //    otherwise. The renderer takes no wording decisions of its own.
  const renderFrontSection = (
    section: typeof view.frontMatter.responsibilities,
    after?: (e: LayoutEngine) => void,
  ) => {
    engine.newPage();
    engine.setSection(section.title);
    mark(section.title);
    for (const block of section.blocks) {
      if (block.heading) engine.subHeading(block.heading);
      if (block.body) engine.paragraph(block.body, { spacingAfter: 7 });
    }
    after?.(engine);
  };

  // The directors approve the statements on their own page: their
  // responsibilities, the approval wording, and their signatures.
  renderFrontSection(view.frontMatter.responsibilities, (e) => {
    for (const block of view.frontMatter.approval.blocks) {
      if (block.heading) e.subHeading(block.heading);
      if (block.body) e.paragraph(block.body, { spacingAfter: 7 });
    }
    if (view.presentation.directors.length) {
      renderDirectorApproval(e, view.presentation.directors);
    }
  });
  renderFrontSection(view.frontMatter.directorsReport);
  renderFrontSection(view.frontMatter.practitionerReport);

  // ── Primary statements (each on its own page) ─────────────────────────────
  const hints = view.composition?.publicationHints;
  // Every statement carries the same two columns, decided once for the set.
  const showComp = documentHasComparatives(view.statements);
  const years = reportingYears(view.period ?? { label: view.presentation.reportingPeriodLabel });
  for (const stmt of view.statements) {
    const matrix =
      stmt.statement_type === 'changes_in_equity' &&
      (stmt.lines as EquityLine[]).some((l) => l.columns != null);
    engine.setBand(
      matrix
        ? figuresBand()
        : statementBand(years, statementColumns(showComp)),
    );
    if (hints?.pageBreaks.eachPrimaryStatement !== false || engine.pageIndex === 0) engine.newPage();
    engine.setSection(statementHeaderTitle(stmt));
    mark(stmt.title);
    if (matrix) renderEquityMatrix(engine, stmt);
    else renderStatement(engine, stmt, showComp);
  }
  engine.setBand(null);

  // ── Accounting Policies ───────────────────────────────────────────────────
  if (hints?.pageBreaks.beforeAccountingPolicies !== false) engine.newPage();
  engine.setSection(POLICIES_SECTION_TITLE);
  mark(POLICIES_SECTION_TITLE);
  const policies = view.accountingPolicies || [];
  if (!policies.length) {
    engine.paragraph(
      `Significant accounting policies are applied in accordance with ${view.frameworkLabel}.`,
      { spacingAfter: 8 },
    );
  } else {
    const paragraphs = (e: LayoutEngine, text: string | undefined) => {
      for (const para of String(text || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)) {
        e.paragraph(para, { spacingAfter: 7 });
      }
    };
    const renderPolicy = (e: LayoutEngine, policy: (typeof policies)[number]) => {
      e.subHeading(policy.title);
      paragraphs(e, policy.body);
      if (policy.table?.length) renderPolicyTable(e, policy.table);
      paragraphs(e, policy.bodyAfter);
      e.spacer(4);
    };
    for (const policy of policies) {
      // A policy short enough for one page is kept on one page.
      engine.keepTogether(engine.measure((e) => renderPolicy(e, policy)));
      renderPolicy(engine, policy);
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  engine.setBand(notesBand(years, showComp));
  if (hints?.pageBreaks.beforeNotes !== false) engine.newPage();
  engine.setSection(NOTES_SECTION_TITLE);
  mark(NOTES_SECTION_TITLE);
  // Each note is measured before it is placed, so the page breaks fall where
  // a reader expects them rather than wherever the space ran out:
  //   - a note that fits on a page is never split: it moves to the next page;
  //   - a longer note starts here only if its heading and first block fit;
  //   - a table that fits on a page is never split, and a longer one repeats
  //     its header row under a "(continued)" line;
  //   - a note the preparer asked to start on a new page does, and no note
  //     ever leaves a blank page behind it.
  const bandRights = statementColumns(showComp).figureRights;
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  let noteTitle = '';
  const renderBlock = (e: LayoutEngine, block: CanonicalNote['blocks'][number]) => {
    if (block.type === 'paragraph') {
      e.paragraph(block.text, { font: block.bold ? 'bold' : 'regular', spacingAfter: 6 });
    } else {
      if (block.title && !same(block.title, noteTitle)) e.subHeading(block.title);
      renderNoteTable(e, block.rows, { kinds: block.kinds, bandRights });
    }
  };
  for (const note of view.notes) {
    noteTitle = note.title;
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
    engine.spacer(12);
  }
  engine.setBand(null);

  // ── Supplementary schedules — behind their own disclaimer ────────────────
  const schedules = view.composition?.supplementarySchedules || [];
  for (const schedule of schedules) {
    engine.setFooterNote(SUPPLEMENTARY_DISCLAIMER);
    engine.setBand(notesBand(years, showComp));
    engine.newPage();
    engine.setSection(schedule.title);
    mark(schedule.title, { supplementary: true });
    renderNoteTable(engine, schedule.rows, { kinds: schedule.kinds, bandRights });
  }
  engine.setBand(null);
  engine.setFooterNote(null);

  // ── Front matter + finalize ───────────────────────────────────────────────
  // Page numbers: the cover carries none; General Information is page 1, the
  // index follows it, and everything after shifts by the index's page count.
  const indexPageCount = 1;
  const pageNumberOf = (bodyIndex: number) =>
    bodyIndex <= generalInfoEndIndex ? bodyIndex + 1 : bodyIndex + 1 + indexPageCount;
  toc.forEach((entry, i) => {
    entry.page = pageNumberOf(entry.bodyIndex);
    const next = toc[i + 1];
    entry.endPage = next ? pageNumberOf(next.bodyIndex) - 1 : pageNumberOf(engine.pageIndex);
  });

  const cover = buildCover(view, meta);
  const indexPages = buildIndexPages(toc, view);

  const pages = engine.finalize([{ page: cover, section: '', header: false }], {
    afterBodyIndex: generalInfoEndIndex,
    pages: indexPages,
    section: 'Index',
  });
  return assemblePdf(pages);
}
