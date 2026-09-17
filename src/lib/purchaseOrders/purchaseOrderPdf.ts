/**
 * The purchase order a supplier receives.
 *
 * Same stationery as the invoice, the quotation and the statement. What is
 * particular here is that the document is an instruction, not a claim: the
 * headline panel carries the delivery date rather than an amount due, there is
 * no banking panel because we are not asking to be paid, and the page ends
 * with the instruction itself -- supply these, by then, quoting this number.
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
  purchaseOrderInstruction,
  type PurchaseOrderDocumentModel,
} from './purchaseOrderDocument';

export async function buildPurchaseOrderPdf(
  model: PurchaseOrderDocumentModel,
): Promise<PdfDoc> {
  const { ctx, autoTable } = await newPaperDocument({
    title: `Purchase Order ${model.number}`,
    subject: `Purchase order ${model.number} from ${model.company.name} to ${model.supplier.name}`,
    author: model.company.name,
  });
  const { doc, pageWidth, pageHeight, contentWidth } = ctx;

  const logo = await loadLogo(model.company.logoUrl);
  drawMasthead(ctx, {
    title: 'PURCHASE ORDER',
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
  const metaBottom = drawMetaColumn(
    ctx,
    [
      ['Order date', day(model.orderDate)],
      ['Delivery due', model.deliveryDate ? day(model.deliveryDate) : 'Not specified'],
      ['Status', model.statusLabel],
    ],
    rightColX, pageWidth - MARGIN, blockTop,
  );

  let y = Math.max(letterheadBottom, metaBottom) + 18;

  // ── Who supplies, beside where it goes ───────────────────────────────────
  const panelTop = y;
  const panelHeight = 96;

  drawPartyPanel(
    ctx,
    {
      heading: 'Supplier',
      name: model.supplier.name,
      lines: model.supplierLines,
      emptyMessage: 'No address or contact details are on file for this supplier.',
    },
    MARGIN, panelTop, colWidth, panelHeight,
  );

  // A purchase order asks for goods, not money. The panel that would carry an
  // amount due on an invoice carries the delivery instruction instead -- which
  // is the thing the supplier acts on.
  setFill(doc, model.isCancelled ? PAPER_RGB.muted : PAPER_RGB.brandBright);
  doc.roundedRect(rightColX, panelTop, colWidth, panelHeight, 5, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.paper);
  doc.text('DELIVER TO', rightColX + 16, panelTop + 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let deliverY = panelTop + 34;
  for (const line of model.deliverTo) {
    if (deliverY > panelTop + panelHeight - 24) break;
    doc.text(doc.splitTextToSize(line, colWidth - 32)[0], rightColX + 16, deliverY);
    deliverY += 11;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(
    model.deliveryDate ? `By ${day(model.deliveryDate)}` : 'No delivery date specified',
    rightColX + 16,
    panelTop + panelHeight - 12,
  );

  y = panelTop + panelHeight + 26;

  // ── What is ordered ──────────────────────────────────────────────────────
  const showProject = model.lines.some((l) => l.project);
  const head = showProject
    ? [['Description', 'Qty', 'Unit cost', 'Amount', 'Project']]
    : [['Description', 'Qty', 'Unit cost', 'Amount']];
  const body = model.lines.map((l) =>
    showProject
      ? [l.description, qty(l.quantity), money(l.unitCost), money(l.amount), l.project || '-']
      : [l.description, qty(l.quantity), money(l.unitCost), money(l.amount)],
  );
  const emptyRow = showProject
    ? ['No items on this order', '', '', money(0), '']
    : ['No items on this order', '', '', money(0)];

  autoTable(doc, {
    startY: y,
    head,
    body: body.length ? body : [emptyRow],
    ...lineTableStyles(),
    columnStyles: showProject
      ? {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 44 },
          2: { halign: 'right', cellWidth: 80 },
          3: { halign: 'right', cellWidth: 86 },
          4: { cellWidth: 90 },
        }
      : {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 48 },
          2: { halign: 'right', cellWidth: 88 },
          3: { halign: 'right', cellWidth: 96 },
        },
  });

  y = afterTable(doc, y) + 16;

  // ── Total ────────────────────────────────────────────────────────────────
  const totalsWidth = 230;
  const totalsX = pageWidth - MARGIN - totalsWidth;
  if (y + 90 > pageHeight - 70) { doc.addPage(); y = MARGIN + 10; }

  setFill(doc, PAPER_RGB.brand);
  doc.roundedRect(totalsX, y, totalsWidth, 30, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setText(doc, PAPER_RGB.paper);
  doc.text('Order total', totalsX + 12, y + 19);
  doc.text(money(model.total), pageWidth - MARGIN - 12, y + 19, { align: 'right' });

  // A supplier reading a total needs to know whether VAT is expected on top of
  // it. Purchase orders in this system carry no tax, so the document says so
  // rather than leaving the supplier to guess.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  setText(doc, PAPER_RGB.muted);
  doc.text(
    doc.splitTextToSize('Excludes VAT. Invoice VAT at the applicable rate.', totalsWidth),
    totalsX,
    y + 42,
  );

  y += 62;

  // ── Notes and the instruction itself ─────────────────────────────────────
  if (model.notes) {
    const notes = doc.splitTextToSize(model.notes, contentWidth);
    if (y + notes.length * 11 + 26 > pageHeight - 70) { doc.addPage(); y = MARGIN + 10; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setText(doc, PAPER_RGB.muted);
    doc.text('NOTES AND DELIVERY INSTRUCTIONS', MARGIN, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, PAPER_RGB.ink);
    doc.text(notes, MARGIN, y + 13);
    y += 13 + notes.length * 11 + 18;
  }

  const instruction = doc.splitTextToSize(purchaseOrderInstruction(model), contentWidth - 28);
  const boxHeight = 22 + instruction.length * 12;
  if (y + boxHeight > pageHeight - 70) { doc.addPage(); y = MARGIN + 10; }

  setDraw(doc, model.isCancelled ? PAPER_RGB.alarm : PAPER_RGB.brand);
  doc.setLineWidth(1);
  setFill(doc, PAPER_RGB.tint);
  doc.roundedRect(MARGIN, y, contentWidth, boxHeight, 5, 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, model.isCancelled ? PAPER_RGB.alarm : PAPER_RGB.ink);
  doc.text(instruction, MARGIN + 14, y + 20);

  if (model.isCancelled) drawWatermark(ctx, 'CANCELLED', PAPER_RGB.alarm);
  else if (model.isDraft) drawWatermark(ctx, 'DRAFT', PAPER_RGB.muted);

  drawFooters(ctx, model.company, `Purchase order ${model.number}`);
  return doc;
}

export async function downloadPurchaseOrderPdf(
  model: PurchaseOrderDocumentModel,
): Promise<void> {
  const doc = await buildPurchaseOrderPdf(model);
  doc.save(documentFileName('PurchaseOrder', model.number));
}

/**
 * Opens the purchase order in the browser's own PDF viewer, where it can be
 * printed. A blocked pop-up saves it instead, so the button never looks broken.
 */
export async function openPurchaseOrderPdf(
  model: PurchaseOrderDocumentModel,
): Promise<void> {
  const doc = await buildPurchaseOrderPdf(model);
  const url = String(doc.output('bloburl'));
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    doc.save(documentFileName('PurchaseOrder', model.number));
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
