import { type LifecycleId, lifecycleStageIndex } from './businessLifecycles';

export type RevenueStageId =
  | 'customer'
  | 'opportunity'
  | 'quote'
  | 'approval'
  | 'invoice'
  | 'collections'
  | 'payment'
  | 'receipt'
  | 'reconciliation'
  | 'statement'
  | 'analytics'
  | 'history';

export type QuoteWorkflowState = {
  status: 'draft' | 'sent' | 'accepted' | 'declined' | string;
};

export type InvoiceWorkflowState = {
  status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void' | string;
};

export function resolveQuoteLifecycleStage(quote: QuoteWorkflowState): RevenueStageId {
  switch (quote.status) {
    case 'draft':
      return 'quote';
    case 'sent':
      return 'approval';
    case 'accepted':
      return 'invoice';
    case 'declined':
      return 'history';
    default:
      return 'quote';
  }
}

export function resolveInvoiceLifecycleStage(invoice: InvoiceWorkflowState): RevenueStageId {
  switch (invoice.status) {
    case 'draft':
      return 'invoice';
    // Part-paid is still collections: there is money still to come in.
    case 'sent':
    case 'partially_paid':
      return 'collections';
    case 'paid':
      return 'receipt';
    case 'void':
      return 'history';
    default:
      return 'invoice';
  }
}

export type LifecycleNextAction = {
  label: string;
  description: string;
  route?: string;
  action?: 'send' | 'accept' | 'invoice' | 'payment' | 'reconcile' | 'statement';
};

export function quoteNextAction(quote: QuoteWorkflowState): LifecycleNextAction | null {
  switch (quote.status) {
    case 'draft':
      return { label: 'Send quote', description: 'Email the quote to your customer for review.', action: 'send' };
    case 'sent':
      return { label: 'Await customer approval', description: 'Mark as accepted or declined when the customer responds.', action: 'accept' };
    case 'accepted':
      return { label: 'Create invoice', description: 'Convert this accepted quote into a customer invoice.', action: 'invoice' };
    default:
      return null;
  }
}

export function invoiceNextAction(invoice: InvoiceWorkflowState): LifecycleNextAction | null {
  switch (invoice.status) {
    case 'draft':
      return { label: 'Send invoice', description: 'Send the invoice to the customer to begin collections.', action: 'send' };
    case 'sent':
      return {
        label: 'Receive payment',
        description: 'Record the customer payment when received.',
        route: '/receive-payments',
        action: 'payment',
      };
    case 'partially_paid':
      return {
        label: 'Receive the balance',
        description: 'Part of this invoice has been paid. Record the rest when it arrives.',
        route: '/receive-payments',
        action: 'payment',
      };
    case 'paid':
      return {
        label: 'Reconcile bank deposit',
        description: 'Match this payment in bank reconciliation.',
        route: '/reconciliation',
        action: 'reconcile',
      };
    default:
      return null;
  }
}

const LIFECYCLE_ID: LifecycleId = 'revenue';

export function revenueStageIndex(stageId: RevenueStageId): number {
  return lifecycleStageIndex(LIFECYCLE_ID, stageId);
}

export function isRevenueStageComplete(stageId: RevenueStageId, currentStageId: RevenueStageId): boolean {
  return revenueStageIndex(stageId) < revenueStageIndex(currentStageId);
}

export function isRevenueStageCurrent(stageId: RevenueStageId, currentStageId: RevenueStageId): boolean {
  return stageId === currentStageId;
}
