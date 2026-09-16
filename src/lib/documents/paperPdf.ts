/**
 * The parts of a customer-facing PDF that do not depend on what the document
 * says: the masthead, the letterhead block, the party panel, the banking
 * panel, the footers and the status stamp.
 *
 * Invoices and quotations differ in their middle -- what is owed versus what is
 * offered -- and in nothing else. Keeping the chrome here means a change to the
 * company's stationery happens once and reaches both.
 */
import { loadPdfEngine } from '@/lib/pdf/pdfEngine';
import {
  PAPER_RGB,
  PAPER_MARGIN as MARGIN,
  PAPER_BAND_HEIGHT as BAND_HEIGHT,
  bankingUnavailableMessage,
  type DocumentBanking,
  type DocumentCompany,
  type RGB,
} from './paperTheme';

export type PdfDoc = InstanceType<Awaited<ReturnType<typeof loadPdfEngine>>['jsPDF']>;

export type PaperCtx = {
  doc: PdfDoc;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
};

export function setFill(doc: PdfDoc, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
export function setText(doc: PdfDoc, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }
export function setDraw(doc: PdfDoc, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }

export type LoadedLogo = { dataUrl: string; format: string; width: number; height: number };

/**
 * The company logo as something jsPDF can draw.
 *
 * Returns null on any failure -- a logo that will not load must not stop a
 * document from being produced, and the masthead falls back to the company
 * name set in type, which is a respectable letterhead in its own right.
 */
export async function loadLogo(url: string | null): Promise<LoadedLogo | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const format = blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'JPEG' : 'PNG';
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the logo.'));
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Could not decode the logo.'));
      img.src = dataUrl;
    });
    if (!size.width || !size.height) return null;
    return { dataUrl, format, width: size.width, height: size.height };
  } catch {
    return null;
  }
}

/**
 * The emerald masthead: brand colour across the full width, the logo sitting on
 * a white card so it reads whatever colours it is drawn in, and the document's
 * name and reference in the opposite corner where a reader looks for them.
 */
export function drawMasthead(
  ctx: PaperCtx,
  opts: { title: string; reference: string; company: DocumentCompany; logo: LoadedLogo | null },
) {
  const { doc, pageWidth } = ctx;

  setFill(doc, PAPER_RGB.brand);
  doc.rect(0, 0, pageWidth, BAND_HEIGHT, 'F');
  // A brighter keyline along the bottom edge stops the band reading as a flat
  // slab and ties it to the accent used on the headline panel below.
  setFill(doc, PAPER_RGB.brandBright);
  doc.rect(0, BAND_HEIGHT - 4, pageWidth, 4, 'F');

  const cardHeight = 64;
  const cardTop = (BAND_HEIGHT - 4 - cardHeight) / 2;

  if (opts.logo) {
    // Fit inside the card without distorting: scale to whichever edge binds
    // first, then centre on the other axis.
    const scale = Math.min(150 / opts.logo.width, (cardHeight - 16) / opts.logo.height);
    const drawW = opts.logo.width * scale;
    const drawH = opts.logo.height * scale;
    const cardWidth = drawW + 28;

    setFill(doc, PAPER_RGB.paper);
    doc.roundedRect(MARGIN, cardTop, cardWidth, cardHeight, 6, 6, 'F');
    doc.addImage(
      opts.logo.dataUrl,
      opts.logo.format,
      MARGIN + (cardWidth - drawW) / 2,
      cardTop + (cardHeight - drawH) / 2,
      drawW,
      drawH,
    );
  } else {
    setText(doc, PAPER_RGB.paper);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(opts.company.name, MARGIN, cardTop + 30, { maxWidth: pageWidth / 2 - MARGIN });
    if (opts.company.website) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(opts.company.website, MARGIN, cardTop + 48);
    }
  }

  const right = pageWidth - MARGIN;
  setText(doc, PAPER_RGB.paper);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(opts.title.length > 9 ? 24 : 30);
  doc.text(opts.title, right, cardTop + 30, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(opts.reference, right, cardTop + 50, { align: 'right' });
}

/** The company block under the masthead. Returns the y it finished at. */
export function drawLetterhead(
  ctx: PaperCtx,
  company: DocumentCompany,
  lines: string[],
  x: number,
  y: number,
  width: number,
): number {
  const { doc } = ctx;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setText(doc, PAPER_RGB.ink);
  doc.text(company.name, x, y);
  let cursor = y + 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, PAPER_RGB.muted);
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, width);
    doc.text(wrapped, x, cursor);
    cursor += wrapped.length * 11;
  }
  return cursor;
}

/** A label/value column, right-aligned against `valueX`. Returns the next y. */
export function drawMetaColumn(
  ctx: PaperCtx,
  rows: Array<[string, string]>,
  labelX: number,
  valueX: number,
  y: number,
): number {
  const { doc } = ctx;
  let cursor = y;
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, PAPER_RGB.muted);
    doc.text(label, labelX, cursor);
    doc.setFont('helvetica', 'bold');
    setText(doc, PAPER_RGB.ink);
    doc.text(value, valueX, cursor, { align: 'right' });
    cursor += 15;
  }
  return cursor;
}

/** The tinted party panel ("Bill to", "Prepared for"). */
export function drawPartyPanel(
  ctx: PaperCtx,
  opts: { heading: string; name: string; lines: string[]; emptyMessage: string },
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const { doc } = ctx;
  setFill(doc, PAPER_RGB.tint);
  doc.roundedRect(x, y, width, height, 5, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.brand);
  doc.text(opts.heading.toUpperCase(), x + 14, y + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, PAPER_RGB.ink);
  doc.text(doc.splitTextToSize(opts.name, width - 28)[0], x + 14, y + 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(doc, PAPER_RGB.muted);
  let cursor = y + 48;
  if (opts.lines.length === 0) {
    doc.text(opts.emptyMessage, x + 14, cursor, { maxWidth: width - 28 });
    return;
  }
  for (const line of opts.lines) {
    if (cursor > y + height - 10) break;
    doc.text(doc.splitTextToSize(line, width - 28)[0], x + 14, cursor);
    cursor += 10.5;
  }
}

/** The bordered "how to pay" panel, including what it says when unavailable. */
export function drawBankingPanel(
  ctx: PaperCtx,
  banking: DocumentBanking | null,
  referenceWording: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const { doc } = ctx;
  setDraw(doc, PAPER_RGB.hairline);
  doc.setLineWidth(0.75);
  setFill(doc, PAPER_RGB.panel);
  doc.roundedRect(x, y, width, height, 5, 5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.brand);
  doc.text('BANKING DETAILS', x + 14, y + 18);

  let cursor = y + 32;
  if (banking && !banking.incomplete) {
    const rows: Array<[string, string]> = [
      ['Account name', banking.accountName],
      ['Bank', banking.bankName ?? '-'],
      ['Account number', banking.accountNumber ?? '-'],
    ];
    if (banking.branchCode) rows.push(['Branch code', banking.branchCode]);
    rows.push(['Reference', banking.reference]);

    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setText(doc, PAPER_RGB.muted);
      doc.text(label, x + 14, cursor);
      doc.setFont('helvetica', 'bold');
      setText(doc, PAPER_RGB.ink);
      doc.text(doc.splitTextToSize(value, width - 130)[0], x + 118, cursor);
      cursor += 14;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(doc, PAPER_RGB.muted);
    doc.text(referenceWording, x + 14, y + height - 12, { maxWidth: width - 28 });
  } else {
    // Saying nothing here is what produced documents a customer could not act on.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, PAPER_RGB.muted);
    doc.text(doc.splitTextToSize(bankingUnavailableMessage(banking), width - 28), x + 14, cursor);
  }
}

/**
 * Diagonal stamp across every page for a document whose status overrides it.
 *
 * Wrapped because transparency is an optional jsPDF feature: if the build in
 * use has no GState the stamp is skipped rather than allowed to abort a
 * document that is otherwise complete and correct.
 */
export function drawWatermark(ctx: PaperCtx, text: string, colour: RGB) {
  const { doc, pageWidth, pageHeight } = ctx;
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    try {
      doc.saveGraphicsState();
      const GState = (doc as unknown as { GState: new (o: { opacity: number }) => unknown }).GState;
      (doc as unknown as { setGState: (s: unknown) => void }).setGState(new GState({ opacity: 0.1 }));
      setText(doc, colour);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(text.length > 6 ? 68 : 94);
      doc.text(text, pageWidth / 2, pageHeight / 2 + 30, { align: 'center', angle: 32 });
      doc.restoreGraphicsState();
    } catch {
      /* no transparency available — the status is stated in the panel above anyway */
    }
  }
}

/** Identity and page numbering on every page. */
export function drawFooters(ctx: PaperCtx, company: DocumentCompany, reference: string) {
  const { doc, pageWidth, pageHeight } = ctx;
  const pages = doc.getNumberOfPages();
  const identity = [
    company.name,
    company.registrationNumber ? `Reg. no. ${company.registrationNumber}` : '',
    company.vatNumber ? `VAT no. ${company.vatNumber}` : '',
  ].filter(Boolean).join('  ·  ');

  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    setDraw(doc, PAPER_RGB.hairline);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, pageHeight - 48, pageWidth - MARGIN, pageHeight - 48);
    setFill(doc, PAPER_RGB.brand);
    doc.rect(MARGIN, pageHeight - 48.5, 46, 2, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, PAPER_RGB.muted);
    doc.text(identity, MARGIN, pageHeight - 34, { maxWidth: pageWidth - MARGIN * 2 - 90 });
    doc.text(
      `${reference}  ·  Page ${page} of ${pages}`,
      pageWidth - MARGIN,
      pageHeight - 34,
      { align: 'right' },
    );
  }
}

/** A fresh A4 document with its metadata set. */
export async function newPaperDocument(props: {
  title: string;
  subject: string;
  author: string;
}): Promise<{ ctx: PaperCtx; autoTable: Awaited<ReturnType<typeof loadPdfEngine>>['autoTable'] }> {
  const { jsPDF, autoTable } = await loadPdfEngine();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }) as PdfDoc;
  doc.setProperties({ ...props, creator: 'AdminLess Fin' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  return {
    ctx: { doc, pageWidth, pageHeight, contentWidth: pageWidth - MARGIN * 2 },
    autoTable,
  };
}

/**
 * The line-items table, styled the same on every document.
 *
 * The RGB triples are spread into fresh tuples because jsPDF-autotable types a
 * colour as exactly three numbers, and the shared palette declares its entries
 * readonly -- passing them straight through widens them to number[].
 */
export function lineTableStyles() {
  const rgb = (c: RGB): [number, number, number] => [c[0], c[1], c[2]];
  return {
    styles: {
      fontSize: 9,
      cellPadding: { top: 7, right: 10, bottom: 7, left: 10 },
      textColor: rgb(PAPER_RGB.ink),
      lineColor: rgb(PAPER_RGB.hairline),
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: rgb(PAPER_RGB.brand),
      textColor: rgb(PAPER_RGB.paper),
      fontStyle: 'bold' as const,
      fontSize: 8,
      cellPadding: { top: 8, right: 10, bottom: 8, left: 10 },
    },
    alternateRowStyles: { fillColor: rgb(PAPER_RGB.zebra) },
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 70 },
  };
}

/** Where the table finished, for laying out what comes after it. */
export function afterTable(doc: PdfDoc, fallback: number): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;
}
