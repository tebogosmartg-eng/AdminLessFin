/**
 * The quotation as a document.
 *
 * A quote is structurally healthier than an invoice: `quote_items` already
 * stores the description, quantity, unit price and tax rate that were typed,
 * and there is no journal to mistranslate. The defect here was arithmetic and
 * omission rather than translation:
 *
 * 1. TAX WAS COLLECTED AND NEVER ADDED. QuoteForm asks for a tax rate per line
 *    and QuotePreview shows the VAT while drafting, but the saved quote -- the
 *    one printed and emailed -- totalled quantity x unit_price and stopped.
 *    The invoice raised from that quote DOES charge VAT, so a customer accepted
 *    one price and was billed another. That is a commercial defect, not a
 *    cosmetic one, and this module is the single place the total is worked out.
 *
 * 2. THE TERMS WERE NEVER PRINTED. `quotes.terms` and the scope in
 *    `quotes.description` are captured on every quote and appeared on no
 *    document, which is what turns a quotation into a bare price list.
 *
 * 3. EXPIRY WAS DECORATIVE. An expired quote looked identical to a live one,
 *    so nothing stopped a customer accepting a price that had lapsed.
 *
 * Presentation and arithmetic only: a quote posts nothing to the ledger, so
 * the figures here are computed from the quote's own lines and are the only
 * figures there are.
 */
import {
  asNumber,
  asText,
  bankingFromAccount,
  companyFromMaster,
  daysBetween,
  letterheadLines,
  partyLines,
  relatedOne,
  round2,
  type DocumentBanking,
  type DocumentCompany,
  type DocumentParty,
} from '@/lib/documents/paperTheme';

export type RawQuoteItem = {
  id?: string;
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  tax_rate_id?: string | null;
  products?: { name?: string | null } | Array<{ name?: string | null }> | null;
  tax_rates?: { id?: string; name?: string | null; rate?: number | null }
    | Array<{ id?: string; name?: string | null; rate?: number | null }>
    | null;
};

export type RawQuoteDocument = {
  quote: {
    id: string;
    quote_number: string;
    quote_date: string;
    expiry_date?: string | null;
    status: string;
    description?: string | null;
    terms?: string | null;
    customers?: {
      name?: string | null;
      contact_name?: string | null;
      address?: string | null;
      email?: string | null;
      phone?: string | null;
      tax_id?: string | null;
    } | null;
    quote_items?: RawQuoteItem[] | null;
  };
  company?: {
    name?: string | null;
    logo_url?: string | null;
    address?: string | null;
    tax_id?: string | null;
    default_quote_terms?: string | null;
  } | null;
  master?: {
    company_profile?: Record<string, unknown> | null;
    addresses?: Record<string, unknown> | null;
    tax_registrations?: Record<string, unknown> | null;
  } | null;
  banking?: {
    name?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    branch_code?: string | null;
    account_type?: string | null;
    currency?: string | null;
  } | null;
  /** Every tax rate in the company, so a line can resolve its own rate. */
  taxRates?: Array<{ id: string; name?: string | null; rate?: number | null }> | null;
  /** Set when this quote has already been turned into an invoice. */
  invoices?: Array<{ id: string; invoice_number: string; status: string }> | null;
};

export type QuoteDocumentLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  /** quantity x unit price, before tax. */
  amount: number;
  taxLabel: string | null;
  taxAmount: number;
};

export type QuoteDocumentTaxLine = { label: string; amount: number };

export type QuoteDocumentModel = {
  quoteId: string;
  number: string;
  quoteDate: string;
  expiryDate: string;
  status: string;
  statusLabel: string;
  isDraft: boolean;
  isAccepted: boolean;
  isDeclined: boolean;
  /** Past its expiry date and not yet accepted or declined. */
  isExpired: boolean;
  /** Days left before it expires, or null when it has none or has lapsed. */
  daysUntilExpiry: number | null;
  company: DocumentCompany;
  customer: DocumentParty;
  lines: QuoteDocumentLine[];
  taxLines: QuoteDocumentTaxLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  letterheadLines: string[];
  customerLines: string[];
  banking: DocumentBanking | null;
  /** The scope of the work, as typed on the quote. */
  scope: string;
  /** The quote's own terms, falling back to the company's standing wording. */
  terms: string;
  /** The invoice this quote became, when it has been converted. */
  convertedTo: { id: string; number: string } | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Awaiting your decision',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
};

/** The rate on a line, from its own embed or from the company's rate list. */
function resolveRate(
  item: RawQuoteItem,
  byId: Map<string, { name?: string | null; rate?: number | null }>,
): { label: string; rate: number } | null {
  const embedded = relatedOne(item.tax_rates);
  const fromList = item.tax_rate_id ? byId.get(String(item.tax_rate_id)) : undefined;
  const found = embedded ?? fromList;
  if (!found || found.rate == null) return null;
  const rate = asNumber(found.rate);
  if (rate === 0) return null;
  return { label: asText(found.name) || `VAT ${rate}%`, rate };
}

/**
 * What a quote comes to, VAT included.
 *
 * Exported so the quotes list, the drafting preview and the printed document
 * all reach the same number through the same code. Three independent
 * calculations is what let the list and the preview disagree in the first
 * place, with the customer-facing one being the one that was wrong.
 */
export function quoteTotals(
  items: RawQuoteItem[] | null | undefined,
  taxRates?: Array<{ id: string; name?: string | null; rate?: number | null }> | null,
): { subtotal: number; taxTotal: number; total: number } {
  const byId = new Map<string, { name?: string | null; rate?: number | null }>();
  for (const r of taxRates ?? []) byId.set(String(r.id), r);

  let subtotal = 0;
  let taxTotal = 0;
  for (const item of items ?? []) {
    const amount = round2(asNumber(item.quantity) * asNumber(item.unit_price));
    subtotal = round2(subtotal + amount);
    const rate = resolveRate(item, byId);
    if (rate) taxTotal = round2(taxTotal + round2((amount * rate.rate) / 100));
  }
  return { subtotal, taxTotal, total: round2(subtotal + taxTotal) };
}

export function buildQuoteDocument(
  raw: RawQuoteDocument,
  options: { today: string },
): QuoteDocumentModel {
  const quote = raw.quote;
  const items = quote.quote_items ?? [];
  const byId = new Map<string, { name?: string | null; rate?: number | null }>();
  for (const r of raw.taxRates ?? []) byId.set(String(r.id), r);

  const lines: QuoteDocumentLine[] = items.map((item) => {
    const quantity = asNumber(item.quantity);
    const unitPrice = asNumber(item.unit_price);
    const amount = round2(quantity * unitPrice);
    const rate = resolveRate(item, byId);
    return {
      description:
        asText(item.description) ||
        asText(relatedOne(item.products)?.name) ||
        'Goods and services quoted',
      quantity,
      unitPrice,
      amount,
      taxLabel: rate?.label ?? null,
      // Rounded per line, the same way post_sales_invoice_atomic rounds it, so
      // the quoted total and the invoice raised from it agree to the cent.
      taxAmount: rate ? round2((amount * rate.rate) / 100) : 0,
    };
  });

  const subtotal = round2(lines.reduce((t, l) => t + l.amount, 0));

  // Grouped by label so a quote mixing 15% and zero-rated lines shows one
  // "VAT 15%" line rather than one per item.
  const grouped = new Map<string, number>();
  for (const line of lines) {
    if (!line.taxLabel || line.taxAmount === 0) continue;
    grouped.set(line.taxLabel, round2((grouped.get(line.taxLabel) ?? 0) + line.taxAmount));
  }
  const taxLines: QuoteDocumentTaxLine[] = [...grouped].map(([label, amount]) => ({ label, amount }));
  const taxTotal = round2(taxLines.reduce((t, l) => t + l.amount, 0));
  const total = round2(subtotal + taxTotal);

  const company = companyFromMaster(raw.master, raw.company);
  const customerRow = quote.customers ?? {};
  const customer: DocumentParty = {
    name: asText(customerRow.name) || 'Customer',
    contactName: asText(customerRow.contact_name),
    address: asText(customerRow.address),
    email: asText(customerRow.email),
    phone: asText(customerRow.phone),
    taxId: asText(customerRow.tax_id),
  };

  const status = asText(quote.status);
  const expiryDate = asText(quote.expiry_date);
  // A quote that has been answered cannot expire: accepting or declining ends
  // its life, and stamping EXPIRED on an accepted quote would contradict the
  // agreement it records.
  const settledByAnswer = status === 'accepted' || status === 'declined';
  const isExpired = !settledByAnswer && !!expiryDate && expiryDate < options.today;
  const converted = (raw.invoices ?? [])[0];

  return {
    quoteId: asText(quote.id),
    number: asText(quote.quote_number),
    quoteDate: asText(quote.quote_date),
    expiryDate,
    status,
    // A draft says Draft even when its expiry date has passed: it was never
    // offered to anyone, so it cannot have lapsed in a customer's hands. The
    // stale date is still called out in the validity wording, which is what
    // the person about to send it needs to see.
    statusLabel: status === 'draft'
      ? 'Draft'
      : isExpired ? 'Expired' : (STATUS_LABELS[status] ?? status),
    isDraft: status === 'draft',
    isAccepted: status === 'accepted',
    isDeclined: status === 'declined',
    isExpired,
    daysUntilExpiry: isExpired ? null : daysBetween(options.today, expiryDate),
    company,
    customer,
    lines,
    taxLines,
    subtotal,
    taxTotal,
    total,
    letterheadLines: letterheadLines(company),
    customerLines: partyLines(customer),
    banking: bankingFromAccount(raw.banking, company.name, asText(quote.quote_number)),
    scope: asText(quote.description),
    terms: asText(quote.terms) || asText(raw.company?.default_quote_terms),
    convertedTo: converted ? { id: converted.id, number: converted.invoice_number } : null,
  };
}

/** What the validity line says, in the words a customer reads. */
export function validityWording(model: QuoteDocumentModel): string {
  if (!model.expiryDate) return 'This quotation does not carry an expiry date.';
  if (model.isAccepted) return 'This quotation has been accepted.';
  if (model.isDeclined) return 'This quotation was declined.';
  if (model.isExpired) {
    return model.isDraft
      ? `The expiry date on this draft (${model.expiryDate}) has already passed. Set a new one before sending it.`
      : `This quotation expired on ${model.expiryDate} and the prices are no longer held.`;
  }
  const days = model.daysUntilExpiry;
  if (days == null) return 'This quotation expires today.';
  return `Prices held for ${days} more day${days === 1 ? '' : 's'}.`;
}
