/**
 * Cross-module deep-link builders for the revenue / AR graph.
 * Prefer these over ad-hoc path strings so related records stay navigable.
 */

export const moduleDeepLinks = {
  invoice: (id: string) => `/invoices/${id}`,
  invoices: (params?: { status?: string; customer_id?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.customer_id) q.set('customer_id', params.customer_id);
    const qs = q.toString();
    return qs ? `/invoices?${qs}` : '/invoices';
  },
  customer: (id: string) => `/customers/${id}`,
  customers: () => '/customers',
  quote: (id: string) => `/quotes/${id}`,
  quotes: () => '/quotes',
  delivery: () => '/inventory/receipts',
  inventory: () => '/inventory',
  journalEntries: () => '/journal-entries',
  accountsReceivable: () => '/invoices?status=sent',
  receivePayments: () => '/receive-payments',
  bankAllocation: () => '/reconciliation',
  vatTransaction: () => '/reports',
  generalLedger: () => '/general-ledger',
  trialBalance: () => '/trial-balance',
  financialStatements: () => '/financial-statements',
  creditNotes: () => '/credit-notes',
  recurringInvoices: () => '/recurring-invoices',
  revenueWorkspace: (drilldown?: string) =>
    drilldown ? `/sales?drilldown=${encodeURIComponent(drilldown)}` : '/sales',
} as const;

export type RevenueRelatedContext = {
  invoiceId?: string;
  customerId?: string;
  quoteId?: string;
};

/** Ordered related-module links for a revenue document context. */
export function buildRevenueRelatedLinks(ctx: RevenueRelatedContext) {
  const links: { id: string; label: string; to: string }[] = [];

  if (ctx.invoiceId) {
    links.push({ id: 'invoice', label: 'Invoice', to: moduleDeepLinks.invoice(ctx.invoiceId) });
  }
  if (ctx.customerId) {
    links.push({ id: 'customer', label: 'Customer', to: moduleDeepLinks.customer(ctx.customerId) });
  }
  if (ctx.quoteId) {
    links.push({ id: 'quote', label: 'Quote', to: moduleDeepLinks.quote(ctx.quoteId) });
  }

  links.push(
    { id: 'delivery', label: 'Delivery / Inventory', to: moduleDeepLinks.inventory() },
    { id: 'ar', label: 'Accounts Receivable', to: moduleDeepLinks.accountsReceivable() },
    { id: 'payment', label: 'Payment', to: moduleDeepLinks.receivePayments() },
    { id: 'bank', label: 'Bank Allocation', to: moduleDeepLinks.bankAllocation() },
    { id: 'vat', label: 'VAT / Reports', to: moduleDeepLinks.vatTransaction() },
    { id: 'journal', label: 'Journal Entry', to: moduleDeepLinks.journalEntries() },
    { id: 'gl', label: 'General Ledger', to: moduleDeepLinks.generalLedger() },
    { id: 'tb', label: 'Trial Balance', to: moduleDeepLinks.trialBalance() },
    { id: 'fs', label: 'Financial Statements', to: moduleDeepLinks.financialStatements() },
  );

  return links;
}
