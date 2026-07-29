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
  /** Optional brand styling for the running header/footer. */
  brand?: BrandMeta;
};

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

const HEADER_TOP = PAGE_H - 48;
const FOOTER_Y = 38;

export class LayoutEngine {
  pages: PdfPage[] = [];
  y = CONTENT_TOP;
  readonly meta: DocMeta;
  private sectionTitle = '';
  private pageSection: string[] = [];
  private continuation: string | null = null;
  /** Pages flagged as front matter (cover) receive no running header. */
  private noHeaderPages = new Set<number>();

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
    this.y = CONTENT_TOP;
    if (this.continuation) {
      this.page.text(CONTENT_L, this.y, `${this.continuation} (continued)`, {
        size: TYPE.subHeading,
        font: 'oblique',
        gray: 0.38,
      });
      this.y -= TYPE.subHeading * 1.55;
    }
    return p;
  }

  /** Force a fresh page (used to start each major statutory section cleanly). */
  newPage(): void {
    this.pushPage();
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
    if (this.y - needed < CONTENT_BOTTOM) this.pushPage();
  }

  spacer(n: number): void {
    this.y -= n;
  }

  /** Remaining vertical space on the current page. */
  get remaining(): number {
    return this.y - CONTENT_BOTTOM;
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

  /** Note heading (kept with at least the first following line). */
  noteHeading(heading: string): void {
    this.ensure(TYPE.noteHeading * 1.6 + TYPE.body * 1.4);
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

  private drawHeader(page: PdfPage, sectionTitle: string): void {
    const leftName = ellipsize(this.meta.companyName, CONTENT_W * 0.58, 9, 'bold');
    page.text(CONTENT_L, HEADER_TOP, leftName, { size: 9, font: 'bold' });
    if (this.meta.registrationNumber) {
      page.text(CONTENT_L, HEADER_TOP - 10, `Registration number: ${this.meta.registrationNumber}`, {
        size: TYPE.small,
        gray: 0.42,
      });
    }
    const rightTitle = sectionTitle || this.meta.documentTitle;
    page.textRight(CONTENT_R, HEADER_TOP, ellipsize(rightTitle, CONTENT_W * 0.4, 9, 'regular'), {
      size: 9,
    });
    if (this.meta.periodLabel) {
      page.textRight(CONTENT_R, HEADER_TOP - 10, ellipsize(this.meta.periodLabel, CONTENT_W * 0.4, TYPE.small), {
        size: TYPE.small,
        gray: 0.42,
      });
    }
    const hr = this.meta.brand?.headerRule;
    if (hr && hr.show) {
      page.line(CONTENT_L, HEADER_TOP - 16, CONTENT_R, HEADER_TOP - 16, hr.width, 0, hr.color);
    } else {
      page.line(CONTENT_L, HEADER_TOP - 16, CONTENT_R, HEADER_TOP - 16, 0.6, 0.35);
    }
  }

  private drawFooter(page: PdfPage, pageNumber: number, total: number): void {
    const fr = this.meta.brand?.footerRule;
    if (fr && fr.show) {
      page.line(CONTENT_L, FOOTER_Y + 11, CONTENT_R, FOOTER_Y + 11, fr.width, 0, fr.color);
    } else {
      page.line(CONTENT_L, FOOTER_Y + 11, CONTENT_R, FOOTER_Y + 11, 0.45, 0.62);
    }
    const creditLine = this.meta.brand?.creditLine || 'AdminLess Fin';
    page.text(CONTENT_L, FOOTER_Y, creditLine, { size: TYPE.footer, gray: 0.48 });
    page.textCenter(PAGE_W / 2, FOOTER_Y, `${pageNumber} / ${total}`, {
      size: TYPE.footer,
      gray: 0.32,
    });
    if (this.meta.issueDateLong) {
      page.textRight(CONTENT_R, FOOTER_Y, this.meta.issueDateLong, {
        size: TYPE.footer,
        gray: 0.48,
      });
    }
  }

  /**
   * Prepend already-built front-matter pages (cover, contents) and stamp the
   * running header/footer across the whole document. Returns the final pages.
   */
  finalize(frontPages: Array<{ page: PdfPage; section: string; header: boolean }>): PdfPage[] {
    const front = frontPages.map((f) => f.page);
    const frontSections = frontPages.map((f) => f.section);
    const frontHeader = frontPages.map((f) => f.header);

    const all = [...front, ...this.pages];
    const sections = [...frontSections, ...this.pageSection];
    const headerFlags = [...frontHeader, ...this.pages.map((_, i) => !this.noHeaderPages.has(i))];
    const total = all.length;

    all.forEach((page, i) => {
      if (headerFlags[i]) this.drawHeader(page, sections[i]);
      // Footer on every page except a headerless cover.
      if (headerFlags[i]) this.drawFooter(page, i + 1, total);
    });
    return all;
  }
}
