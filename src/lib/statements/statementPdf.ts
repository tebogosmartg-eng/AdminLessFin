/**
 * The statement of account a customer or a supplier receives.
 *
 * Same stationery as the invoice and the quotation. What is particular to a
 * statement is that it is an account of a period rather than a demand for one
 * amount: it opens with a brought-forward balance, lists what moved, and
 * closes with what is left. The closing balance therefore gets the headline
 * panel, and the running balance column is the thing the layout protects --
 * it is the column a reader checks by hand.
 */
import {
  PAPER_RGB,
  PAPER_MARGIN as MARGIN,
  PAPER_BAND_HEIGHT as BAND_HEIGHT,
  day,
  documentFileName,
  money,
} from '@/lib/documents/paperTheme';
import {
  afterTable,
  drawBankingPanel,
  drawFooters,
  drawLetterhead,
  drawMasthead,
  drawMetaColumn,
  drawPartyPanel,
  lineTableStyles,
  loadLogo,
  newPaperDocument,
  setDraw,
  setFill,
  setText,
  type PdfDoc,
} from '@/lib/documents/paperPdf';
import { closingWording, headlineLabel, type StatementDocumentModel } from './statementDocument';

/**
 * A description short enough to sit on a statement line.
 *
 * Journal descriptions double as internal notes -- a reversal can carry a
 * paragraph explaining why -- and printed in full one such line fills half a
 * page. The party needs to recognise the movement, not read the note, so the
 * PDF cuts at a word boundary. The screen and the CSV keep the full text.
 */
function clip(text: string, max = 90): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:-]+$/, '') + '…';
}

export async function buildStatementPdf(model: StatementDocumentModel): Promise<PdfDoc> {
  const period = `${day(model.dateFrom)} to ${day(model.dateTo)}`;
  const { ctx, autoTable } = await newPaperDocument({
    title: `${model.wording.title} ${model.party.name}`,
    subject: `${model.wording.title} for ${model.party.name}, ${period}`,
    author: model.company.name,
  });
  const { doc, pageWidth, pageHeight, contentWidth } = ctx;

  const logo = await loadLogo(model.company.logoUrl);
  drawMasthead(ctx, {
    title: 'STATEMENT',
    reference: period,
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
      ['Period from', day(model.dateFrom)],
      ['Period to', day(model.dateTo)],
      ['Statement date', day(new Date().toISOString().slice(0, 10))],
    ],
    rightColX, pageWidth - MARGIN, blockTop,
  );

  let y = Math.max(letterheadBottom, metaBottom) + 18;

  // ── Who the account belongs to, beside what it comes to ──────────────────
  const panelTop = y;
  const panelHeight = 96;

  drawPartyPanel(
    ctx,
    {
      heading: model.wording.party,
      name: model.party.name,
      lines: model.partyLines,
      emptyMessage: 'No address or contact details are on file.',
    },
    MARGIN, panelTop, colWidth, panelHeight,
  );

  const inCredit = model.closingBalance < 0;
  const settled = model.closingBalance === 0;
  setFill(doc, settled || inCredit ? PAPER_RGB.brand : PAPER_RGB.brandBright);
  doc.roundedRect(rightColX, panelTop, colWidth, panelHeight, 5, 5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setText(doc, PAPER_RGB.paper);
  doc.text(headlineLabel(model).toUpperCase(), rightColX + 16, panelTop + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(23);
  doc.text(
    model.balanceKnown ? money(Math.abs(model.closingBalance)) : 'Not available',
    rightColX + 16,
    panelTop + 50,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    doc.splitTextToSize(closingWording(model), colWidth - 32).slice(0, 3),
    rightColX + 16,
    panelTop + 66,
  );

  y = panelTop + panelHeight + 26;

  // ── The account ──────────────────────────────────────────────────────────
  // "Balance brought forward" is a row of the table rather than a note above
  // it, so the running balance column starts from a stated figure and every
  // later balance can be checked against the one above it.
  const head = [['Date', 'Description', 'Reference', model.wording.chargeColumn, model.wording.creditColumn, 'Balance']];
  const body: string[][] = [
    ['', 'Balance brought forward', '', '', '', money(model.openingBalance)],
    ...model.lines.map((l) => [
      day(l.date),
      clip(l.description),
      l.reference,
      l.direction === 'charge' ? money(l.amount) : '',
      l.direction === 'credit' ? money(l.amount) : '',
      money(l.balance),
    ]),
  ];
  if (model.lines.length === 0) {
    body.push(['', 'No movements in this period', '', '', '', money(model.closingBalance)]);
  }

  autoTable(doc, {
    startY: y,
    head,
    body,
    foot: [[
      '', 'Closing balance', '',
      money(model.totalCharges), money(model.totalCredits), money(model.closingBalance),
    ]],
    ...lineTableStyles(),
    footStyles: {
      fillColor: [PAPER_RGB.brand[0], PAPER_RGB.brand[1], PAPER_RGB.brand[2]] as [number, number, number],
      textColor: [PAPER_RGB.paper[0], PAPER_RGB.paper[1], PAPER_RGB.paper[2]] as [number, number, number],
      fontStyle: 'bold' as const,
      // 8.5 rather than 9: a six-figure total in bold wraps inside the money
      // columns at 9, and a wrapped total reads as two numbers.
      fontSize: 8.5,
      halign: 'right' as const,
    },
    // Six columns on an A4 page leave little room, so the horizontal padding is
    // tighter than on the invoice and references are set a size smaller: a
    // reference wrapped over three lines is harder to match than a small one.
    styles: { ...lineTableStyles().styles, cellPadding: { top: 6, right: 6, bottom: 6, left: 6 } },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 84, fontSize: 7.5 },
      3: { halign: 'right', cellWidth: 76 },
      4: { halign: 'right', cellWidth: 76 },
      5: { halign: 'right', cellWidth: 84, fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // The brought-forward row is a statement of where the period began, not
      // a movement in it, so it is set apart from the lines beneath it.
      if (data.section === 'body' && data.row.index === 0) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [PAPER_RGB.tint[0], PAPER_RGB.tint[1], PAPER_RGB.tint[2]];
      }
      if (data.section === 'foot' && data.row.index === 0) {
        data.cell.styles.halign = 'right';
      }
    },
    willDrawCell: (data) => {
      if (data.section === 'foot' && data.column.index <= 1) data.cell.styles.halign = 'left';
    },
  });

  y = afterTable(doc, y) + 18;

  if (!model.reconciles) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setText(doc, PAPER_RGB.alarm);
    doc.text(
      doc.splitTextToSize(
        'THIS STATEMENT DOES NOT RECONCILE. The movements listed do not add up to the closing balance in the ledger.',
        contentWidth,
      ),
      MARGIN,
      y,
    );
    y += 22;
  }

  // ── Ageing, where the caller supplied it ─────────────────────────────────
  if (model.ageing) {
    if (y + 90 > pageHeight - 70) { doc.addPage(); y = MARGIN + 10; }
    autoTable(doc, {
      startY: y,
      head: [['Current', '1-30 days', '31-60 days', '61-90 days', '90+ days', 'Total']],
      body: [[
        money(model.ageing.current),
        money(model.ageing.days_1_30),
        money(model.ageing.days_31_60),
        money(model.ageing.days_61_90),
        money(model.ageing.days_120_plus),
        money(model.ageing.total),
      ]],
      ...lineTableStyles(),
      styles: { ...lineTableStyles().styles, halign: 'right' as const, fontSize: 8.5 },
    });
    y = afterTable(doc, y) + 18;
  }

  // ── How to settle ────────────────────────────────────────────────────────
  if (model.banking) {
    const bankHeight = 118;
    if (y + bankHeight > pageHeight - 70) { doc.addPage(); y = MARGIN + 10; }
    drawBankingPanel(
      ctx,
      model.banking,
      `Please quote ${model.banking.reference} as the payment reference.`,
      MARGIN, y, contentWidth - 200, bankHeight,
    );
    y += bankHeight + 18;
  }

  setDraw(doc, PAPER_RGB.hairline);
  drawFooters(ctx, model.company, `${model.wording.title} · ${model.party.name}`);
  return doc;
}

export async function downloadStatementPdf(model: StatementDocumentModel): Promise<void> {
  const doc = await buildStatementPdf(model);
  doc.save(documentFileName('Statement', `${model.party.name}_${model.dateFrom}_${model.dateTo}`));
}

/**
 * Opens the statement in the browser's own PDF viewer, where it can be printed.
 * A blocked pop-up saves it instead, so the button never looks broken.
 */
export async function openStatementPdf(model: StatementDocumentModel): Promise<void> {
  const doc = await buildStatementPdf(model);
  const url = String(doc.output('bloburl'));
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    doc.save(documentFileName('Statement', `${model.party.name}_${model.dateFrom}_${model.dateTo}`));
    return;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
