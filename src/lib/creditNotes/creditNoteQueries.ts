import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything a credit note can change.
 *
 * Issuing, applying, un-applying or voiding a credit note moves the customer's
 * balance, one or more invoices' outstanding amounts and statuses, their
 * printed documents, the age analysis and the statement. Refreshing only the
 * credit note list would leave every one of those showing the old figure.
 */
const AFFECTED_VIEWS = [
  'credit_notes',
  'credit_note_document',
  'creditable_invoices',
  'invoices',
  'invoice_detail',
  'invoice_document',
  'customer_open_invoices',
  'customer_ar_balances',
  'customer_detail',
  'debtors_age_analysis',
  'journal_entries',
  'related_journal_entries',
] as const;

export function refreshAfterCreditNoteChange(queryClient: QueryClient) {
  for (const key of AFFECTED_VIEWS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
