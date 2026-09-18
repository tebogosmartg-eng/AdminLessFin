/**
 * The supplier credit document, and the arithmetic the form shows before
 * posting.
 *
 * The totals tests pin the form to post_vendor_credit_atomic's rounding: each
 * line to the cent, then that line's VAT to the cent, then added. The document
 * tests pin what the page says about where the credit went -- and, in
 * particular, that a void credit is worth nothing however its journal reads.
 */
import { describe, it, expect } from 'vitest';
import {
  buildVendorCreditDocument,
  vendorCreditSettlementWording,
  vendorCreditStatusLabel,
  type RawVendorCreditDocument,
} from '@/lib/vendorCredits/vendorCreditDocument';
import { vendorCreditTotals, roundCents } from '@/lib/vendorCredits/vendorCreditTotals';

const VAT = { id: 'vat15', name: 'VAT 15%', rate: 15 };

function raw(overrides: Partial<RawVendorCreditDocument> = {}): RawVendorCreditDocument {
  return {
    vendor_credit: {
      id: 'vc-1',
      credit_number: 'VCN-00001',
      credit_date: '2026-09-18',
      status: 'issued',
      vendor_id: 'vend-1',
      reason: 'Two units returned damaged',
      vendors: { name: 'Acme Supplies', address: '1 Main Road\nJohannesburg', tax_id: '4123456789' },
      bills: { id: 'bill-4', bill_number: 'BILL-00004', bill_date: '2026-09-16' },
      journal_entries: { journal_number: 'JE-000031' },
      vendor_credit_items: [
        { position: 2, description: 'Delivery', quantity: 1, unit_price: 30, line_amount: 30, tax_amount: 4.5, tax_rates: VAT },
        { position: 1, description: 'Widget', quantity: 2, unit_price: 100, line_amount: 200, tax_amount: 30, tax_rates: VAT },
      ],
    },
    company: { name: 'My’s Company' },
    master: null,
    settlement: { total: 264.5, applied: 264.5, remaining: 0 },
    allocations: [{ amount: 264.5, bills: { id: 'bill-4', bill_number: 'BILL-00004', bill_date: '2026-09-16' } }],
    reversal: null,
    ...overrides,
  };
}

describe('the lines', () => {
  it('prints them in the order they were entered, not the order the database returned them', () => {
    const doc = buildVendorCreditDocument(raw());
    expect(doc.lines.map((l) => l.description)).toEqual(['Widget', 'Delivery']);
  });

  it('shows the figures that were posted', () => {
    const doc = buildVendorCreditDocument(raw());
    expect(doc.lines[0]).toMatchObject({ amount: 200, tax: 30, taxLabel: 'VAT 15%' });
    expect(doc.subtotal).toBe(230);
    expect(doc.taxTotal).toBe(34.5);
    expect(doc.taxLines).toEqual([{ label: 'VAT 15%', amount: 34.5 }]);
  });

  it('takes the total from the ledger and says when the lines disagree with it', () => {
    expect(buildVendorCreditDocument(raw()).linesReconcile).toBe(true);

    // The ledger debited 300; the lines only account for 264.50. The document
    // must print what the ledger says and admit the difference rather than
    // quietly showing a total no journal supports.
    const drifted = buildVendorCreditDocument(raw({ settlement: { total: 300, applied: 0, remaining: 300 } }));
    expect(drifted.total).toBe(300);
    expect(drifted.linesReconcile).toBe(false);
  });
});

describe('what the credit is worth', () => {
  it('is applied in full when the allocations cover it', () => {
    const doc = buildVendorCreditDocument(raw());
    expect(doc.applied).toBe(264.5);
    expect(doc.remaining).toBe(0);
    expect(doc.statusLabel).toBe('Applied in full');
    expect(doc.applications).toEqual([
      { billId: 'bill-4', billNumber: 'BILL-00004', billDate: '2026-09-16', amount: 264.5 },
    ]);
  });

  it('holds the rest on the supplier account when only part of it was used', () => {
    const doc = buildVendorCreditDocument(
      raw({
        settlement: { total: 264.5, applied: 100, remaining: 164.5 },
        allocations: [{ amount: 100, bills: { id: 'bill-4', bill_number: 'BILL-00004' } }],
      }),
    );
    expect(doc.statusLabel).toBe('Partly applied');
    expect(vendorCreditSettlementWording(doc)).toContain('held on the supplier');
  });

  it('is worth nothing once void, whatever its journal still says', () => {
    const doc = buildVendorCreditDocument(
      raw({
        vendor_credit: { ...raw().vendor_credit, status: 'void', voided_at: '2026-09-18T09:00:00Z', void_reason: 'Wrong supplier' },
        settlement: { total: 264.5, applied: 0, remaining: 264.5 },
        allocations: [],
        reversal: { journal_number: 'JE-000032' },
      }),
    );
    expect(doc.isVoid).toBe(true);
    expect(doc.remaining).toBe(0);
    expect(doc.statusLabel).toBe('Void');
    expect(doc.reversalJournalNumber).toBe('JE-000032');
    expect(doc.voidedAt).toBe('2026-09-18');
    expect(vendorCreditSettlementWording(doc)).toContain('cancelled');
  });

  it('names every bill the credit was set against', () => {
    const doc = buildVendorCreditDocument(
      raw({
        settlement: { total: 264.5, applied: 264.5, remaining: 0 },
        allocations: [
          { amount: 200, bills: { id: 'b1', bill_number: 'BILL-00001' } },
          { amount: 64.5, bills: { id: 'b2', bill_number: 'BILL-00002' } },
        ],
      }),
    );
    expect(vendorCreditSettlementWording(doc)).toContain('BILL-00001 and BILL-00002');
  });
});

describe('the status label', () => {
  it('says what a reader needs to know at a glance', () => {
    expect(vendorCreditStatusLabel('void', 0, 0)).toBe('Void');
    expect(vendorCreditStatusLabel('issued', 0, 100)).toBe('Not yet applied');
    expect(vendorCreditStatusLabel('issued', 40, 60)).toBe('Partly applied');
    expect(vendorCreditStatusLabel('issued', 100, 0)).toBe('Applied in full');
  });
});

describe('the totals the form shows before posting', () => {
  it('rounds each line, then its VAT, the way the database does', () => {
    const totals = vendorCreditTotals(
      [
        { quantity: 3, unit_price: 33.335, tax_rate_id: 'vat15' },
        { quantity: 1, unit_price: 10, tax_rate_id: null },
      ],
      [VAT],
    );
    expect(totals.lines[0]).toEqual({ amount: 100.01, tax: 15 });
    expect(totals.lines[1]).toEqual({ amount: 10, tax: 0 });
    expect(totals.subtotal).toBe(110.01);
    expect(totals.tax).toBe(15);
    expect(totals.total).toBe(125.01);
  });

  it("treats 'none' as no VAT rather than as an unknown rate", () => {
    const totals = vendorCreditTotals([{ quantity: 1, unit_price: 100, tax_rate_id: 'none' }], [VAT]);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(100);
  });

  it('rounds half away from zero, as Postgres ROUND does', () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(2.675)).toBe(2.68);
  });
});
