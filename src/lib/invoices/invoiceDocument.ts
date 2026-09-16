/**
 * The invoice as a document, rather than as a journal.
 *
 * An invoice is stored as a journal entry, and a journal entry is not an
 * invoice. Turning one into the other is where the printed document has
 * always gone wrong, in three ways this module exists to settle:
 *
 * 1. WHAT A LINE SAYS. Until the presentation columns were added, a line could
 *    only be labelled with the general-ledger account it credited, so an
 *    invoice read "Consulting Income" instead of what was sold. Lines posted
 *    before that still have no description, so the account name remains the
 *    fallback -- never a blank.
 *
 * 2. WHICH CREDITS ARE LINES. Selling a stock item credits the inventory asset
 *    account as well as revenue. Treating "every credit that is not tax" as a
 *    line therefore printed the inventory account as though the customer had
 *    bought it. Only credits to income accounts are invoice lines.
 *
 * 3. WHAT THE TOTAL IS. Selling a stock item also debits cost of sales, so
 *    "sum of the debits" -- what the screen used -- overstated the invoice by
 *    the cost of the goods. The amount owed is the debit to the receivables
 *    control account, which the server computes as `gross`; this module treats
 *    that as authoritative and reports any disagreement rather than hiding it.
 *
 * Presentation only. Nothing here computes a balance: the amounts come from
 * the journal and the settlement figures from the allocation engine.
 */
import { isTaxLedgerAccount, type AccountRoleMetadata } from '@/lib/accounting/accountRoles';

export type RawAccount = AccountRoleMetadata & { name?: string | null };

export type RawJournalItem = {
  id?: string;
  amount: number | string;
  type: 'debit' | 'credit';
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  chart_of_accounts?: RawAccount | RawAccount[] | null;
  journal_entry_item_tax_rates?: Array<{
    tax_rates?: { id?: string; name?: string | null; rate?: number | null } | null;
  }> | null;
};

export type RawInvoiceDocument = {
  invoice: {
    id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    status: string;
    notes?: string | null;
    customers?: {
      name?: string | null;
      contact_name?: string | null;
      address?: string | null;
      email?: string | null;
      phone?: string | null;
      tax_id?: string | null;
      payment_terms?: number | null;
    } | null;
    journal_entries?: {
      journal_number?: string | null;
      journal_entry_items?: RawJournalItem[] | null;
    } | Array<{
      journal_number?: string | null;
      journal_entry_items?: RawJournalItem[] | null;
    }> | null;
  };
  company?: {
    name?: string | null;
    logo_url?: string | null;
    address?: string | null;
    tax_id?: string | null;
    default_invoice_notes?: string | null;
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
  settlement?: { gross?: number; allocated?: number; outstanding?: number } | null;
};

export type InvoiceDocumentLine = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
};

export type InvoiceDocumentTaxLine = {
  label: string;
  amount: number;
};

export type InvoiceDocumentBanking = {
  accountName: string;
  bankName: string | null;
  accountNumber: string | null;
  branchCode: string | null;
  accountType: string | null;
  currency: string | null;
  /** What the customer should quote on the transfer so the receipt can be matched. */
  reference: string;
  /** True when the account exists but nobody has captured the number to pay into. */
  incomplete: boolean;
};

export type InvoiceDocumentModel = {
  invoiceId: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  status: string;
  statusLabel: string;
  isVoid: boolean;
  isPaid: boolean;
  /** True only when money has actually settled the invoice in full. */
  settled: boolean;
  isOverdue: boolean;
  company: {
    name: string;
    address: string;
    email: string;
    phone: string;
    website: string;
    registrationNumber: string;
    vatNumber: string;
    taxId: string;
    logoUrl: string | null;
  };
  customer: {
    name: string;
    contactName: string;
    address: string;
    email: string;
    phone: string;
    taxId: string;
    paymentTerms: number | null;
  };
  lines: InvoiceDocumentLine[];
  taxLines: InvoiceDocumentTaxLine[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  /** Address, contact and tax lines for the Bill To block, already filtered. */
  billToLines: string[];
  /** Address, registration and contact lines for the letterhead, already filtered. */
  fromLines: string[];
  banking: InvoiceDocumentBanking | null;
  notes: string;
  /**
   * False when the lines and tax shown do not add up to the amount receivable.
   * The document still prints the receivable as the total -- it is what the
   * ledger says the customer owes -- but a caller can warn rather than let a
   * reader silently check the arithmetic and find it wrong.
   */
  linesReconcile: boolean;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** PostgREST returns a to-one embed as an object and a to-many as an array. */
function one<T>(value: T | T[] | null | undefined): T | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Unpaid',
  partially_paid: 'Part paid',
  paid: 'Paid in full',
  void: 'Void',
};

/**
 * An income account is a line the customer bought. Where the chart has not
 * been typed at all, fall back to "a credit that is not tax", which is how the
 * screen has always read it -- wrong for stock, right for everything else, and
 * better than dropping the line off the invoice entirely.
 */
function isRevenueLine(account: RawAccount | undefined, anyAccountTyped: boolean): boolean {
  if (!account) return !anyAccountTyped;
  if (isTaxLedgerAccount(account)) return false;
  if (anyAccountTyped) return str(account.type) === 'Income';
  return true;
}

export function buildInvoiceDocument(raw: RawInvoiceDocument): InvoiceDocumentModel {
  const invoice = raw.invoice;
  const journal = one(invoice.journal_entries);
  const items = journal?.journal_entry_items ?? [];

  const credits = items.filter((i) => i.type === 'credit');
  const accountOf = (i: RawJournalItem) => one(i.chart_of_accounts);
  // If nothing in this journal carries a type, the chart predates typing and
  // the Income test would silently empty the invoice.
  const anyAccountTyped = items.some((i) => str(accountOf(i)?.type) !== '');

  const lines: InvoiceDocumentLine[] = credits
    .filter((i) => isRevenueLine(accountOf(i), anyAccountTyped))
    .map((i) => {
      const quantity = i.quantity == null ? null : num(i.quantity);
      const unitPrice = i.unit_price == null ? null : num(i.unit_price);
      return {
        description: str(i.description) || str(accountOf(i)?.name) || 'Goods and services supplied',
        // A quantity of one adds a column of "1" to every row and tells the
        // reader nothing, so it is shown only when it carries information.
        quantity: quantity != null && quantity !== 1 ? quantity : null,
        unitPrice: quantity != null && quantity !== 1 ? unitPrice : null,
        amount: num(i.amount),
      };
    });

  const taxItems = credits.filter((i) => isTaxLedgerAccount(accountOf(i)));
  const taxLines: InvoiceDocumentTaxLine[] = taxItems.map((i) => {
    const rate = i.journal_entry_item_tax_rates?.[0]?.tax_rates;
    const label = rate?.name
      ? str(rate.name)
      : rate?.rate != null
        ? `VAT ${rate.rate}%`
        : str(accountOf(i)?.name) || 'Tax';
    return { label, amount: num(i.amount) };
  });

  const subtotal = round2(lines.reduce((t, l) => t + l.amount, 0));
  const taxTotal = round2(taxLines.reduce((t, l) => t + l.amount, 0));

  // `gross` is the debit to the receivables control account -- what the ledger
  // says is owed. It comes back as zero when the invoice's debit did not land
  // on a control account at all, which happens when the chart has the account
  // mistyped; the document then falls back to adding its own lines up.
  //
  // `outstanding` is derived from that same gross, so it has to fall with it.
  // Trusting the server's zero outstanding beside a locally computed total is
  // what made an unpaid draft print PAID IN FULL.
  const gross = raw.settlement?.gross;
  const grossIsUsable = gross != null && num(gross) !== 0;
  const total = grossIsUsable ? round2(num(gross)) : round2(subtotal + taxTotal);
  const amountPaid = round2(num(raw.settlement?.allocated));
  const amountDue =
    grossIsUsable && raw.settlement?.outstanding != null
      ? round2(num(raw.settlement.outstanding))
      : round2(total - amountPaid);

  const status = str(invoice.status);
  // "Paid in full" is a claim about money received, so it needs money to have
  // been received. An invoice worth nothing, or one merely drafted, is not paid.
  const settled = status === 'paid' || (total > 0 && amountPaid > 0 && amountDue <= 0);

  const profile = raw.master?.company_profile ?? {};
  const addresses = raw.master?.addresses ?? {};
  const taxReg = raw.master?.tax_registrations ?? {};

  const customer = invoice.customers ?? {};
  const bank = raw.banking;
  const banking: InvoiceDocumentBanking | null = bank
    ? {
        accountName: str(bank.name) || str(profile.registered_name) || str(raw.company?.name),
        bankName: str(bank.bank_name) || null,
        accountNumber: str(bank.account_number) || null,
        branchCode: str(bank.branch_code) || null,
        accountType: str(bank.account_type) || null,
        currency: str(bank.currency) || null,
        reference: str(invoice.invoice_number),
        incomplete: !str(bank.account_number) || !str(bank.bank_name),
      }
    : null;

  const dueDate = str(invoice.due_date);

  const companyName =
    str(profile.registered_name) || str(profile.trading_name) || str(raw.company?.name) || 'Your Company';
  const companyAddress =
    str(addresses.business_address) ||
    str(addresses.registered_office) ||
    str(addresses.physical_address) ||
    str(addresses.postal_address) ||
    str(raw.company?.address);
  const registrationNumber = str(profile.registration_number);
  const vatNumber = str(taxReg.vat_number);

  const fromLines = [
    ...(companyAddress ? companyAddress.split(/\r?\n/) : []),
    registrationNumber ? `Reg. no. ${registrationNumber}` : '',
    vatNumber ? `VAT no. ${vatNumber}` : '',
    str(addresses.email),
    str(addresses.telephone),
    str(addresses.website),
  ]
    .map((l) => l.trim())
    .filter(Boolean);

  // An address block with nothing in it reads as a rendering fault. Saying the
  // details are not on file is both honest and a prompt to go and capture them.
  const billToLines = [
    str(customer.contact_name) ? `Attn: ${str(customer.contact_name)}` : '',
    ...(str(customer.address) ? str(customer.address).split(/\r?\n/) : []),
    str(customer.email),
    str(customer.phone),
    str(customer.tax_id) ? `VAT no. ${str(customer.tax_id)}` : '',
  ]
    .map((l) => l.trim())
    .filter(Boolean);

  return {
    invoiceId: str(invoice.id),
    number: str(invoice.invoice_number),
    invoiceDate: str(invoice.invoice_date),
    dueDate,
    status,
    statusLabel: STATUS_LABELS[status] ?? status,
    isVoid: status === 'void',
    isPaid: status === 'paid',
    settled,
    isOverdue: status !== 'paid' && status !== 'void' && status !== 'draft' && amountDue > 0,
    company: {
      name: companyName,
      address: companyAddress,
      email: str(addresses.email),
      phone: str(addresses.telephone),
      website: str(addresses.website),
      registrationNumber,
      vatNumber,
      taxId: str(taxReg.income_tax_number) || str(raw.company?.tax_id),
      logoUrl: str(raw.company?.logo_url) || null,
    },
    customer: {
      name: str(customer.name) || 'Customer',
      contactName: str(customer.contact_name),
      address: str(customer.address),
      email: str(customer.email),
      phone: str(customer.phone),
      taxId: str(customer.tax_id),
      paymentTerms: customer.payment_terms == null ? null : num(customer.payment_terms),
    },
    lines,
    taxLines,
    subtotal,
    taxTotal,
    total,
    amountPaid,
    amountDue,
    billToLines,
    fromLines,
    banking,
    notes: str(invoice.notes) || str(raw.company?.default_invoice_notes),
    linesReconcile: Math.abs(round2(subtotal + taxTotal) - total) < 0.005,
  };
}

/** "Invoice_INV-00042.pdf" — safe on every filesystem the browser may save to. */
export function invoiceFileName(model: Pick<InvoiceDocumentModel, 'number'>): string {
  const stem = model.number.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return `Invoice_${stem || 'document'}.pdf`;
}

/**
 * How overdue the invoice is, in whole days, or null when it is not overdue.
 * Taken against a caller-supplied "today" so the document is reproducible and
 * testable rather than dependent on when it happens to be rendered.
 */
export function daysOverdue(dueDate: string, today: string): number | null {
  if (!dueDate || !today || dueDate >= today) return null;
  const due = Date.parse(dueDate + 'T00:00:00Z');
  const now = Date.parse(today + 'T00:00:00Z');
  if (!Number.isFinite(due) || !Number.isFinite(now)) return null;
  return Math.round((now - due) / 86_400_000);
}
