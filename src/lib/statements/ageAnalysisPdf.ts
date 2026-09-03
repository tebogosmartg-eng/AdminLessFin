/**
 * Age analysis PDF — the version handed to an auditor.
 *
 * Serves both sides of the ledger: creditors (trade payables) and debtors
 * (trade receivables). They differ only in wording, so the layout, the totals
 * and the reconciliation are written once.
 *
 * The reconciliation is part of the document, not an optional extra. An age
 * analysis ages OPEN BILLS, while the creditors control account can also hold
 * payments on account, credit notes and anything journalled straight to it. A
 * schedule that showed only the aged bills would appear to state the creditors
 * balance and be wrong. Every page therefore ends with:
 *
 *     aged bills + unallocated + unattributed = control account per the ledger
 *
 * Presentation only: it renders figures it is given and computes no balance of
 * its own.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type AgeAnalysisRow = {
  party_name: string;
  buckets: {
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_120_plus: number;
  };
  total: number;
  control_balance: number;
  unallocated: number;
};

export type AgeAnalysisReconciliation = {
  age_analysis_total: number;
  unallocated_to_parties: number;
  unattributed_to_any_party: number;
  general_ledger_control_balance: number;
  variance: number;
  reconciles: boolean;
};

export type AgeAnalysisSide = 'payable' | 'receivable';

/** The only things that differ between the two sides. */
export const SIDE_WORDING: Record<AgeAnalysisSide, {
  title: string; party: string; document: string; controlAccount: string; fileStem: string;
}> = {
  payable: {
    title: 'CREDITORS AGE ANALYSIS',
    party: 'Supplier',
    document: 'bills',
    controlAccount: 'Creditors control account per the general ledger',
    fileStem: 'Creditors_Age_Analysis',
  },
  receivable: {
    title: 'DEBTORS AGE ANALYSIS',
    party: 'Customer',
    document: 'invoices',
    controlAccount: 'Debtors control account per the general ledger',
    fileStem: 'Debtors_Age_Analysis',
  },
};

export type AgeAnalysisInput = {
  side: AgeAnalysisSide;
  companyName: string;
  companyAddress?: string | null;
  asOf: string;
  parties: AgeAnalysisRow[];
  totals: AgeAnalysisRow['buckets'] & { total: number; control_balance: number; unallocated: number };
  reconciliation: AgeAnalysisReconciliation;
  preparedBy?: string | null;
};

const money = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(n) || 0);

const day = (d: string) => {
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? String(d) : parsed.toLocaleDateString('en-ZA');
};

export function buildAgeAnalysisPdf(input: AgeAnalysisInput): jsPDF {
  const w = SIDE_WORDING[input.side];
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(input.companyName || w.title, margin, margin);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (input.companyAddress) doc.text(String(input.companyAddress), margin, margin + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(w.title, pageWidth - margin, margin, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`As at ${day(input.asOf)}`, pageWidth - margin, margin + 14, { align: 'right' });
  doc.text(`Prepared ${new Date().toLocaleString('en-ZA')}`, pageWidth - margin, margin + 26, { align: 'right' });

  const t = input.totals;
  autoTable(doc, {
    startY: margin + 44,
    head: [[w.party, 'Current', '1-30 days', '31-60 days', '61-90 days', '90+ days', 'Aged total', 'Control balance', 'Difference']],
    body: input.parties.map((s) => [
      s.party_name,
      money(s.buckets.current),
      money(s.buckets.days_1_30),
      money(s.buckets.days_31_60),
      money(s.buckets.days_61_90),
      money(s.buckets.days_120_plus),
      money(s.total),
      money(s.control_balance),
      money(s.unallocated),
    ]),
    foot: [[
      'Total',
      money(t.current), money(t.days_1_30), money(t.days_31_60), money(t.days_61_90), money(t.days_120_plus),
      money(t.total), money(t.control_balance), money(t.unallocated),
    ]],
    styles: { fontSize: 8, cellPadding: 4, halign: 'right' },
    columnStyles: { 0: { halign: 'left' } },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', halign: 'right' },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', halign: 'right' },
    margin: { left: margin, right: margin },
  });

  const afterTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin + 44;
  const r = input.reconciliation;

  autoTable(doc, {
    startY: afterTable + 20,
    head: [['Reconciliation to the general ledger', 'Amount']],
    body: [
      [`Open ${w.document} aged above`, money(r.age_analysis_total)],
      [`Movements against a ${w.party.toLowerCase()} that are not an open ${w.document.replace(/s$/, '')} (payments on account, credit notes, journals)`, money(r.unallocated_to_parties)],
      [`Movements on the control account with no ${w.party.toLowerCase()} recorded`, money(r.unattributed_to_any_party)],
      [w.controlAccount, money(r.general_ledger_control_balance)],
      ['Variance', money(r.variance)],
    ],
    styles: { fontSize: 8, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 420 }, 1: { halign: 'right' } },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index >= 3) data.cell.styles.fontStyle = 'bold';
    },
  });

  const afterRecon = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterTable;
  doc.setFontSize(8);
  doc.setFont('helvetica', r.reconciles ? 'normal' : 'bold');
  doc.text(
    r.reconciles
      ? `The age analysis reconciles to the ${input.side === 'payable' ? 'creditors' : 'debtors'} control account in the general ledger.`
      : `THIS ANALYSIS DOES NOT RECONCILE. Unexplained variance ${money(r.variance)}.`,
    margin,
    afterRecon + 16,
    { maxWidth: pageWidth - margin * 2 },
  );
  if (input.preparedBy) {
    doc.setFont('helvetica', 'normal');
    doc.text(`Prepared by ${input.preparedBy}`, margin, afterRecon + 30);
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
  }
  return doc;
}

export function downloadAgeAnalysisPdf(input: AgeAnalysisInput) {
  const doc = buildAgeAnalysisPdf(input);
  doc.save(`${SIDE_WORDING[input.side].fileStem}_${input.asOf}.pdf`);
}
