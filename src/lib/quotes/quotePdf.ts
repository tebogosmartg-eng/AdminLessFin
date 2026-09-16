/**
 * The quotation a customer receives.
 *
 * Shares its stationery with the invoice -- same masthead, palette, panels and
 * footers -- because both leave the company and should look like they came from
 * the same one. What differs is what a quotation is FOR: it states a price that
 * is held until a date, and it asks for a decision. So where the invoice puts
 * "Amount due" it puts "Quotation total" with the validity beneath, it prints
 * the scope and the terms the price is offered on, and it ends with an
 * acceptance block someone can sign.
 *
 * Presentation only: every figure comes from the document model.
 */
import {
  PAPER_RGB,
  PAPER_MARGIN as MARGIN,
  PAPER_BAND_HEIGHT as BAND_HEIGHT,
  day,
  documentFileName,
  money,
  qty,
} from '@/lib/documents/paperTheme';
import {
  afterTable,
  drawBankingPanel,
  drawFooters,
  drawLetterhead,
  drawMasthead,
  drawMetaColumn,
  drawPartyPanel,
  drawWatermark,
  lineTableStyles,
  loadLogo,
  newPaperDocument,
  setDraw,
  setFill,
  setText,
  type PdfDoc,
} from '@/lib/documents/paperPdf';
import { validityWording, type QuoteDocumentModel } from './quoteDocument';

export async function buildQuotePdf(model: QuoteDocumentModel): Promise<PdfDoc> {
  const { ctx, autoTable } = await newPaperDocument({
    title: `Quotation ${model.number}`,
    subject: `Quotation ${model.number} from ${model.company.name} to ${model.customer.name}`,
    author: model.company.name,
  });
  const { doc, pageWidth, pageHeight, contentWidth } = ctx;

  const logo = await loadLogo(model.company.logoUrl);
  drawMasthead(ctx, {
    title: 'QUOTATION',
    reference: model.number,
    company: model.company,
    logo,
  });

  const colWidth = (contentWidth - 24) / 2;
  const rightColX = MARGIN + colWidth + 24;
  const blockTop = BAND_HEIGHT + 30;

  const letterheadBottom = drawLetterhead(
    ctx, model.company, model.letterheadLines, MARGIN, blockTop, colWidth,
  );

  const meta: Array<[string, string]> = [
    ['Quotation date', day(model.quoteDate)],
    ['Valid until', model.expiryDate ? day(model.expiryDate) : 'No expiry'],
    ['Status', model.statusLabel],
  ];
  let metaBottom = drawMetaColumn(ctx, meta, rightColX, pageWidth - MARGIN, blockTop);

  if (model.isExpired) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setText(doc, PAPER_RGB.alarm);
    doc.text(
      model.isDraft ? 'The expiry date has already passed' : 'These prices are no longer held',
      pageWidth - MARGIN,
      metaBottom,
      { align: 'right' },
    );
    metaBottom += 15;
  }

  let y = Math.max(letterheadBottom, metaBottom) + 18;

  // ── Who it is for, beside what it comes to ───────────────────────────────
  const panelTop = y;
  const panelHeight = 96;

  drawPartyPanel(
    ctx,
    {
      heading: 'Prepared for',
      name: model.customer.name,
      lines: model.customerLines,
      emptyMessage: 'No address or contact details are on file for this customer.',
    },
    MARGIN, panelTop, colWidth, panelHeight,
  );

  // A quotation is an offer, not a debt. The headline is what it comes to and
  // how long that holds -- never "amount due", which would assert an
  // obligation the customer has not yet agreed to.
  setFill(doc, model.isExpired || model.isDeclined ? PAPER_RGB.muted : PAPER_RGB.brandBright);
  doc.roundedRect(rightColX, panelTop, colWidth, panelHeight, 5, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.paper);
  doc.text('QUOTATION TOTAL', rightColX + 16, panelTop + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text(money(model.total), rightColX + 16, panelTop + 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const validity = doc.splitTextToSize(validityWording(model), colWidth - 32);
  doc.text(validity.slice(0, 2), rightColX + 16, panelTop + 68);

  y = panelTop + panelHeight + 24;

  // ── The scope of the work ────────────────────────────────────────────────
  if (model.scope) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setText(doc, PAPER_RGB.muted);
    doc.text('SCOPE', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, PAPER_RGB.ink);
    const scope = doc.splitTextToSize(model.scope, contentWidth);
    doc.text(scope, MARGIN, y + 13);
    y += 13 + scope.length * 11 + 14;
  }

  // ── What is being quoted ─────────────────────────────────────────────────
  const showTax = model.taxLines.length > 0;
  const head = showTax
    ? [['Description', 'Qty', 'Unit price', 'VAT', 'Amount']]
    : [['Description', 'Qty', 'Unit price', 'Amount']];
  const body = model.lines.map((l) =>
    showTax
      ? [l.description, qty(l.quantity), money(l.unitPrice), l.taxAmount ? money(l.taxAmount) : '-', money(l.amount)]
      : [l.description, qty(l.quantity), money(l.unitPrice), money(l.amount)],
  );
  // A quotation with no lines is a real state -- a draft someone has started.
  // Printing an empty table body would look like a rendering fault.
  const emptyRow = showTax
    ? ['No items quoted yet', '', '', '', money(0)]
    : ['No items quoted yet', '', '', money(0)];

  autoTable(doc, {
    startY: y,
    head,
    body: body.length ? body : [emptyRow],
    ...lineTableStyles(),
    columnStyles: showTax
      ? {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 44 },
          2: { halign: 'right', cellWidth: 76 },
          3: { halign: 'right', cellWidth: 66 },
          4: { halign: 'right', cellWidth: 86 },
        }
      : {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 48 },
          2: { halign: 'right', cellWidth: 86 },
          3: { halign: 'right', cellWidth: 96 },
        },
  });

  y = afterTable(doc, y) + 16;

  // ── Totals, beside how to pay ────────────────────────────────────────────
  const totalsWidth = 230;
  const totalsX = pageWidth - MARGIN - totalsWidth;
  const bankWidth = contentWidth - totalsWidth - 24;
  const bankHeight = 118;
  const totalsHeight = 46 + model.taxLines.length * 14 + 40;
  const bandHeight = Math.max(totalsHeight, bankHeight);

  if (y + bandHeight > pageHeight - 70) {
    doc.addPage();
    y = MARGIN + 10;
  }
  const bandTop = y;

  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 9);
    setText(doc, PAPER_RGB.ink);
    doc.text(label, totalsX, y);
    doc.text(value, pageWidth - MARGIN, y, { align: 'right' });
    y += bold ? 17 : 14;
  };

  y = bandTop + 10;
  totalRow('Subtotal', money(model.subtotal));
  for (const tax of model.taxLines) totalRow(tax.label, money(tax.amount));

  setDraw(doc, PAPER_RGB.hairline);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 8, pageWidth - MARGIN, y - 8);
  y += 6;

  setFill(doc, PAPER_RGB.brand);
  doc.roundedRect(totalsX, y - 12, totalsWidth, 30, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, PAPER_RGB.paper);
  doc.text('Total', totalsX + 12, y + 7);
  doc.text(money(model.total), pageWidth - MARGIN - 12, y + 7, { align: 'right' });
  const totalsBottom = y + 26;

  if (model.taxLines.length === 0 && model.company.vatNumber) {
    // A VAT-registered company quoting nothing in VAT is worth stating plainly,
    // so nobody reads the total as excluding a tax that is about to be added.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setText(doc, PAPER_RGB.muted);
    doc.text(
      doc.splitTextToSize('No VAT has been quoted on these items.', totalsWidth),
      totalsX,
      totalsBottom,
    );
  }

  drawBankingPanel(
    ctx,
    model.banking,
    `Please quote ${model.number} as the reference on any deposit.`,
    MARGIN, bandTop, bankWidth, bankHeight,
  );

  y = Math.max(bandTop + bankHeight, totalsBottom) + 24;

  // ── The terms the price is offered on ────────────────────────────────────
  if (model.terms) {
    const terms = doc.splitTextToSize(model.terms, contentWidth);
    if (y + terms.length * 10 + 26 > pageHeight - 70) {
      doc.addPage();
      y = MARGIN + 10;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setText(doc, PAPER_RGB.muted);
    doc.text('TERMS AND CONDITIONS', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, PAPER_RGB.ink);
    doc.text(terms, MARGIN, y + 13);
    y += 13 + terms.length * 10 + 18;
  }

  // ── Acceptance ───────────────────────────────────────────────────────────
  // What makes this a quotation rather than a price list: somewhere to say yes.
  // Omitted once the question has been answered -- offering a signature block on
  // an accepted, declined or lapsed quotation invites the wrong thing to happen.
  if (!model.isAccepted && !model.isDeclined && !model.isExpired) {
    const acceptHeight = 96;
    if (y + acceptHeight > pageHeight - 70) {
      doc.addPage();
      y = MARGIN + 10;
    }
    setDraw(doc, PAPER_RGB.brand);
    doc.setLineWidth(1);
    setFill(doc, PAPER_RGB.tint);
    doc.roundedRect(MARGIN, y, contentWidth, acceptHeight, 5, 5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setText(doc, PAPER_RGB.brand);
    doc.text('ACCEPTANCE', MARGIN + 14, y + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, PAPER_RGB.ink);
    doc.text(
      doc.splitTextToSize(
        `By signing below ${model.customer.name} accepts this quotation and the terms above, and authorises ${model.company.name} to proceed with the work described.`,
        contentWidth - 28,
      ),
      MARGIN + 14,
      y + 32,
    );

    const lineY = y + acceptHeight - 22;
    const slot = (contentWidth - 28 - 24) / 3;
    const labels = ['Signature', 'Name and capacity', 'Date'];
    setDraw(doc, PAPER_RGB.muted);
    doc.setLineWidth(0.5);
    for (let i = 0; i < 3; i++) {
      const x = MARGIN + 14 + i * (slot + 12);
      doc.line(x, lineY, x + slot, lineY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      setText(doc, PAPER_RGB.muted);
      doc.text(labels[i], x, lineY + 11);
    }
  }

  // Draft is tested first: an unsent quotation is a draft before it is
  // anything else, and stamping EXPIRED on one nobody has seen is misleading.
  if (model.isDraft) drawWatermark(ctx, 'DRAFT', PAPER_RGB.muted);
  else if (model.isDeclined) drawWatermark(ctx, 'DECLINED', PAPER_RGB.alarm);
  else if (model.isExpired) drawWatermark(ctx, 'EXPIRED', PAPER_RGB.alarm);
  else if (model.isAccepted) drawWatermark(ctx, 'ACCEPTED', PAPER_RGB.brand);

  drawFooters(ctx, model.company, `Quotation ${model.number}`);
  return doc;
}

export async function downloadQuotePdf(model: QuoteDocumentModel): Promise<void> {
  const doc = await buildQuotePdf(model);
  doc.save(documentFileName('Quotation', model.number));
}

/**
 * Opens the quotation in the browser's own PDF viewer, where it can be printed.
 *
 * A blocked pop-up would otherwise look exactly like a broken button, so when
 * the window does not open the document is saved instead: the user still ends
 * up holding it, which is the point of pressing Print.
 */
export async function openQuotePdf(model: QuoteDocumentModel): Promise<void> {
  const doc = await buildQuotePdf(model);
  const url = String(doc.output('bloburl'));
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    doc.save(documentFileName('Quotation', model.number));
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
