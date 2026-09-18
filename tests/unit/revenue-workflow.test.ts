import { describe, expect, it } from 'vitest';
import { BUSINESS_LIFECYCLES } from '../../src/lib/businessLifecycles';
import {
  INVOICE_RECEIVABLE_STAGE_IDS,
  invoiceNextAction,
  invoiceReceivableStatusLabel,
  resolveInvoiceLifecycleStage,
} from '../../src/lib/revenueWorkflow';
import { resolveNextAction } from '../../src/lib/boe/nextActionEngine';

describe('invoice receivable lifecycle', () => {
  it('does not treat bank reconciliation or customer statements as revenue stages', () => {
    const ids = BUSINESS_LIFECYCLES.revenue.stages.map((s) => s.id);
    expect(ids).not.toContain('reconciliation');
    expect(ids).not.toContain('statement');
    expect(BUSINESS_LIFECYCLES.revenue.stages.map((s) => s.label)).not.toContain('Bank Reconciliation');
    expect(BUSINESS_LIFECYCLES.revenue.stages.map((s) => s.label)).not.toContain('Customer Statement');
  });

  it('keeps bank reconciliation on the financial close and banking paths', () => {
    expect(BUSINESS_LIFECYCLES.financial_close.stages.some((s) => s.id === 'reconciliations')).toBe(true);
  });

  it('maps invoice status to the customer receivable stages only', () => {
    expect(resolveInvoiceLifecycleStage({ status: 'draft' })).toBe('invoice');
    expect(resolveInvoiceLifecycleStage({ status: 'sent' })).toBe('payment');
    expect(resolveInvoiceLifecycleStage({ status: 'partially_paid' })).toBe('payment');
    expect(resolveInvoiceLifecycleStage({ status: 'paid' })).toBe('receipt');
    expect(INVOICE_RECEIVABLE_STAGE_IDS).toEqual(['invoice', 'payment', 'receipt']);
  });

  it('does not ask to reconcile a paid invoice', () => {
    expect(invoiceNextAction({ status: 'paid' })).toBeNull();
    expect(resolveNextAction({ lifecycleId: 'revenue', entityType: 'invoice', state: { status: 'paid' } })).toBeNull();
  });

  it('still asks for payment while the receivable is open', () => {
    expect(invoiceNextAction({ status: 'draft' })?.action).toBe('send');
    expect(invoiceNextAction({ status: 'sent' })?.action).toBe('payment');
    expect(invoiceNextAction({ status: 'partially_paid' })?.label).toBe('Receive the balance');
    expect(invoiceNextAction({ status: 'sent' })?.label).not.toMatch(/reconcil/i);
  });

  it('labels status from the receivable, not from bank reconciliation', () => {
    expect(invoiceReceivableStatusLabel({ status: 'draft' })).toBe('Draft');
    expect(invoiceReceivableStatusLabel({ status: 'sent', due_date: '2026-09-20' }, '2026-09-18')).toBe('Sent');
    expect(invoiceReceivableStatusLabel({ status: 'sent', due_date: '2026-09-01' }, '2026-09-18')).toBe('Overdue');
    expect(invoiceReceivableStatusLabel({ status: 'partially_paid' })).toBe('Partially Paid');
    expect(invoiceReceivableStatusLabel({ status: 'paid' })).toBe('Paid');
    expect(invoiceReceivableStatusLabel({ status: 'void' })).toBe('Voided');
  });
});
