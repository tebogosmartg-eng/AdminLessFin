/**
 * The invoice a customer receives.
 *
 * This is one of two documents in the product that leave the company and are
 * read by someone who does not use it, so the brand and the layout are part of
 * the job rather than decoration. It replaces printing the web page, which
 * produced an unbranded sheet with no banking details -- so a customer could
 * read the invoice and still have nowhere to pay it.
 *
 * The masthead, panels, footers and palette live in lib/documents so the
 * invoice and the quotation are visibly the same company's stationery. What is
 * here is what makes this an INVOICE: a debt, what has been received against
 * it, and what is still due.
 *
 * Presentation only: every figure is taken from the document model, which
 * takes them from the ledger. Nothing here adds anything up that the ledger has
 * not already added up, except the column of line amounts it is printing.
 */
import {
  PAPER_RGB,
  PAPER_MARGIN as MARGIN,
  PAPER_BAND_HEIGHT as BAND_HEIGHT,
  day,
  documentFileName,
  money,
  qty,
  todayIso,
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
import { daysOverdue, settlementProgress, type InvoiceDocumentModel } from './invoiceDocument';

export async function buildInvoicePdf(
  model: InvoiceDocumentModel,
  options: { today?: string } = {},
): Promise<PdfDoc> {
  const { ctx, autoTable } = await newPaperDocument({
    title: `Invoice ${model.number}`,
    subject: `Invoice ${model.number} from ${model.company.name} to ${model.customer.name}`,
    author: model.company.name,
  });
  const { doc, pageWidth, pageHeight, contentWidth } = ctx;

  const logo = await loadLogo(model.company.logoUrl);
  drawMasthead(ctx, { title: 'INVOICE', reference: model.number, company: model.company, logo });

  const colWidth = (contentWidth - 24) / 2;
  const rightColX = MARGIN + colWidth + 24;
  const blockTop = BAND_HEIGHT + 30;

  const letterheadBottom = drawLetterhead(
    ctx, model.company, model.fromLines, MARGIN, blockTop, colWidth,
  );

  // The meta column is pinned to the top of this block rather than following
  // the address, so the dates line up with the company name on every invoice
  // regardless of how many address lines a company has.
  const meta: Array<[string, string]> = [
    ['Invoice date', day(model.invoiceDate)],
    ['Due date', day(model.dueDate)],
  ];
  if (model.customer.paymentTerms != null) {
    meta.push(['Payment terms', `${model.customer.paymentTerms} days`]);
  }
  meta.push(['Status', model.statusLabel]);
  let metaBottom = drawMetaColumn(ctx, meta, rightColX, pageWidth - MARGIN, blockTop);

  const overdueBy = model.isOverdue
    ? daysOverdue(model.dueDate, options.today ?? todayIso())
    : null;
  if (overdueBy != null && overdueBy > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setText(doc, PAPER_RGB.alarm);
    doc.text(
      `${overdueBy} day${overdueBy === 1 ? '' : 's'} overdue`,
      pageWidth - MARGIN,
      metaBottom,
      { align: 'right' },
    );
    metaBottom += 15;
  }

  let y = Math.max(letterheadBottom, metaBottom) + 18;

  // -- Bill to, beside what is owed ----------------------------------------
  const panelTop = y;
  const panelHeight = 96;

  drawPartyPanel(
    ctx,
    {
      heading: 'Bill to',
      name: model.customer.name,
      lines: model.billToLines,
      emptyMessage: 'No address or contact details are on file for this customer.',
    },
    MARGIN, panelTop, colWidth, panelHeight,
  );

  // The number the reader is looking for, given the most visual weight on the
  // page after the brand itself.
  const settled = model.settled;
  setFill(doc, settled ? PAPER_RGB.brand : PAPER_RGB.brandBright);
  doc.roundedRect(rightColX, panelTop, colWidth, panelHeight, 5, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.paper);
  doc.text(settled ? model.settledLabel.toUpperCase() : 'AMOUNT DUE', rightColX + 16, panelTop + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text(money(settled ? model.total : model.amountDue), rightColX + 16, panelTop + 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (settled) {
    doc.text('No payment is due on this invoice.', rightColX + 16, panelTop + 68);
  } else {
    doc.text(`Due ${day(model.dueDate)}`, rightColX + 16, panelTop + 68);
    const progress = settlementProgress(model);
    if (progress) {
      doc.text(
        doc.splitTextToSize(progress, colWidth - 32)[0],
        rightColX + 16,
        panelTop + 82,
      );
    }
  }

  y = panelTop + panelHeight + 26;

  // -- What was supplied ---------------------------------------------------
  const showUnits = model.lines.some((l) => l.quantity != null);
  const head = showUnits
    ? [['Description', 'Qty', 'Unit price', 'Amount']]
    : [['Description', 'Amount']];
  const body = model.lines.map((l) =>
    showUnits
      ? [
          l.description,
          l.quantity == null ? '' : qty(l.quantity),
          l.unitPrice == null ? '' : money(l.unitPrice),
          money(l.amount),
        ]
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
    ...lineTableStyles(),
    columnStyles: showUnits
      ? {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 48 },
          2: { halign: 'right', cellWidth: 82 },
          3: { halign: 'right', cellWidth: 92 },
        }
      : { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 110 } },
  });

  y = afterTable(doc, y) + 16;

  // -- Totals, beside how to pay -------------------------------------------
  // The two belong on the same band: a customer reads what is owed and then
  // immediately where to send it, and splitting them over a page break is the
  // one break that makes an invoice hard to act on. Both therefore start from
  // a single bandTop and the page break, if any, is taken before either.
  const totalsWidth = 230;
  const totalsX = pageWidth - MARGIN - totalsWidth;
  const bankWidth = contentWidth - totalsWidth - 24;
  const bankHeight = 118;
  const totalsHeight = 46 + model.taxLines.length * 14 + (model.amountPaid > 0 ? 16 : 0)
    + model.creditNotes.length * 14 + 40;
  const bandHeight = Math.max(totalsHeight, bankHeight) + (model.linesReconcile ? 0 : 24);

  if (y + bandHeight > pageHeight - 70) {
    doc.addPage();
    y = MARGIN + 10;
  }
  const bandTop = y;

  const totalRow = (label: string, value: string, bold = false, colour = PAPER_RGB.ink) => {
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

  setDraw(doc, PAPER_RGB.hairline);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 8, pageWidth - MARGIN, y - 8);
  y += 2;
  totalRow('Total', money(model.total), true);

  if (model.amountPaid > 0) {
    totalRow('Received', `-${money(model.amountPaid)}`, false, PAPER_RGB.muted);
  }
  // Each credit note by number, so the customer can match it to the credit
  // note they were sent.
  for (const credit of model.creditNotes) {
    totalRow(`Credit note ${credit.number}`, `-${money(credit.amount)}`, false, PAPER_RGB.muted);
  }
  if (model.amountPaid > 0 || model.creditNotes.length > 0) {
    y += 2;
  }

  setFill(doc, PAPER_RGB.brand);
  doc.roundedRect(totalsX, y - 12, totalsWidth, 30, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, PAPER_RGB.paper);
  doc.text(settled ? model.settledLabel : 'Balance due', totalsX + 12, y + 7);
  doc.text(money(settled ? 0 : model.amountDue), pageWidth - MARGIN - 12, y + 7, { align: 'right' });
  let totalsBottom = y + 26;

  if (!model.linesReconcile) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setText(doc, PAPER_RGB.alarm);
    const warning = doc.splitTextToSize(
      'The lines above do not add up to the total. The total is the amount receivable per the ledger.',
      totalsWidth,
    );
    doc.text(warning, totalsX, totalsBottom);
    totalsBottom += warning.length * 9;
  }

  drawBankingPanel(
    ctx,
    model.banking,
    `Please quote ${model.number} as the payment reference.`,
    MARGIN, bandTop, bankWidth, bankHeight,
  );

  // -- Notes and terms -----------------------------------------------------
  let notesY = Math.max(bandTop + bankHeight, totalsBottom) + 24;
  if (model.notes) {
    if (notesY > pageHeight - 130) {
      doc.addPage();
      notesY = MARGIN + 10;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setText(doc, PAPER_RGB.muted);
    doc.text('NOTES', MARGIN, notesY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, PAPER_RGB.ink);
    doc.text(doc.splitTextToSize(model.notes, contentWidth), MARGIN, notesY + 12);
  }

  if (model.isVoid) drawWatermark(ctx, 'VOID', PAPER_RGB.alarm);
  else if (model.isPaid) drawWatermark(ctx, model.settledStamp, PAPER_RGB.brand);

  drawFooters(ctx, model.company, `Invoice ${model.number}`);

  return doc;
}

export async function downloadInvoicePdf(
  model: InvoiceDocumentModel,
  options: { today?: string } = {},
): Promise<void> {
  const doc = await buildInvoicePdf(model, options);
  doc.save(documentFileName('Invoice', model.number));
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
    doc.save(documentFileName('Invoice', model.number));
    return;
  }
  // The blob backs the open tab, so it can only be released once that tab has
  // had time to load it.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
