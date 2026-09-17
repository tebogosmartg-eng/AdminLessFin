/**
 * The credit note document, and the arithmetic the form shows before posting.
 *
 * The totals tests pin the form to post_credit_note_atomic's rounding: each
 * line to the cent, then that line's VAT to the cent, then added. The document
 * tests pin what a customer is told about where the credit went.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCreditNoteDocument,
  creditNoteSettlementWording,
  creditNoteStatusLabel,
  type RawCreditNoteDocument,
} from '@/lib/creditNotes/creditNoteDocument';
import { creditNoteTotals, roundCents } from '@/lib/creditNotes/creditNoteTotals';

const VAT = { id: 'vat15', name: 'VAT 15%', rate: 15 };

function raw(overrides: Partial<RawCreditNoteDocument> = {}): RawCreditNoteDocument {
  return {
    credit_note: {
      id: 'cn-1',
      credit_note_number: 'CN-00001',
      credit_note_date: '2026-09-17',
      status: 'issued',
      customer_id: 'cust-1',
      reason: 'Two units returned damaged',
      customers: { name: 'Tebogo', address: '1 Main Road\nJohannesburg', tax_id: '4123456789' },
      invoices: { id: 'inv-4', invoice_number: 'INV-00004', invoice_date: '2026-09-16' },
      journal_entries: { journal_number: 'JE-000031' },
      credit_note_items: [
        { position: 2, description: 'Delivery', quantity: 1, unit_price: 30, line_amount: 30, tax_amount: 4.5, tax_rates: VAT },
        { position: 1, description: 'Widget', quantity: 2, unit_price: 100, line_amount: 200, tax_amount: 30, tax_rates: VAT },
      ],
    },
    company: { name: 'My’s Company' },
    master: null,
    settlement: { total: 264.5, applied: 264.5, remaining: 0 },
    allocations: [{ amount: 264.5, invoices: { id: 'inv-4', invoice_number: 'INV-00004', invoice_date: '2026-09-16' } }],
    reversal: null,
    ...overrides,
  };
}

describe('the lines', () => {
  it('prints them in the order they were entered, not the order the database returned them', () => {
    const doc = buildCreditNoteDocument(raw());
    expect(doc.lines.map((l) => l.description)).toEqual(['Widget', 'Delivery']);
  });

  it('shows the figures that were posted', () => {
    const doc = buildCreditNoteDocument(raw());
    expect(doc.lines[0]).toMatchObject({ amount: 200, tax: 30, taxLabel: 'VAT 15%' });
    expect(doc.subtotal).toBe(230);
    expect(doc.taxTotal).toBe(34.5);
    expect(doc.taxLines).toEqual([{ label: 'VAT 15%', amount: 34.5 }]);
  });

  it('takes the total from the ledger and says when the lines disagree with it', () => {
    expect(buildCreditNoteDocument(raw()).linesReconcile).toBe(true);
    const off = buildCreditNoteDocument(raw({ settlement: { total: 300, applied: 0, remaining: 300 } }));
    expect(off.total).toBe(300);
    expect(off.linesReconcile).toBe(false);
  });

  it('hides the quantity and VAT columns when they carry no information', () => {
    const plain = raw();
    plain.credit_note.credit_note_items = [{ position: 1, description: 'Goodwill', quantity: 1, unit_price: 50, line_amount: 50, tax_amount: 0 }];
    const doc = buildCreditNoteDocument({ ...plain, settlement: { total: 50, applied: 0, remaining: 50 }, allocations: [] });
    expect(doc.showsQuantities).toBe(false);
    expect(doc.showsTax).toBe(false);
  });
});

describe('what the customer is told', () => {
  it('names the invoice being credited and the reason', () => {
    const doc = buildCreditNoteDocument(raw());
    expect(doc.originalInvoice).toEqual({ id: 'inv-4', number: 'INV-00004', date: '2026-09-16' });
    expect(doc.reason).toBe('Two units returned damaged');
    expect(doc.customerLines).toContain('VAT no. 4123456789');
  });

  it('says a fully applied credit needs nothing further', () => {
    const doc = buildCreditNoteDocument(raw());
    expect(doc.statusLabel).toBe('Applied in full');
    expect(creditNoteSettlementWording(doc)).toBe(
      'This credit has been applied in full against INV-00004. No further action is needed.',
    );
  });

  it('says how much is still held on account when only part was applied', () => {
    const doc = buildCreditNoteDocument(raw({ settlement: { total: 264.5, applied: 100, remaining: 164.5 } }));
    expect(doc.statusLabel).toBe('Partly applied');
    expect(creditNoteSettlementWording(doc)).toBe(
      'R 100,00 of this credit has been applied against INV-00004. The remaining R 164,50 is held on your account against future invoices.',
    );
  });

  it('says an unapplied credit is held on account', () => {
    const doc = buildCreditNoteDocument(raw({ settlement: { total: 264.5, applied: 0, remaining: 264.5 }, allocations: [] }));
    expect(doc.statusLabel).toBe('Not yet applied');
    expect(creditNoteSettlementWording(doc)).toBe(
      'This credit of R 264,50 is held on your account against future invoices.',
    );
  });

  it('lists every invoice it settled', () => {
    const doc = buildCreditNoteDocument(raw({
      allocations: [
        { amount: 100, invoices: { id: 'a', invoice_number: 'INV-1' } },
        { amount: 100, invoices: { id: 'b', invoice_number: 'INV-2' } },
        { amount: 64.5, invoices: { id: 'c', invoice_number: 'INV-3' } },
      ],
    }));
    expect(creditNoteSettlementWording(doc)).toContain('against INV-1, INV-2 and INV-3.');
  });

  it('tells the customer to disregard a void credit note, and gives it nothing left to apply', () => {
    const voided = raw({ settlement: { total: 264.5, applied: 0, remaining: 264.5 }, allocations: [] });
    voided.credit_note.status = 'void';
    voided.credit_note.void_reason = 'Issued to the wrong customer';
    voided.credit_note.voided_at = '2026-09-18T10:00:00Z';
    const doc = buildCreditNoteDocument(voided);
    expect(doc.isVoid).toBe(true);
    expect(doc.remaining).toBe(0);
    expect(doc.statusLabel).toBe('Void');
    expect(doc.voidedAt).toBe('2026-09-18');
    expect(creditNoteSettlementWording(doc)).toBe(
      'This credit note has been cancelled and no longer reduces the account (Issued to the wrong customer). Disregard it.',
    );
  });
});

describe('status labels', () => {
  it('reads from the allocations, never from a stored flag', () => {
    expect(creditNoteStatusLabel('issued', 0, 100)).toBe('Not yet applied');
    expect(creditNoteStatusLabel('issued', 40, 60)).toBe('Partly applied');
    expect(creditNoteStatusLabel('issued', 100, 0)).toBe('Applied in full');
    expect(creditNoteStatusLabel('void', 100, 0)).toBe('Void');
  });
});

describe('the total the form shows before posting', () => {
  it('rounds VAT per line, the way the posting function does', () => {
    // Three lines of 33.33 at 15%: per-line VAT is 5.00 each (15.00), whereas
    // VAT on the 99.99 subtotal would be 15.00 too -- so use a case where the
    // two methods disagree: 0.10 at 15% is 0.015 -> 0.02 per line.
    const lines = [1, 2, 3].map(() => ({ quantity: 1, unit_price: 0.1, tax_rate_id: 'vat15' }));
    const totals = creditNoteTotals(lines, [VAT]);
    expect(totals.lines.map((l) => l.tax)).toEqual([0.02, 0.02, 0.02]);
    expect(totals.tax).toBe(0.06);
    expect(totals.subtotal).toBe(0.3);
    expect(totals.total).toBe(0.36);
  });

  it('rounds half away from zero, as Postgres ROUND does', () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(2.675)).toBe(2.68);
    expect(roundCents(-1.005)).toBe(-1.01);
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
  });

  it('rounds the line before taking VAT on it', () => {
    // 3 x 33.335 = 100.005 -> 100.01; VAT 15% on 100.01 = 15.0015 -> 15.00.
    const totals = creditNoteTotals([{ quantity: 3, unit_price: 33.335, tax_rate_id: 'vat15' }], [VAT]);
    expect(totals.lines[0]).toEqual({ amount: 100.01, tax: 15 });
  });

  it('treats "none" and an unknown rate as no VAT', () => {
    const totals = creditNoteTotals(
      [
        { quantity: 1, unit_price: 100, tax_rate_id: 'none' },
        { quantity: 1, unit_price: 100, tax_rate_id: 'missing' },
      ],
      [VAT],
    );
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(200);
  });

  it('reproduces the rehearsed posting: 2 x R100 at 15% is R230', () => {
    expect(creditNoteTotals([{ quantity: 2, unit_price: 100, tax_rate_id: 'vat15' }], [VAT]).total).toBe(230);
  });
});
