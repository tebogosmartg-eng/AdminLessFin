import type { QueryClient } from '@tanstack/react-query';

/**
 * Everything a supplier credit can change.
 *
 * Issuing, applying, un-applying or voiding a supplier credit moves the
 * supplier's balance, one or more bills' outstanding amounts and statuses, the
 * creditors age analysis and the payables screens. Refreshing only the credit
 * list would leave every one of those showing the old figure.
 */
const AFFECTED_VIEWS = [
  'vendor_credits',
  'vendor_credit_document',
  'creditable_bills',
  'vendor_open_bills',
  'bills',
  'purchases_workspace',
  'vendor_ap_balances',
  'vendor_detail',
  'vendors',
  'creditors_age_analysis',
  'journal_entries',
  'related_journal_entries',
] as const;

export function refreshAfterVendorCreditChange(queryClient: QueryClient) {
  for (const key of AFFECTED_VIEWS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
