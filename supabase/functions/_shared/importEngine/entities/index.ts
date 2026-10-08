/**
 * Entity handler registry: one validate and one commit planner per import
 * type. The service and the edge function dispatch through here only.
 */

import type { ImportEntityType } from '../types.ts';
import type { ValidateContext, WorkRow } from './common.ts';
import type { CommitRowInput, CommitUnit } from './db.ts';
import { planMasterDataCommit, validateMasterData } from './masterData.ts';
import { planBillCommit, planInvoiceCommit, validateBills, validateInvoices } from './documents.ts';
import {
  planCustomerPaymentCommit,
  planSupplierPaymentCommit,
  validateCustomerPayments,
  validateSupplierPayments,
} from './payments.ts';
import { planBankCommit, validateBankTransactions } from './bank.ts';
import {
  planJournalCommit,
  planOpeningBalanceCommit,
  validateJournalEntries,
  validateOpeningBalances,
} from './journals.ts';

export interface EntityHandler {
  validate(rows: WorkRow[], ctx: ValidateContext): void;
  planCommit(rows: CommitRowInput[]): CommitUnit[];
}

export const ENTITY_HANDLERS: Record<ImportEntityType, EntityHandler> = {
  customers: {
    validate: (rows, ctx) => validateMasterData('customers', rows, ctx),
    planCommit: rows => planMasterDataCommit('customers', rows),
  },
  vendors: {
    validate: (rows, ctx) => validateMasterData('vendors', rows, ctx),
    planCommit: rows => planMasterDataCommit('vendors', rows),
  },
  products: {
    validate: (rows, ctx) => validateMasterData('products', rows, ctx),
    planCommit: rows => planMasterDataCommit('products', rows),
  },
  chart_of_accounts: {
    validate: (rows, ctx) => validateMasterData('chart_of_accounts', rows, ctx),
    planCommit: rows => planMasterDataCommit('chart_of_accounts', rows),
  },
  invoices: { validate: validateInvoices, planCommit: planInvoiceCommit },
  bills: { validate: validateBills, planCommit: planBillCommit },
  customer_payments: { validate: validateCustomerPayments, planCommit: planCustomerPaymentCommit },
  supplier_payments: { validate: validateSupplierPayments, planCommit: planSupplierPaymentCommit },
  bank_transactions: { validate: validateBankTransactions, planCommit: planBankCommit },
  journal_entries: { validate: validateJournalEntries, planCommit: planJournalCommit },
  opening_balances: { validate: validateOpeningBalances, planCommit: planOpeningBalanceCommit },
};
