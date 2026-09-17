/**
 * The credit note as a document.
 *
 * A credit note is the one document a customer receives that takes money OFF
 * what they owe, so what it has to make unmistakable is different from an
 * invoice: which invoice it reduces, why, by how much including VAT, and where
 * that credit went -- against which invoices, and how much is still sitting on
 * the account. A VAT credit note must also carry a brief explanation of why it
 * was issued and identify the supply it adjusts, which is why the reason and
 * the original invoice are part of the model rather than optional notes.
 *
 * Presentation only. The total is what the credit note took out of the debtors
 * control account, the applied figure is the sum of its allocations, and both
 * come from the server. The lines are what was posted, line by line.
 */
import {
  asNumber,
  asText,
  companyFromMaster,
  letterheadLines,
  money,
  partyLines,
  relatedOne,
  round2,
  type DocumentCompany,
  type DocumentParty,
} from '@/lib/documents/paperTheme';

type One<T> = T | T[] | null | undefined;

export type RawCreditNoteItem = {
  id?: string;
  position?: number | null;
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_amount?: number | string | null;
  tax_amount?: number | string | null;
  tax_rates?: One<{ id?: string; name?: string | null; rate?: number | string | null }>;
};

export type RawCreditNoteDocument = {
  credit_note: {
    id: string;
    credit_note_number: string;
    credit_note_date: string;
    status: string;
    customer_id?: string | null;
    reason?: string | null;
    voided_at?: string | null;
    void_reason?: string | null;
    customers?: One<{
      name?: string | null; contact_name?: string | null; address?: string | null;
      email?: string | null; phone?: string | null; tax_id?: string | null;
    }>;
    invoices?: One<{ id?: string; invoice_number?: string | null; invoice_date?: string | null }>;
    journal_entries?: One<{ journal_number?: string | null }>;
    credit_note_items?: RawCreditNoteItem[] | null;
  };
  company?: { name?: string | null; logo_url?: string | null; address?: string | null; tax_id?: string | null } | null;
  master?: {
    company_profile?: Record<string, unknown> | null;
    addresses?: Record<string, unknown> | null;
    tax_registrations?: Record<string, unknown> | null;
  } | null;
  settlement?: { total?: number | string | null; applied?: number | string | null; remaining?: number | string | null } | null;
  allocations?: Array<{
    amount?: number | string | null;
    created_at?: string | null;
    invoices?: One<{ id?: string; invoice_number?: string | null; invoice_date?: string | null; status?: string | null }>;
  }> | null;
  reversal?: { journal_number?: string | null; committed_at?: string | null } | null;
};

export type CreditNoteDocumentLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxLabel: string;
  tax: number;
};

export type CreditNoteApplication = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
};

export type CreditNoteDocumentModel = {
  creditNoteId: string;
  number: string;
  date: string;
  status: string;
  statusLabel: string;
  isVoid: boolean;
  voidedAt: string;
  voidReason: string;
  reversalJournalNumber: string;
  journalNumber: string;
  company: DocumentCompany;
  customerId: string;
  customer: DocumentParty;
  letterheadLines: string[];
  customerLines: string[];
  reason: string;
  originalInvoice: { id: string; number: string; date: string } | null;
  lines: CreditNoteDocumentLine[];
  taxLines: Array<{ label: string; amount: number }>;
  subtotal: number;
  taxTotal: number;
  total: number;
  applied: number;
  remaining: number;
  applications: CreditNoteApplication[];
  showsQuantities: boolean;
  showsTax: boolean;
  /** False when the lines do not add up to what the ledger credited. */
  linesReconcile: boolean;
};

function taxLabelOf(rate: { name?: string | null; rate?: number | string | null } | undefined): string {
  if (!rate) return '';
  const name = asText(rate.name);
  if (name) return name;
  return rate.rate == null ? 'VAT' : `VAT ${asNumber(rate.rate)}%`;
}

export function creditNoteStatusLabel(status: string, applied: number, remaining: number): string {
  if (status === 'void') return 'Void';
  if (applied > 0 && remaining <= 0) return 'Applied in full';
  if (applied > 0) return 'Partly applied';
  return 'Not yet applied';
}

export function buildCreditNoteDocument(raw: RawCreditNoteDocument): CreditNoteDocumentModel {
  const cn = raw.credit_note;
  const company = companyFromMaster(raw.master, raw.company);

  const customerRow = relatedOne(cn.customers) ?? {};
  const customer: DocumentParty = {
    name: asText(customerRow.name) || 'Customer',
    contactName: asText(customerRow.contact_name),
    address: asText(customerRow.address),
    email: asText(customerRow.email),
    phone: asText(customerRow.phone),
    taxId: asText(customerRow.tax_id),
  };

  const items = [...(cn.credit_note_items ?? [])].sort(
    (a, b) => asNumber(a.position) - asNumber(b.position),
  );
  const lines: CreditNoteDocumentLine[] = items.map((item) => {
    const quantity = asNumber(item.quantity);
    const unitPrice = asNumber(item.unit_price);
    // The posted figure where there is one; the arithmetic only as a fallback.
    const amount = item.line_amount == null ? round2(quantity * unitPrice) : round2(asNumber(item.line_amount));
    return {
      description: asText(item.description) || 'Credit',
      quantity,
      unitPrice,
      amount,
      taxLabel: taxLabelOf(relatedOne(item.tax_rates)),
      tax: round2(asNumber(item.tax_amount)),
    };
  });

  // VAT is shown by rate, as the invoice it reverses showed it.
  const byLabel = new Map<string, number>();
  for (const line of lines) {
    if (line.tax <= 0) continue;
    const label = line.taxLabel || 'VAT';
    byLabel.set(label, round2((byLabel.get(label) ?? 0) + line.tax));
  }
  const taxLines = [...byLabel.entries()].map(([label, amount]) => ({ label, amount }));

  const subtotal = round2(lines.reduce((t, l) => t + l.amount, 0));
  const taxTotal = round2(lines.reduce((t, l) => t + l.tax, 0));
  const ledgerTotal = round2(asNumber(raw.settlement?.total));
  const total = ledgerTotal !== 0 ? ledgerTotal : round2(subtotal + taxTotal);

  const status = asText(cn.status);
  const isVoid = status === 'void';
  const applications: CreditNoteApplication[] = (raw.allocations ?? [])
    .map((a) => {
      const invoice = relatedOne(a.invoices) ?? {};
      return {
        invoiceId: asText(invoice.id),
        invoiceNumber: asText(invoice.invoice_number) || 'Invoice',
        invoiceDate: asText(invoice.invoice_date),
        amount: round2(asNumber(a.amount)),
      };
    })
    .filter((a) => a.amount > 0);
  const applied = round2(
    raw.settlement?.applied == null
      ? applications.reduce((t, a) => t + a.amount, 0)
      : asNumber(raw.settlement.applied),
  );
  const remaining = isVoid
    ? 0
    : raw.settlement?.remaining == null
      ? round2(total - applied)
      : round2(asNumber(raw.settlement.remaining));

  const invoice = relatedOne(cn.invoices);

  return {
    creditNoteId: asText(cn.id),
    number: asText(cn.credit_note_number),
    date: asText(cn.credit_note_date),
    status,
    statusLabel: creditNoteStatusLabel(status, applied, remaining),
    isVoid,
    voidedAt: asText(cn.voided_at).slice(0, 10),
    voidReason: asText(cn.void_reason),
    reversalJournalNumber: asText(raw.reversal?.journal_number),
    journalNumber: asText(relatedOne(cn.journal_entries)?.journal_number),
    company,
    customerId: asText(cn.customer_id),
    customer,
    letterheadLines: letterheadLines(company),
    customerLines: partyLines(customer),
    reason: asText(cn.reason),
    originalInvoice: invoice && asText(invoice.invoice_number)
      ? { id: asText(invoice.id), number: asText(invoice.invoice_number), date: asText(invoice.invoice_date) }
      : null,
    lines,
    taxLines,
    subtotal,
    taxTotal,
    total,
    applied,
    remaining,
    applications,
    showsQuantities: lines.some((l) => l.quantity !== 1),
    showsTax: lines.some((l) => l.tax > 0),
    linesReconcile: Math.abs(round2(subtotal + taxTotal) - total) < 0.005,
  };
}

/**
 * The sentence that tells the customer what has become of the credit. It is the
 * thing they act on: whether to expect it against an invoice, or on account.
 */
export function creditNoteSettlementWording(
  model: Pick<CreditNoteDocumentModel, 'isVoid' | 'applied' | 'remaining' | 'applications' | 'voidReason'>,
): string {
  if (model.isVoid) {
    return `This credit note has been cancelled and no longer reduces the account${
      model.voidReason ? ` (${model.voidReason})` : ''
    }. Disregard it.`;
  }
  const invoices = model.applications.map((a) => a.invoiceNumber);
  const listed = invoices.length === 0
    ? ''
    : invoices.length === 1
      ? invoices[0]
      : `${invoices.slice(0, -1).join(', ')} and ${invoices[invoices.length - 1]}`;
  if (model.applied > 0 && model.remaining <= 0) {
    return `This credit has been applied in full against ${listed}. No further action is needed.`;
  }
  if (model.applied > 0) {
    return `${money(model.applied)} of this credit has been applied against ${listed}. The remaining ${money(model.remaining)} is held on your account against future invoices.`;
  }
  return `This credit of ${money(model.remaining)} is held on your account against future invoices.`;
}
