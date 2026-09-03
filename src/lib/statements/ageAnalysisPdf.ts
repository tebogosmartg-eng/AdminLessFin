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

/* ------------------------------------------------------------------------- */
/* Control account ledger                                                     */
/* ------------------------------------------------------------------------- */

export type ControlLedgerRow = {
  entry_date: string;
  journal_number: string | null;
  description: string | null;
  party_name: string | null;
  document: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type ControlLedgerInput = {
  side: AgeAnalysisSide;
  companyName: string;
  companyAddress?: string | null;
  asOf: string;
  dateFrom?: string | null;
  controlAccounts: Array<{ account_number: number; name: string }>;
  openingBalance: number;
  rows: ControlLedgerRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  truncated: boolean;
  tie: {
    ledger_closing_balance: number;
    age_analysis_control_balance: number;
    age_analysis_total: number;
    not_open_documents: number;
    ties: boolean;
  };
};

/**
 * The control account ledger, ending in the tie to the age analysis.
 *
 * The tie is on the same page as the detail on purpose: the question an auditor
 * asks of this document is not "what moved" but "does this agree with the age
 * analysis", and that answer should not require a second document.
 */
export function buildControlLedgerPdf(input: ControlLedgerInput): jsPDF {
  const w = SIDE_WORDING[input.side];
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const accounts = input.controlAccounts.map((a) => `${a.account_number} ${a.name}`).join(', ');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(input.companyName || w.title, margin, margin);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (input.companyAddress) doc.text(String(input.companyAddress), margin, margin + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(
    input.side === 'payable' ? 'CREDITORS CONTROL ACCOUNT' : 'DEBTORS CONTROL ACCOUNT',
    pageWidth - margin, margin, { align: 'right' },
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(accounts || 'No control account mapped', pageWidth - margin, margin + 14, { align: 'right' });
  doc.text(
    input.dateFrom ? `${day(input.dateFrom)} to ${day(input.asOf)}` : `To ${day(input.asOf)}`,
    pageWidth - margin, margin + 26, { align: 'right' },
  );

  autoTable(doc, {
    startY: margin + 44,
    head: [['Date', 'Journal', w.party, 'Reference', 'Description', 'Debit', 'Credit', 'Balance']],
    body: [
      ['', '', '', '', input.dateFrom ? 'Opening balance' : 'Opening balance (inception)', '', '', money(input.openingBalance)],
      ...input.rows.map((r) => [
        day(r.entry_date),
        r.journal_number ?? '',
        r.party_name ?? '',
        r.document ?? '',
        (r.description ?? '').slice(0, 70),
        r.debit ? money(r.debit) : '',
        r.credit ? money(r.credit) : '',
        money(r.balance),
      ]),
    ],
    foot: [['', '', '', '', 'Closing balance', money(input.totalDebit), money(input.totalCredit), money(input.closingBalance)]],
    styles: { fontSize: 7, cellPadding: 3 },
    columnStyles: {
      4: { cellWidth: 220 },
      5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
    },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    margin: { left: margin, right: margin },
  });

  const afterTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? margin;
  const t = input.tie;
  autoTable(doc, {
    startY: afterTable + 18,
    head: [['Agreement with the age analysis', 'Amount']],
    body: [
      ['Control account closing balance per this ledger', money(t.ledger_closing_balance)],
      ['Control account balance per the age analysis', money(t.age_analysis_control_balance)],
      ['Difference', money(t.ledger_closing_balance - t.age_analysis_control_balance)],
      [`Of that balance, open ${w.document} aged in the analysis`, money(t.age_analysis_total)],
      ['Not represented by an open document (payments on account, credit notes, journals)', money(t.not_open_documents)],
    ],
    styles: { fontSize: 8, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 460 }, 1: { halign: 'right' } },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index <= 2) data.cell.styles.fontStyle = 'bold';
    },
  });

  const afterTie = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? afterTable;
  doc.setFontSize(8);
  doc.setFont('helvetica', t.ties ? 'normal' : 'bold');
  doc.text(
    t.ties
      ? 'This ledger agrees with the age analysis prepared as at the same date.'
      : 'THIS LEDGER DOES NOT AGREE WITH THE AGE ANALYSIS. Investigate before submitting.',
    margin, afterTie + 16, { maxWidth: pageWidth - margin * 2 },
  );
  if (input.truncated) {
    doc.setFont('helvetica', 'bold');
    doc.text(
      'This ledger was truncated at 20 000 lines and is therefore incomplete.',
      margin, afterTie + 30, { maxWidth: pageWidth - margin * 2 },
    );
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 16, { align: 'right' });
  }
  return doc;
}

export function downloadControlLedgerPdf(input: ControlLedgerInput) {
  const doc = buildControlLedgerPdf(input);
  const stem = input.side === 'payable' ? 'Creditors_Control_Account' : 'Debtors_Control_Account';
  doc.save(`${stem}_${input.asOf}.pdf`);
}
