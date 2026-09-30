/**
 * Professional Layout Engine (V14.0) — Page Layout + Header/Footer + Typography
 * hierarchy for the statutory document. Manages the flowing cursor, automatic
 * page breaks with widow/orphan control, note continuation headings, and the
 * repeating header/footer applied in a final pass.
 *
 * Consumes only primitives from pdfKit — no document semantics here.
 */
import {
  asciiOnly,
  CONTENT_BOTTOM,
  CONTENT_L,
  CONTENT_R,
  CONTENT_TOP,
  CONTENT_W,
  ellipsize,
  PAGE_H,
  PAGE_W,
  PdfPage,
  wrapText,
  type FontKey,
  type Rgb,
} from './pdfKit';

/** Presentation-only branding hints consumed by the header/footer. */
export type BrandMeta = {
  creditLine: string;
  headerRule: { show: boolean; color: Rgb; width: number };
  footerRule: { show: boolean; color: Rgb; width: number };
};

export type DocMeta = {
  companyName: string;
  registrationNumber: string | null;
  documentTitle: string;
  periodLabel: string;
  issueDateLong: string;
  /**
   * The one-line description under the company name in the running header:
   * "Annual Financial Statements for the year ended 28 February 2027".
   */
  documentLine?: string;
  /** Optional brand styling for the running header/footer. */
  brand?: BrandMeta;
};

/**
 * A band drawn at the top of every page of a section — the column captions a
 * statement or the notes repeat on each of their pages, "Figures in Rand" with
 * the two years. It returns the height it used so the flowing text starts
 * below it.
 */
export type PageBand = (page: PdfPage, topY: number) => number;

// Type scale (statutory hierarchy — classic professional AFS).
export const TYPE = {
  coverTitle: 22,
  coverSub: 14,
  sectionTitle: 13,
  statementTitle: 12.5,
  noteHeading: 10.5,
  subHeading: 10,
  body: 9.5,
  caption: 8.5,
  small: 8,
  footer: 7.5,
} as const;

const HEADER_TOP = PAGE_H - 46;
const FOOTER_Y = 40;

export class LayoutEngine {
  pages: PdfPage[] = [];
  y = CONTENT_TOP;
  readonly meta: DocMeta;
  private sectionTitle = '';
  private pageSection: string[] = [];
  private continuation: string | null = null;
  /** Pages flagged as front matter (cover) receive no running header. */
  private noHeaderPages = new Set<number>();
  /** The band the current section repeats at the top of each of its pages. */
  private band: PageBand | null = null;
  private pageBandHeights: number[] = [];
  /** A line printed above the page number — the supplementary disclaimer. */
  private footerNote: string | null = null;
  private pageFooterNote: Array<string | null> = [];
  /**
   * A measuring engine lays content out on one endless page and draws nothing
   * that is kept: it exists to learn how tall something will be before it is
   * placed for real.
   */
  private measuring = false;
  /** Where the writing starts on the current page, below any continuation line. */
  private pageStartY = CONTENT_TOP;

  constructor(meta: DocMeta) {
    this.meta = meta;
    this.pushPage();
  }

  get page(): PdfPage {
    return this.pages[this.pages.length - 1];
  }

  get pageIndex(): number {
    return this.pages.length - 1;
  }

  private pushPage(): PdfPage {
    const p = new PdfPage();
    this.pages.push(p);
    this.pageSection.push(this.sectionTitle);
    this.pageFooterNote.push(this.footerNote);
    this.y = CONTENT_TOP;
    // The section's column band repeats at the top of each of its pages, so a
    // figure is never read against captions three pages back.
    let bandH = 0;
    if (this.band && !this.measuring) {
      bandH = this.band(p, this.y);
      this.y -= bandH;
    }
    this.pageBandHeights.push(bandH);
    if (this.continuation) {
      this.page.text(CONTENT_L, this.y, `${this.continuation} (continued)`, {
        size: TYPE.caption,
        font: 'oblique',
        gray: 0.38,
      });
      this.y -= TYPE.caption * 1.7;
    }
    this.pageStartY = this.y;
    return p;
  }

  private bandHeight = 0;

  /**
   * Repeat a column band at the top of every page from here on (null stops
   * it). Set before the section's first page is started, so the first page
   * carries it too.
   */
  setBand(band: PageBand | null): void {
    this.band = band;
    this.bandHeight = band ? band(new PdfPage(), CONTENT_TOP) : 0;
  }

  /** Draw the band on the current page now (used on a page already begun). */
  drawBandNow(): void {
    if (!this.band || this.measuring) return;
    const h = this.band(this.page, this.y);
    this.y -= h;
    this.pageStartY = this.y;
  }

  /** A footer line above the page number for this section's pages. */
  setFooterNote(note: string | null): void {
    this.footerNote = note;
  }

  /** Force a fresh page (used to start each major statutory section cleanly). */
  newPage(): void {
    if (this.measuring) return;
    this.pushPage();
  }

  /** Nothing has been written on this page yet. */
  get atPageTop(): boolean {
    return this.y >= this.pageStartY - 0.5;
  }

  /** The height a full page offers, below the band and a continuation line. */
  get pageCapacity(): number {
    return CONTENT_TOP - CONTENT_BOTTOM - this.bandHeight - TYPE.caption * 1.7;
  }

  /**
   * How tall something will be once laid out, without laying it out here.
   * The content is rendered into a measuring engine that never breaks a page.
   */
  measure(render: (engine: LayoutEngine) => void): number {
    const probe = new LayoutEngine(this.meta);
    probe.measuring = true;
    const start = probe.y;
    render(probe);
    return start - probe.y;
  }

  /**
   * Keep a block together: if it will not fit in what is left of this page but
   * would fit on a page of its own, start it on the next page. A block taller
   * than a page is left to flow, since moving it would only add a blank gap.
   */
  keepTogether(height: number): void {
    if (this.measuring || this.atPageTop) return;
    if (height > this.remaining && height <= this.pageCapacity) this.pushPage();
  }

  /** Start a page that carries no running header (cover). */
  newCoverPage(): void {
    this.pushPage();
    this.noHeaderPages.add(this.pageIndex);
  }

  setSection(title: string): void {
    this.sectionTitle = title;
    this.pageSection[this.pageIndex] = title;
  }

  setContinuation(label: string | null): void {
    this.continuation = label;
  }

  ensure(needed: number): void {
    if (this.measuring) return;
    if (this.y - needed < CONTENT_BOTTOM) this.pushPage();
  }

  spacer(n: number): void {
    this.y -= n;
  }

  /** Remaining vertical space on the current page. */
  get remaining(): number {
    return this.measuring ? Number.POSITIVE_INFINITY : this.y - CONTENT_BOTTOM;
  }

  // ── Typography helpers ────────────────────────────────────────────────────

  /** Major section title on a fresh block, with a branded underline rule. */
  sectionTitleBlock(title: string, accent?: Rgb): void {
    this.ensure(TYPE.sectionTitle * 2.6);
    this.page.text(CONTENT_L, this.y, asciiOnly(title), { size: TYPE.sectionTitle, font: 'bold' });
    this.y -= TYPE.sectionTitle * 1.1;
    if (accent) {
      this.page.line(CONTENT_L, this.y, CONTENT_L + 72, this.y, 1.4, 0, accent);
      this.page.line(CONTENT_L + 76, this.y, CONTENT_R, this.y, 0.5, 0.72);
    } else {
      this.page.line(CONTENT_L, this.y, CONTENT_R, this.y, 1.0, 0.18);
    }
    this.y -= TYPE.sectionTitle * 0.85;
  }

  /** Statement title + reporting-date caption. */
  statementTitleBlock(title: string, caption: string): void {
    this.ensure(TYPE.statementTitle * 2.6 + TYPE.caption * 1.6);
    this.page.text(CONTENT_L, this.y, asciiOnly(title), { size: TYPE.statementTitle, font: 'bold' });
    this.y -= TYPE.statementTitle * 1.2;
    if (caption) {
      this.page.text(CONTENT_L, this.y, asciiOnly(caption), {
        size: TYPE.caption,
        font: 'oblique',
        gray: 0.38,
      });
      this.y -= TYPE.caption * 1.55;
    }
  }

  /**
   * Name the current position so a link can jump to it. Call after any
   * `ensure` that may start a new page, so the name lands where the text does.
   */
  anchor(name: string): void {
    this.page.anchor(name, this.y + TYPE.body);
  }

  /** Note heading (kept with at least the first following line). */
  noteHeading(heading: string, anchor?: string): void {
    this.ensure(TYPE.noteHeading * 1.6 + TYPE.body * 1.4);
    if (anchor) this.anchor(anchor);
    this.page.text(CONTENT_L, this.y, asciiOnly(heading), { size: TYPE.noteHeading, font: 'bold' });
    this.y -= TYPE.noteHeading * 1.5;
  }

  subHeading(text: string): void {
    this.ensure(TYPE.subHeading * 1.5 + TYPE.body * 1.35);
    this.page.text(CONTENT_L, this.y, asciiOnly(text), { size: TYPE.subHeading, font: 'bold' });
    this.y -= TYPE.subHeading * 1.45;
  }

  paragraph(
    text: string,
    opts: { size?: number; font?: FontKey; indent?: number; gray?: number; spacingAfter?: number } = {},
  ): void {
    const size = opts.size ?? TYPE.body;
    const indent = opts.indent ?? 0;
    const leading = size * 1.42;
    const lines = wrapText(text, CONTENT_W - indent, size, opts.font || 'regular');
    // Orphan control: keep the first two lines together where possible.
    this.ensure(Math.min(lines.length, 2) * leading);
    for (const line of lines) {
      this.ensure(leading);
      this.page.text(CONTENT_L + indent, this.y, line, { size, font: opts.font, gray: opts.gray });
      this.y -= leading;
    }
    if (opts.spacingAfter) this.y -= opts.spacingAfter;
  }

  ruleThin(gray = 0.5): void {
    this.ensure(6);
    this.page.line(CONTENT_L, this.y, CONTENT_R, this.y, 0.5, gray);
    this.y -= 6;
  }

  /**
   * Professional label / value row for corporate information schedules.
   * Label is left-aligned; value is right-column with multi-line support.
   */
  labelValueRow(
    label: string,
    valueLines: string[],
    opts: { labelWidth?: number; spacingAfter?: number } = {},
  ): void {
    const labelWidth = opts.labelWidth ?? 155;
    const valueX = CONTENT_L + labelWidth;
    const valueWidth = CONTENT_R - valueX;
    const size = TYPE.body;
    const leading = size * 1.42;
    const labelLines = wrapText(label, labelWidth - 8, size, 'regular');
    const wrappedValues = valueLines.flatMap((v) =>
      wrapText(v, valueWidth, size, 'regular'),
    );
    const rowHeight = Math.max(labelLines.length, wrappedValues.length) * leading + 4;
    this.ensure(rowHeight);

    let labelY = this.y;
    for (const line of labelLines) {
      this.page.text(CONTENT_L, labelY, line, { size, gray: 0.38 });
      labelY -= leading;
    }

    let valueY = this.y;
    for (const line of wrappedValues) {
      this.page.text(valueX, valueY, line, { size, font: 'regular' });
      valueY -= leading;
    }

    this.y -= rowHeight;
    if (opts.spacingAfter) this.y -= opts.spacingAfter;
  }

  // ── Header / footer (final pass) ──────────────────────────────────────────

  /**
   * The running header a published set of statements carries on every page:
   * the company, its registration number, what the document is, and the title
   * of the section this page belongs to, closed with a rule. The section
   * title lives here — a section never re-prints its own heading in the body,
   * which is what keeps it at the top of every one of its pages.
   */
  private drawHeader(page: PdfPage, sectionTitle: string): void {
    page.text(CONTENT_L, HEADER_TOP, asciiOnly(this.meta.companyName), { size: 10, font: 'bold' });
    let y = HEADER_TOP - 11;
    if (this.meta.registrationNumber) {
      page.text(CONTENT_L, y, `(Registration number: ${this.meta.registrationNumber})`, {
        size: TYPE.small,
        gray: 0.35,
      });
      y -= 10;
    }
    const docLine =
      this.meta.documentLine ||
      `${this.meta.documentTitle}${this.meta.periodLabel ? ` — ${this.meta.periodLabel}` : ''}`;
    page.text(CONTENT_L, y, ellipsize(docLine, CONTENT_W, TYPE.small), { size: TYPE.small, gray: 0.35 });

    const title = sectionTitle || this.meta.documentTitle;
    // The section title sits a clear line below the identification block,
    // however many lines that block has.
    const titleY = Math.min(HEADER_TOP - 38, y - 22);
    page.text(CONTENT_L, titleY, ellipsize(title, CONTENT_W, TYPE.sectionTitle, 'bold'), {
      size: TYPE.sectionTitle,
      font: 'bold',
    });
    page.line(CONTENT_L, titleY - 8, CONTENT_R, titleY - 8, 0.9, 0.25);
  }

  private drawFooter(page: PdfPage, pageNumber: number, note: string | null): void {
    page.line(CONTENT_L, FOOTER_Y + 13, CONTENT_R, FOOTER_Y + 13, 0.45, 0.62);
    if (note) {
      page.textCenter(PAGE_W / 2, FOOTER_Y + 2.5, asciiOnly(note), {
        size: TYPE.footer,
        font: 'oblique',
        gray: 0.4,
      });
      page.textCenter(PAGE_W / 2, FOOTER_Y - 8, String(pageNumber), { size: TYPE.footer, gray: 0.32 });
    } else {
      page.textCenter(PAGE_W / 2, FOOTER_Y, String(pageNumber), { size: TYPE.footer, gray: 0.32 });
    }
  }

  /**
   * Prepend already-built front-matter pages (cover, contents) and stamp the
   * running header/footer across the whole document. The cover carries
   * neither, and the page numbers start after it — the first page of general
   * information is page 1, the way a bound set reads.
   */
  finalize(
    frontPages: Array<{ page: PdfPage; section: string; header: boolean }>,
    insertion?: { afterBodyIndex: number; pages: PdfPage[]; section: string },
  ): PdfPage[] {
    type Record_ = { page: PdfPage; section: string; note: string | null; header: boolean };
    const records: Record_[] = frontPages.map((f) => ({
      page: f.page,
      section: f.section,
      note: null,
      header: f.header,
    }));
    this.pages.forEach((page, i) => {
      records.push({
        page,
        section: this.pageSection[i],
        note: this.pageFooterNote[i] ?? null,
        header: !this.noHeaderPages.has(i),
      });
      if (insertion && i === insertion.afterBodyIndex) {
        for (const p of insertion.pages) {
          records.push({ page: p, section: insertion.section, note: null, header: true });
        }
      }
    });

    let pageNumber = 0;
    for (const r of records) {
      if (!r.header) continue; // the cover carries no furniture and no number
      pageNumber += 1;
      this.drawHeader(r.page, r.section);
      this.drawFooter(r.page, pageNumber, r.note);
    }
    return records.map((r) => r.page);
  }
}
