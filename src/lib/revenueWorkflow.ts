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
  | 'analytics'
  | 'history';

/**
 * Invoice page stages: the customer's receivable, not the accounting engine's
 * internal path. Bank reconciliation and customer statements stay available
 * elsewhere; they are not required to complete an invoice.
 */
export const INVOICE_RECEIVABLE_STAGE_IDS = ['invoice', 'payment', 'receipt'] as const;

export type QuoteWorkflowState = {
  status: 'draft' | 'sent' | 'accepted' | 'declined' | string;
};

export type InvoiceWorkflowState = {
  status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void' | string;
  due_date?: string | null;
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
    case 'sent':
    case 'partially_paid':
      return 'payment';
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
  action?: 'send' | 'accept' | 'invoice' | 'payment';
};

export function quoteNextAction(quote: QuoteWorkflowState): LifecycleNextAction | null {
  switch (quote.status) {
    case 'draft':
      return {
        label: 'Send quote',
        description: 'Email the quote, or mark it sent, accepted, or declined without email.',
        action: 'send',
      };
    case 'sent':
      return { label: 'Await customer approval', description: 'Mark as accepted or declined when the customer responds.', action: 'accept' };
    case 'accepted':
      return { label: 'Create invoice', description: 'Convert this accepted quote into a customer invoice.', action: 'invoice' };
    default:
      return null;
  }
}

/**
 * Next action on the invoice itself. Recording payment completes the customer
 * receivable. Bank reconciliation is a separate banking control and is never
 * returned here.
 */
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
    default:
      return null;
  }
}

/** Receivable-facing status. Overdue is display-only; the stored status stays `sent`. */
export function invoiceReceivableStatusLabel(
  invoice: InvoiceWorkflowState,
  today: string = new Date().toISOString().slice(0, 10),
): string {
  switch (invoice.status) {
    case 'draft':
      return 'Draft';
    case 'paid':
      return 'Paid';
    case 'void':
      return 'Voided';
    case 'partially_paid':
      return invoiceIsPastDue(invoice.due_date, today) ? 'Overdue · Partially Paid' : 'Partially Paid';
    case 'sent':
      return invoiceIsPastDue(invoice.due_date, today) ? 'Overdue' : 'Sent';
    default:
      return invoice.status;
  }
}

function invoiceIsPastDue(dueDate: string | null | undefined, today: string): boolean {
  return !!dueDate && dueDate < today;
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
