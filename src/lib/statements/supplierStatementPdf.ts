/**
 * Supplier statement PDF.
 *
 * The supplier statement could only be exported as CSV, which is not something
 * a customer can send to a supplier. This renders the same statement the screen
 * shows — opening balance, transactions, running balance, closing balance — plus
 * the age analysis, as a PDF.
 *
 * Presentation only: it renders figures it is given and computes no balance of
 * its own beyond the running total already shown on screen.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type StatementLine = {
  date: string;
  description: string | null;
  bill_number?: string | null;
  type: string;
  amount: number;
  balance: number;
};

export type StatementAgeing = {
  as_of?: string;
  current?: number;
  days_1_30?: number;
  days_31_60?: number;
  days_61_90?: number;
  days_120_plus?: number;
  total?: number;
  ap_control_balance?: number;
  unallocated?: number;
};

export type SupplierStatementInput = {
  companyName: string;
  companyAddress?: string | null;
  vendorName: string;
  vendorAddress?: string | null;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  closingBalance: number;
  totalBilled: number;
  totalPaid: number;
  lines: StatementLine[];
  ageing?: StatementAgeing | null;
};

const money = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(n) || 0);

const day = (d: string) => {
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? String(d) : parsed.toLocaleDateString('en-ZA');
};

export function buildSupplierStatementPdf(input: SupplierStatementInput): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(input.companyName || 'Statement', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (input.companyAddress) {
    y += 14;
    doc.text(String(input.companyAddress), margin, y);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SUPPLIER STATEMENT', doc.internal.pageSize.getWidth() - margin, margin, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `${day(input.dateFrom)} to ${day(input.dateTo)}`,
    doc.internal.pageSize.getWidth() - margin,
    margin + 14,
    { align: 'right' },
  );

  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.text('Supplier', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 13;
  doc.text(input.vendorName, margin, y);
  if (input.vendorAddress) {
    y += 12;
    doc.text(String(input.vendorAddress), margin, y);
  }

  y += 22;
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Description', 'Reference', 'Type', 'Amount', 'Balance']],
    body: [
      [day(input.dateFrom), 'Opening balance', '', '', '', money(input.openingBalance)],
      ...input.lines.map((l) => [
        day(l.date),
        l.description ?? '',
        l.bill_number ?? '-',
        l.type === 'bill' ? 'Bill' : 'Payment',
        money(l.type === 'payment' ? -l.amount : l.amount),
        money(l.balance),
      ]),
    ],
    foot: [['', 'Closing balance', '', '', '', money(input.closingBalance)]],
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });

  const afterTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  let y2 = afterTable + 22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Summary', margin, y2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y2 += 14;
  doc.text(`Total billed: ${money(input.totalBilled)}`, margin, y2);
  doc.text(`Total paid: ${money(input.totalPaid)}`, margin + 180, y2);
  doc.text(`Closing balance: ${money(input.closingBalance)}`, margin + 340, y2);

  const a = input.ageing;
  if (a) {
    y2 += 26;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Age analysis as at ${day(a.as_of ?? input.dateTo)}`, margin, y2);
    autoTable(doc, {
      startY: y2 + 8,
      head: [['Current', '1-30 days', '31-60 days', '61-90 days', '90+ days', 'Total']],
      body: [[
        money(a.current ?? 0),
        money(a.days_1_30 ?? 0),
        money(a.days_31_60 ?? 0),
        money(a.days_61_90 ?? 0),
        money(a.days_120_plus ?? 0),
        money(a.total ?? 0),
      ]],
      styles: { fontSize: 8, cellPadding: 4, halign: 'right' },
      headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', halign: 'right' },
      margin: { left: margin, right: margin },
    });

    // The age analysis covers OPEN BILLS. Anything else sitting on the control
    // account is stated rather than hidden, so the two figures reconcile.
    if (typeof a.unallocated === 'number' && Math.abs(a.unallocated) >= 0.01) {
      const afterAgeing = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(
        `Age analysis covers open bills (${money(a.total ?? 0)}). Control account balance ` +
          `${money(a.ap_control_balance ?? 0)}; difference ${money(a.unallocated)} is payments on ` +
          `account, credit notes or journals not allocated to a bill.`,
        margin,
        afterAgeing + 14,
        { maxWidth: doc.internal.pageSize.getWidth() - margin * 2 },
      );
    }
  }

  return doc;
}

export function downloadSupplierStatementPdf(input: SupplierStatementInput) {
  const doc = buildSupplierStatementPdf(input);
  const safe = input.vendorName.replace(/[^\w.-]+/g, '_');
  doc.save(`Statement_${safe}_${input.dateFrom}_${input.dateTo}.pdf`);
}
