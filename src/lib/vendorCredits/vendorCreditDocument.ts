/**
 * The supplier credit as a document.
 *
 * A supplier credit takes money OFF what this company owes a supplier, so what
 * it has to make unmistakable is which bill it reduces, why, by how much
 * including VAT, and where that credit went -- against which bills, and how
 * much is still sitting on the supplier's account. For VAT it is the mirror of
 * a credit note: it must state why it was issued and identify the supply it
 * adjusts, which is why the reason and the original bill are part of the model
 * rather than optional notes.
 *
 * Presentation only. The total is what the credit took out of the creditors
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

export type RawVendorCreditItem = {
  id?: string;
  position?: number | null;
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_amount?: number | string | null;
  tax_amount?: number | string | null;
  tax_rates?: One<{ id?: string; name?: string | null; rate?: number | string | null }>;
};

export type RawVendorCreditDocument = {
  vendor_credit: {
    id: string;
    credit_number: string;
    credit_date: string;
    status: string;
    vendor_id?: string | null;
    reason?: string | null;
    voided_at?: string | null;
    void_reason?: string | null;
    vendors?: One<{
      name?: string | null; contact_name?: string | null; address?: string | null;
      email?: string | null; phone?: string | null; tax_id?: string | null;
    }>;
    bills?: One<{ id?: string; bill_number?: string | null; bill_date?: string | null }>;
    journal_entries?: One<{ journal_number?: string | null }>;
    vendor_credit_items?: RawVendorCreditItem[] | null;
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
    bills?: One<{ id?: string; bill_number?: string | null; bill_date?: string | null; status?: string | null }>;
  }> | null;
  reversal?: { journal_number?: string | null; committed_at?: string | null } | null;
};

export type VendorCreditDocumentLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxLabel: string;
  tax: number;
};

export type VendorCreditApplication = {
  billId: string;
  billNumber: string;
  billDate: string;
  amount: number;
};

export type VendorCreditDocumentModel = {
  vendorCreditId: string;
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
  vendorId: string;
  vendor: DocumentParty;
  letterheadLines: string[];
  vendorLines: string[];
  reason: string;
  originalBill: { id: string; number: string; date: string } | null;
  lines: VendorCreditDocumentLine[];
  taxLines: Array<{ label: string; amount: number }>;
  subtotal: number;
  taxTotal: number;
  total: number;
  applied: number;
  remaining: number;
  applications: VendorCreditApplication[];
  showsQuantities: boolean;
  showsTax: boolean;
  /** False when the lines do not add up to what the ledger debited. */
  linesReconcile: boolean;
};

function taxLabelOf(rate: { name?: string | null; rate?: number | string | null } | undefined): string {
  if (!rate) return '';
  const name = asText(rate.name);
  if (name) return name;
  return rate.rate == null ? 'VAT' : `VAT ${asNumber(rate.rate)}%`;
}

export function vendorCreditStatusLabel(status: string, applied: number, remaining: number): string {
  if (status === 'void') return 'Void';
  if (applied > 0 && remaining <= 0) return 'Applied in full';
  if (applied > 0) return 'Partly applied';
  return 'Not yet applied';
}

export function buildVendorCreditDocument(raw: RawVendorCreditDocument): VendorCreditDocumentModel {
  const vc = raw.vendor_credit;
  const company = companyFromMaster(raw.master, raw.company);

  const vendorRow = relatedOne(vc.vendors) ?? {};
  const vendor: DocumentParty = {
    name: asText(vendorRow.name) || 'Supplier',
    contactName: asText(vendorRow.contact_name),
    address: asText(vendorRow.address),
    email: asText(vendorRow.email),
    phone: asText(vendorRow.phone),
    taxId: asText(vendorRow.tax_id),
  };

  const items = [...(vc.vendor_credit_items ?? [])].sort(
    (a, b) => asNumber(a.position) - asNumber(b.position),
  );
  const lines: VendorCreditDocumentLine[] = items.map((item) => {
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

  // VAT is shown by rate, as the bill it reverses showed it.
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

  const status = asText(vc.status);
  const isVoid = status === 'void';
  const applications: VendorCreditApplication[] = (raw.allocations ?? [])
    .map((a) => {
      const bill = relatedOne(a.bills) ?? {};
      return {
        billId: asText(bill.id),
        billNumber: asText(bill.bill_number) || 'Bill',
        billDate: asText(bill.bill_date),
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

  const bill = relatedOne(vc.bills);

  return {
    vendorCreditId: asText(vc.id),
    number: asText(vc.credit_number),
    date: asText(vc.credit_date),
    status,
    statusLabel: vendorCreditStatusLabel(status, applied, remaining),
    isVoid,
    voidedAt: asText(vc.voided_at).slice(0, 10),
    voidReason: asText(vc.void_reason),
    reversalJournalNumber: asText(raw.reversal?.journal_number),
    journalNumber: asText(relatedOne(vc.journal_entries)?.journal_number),
    company,
    vendorId: asText(vc.vendor_id),
    vendor,
    letterheadLines: letterheadLines(company),
    vendorLines: partyLines(vendor),
    reason: asText(vc.reason),
    originalBill: bill && asText(bill.bill_number)
      ? { id: asText(bill.id), number: asText(bill.bill_number), date: asText(bill.bill_date) }
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
 * The sentence that says what has become of the credit. It is the thing anyone
 * reading the document acts on: whether it has already come off a bill, or is
 * still sitting with the supplier waiting to.
 */
export function vendorCreditSettlementWording(
  model: Pick<VendorCreditDocumentModel, 'isVoid' | 'applied' | 'remaining' | 'applications' | 'voidReason'>,
): string {
  if (model.isVoid) {
    return `This credit has been cancelled and no longer reduces the account${
      model.voidReason ? ` (${model.voidReason})` : ''
    }. Disregard it.`;
  }
  const bills = model.applications.map((a) => a.billNumber);
  const listed = bills.length === 0
    ? ''
    : bills.length === 1
      ? bills[0]
      : `${bills.slice(0, -1).join(', ')} and ${bills[bills.length - 1]}`;
  if (model.applied > 0 && model.remaining <= 0) {
    return `This credit has been set off in full against ${listed}. No further action is needed.`;
  }
  if (model.applied > 0) {
    return `${money(model.applied)} of this credit has been set off against ${listed}. The remaining ${money(model.remaining)} is held on the supplier's account against future bills.`;
  }
  return `This credit of ${money(model.remaining)} is held on the supplier's account against future bills.`;
}
