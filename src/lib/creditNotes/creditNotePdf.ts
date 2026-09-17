/**
 * The credit note a customer receives.
 *
 * Same stationery as the invoice, quotation, statement and purchase order. What
 * is particular here is that the document reduces a debt rather than raising
 * one: the headline panel carries the credit, the page states which invoice it
 * adjusts and why, and where the invoice has a banking panel this has the
 * record of where the credit went -- because a customer's next question is
 * "so what do I owe now?", not "where do I pay?".
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
import {
  creditNoteSettlementWording,
  type CreditNoteDocumentModel,
} from './creditNoteDocument';

export async function buildCreditNotePdf(model: CreditNoteDocumentModel): Promise<PdfDoc> {
  const { ctx, autoTable } = await newPaperDocument({
    title: `Credit Note ${model.number}`,
    subject: `Credit note ${model.number} from ${model.company.name} to ${model.customer.name}`,
    author: model.company.name,
  });
  const { doc, pageWidth, pageHeight, contentWidth } = ctx;

  const logo = await loadLogo(model.company.logoUrl);
  drawMasthead(ctx, { title: 'CREDIT NOTE', reference: model.number, company: model.company, logo });

  const colWidth = (contentWidth - 24) / 2;
  const rightColX = MARGIN + colWidth + 24;
  const blockTop = BAND_HEIGHT + 30;

  const letterheadBottom = drawLetterhead(
    ctx, model.company, model.letterheadLines, MARGIN, blockTop, colWidth,
  );

  const meta: Array<[string, string]> = [['Credit note date', day(model.date)]];
  if (model.originalInvoice) {
    meta.push(['Credits invoice', model.originalInvoice.number]);
    if (model.originalInvoice.date) meta.push(['Invoice date', day(model.originalInvoice.date)]);
  }
  meta.push(['Status', model.statusLabel]);
  if (model.isVoid && model.voidedAt) meta.push(['Voided on', day(model.voidedAt)]);
  const metaBottom = drawMetaColumn(ctx, meta, rightColX, pageWidth - MARGIN, blockTop);

  let y = Math.max(letterheadBottom, metaBottom) + 18;

  // ── Who is credited, beside by how much ──────────────────────────────────
  const panelTop = y;
  // Tall enough for every line of the customer's details: on a VAT credit note
  // the recipient's VAT number is the line that must not be cut off, and it is
  // the last one.
  const panelHeight = Math.max(96, 58 + model.customerLines.length * 10.5);

  drawPartyPanel(
    ctx,
    {
      heading: 'Credit to',
      name: model.customer.name,
      lines: model.customerLines,
      emptyMessage: 'No address or contact details are on file for this customer.',
    },
    MARGIN, panelTop, colWidth, panelHeight,
  );

  setFill(doc, model.isVoid ? PAPER_RGB.muted : PAPER_RGB.brandBright);
  doc.roundedRect(rightColX, panelTop, colWidth, panelHeight, 5, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.paper);
  doc.text(model.isVoid ? 'CREDIT NOTE VOID' : 'TOTAL CREDIT', rightColX + 16, panelTop + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text(money(model.total), rightColX + 16, panelTop + 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const headline = model.isVoid
    ? 'Cancelled. This credit no longer applies.'
    : model.taxTotal > 0
      ? `Including ${money(model.taxTotal)} VAT`
      : 'No VAT on this credit';
  doc.text(headline, rightColX + 16, panelTop + 68);
  if (!model.isVoid) {
    const whereItWent = model.remaining > 0
      ? `${money(model.remaining)} held on account`
      : model.applications.length === 1
        ? `Applied against ${model.applications[0].invoiceNumber}`
        : 'Applied in full';
    doc.text(doc.splitTextToSize(whereItWent, colWidth - 32)[0], rightColX + 16, panelTop + 82);
  }

  y = panelTop + panelHeight + 20;

  // ── Why ──────────────────────────────────────────────────────────────────
  // Text is measured in the font it will be drawn in, or it overruns its box.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const reason = doc.splitTextToSize(model.reason || 'No reason recorded.', contentWidth - 28);
  const reasonHeight = 26 + reason.length * 11;
  setDraw(doc, PAPER_RGB.hairline);
  doc.setLineWidth(0.75);
  setFill(doc, PAPER_RGB.panel);
  doc.roundedRect(MARGIN, y, contentWidth, reasonHeight, 5, 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.brand);
  doc.text('REASON FOR CREDIT', MARGIN + 14, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setText(doc, PAPER_RGB.ink);
  doc.text(reason, MARGIN + 14, y + 29);
  y += reasonHeight + 20;

  // ── What is credited ─────────────────────────────────────────────────────
  const showUnits = model.showsQuantities;
  const showTax = model.showsTax;
  const head = [[
    'Description',
    ...(showUnits ? ['Qty', 'Unit price'] : []),
    ...(showTax ? ['VAT'] : []),
    'Amount',
  ]];
  const body = model.lines.map((l) => [
    l.description,
    ...(showUnits ? [qty(l.quantity), money(l.unitPrice)] : []),
    ...(showTax ? [l.tax > 0 ? money(l.tax) : '-'] : []),
    money(l.amount),
  ]);
  const columnCount = head[0].length;
  const emptyRow = ['No lines recorded on this credit note', ...Array(columnCount - 2).fill(''), money(0)];

  const columnStyles: Record<number, { halign?: 'right'; cellWidth: number | 'auto' }> = { 0: { cellWidth: 'auto' } };
  let col = 1;
  if (showUnits) {
    columnStyles[col++] = { halign: 'right', cellWidth: 44 };
    columnStyles[col++] = { halign: 'right', cellWidth: 82 };
  }
  if (showTax) columnStyles[col++] = { halign: 'right', cellWidth: 76 };
  columnStyles[col] = { halign: 'right', cellWidth: 92 };

  autoTable(doc, {
    startY: y,
    head,
    body: body.length ? body : [emptyRow],
    ...lineTableStyles(),
    columnStyles,
  });

  y = afterTable(doc, y) + 16;

  // ── Totals, beside where the credit went ─────────────────────────────────
  const totalsWidth = 230;
  const totalsX = pageWidth - MARGIN - totalsWidth;
  const appliedWidth = contentWidth - totalsWidth - 24;
  const appliedRows = Math.max(model.applications.length, 1);
  const appliedHeight = 44 + appliedRows * 14 + 18;
  const totalsHeight = 46 + model.taxLines.length * 14 + 40 + (model.linesReconcile ? 0 : 24);
  const bandHeight = Math.max(appliedHeight, totalsHeight);

  if (y + bandHeight > pageHeight - 70) {
    doc.addPage();
    y = MARGIN + 10;
  }
  const bandTop = y;

  const totalRow = (label: string, value: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(doc, PAPER_RGB.ink);
    doc.text(label, totalsX, y);
    doc.text(value, pageWidth - MARGIN, y, { align: 'right' });
    y += 14;
  };

  y = bandTop + 10;
  totalRow('Subtotal', money(model.subtotal));
  for (const tax of model.taxLines) totalRow(tax.label, money(tax.amount));
  setDraw(doc, PAPER_RGB.hairline);
  doc.setLineWidth(0.5);
  doc.line(totalsX, y - 8, pageWidth - MARGIN, y - 8);
  y += 6;

  setFill(doc, model.isVoid ? PAPER_RGB.muted : PAPER_RGB.brand);
  doc.roundedRect(totalsX, y - 12, totalsWidth, 30, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, PAPER_RGB.paper);
  doc.text('Total credit', totalsX + 12, y + 7);
  doc.text(money(model.total), pageWidth - MARGIN - 12, y + 7, { align: 'right' });
  let totalsBottom = y + 26;

  if (!model.linesReconcile) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setText(doc, PAPER_RGB.alarm);
    const warning = doc.splitTextToSize(
      'The lines above do not add up to the total. The total is the amount credited per the ledger.',
      totalsWidth,
    );
    doc.text(warning, totalsX, totalsBottom);
    totalsBottom += warning.length * 9;
  }

  // Where the credit went: the counterpart of the invoice's banking panel.
  setDraw(doc, PAPER_RGB.hairline);
  doc.setLineWidth(0.75);
  setFill(doc, PAPER_RGB.panel);
  doc.roundedRect(MARGIN, bandTop, appliedWidth, appliedHeight, 5, 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.brand);
  doc.text('APPLIED TO', MARGIN + 14, bandTop + 18);

  let rowY = bandTop + 34;
  const amountX = MARGIN + appliedWidth - 14;
  if (model.applications.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, PAPER_RGB.muted);
    doc.text(model.isVoid ? 'Nothing. This credit note is void.' : 'Not yet applied to an invoice.', MARGIN + 14, rowY);
    rowY += 14;
  } else {
    for (const application of model.applications) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      setText(doc, PAPER_RGB.ink);
      doc.text(application.invoiceNumber, MARGIN + 14, rowY);
      doc.setFont('helvetica', 'normal');
      setText(doc, PAPER_RGB.muted);
      if (application.invoiceDate) doc.text(day(application.invoiceDate), MARGIN + 118, rowY);
      setText(doc, PAPER_RGB.ink);
      doc.text(money(application.amount), amountX, rowY, { align: 'right' });
      rowY += 14;
    }
  }
  setDraw(doc, PAPER_RGB.hairline);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 14, rowY - 6, amountX, rowY - 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  setText(doc, PAPER_RGB.ink);
  doc.text('Held on account', MARGIN + 14, rowY + 8);
  doc.text(money(model.remaining), amountX, rowY + 8, { align: 'right' });

  // ── What happens to it ───────────────────────────────────────────────────
  y = Math.max(bandTop + appliedHeight, totalsBottom) + 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const statement = doc.splitTextToSize(creditNoteSettlementWording(model), contentWidth - 28);
  const boxHeight = 22 + statement.length * 12;
  if (y + boxHeight > pageHeight - 70) {
    doc.addPage();
    y = MARGIN + 10;
  }
  setDraw(doc, model.isVoid ? PAPER_RGB.alarm : PAPER_RGB.brand);
  doc.setLineWidth(1);
  setFill(doc, PAPER_RGB.tint);
  doc.roundedRect(MARGIN, y, contentWidth, boxHeight, 5, 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, model.isVoid ? PAPER_RGB.alarm : PAPER_RGB.ink);
  doc.text(statement, MARGIN + 14, y + 20);

  if (model.isVoid) drawWatermark(ctx, 'VOID', PAPER_RGB.alarm);

  drawFooters(ctx, model.company, `Credit note ${model.number}`);
  return doc;
}

export async function downloadCreditNotePdf(model: CreditNoteDocumentModel): Promise<void> {
  const doc = await buildCreditNotePdf(model);
  doc.save(documentFileName('CreditNote', model.number));
}

/**
 * Opens the credit note in the browser's own PDF viewer, where it can be
 * printed. A blocked pop-up saves it instead, so the button never looks broken.
 */
export async function openCreditNotePdf(model: CreditNoteDocumentModel): Promise<void> {
  const doc = await buildCreditNotePdf(model);
  const url = String(doc.output('bloburl'));
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    doc.save(documentFileName('CreditNote', model.number));
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
