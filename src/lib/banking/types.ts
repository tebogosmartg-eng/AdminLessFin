export type BankAccountType = 'bank' | 'cash' | 'petty_cash';
export type BankAccountStatus = 'active' | 'inactive' | 'closed';

export type BankAccount = {
  id: string;
  company_id: string;
  chart_of_account_id: string;
  name: string;
  account_type: BankAccountType;
  account_number: string | null;
  bank_name: string | null;
  branch_code: string | null;
  currency: string;
  status: BankAccountStatus;
  is_default: boolean;
  opening_balance: number;
  opening_balance_date: string | null;
  opening_balance_posted: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  chart_of_accounts?: { name: string; account_number: number } | null;
};

export const BANK_TRANSACTION_TYPES = [
  'deposit',
  'withdrawal',
  'interest_received',
  'interest_paid',
  'bank_charge',
  'manual_adjustment',
  'cash_float',
  'cash_topup',
  'cash_reimbursement',
  'cash_count_adjustment',
  'cash_shortage',
  'cash_overage',
] as const;
export type BankTransactionType = (typeof BANK_TRANSACTION_TYPES)[number] | 'transfer_in' | 'transfer_out' | 'opening_balance';

export const BANK_TRANSACTION_LABELS: Record<string, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  interest_received: 'Interest Received',
  interest_paid: 'Interest Paid',
  bank_charge: 'Bank Charge',
  manual_adjustment: 'Manual Adjustment',
  cash_float: 'Cash Float',
  cash_topup: 'Cash Top-up',
  cash_reimbursement: 'Cash Reimbursement',
  cash_count_adjustment: 'Cash Count Adjustment',
  cash_shortage: 'Cash Shortage',
  cash_overage: 'Cash Overage',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  opening_balance: 'Opening Balance',
};

/** Types that increase the bank account balance by default (debit). */
export const INCREASE_TYPES = new Set([
  'deposit', 'interest_received', 'cash_float', 'cash_topup', 'cash_overage', 'transfer_in', 'opening_balance',
]);
export const DECREASE_TYPES = new Set([
  'withdrawal', 'interest_paid', 'bank_charge', 'cash_reimbursement', 'cash_shortage', 'transfer_out',
]);
/**
 * bank_transactions.amount is always stored positive; direction for most
 * types is unambiguous from transaction_type alone. 'manual_adjustment' and
 * 'cash_count_adjustment' can legitimately go either way and the actual
 * direction chosen isn't persisted on the row (only on the underlying
 * journal_entry_items debit/credit) — these two are deliberately excluded
 * from net cash-flow math rather than guessed.
 */
export function signedDirection(type: string): 1 | -1 | 0 {
  if (INCREASE_TYPES.has(type)) return 1;
  if (DECREASE_TYPES.has(type)) return -1;
  return 0;
}

export type BankTransaction = {
  id: string;
  company_id: string;
  bank_account_id: string;
  transaction_type: BankTransactionType;
  transaction_date: string;
  amount: number;
  description: string | null;
  contra_account_id: string | null;
  transfer_id: string | null;
  statement_line_id: string | null;
  posting_request_id: string | null;
  journal_entry_id: string | null;
  reference: string | null;
  created_by: string | null;
  created_at: string;
  bank_accounts?: { name: string } | null;
};

export type BankStatementLine = {
  id: string;
  company_id: string;
  statement_import_id: string;
  bank_account_id: string;
  line_date: string;
  description: string | null;
  amount: number;
  external_reference: string | null;
  match_status: 'unmatched' | 'matched' | 'manual_adjustment' | 'ignored';
  matched_journal_entry_item_id: string | null;
  matched_bank_transaction_id: string | null;
  created_at: string;
};

export type BankTransferView = {
  transfer_id: string;
  transfer_date: string;
  amount: number;
  description: string | null;
  from_bank_account_id: string;
  from_bank_account_name: string;
  to_bank_account_id: string;
  to_bank_account_name: string;
  posting_request_id: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: string;
};
