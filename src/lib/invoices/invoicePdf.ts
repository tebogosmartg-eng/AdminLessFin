/**
 * The invoice a customer receives.
 *
 * This is the only document in the product that leaves the company and is read
 * by someone who does not use the product, so it is the one place where the
 * brand and the layout are part of the job rather than decoration. It replaces
 * printing the web page, which produced an unbranded sheet with no banking
 * details -- so a customer could read the invoice and still have nowhere to pay
 * it.
 *
 * Presentation only: every figure is taken from the document model, which
 * takes them from the ledger. Nothing here adds anything up that the ledger has
 * not already added up, except the column of line amounts it is printing.
 */
import { loadPdfEngine } from '@/lib/pdf/pdfEngine';
import {
  daysOverdue,
  invoiceFileName,
  type InvoiceDocumentModel,
} from './invoiceDocument';

type Doc = InstanceType<Awaited<ReturnType<typeof loadPdfEngine>>['jsPDF']>;

type RGB = [number, number, number];

/**
 * The AdminLess emerald, converted once from the design tokens in globals.css
 * so the printed document and the screen are the same green rather than two
 * greens that nearly match.
 *
 *   --primary  hsl(163 94% 24%)  emerald-700 — headings, rules, the header band
 *   --accent   hsl(160 84% 39%)  emerald-500 — the amount-due panel
 */
const BRAND: RGB = [4, 119, 86];
const BRAND_BRIGHT: RGB = [16, 183, 127];
/** emerald-50, for panel fills that must stay readable under black text. */
const BRAND_TINT: RGB = [236, 250, 244];
const INK: RGB = [26, 24, 22];
const MUTED: RGB = [118, 113, 107];
const HAIRLINE: RGB = [226, 222, 216];
const PAPER: RGB = [255, 255, 255];

const MARGIN = 42;
const BAND_HEIGHT = 108;

/**
 * "R 1 234,56" with ordinary spaces. Intl's en-ZA groups with a non-breaking
 * space, which jsPDF's built-in WinAnsi fonts render as a hollow box.
 */
function money(n: number): string {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  const [whole, cents] = Math.abs(v).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}R ${grouped},${cents}`;
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
}

function day(iso: string): string {
  if (!iso) return '-';
  const parsed = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * The company logo as something jsPDF can draw.
 *
 * Returns null on any failure -- a logo that will not load must not stop an
 * invoice from being produced, and the header falls back to the company name
 * set in type, which is a respectable letterhead in its own right.
 */
async function loadLogo(
  url: string | null,
): Promise<{ dataUrl: string; format: string; width: number; height: number } | null> {
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

type Ctx = {
  doc: Doc;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
};

function setFill(doc: Doc, c: RGB) { doc.setFillColor(c[0], c[1], c[2]); }
function setText(doc: Doc, c: RGB) { doc.setTextColor(c[0], c[1], c[2]); }
function setDraw(doc: Doc, c: RGB) { doc.setDrawColor(c[0], c[1], c[2]); }

/**
 * The emerald masthead: brand colour across the full width, the logo sitting on
 * a white card so it reads whatever colours it is drawn in, and the document's
 * name and number in the opposite corner where a reader looks for them.
 */
function drawHeaderBand(
  ctx: Ctx,
  model: InvoiceDocumentModel,
  logo: Awaited<ReturnType<typeof loadLogo>>,
) {
  const { doc, pageWidth } = ctx;

  setFill(doc, BRAND);
  doc.rect(0, 0, pageWidth, BAND_HEIGHT, 'F');
  // A brighter keyline along the bottom edge stops the band reading as a flat
  // slab and ties it to the accent used on the amount-due panel below.
  setFill(doc, BRAND_BRIGHT);
  doc.rect(0, BAND_HEIGHT - 4, pageWidth, 4, 'F');

  const cardHeight = 64;
  const cardTop = (BAND_HEIGHT - 4 - cardHeight) / 2;

  if (logo) {
    // Fit inside the card without distorting: scale to whichever edge binds
    // first, then centre on the other axis.
    const maxW = 150;
    const maxH = cardHeight - 16;
    const scale = Math.min(maxW / logo.width, maxH / logo.height);
    const drawW = logo.width * scale;
    const drawH = logo.height * scale;
    const cardWidth = drawW + 28;

    setFill(doc, PAPER);
    doc.roundedRect(MARGIN, cardTop, cardWidth, cardHeight, 6, 6, 'F');
    doc.addImage(
      logo.dataUrl,
      logo.format,
      MARGIN + (cardWidth - drawW) / 2,
      cardTop + (cardHeight - drawH) / 2,
      drawW,
      drawH,
    );
  } else {
    setText(doc, PAPER);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(model.company.name, MARGIN, cardTop + 30, { maxWidth: pageWidth / 2 - MARGIN });
    if (model.company.website) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(model.company.website, MARGIN, cardTop + 48);
    }
  }

  const right = pageWidth - MARGIN;
  setText(doc, PAPER);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text('INVOICE', right, cardTop + 30, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(model.number, right, cardTop + 50, { align: 'right' });
}

/**
 * Diagonal stamp across every page for an invoice that is settled or cancelled.
 *
 * Wrapped because transparency is an optional jsPDF feature: if the build in
 * use has no GState the stamp is skipped rather than allowed to abort a
 * document that is otherwise complete and correct.
 */
function drawWatermark(ctx: Ctx, text: string, colour: RGB) {
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
      doc.setFontSize(94);
      doc.text(text, pageWidth / 2, pageHeight / 2 + 30, { align: 'center', angle: 32 });
      doc.restoreGraphicsState();
    } catch {
      /* no transparency available — the status is stated in the panel above anyway */
    }
  }
}

export async function buildInvoicePdf(
  model: InvoiceDocumentModel,
  options: { today?: string } = {},
): Promise<Doc> {
  const { jsPDF, autoTable } = await loadPdfEngine();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }) as Doc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const ctx: Ctx = { doc, pageWidth, pageHeight, contentWidth: pageWidth - MARGIN * 2 };

  doc.setProperties({
    title: `Invoice ${model.number}`,
    subject: `Invoice ${model.number} from ${model.company.name} to ${model.customer.name}`,
    author: model.company.name,
    creator: 'AdminLess Fin',
  });

  const logo = await loadLogo(model.company.logoUrl);
  drawHeaderBand(ctx, model, logo);

  const colWidth = (ctx.contentWidth - 24) / 2;
  const rightColX = MARGIN + colWidth + 24;
  let y = BAND_HEIGHT + 30;

  // ── Who is invoicing, and on what terms ──────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  setText(doc, INK);
  doc.text(model.company.name, MARGIN, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, MUTED);
  for (const line of model.fromLines) {
    const wrapped = doc.splitTextToSize(line, colWidth);
    doc.text(wrapped, MARGIN, y);
    y += wrapped.length * 11;
  }

  // The meta column is pinned to the top of this block rather than following
  // the address, so the dates line up with the company name on every invoice
  // regardless of how many address lines a company has.
  let metaY = BAND_HEIGHT + 30;
  const metaLabelX = rightColX;
  const metaValueX = pageWidth - MARGIN;
  const meta: Array<[string, string]> = [
    ['Invoice date', day(model.invoiceDate)],
    ['Due date', day(model.dueDate)],
  ];
  if (model.customer.paymentTerms != null) {
    meta.push(['Payment terms', `${model.customer.paymentTerms} days`]);
  }
  meta.push(['Status', model.statusLabel]);

  for (const [label, value] of meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, MUTED);
    doc.text(label, metaLabelX, metaY);
    doc.setFont('helvetica', 'bold');
    setText(doc, INK);
    doc.text(value, metaValueX, metaY, { align: 'right' });
    metaY += 15;
  }

  const overdueBy = model.isOverdue ? daysOverdue(model.dueDate, options.today ?? new Date().toISOString().slice(0, 10)) : null;
  if (overdueBy != null && overdueBy > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setText(doc, [178, 44, 44]);
    doc.text(`${overdueBy} day${overdueBy === 1 ? '' : 's'} overdue`, metaValueX, metaY, { align: 'right' });
    metaY += 15;
  }

  y = Math.max(y, metaY) + 18;

  // ── Bill to, beside what is owed ─────────────────────────────────────────
  const panelTop = y;
  const panelHeight = 96;

  setFill(doc, BRAND_TINT);
  setDraw(doc, HAIRLINE);
  doc.roundedRect(MARGIN, panelTop, colWidth, panelHeight, 5, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, BRAND);
  doc.text('BILL TO', MARGIN + 14, panelTop + 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, INK);
  doc.text(doc.splitTextToSize(model.customer.name, colWidth - 28)[0], MARGIN + 14, panelTop + 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setText(doc, MUTED);
  let billY = panelTop + 48;
  if (model.billToLines.length === 0) {
    doc.text('No address or contact details are on file for this customer.', MARGIN + 14, billY, {
      maxWidth: colWidth - 28,
    });
  } else {
    for (const line of model.billToLines) {
      if (billY > panelTop + panelHeight - 10) break;
      doc.text(doc.splitTextToSize(line, colWidth - 28)[0], MARGIN + 14, billY);
      billY += 10.5;
    }
  }

  // The number the reader is looking for, given the most visual weight on the
  // page after the brand itself.
  const duePanelPaid = model.isPaid || model.amountDue <= 0;
  setFill(doc, duePanelPaid ? BRAND : BRAND_BRIGHT);
  doc.roundedRect(rightColX, panelTop, colWidth, panelHeight, 5, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER);
  doc.text(duePanelPaid ? 'PAID IN FULL' : 'AMOUNT DUE', rightColX + 16, panelTop + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text(money(duePanelPaid ? model.total : model.amountDue), rightColX + 16, panelTop + 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (!duePanelPaid) {
    doc.text(`Due ${day(model.dueDate)}`, rightColX + 16, panelTop + 68);
    if (model.amountPaid > 0) {
      doc.text(
        `${money(model.amountPaid)} of ${money(model.total)} already received`,
        rightColX + 16,
        panelTop + 82,
      );
    }
  } else {
    doc.text('No payment is due on this invoice.', rightColX + 16, panelTop + 68);
  }

  y = panelTop + panelHeight + 26;

  // ── What was supplied ────────────────────────────────────────────────────
  const showUnits = model.lines.some((l) => l.quantity != null);
  const head = showUnits
    ? [['Description', 'Qty', 'Unit price', 'Amount']]
    : [['Description', 'Amount']];
  const body = model.lines.map((l) =>
    showUnits
      ? [l.description, l.quantity == null ? '' : qty(l.quantity), l.unitPrice == null ? '' : money(l.unitPrice), money(l.amount)]
      : [l.description, money(l.amount)],
  );
  // An invoice with no revenue lines is a real state (a journal that credits
  // nothing to income), and printing an empty table body would look like a
  // rendering fault rather than what the ledger says.
  const emptyRow = showUnits
    ? ['No lines recorded on this invoice', '', '', money(0)]
    : ['No lines recorded on this invoice', money(0)];

  autoTable(doc, {
    startY: y,
    head,
    body: body.length ? body : [emptyRow],
    styles: { fontSize: 9, cellPadding: { top: 7, right: 10, bottom: 7, left: 10 }, textColor: INK, lineColor: HAIRLINE, lineWidth: 0.5 },
    headStyles: { fillColor: BRAND, textColor: PAPER, fontStyle: 'bold', fontSize: 8, cellPadding: { top: 8, right: 10, bottom: 8, left: 10 } },
    alternateRowStyles: { fillColor: [250, 249, 247] },
    columnStyles: showUnits
      ? { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 48 }, 2: { halign: 'right', cellWidth: 82 }, 3: { halign: 'right', cellWidth: 92 } }
      : { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 110 } },
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: 70 },
  });

  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  y += 16;

  // ── Totals, beside how to pay ────────────────────────────────────────────
  // The two belong on the same band: a customer reads what is owed and then
  // immediately where to send it, and splitting them over a page break is the
  // one break that makes an invoice hard to act on. Both therefore start from
  // a single `bandTop` and the page break, if any, is taken before either.
  const totalsWidth = 230;
  const totalsX = pageWidth - MARGIN - totalsWidth;
  const bankWidth = ctx.contentWidth - totalsWidth - 24;
  const bankHeight = 118;
  const totalsHeight = 46 + model.taxLines.length * 14 + (model.amountPaid > 0 ? 16 : 0) + 40;
  const bandHeight = Math.max(totalsHeight, bankHeight) + (model.linesReconcile ? 0 : 24);

  if (y + bandHeight > pageHeight - 70) {
    doc.addPage();
    y = MARGIN + 10;
  }
  const bandTop = y;

  const totalRow = (label: string, value: string, bold = false, colour: RGB = INK) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 9);
    setText(doc, colour);
    doc.text(label, totalsX, y);
    doc.text(value, pageWidth - MARGIN, y, { align: 'right' });
    y += bold ? 17 : 14;
  };

  y = bandTop + 10;
  totalRow('Subtotal', money(model.subtotal));
  for (const tax of model.taxLines) totalRow(tax.label, money(tax.amount));

  setDraw(doc, HAIRLINE);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 8, pageWidth - MARGIN, y - 8);
  y += 2;
  totalRow('Total', money(model.total), true);

  if (model.amountPaid > 0) {
    totalRow('Received', `-${money(model.amountPaid)}`, false, MUTED);
    y += 2;
  }

  setFill(doc, BRAND);
  doc.roundedRect(totalsX, y - 12, totalsWidth, 30, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, PAPER);
  doc.text(duePanelPaid ? 'Paid in full' : 'Balance due', totalsX + 12, y + 7);
  doc.text(money(duePanelPaid ? 0 : model.amountDue), pageWidth - MARGIN - 12, y + 7, { align: 'right' });
  let totalsBottom = y + 26;

  if (!model.linesReconcile) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setText(doc, [178, 44, 44]);
    const warning = doc.splitTextToSize(
      'The lines above do not add up to the total. The total is the amount receivable per the ledger.',
      totalsWidth,
    );
    doc.text(warning, totalsX, totalsBottom);
    totalsBottom += warning.length * 9;
  }

  // ── How to pay ───────────────────────────────────────────────────────────
  const bankTop = bandTop;
  let bankY = bankTop + 32;

  setDraw(doc, HAIRLINE);
  doc.setLineWidth(0.75);
  setFill(doc, [252, 251, 249]);
  doc.roundedRect(MARGIN, bankTop, bankWidth, bankHeight, 5, 5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, BRAND);
  doc.text('BANKING DETAILS', MARGIN + 14, bankTop + 18);

  if (model.banking && !model.banking.incomplete) {
    const rows: Array<[string, string]> = [
      ['Account name', model.banking.accountName],
      ['Bank', model.banking.bankName ?? '-'],
      ['Account number', model.banking.accountNumber ?? '-'],
    ];
    if (model.banking.branchCode) rows.push(['Branch code', model.banking.branchCode]);
    rows.push(['Reference', model.banking.reference]);

    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setText(doc, MUTED);
      doc.text(label, MARGIN + 14, bankY);
      doc.setFont('helvetica', 'bold');
      setText(doc, INK);
      doc.text(doc.splitTextToSize(value, bankWidth - 130)[0], MARGIN + 118, bankY);
      bankY += 14;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(doc, MUTED);
    doc.text(
      `Please quote ${model.banking.reference} as the payment reference.`,
      MARGIN + 14,
      bankTop + bankHeight - 12,
      { maxWidth: bankWidth - 28 },
    );
  } else {
    // Saying nothing here is what produced invoices a customer could not pay.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, MUTED);
    doc.text(
      doc.splitTextToSize(
        model.banking
          ? 'This company has a default bank account but its bank name and account number have not been captured, so they cannot be printed. Add them under Banking to have them appear on every invoice.'
          : 'No default bank account has been nominated, so there are no banking details to print. Set one under Banking to have them appear on every invoice.',
        bankWidth - 28,
      ),
      MARGIN + 14,
      bankY,
    );
  }

  // ── Notes and terms ──────────────────────────────────────────────────────
  let notesY = Math.max(bankTop + bankHeight, totalsBottom) + 24;
  if (model.notes) {
    if (notesY > pageHeight - 130) {
      doc.addPage();
      notesY = MARGIN + 10;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setText(doc, MUTED);
    doc.text('NOTES', MARGIN, notesY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, INK);
    doc.text(doc.splitTextToSize(model.notes, ctx.contentWidth), MARGIN, notesY + 12);
  }

  if (model.isVoid) drawWatermark(ctx, 'VOID', [178, 44, 44]);
  else if (model.isPaid) drawWatermark(ctx, 'PAID', BRAND);

  drawFooters(ctx, model);

  return doc;
}

function drawFooters(ctx: Ctx, model: InvoiceDocumentModel) {
  const { doc, pageWidth, pageHeight } = ctx;
  const pages = doc.getNumberOfPages();
  const identity = [
    model.company.name,
    model.company.registrationNumber ? `Reg. no. ${model.company.registrationNumber}` : '',
    model.company.vatNumber ? `VAT no. ${model.company.vatNumber}` : '',
  ].filter(Boolean).join('  ·  ');

  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    setDraw(doc, HAIRLINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, pageHeight - 48, pageWidth - MARGIN, pageHeight - 48);
    setFill(doc, BRAND);
    doc.rect(MARGIN, pageHeight - 48.5, 46, 2, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setText(doc, MUTED);
    doc.text(identity, MARGIN, pageHeight - 34, { maxWidth: pageWidth - MARGIN * 2 - 90 });
    doc.text(
      `Invoice ${model.number}  ·  Page ${page} of ${pages}`,
      pageWidth - MARGIN,
      pageHeight - 34,
      { align: 'right' },
    );
  }
}

export async function downloadInvoicePdf(
  model: InvoiceDocumentModel,
  options: { today?: string } = {},
): Promise<void> {
  const doc = await buildInvoicePdf(model, options);
  doc.save(invoiceFileName(model));
}

/**
 * Opens the invoice in the browser's own PDF viewer, where it can be printed.
 *
 * A blocked pop-up would otherwise look exactly like a broken button, so when
 * the window does not open the invoice is saved instead: the user still ends
 * up holding the document, which is the point of pressing Print.
 */
export async function openInvoicePdf(
  model: InvoiceDocumentModel,
  options: { today?: string } = {},
): Promise<void> {
  const doc = await buildInvoicePdf(model, options);
  const url = String(doc.output('bloburl'));
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    doc.save(invoiceFileName(model));
    return;
  }
  // The blob backs the open tab, so it can only be released once that tab has
  // had time to load it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
