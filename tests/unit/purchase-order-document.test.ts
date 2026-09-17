/**
 * The purchase order document model.
 *
 * A purchase order is an instruction, so the tests that matter are about what
 * it tells the supplier to do: deliver what, to where, by when, quoting what.
 * A cancelled or draft order must never read as an instruction to supply.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPurchaseOrderDocument,
  purchaseOrderInstruction,
  type RawPurchaseOrderDocument,
} from '@/lib/purchaseOrders/purchaseOrderDocument';

function raw(overrides: Partial<RawPurchaseOrderDocument> = {}): RawPurchaseOrderDocument {
  return {
    purchase_order: {
      id: 'po-1',
      po_number: 'PO-00042',
      po_date: '2026-09-01',
      delivery_date: '2026-09-30',
      status: 'sent',
      notes: 'Deliver to the loading bay before 16:00.',
      vendors: { name: 'Acme Supplies', contact_name: 'Sipho', email: 'orders@acme.co.za' },
      purchase_order_items: [
        { description: 'Steel brackets', quantity: 40, unit_cost: 12.5, projects: { name: 'Depot fit-out' } },
        { description: 'Delivery', quantity: 1, unit_cost: 350 },
      ],
      ...(overrides.purchase_order ?? {}),
    },
    company: { name: 'Spaceman', address: '12 Long Street\nCape Town' },
    master: null,
    ...overrides,
  };
}

describe('what is ordered', () => {
  it('totals quantity times unit cost', () => {
    const doc = buildPurchaseOrderDocument(raw());
    expect(doc.lines[0].amount).toBe(500);
    expect(doc.lines[1].amount).toBe(350);
    expect(doc.total).toBe(850);
  });

  it('never leaves a line unlabelled', () => {
    const input = raw();
    input.purchase_order.purchase_order_items = [{ description: '  ', quantity: 1, unit_cost: 10 }];
    expect(buildPurchaseOrderDocument(input).lines[0].description).toBe('Goods or services ordered');
  });

  it('carries the project a line is for, and an empty string when there is none', () => {
    const doc = buildPurchaseOrderDocument(raw());
    expect(doc.lines[0].project).toBe('Depot fit-out');
    expect(doc.lines[1].project).toBe('');
  });

  it('totals an empty order at zero rather than NaN', () => {
    const input = raw();
    input.purchase_order.purchase_order_items = [];
    const doc = buildPurchaseOrderDocument(input);
    expect(doc.lines).toEqual([]);
    expect(doc.total).toBe(0);
  });

  it('treats a missing quantity or cost as zero', () => {
    const input = raw();
    input.purchase_order.purchase_order_items = [{ description: 'Blank' }];
    expect(buildPurchaseOrderDocument(input).total).toBe(0);
  });
});

describe('where it goes', () => {
  it('addresses delivery to the ordering company', () => {
    const doc = buildPurchaseOrderDocument(raw());
    expect(doc.deliverTo).toEqual(['Spaceman', '12 Long Street', 'Cape Town']);
  });

  it('includes a telephone number when master data has one', () => {
    const doc = buildPurchaseOrderDocument(
      raw({
        master: {
          company_profile: { registered_name: 'Spaceman Holdings' },
          addresses: { business_address: '12 Long Street', telephone: '021 555 0100' },
          tax_registrations: {},
        },
      }),
    );
    expect(doc.deliverTo).toEqual(['Spaceman Holdings', '12 Long Street', 'Tel 021 555 0100']);
  });

  it('still names the company when no address is on file', () => {
    const doc = buildPurchaseOrderDocument(raw({ company: { name: 'Spaceman' }, master: null }));
    expect(doc.deliverTo).toEqual(['Spaceman']);
  });
});

describe('the instruction', () => {
  it('tells the supplier to supply, by when, quoting the order number', () => {
    const doc = buildPurchaseOrderDocument(raw());
    const line = purchaseOrderInstruction(doc);
    expect(line).toMatch(/Please supply/);
    expect(line).toContain('2026-09-30');
    expect(line).toContain('PO-00042');
  });

  it('omits a date it does not have, rather than inventing one', () => {
    const input = raw();
    input.purchase_order.delivery_date = null;
    const line = purchaseOrderInstruction(buildPurchaseOrderDocument(input));
    expect(line).toMatch(/Please supply the items above and quote/);
  });

  it('tells a supplier NOT to supply against a cancelled order', () => {
    const input = raw();
    input.purchase_order.status = 'cancelled';
    const doc = buildPurchaseOrderDocument(input);
    expect(doc.isCancelled).toBe(true);
    expect(purchaseOrderInstruction(doc)).toMatch(/Do not supply against it, and do not invoice it/);
  });

  it('says a draft is not an instruction at all', () => {
    const input = raw();
    input.purchase_order.status = 'draft';
    const doc = buildPurchaseOrderDocument(input);
    expect(doc.isDraft).toBe(true);
    expect(purchaseOrderInstruction(doc)).toMatch(/has not been issued/);
  });

  it('puts every status into words a supplier can read', () => {
    const statuses: Array<[string, string]> = [
      ['sent', 'Issued'],
      ['received', 'Received in full'],
      ['partially_received', 'Partly received'],
      ['cancelled', 'Cancelled'],
    ];
    for (const [status, label] of statuses) {
      const input = raw();
      input.purchase_order.status = status;
      expect(buildPurchaseOrderDocument(input).statusLabel).toBe(label);
    }
  });
});
