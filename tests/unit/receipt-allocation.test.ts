import { describe, expect, it } from 'vitest';
import {
  allocateOldestFirst,
  allocatedCents,
  allocationProblem,
  type OpenInvoice,
} from '../../src/lib/accounting/receiptAllocation';

/**
 * The receipt dialog previews how a payment will be applied, and the server
 * applies the same rule when no allocation is given. A preview that disagrees
 * with what happens is worse than no preview, so the rule is pinned here.
 */

const invoice = (
  id: string,
  invoice_number: string,
  outstanding: number,
  invoice_date = '2026-01-01',
): OpenInvoice => ({
  id,
  invoice_number,
  invoice_date,
  due_date: invoice_date,
  status: 'sent',
  gross: outstanding,
  allocated: 0,
  outstanding,
});

describe('applying a receipt oldest first', () => {
  const list = [
    invoice('a', 'INV-1', 100, '2026-01-01'),
    invoice('b', 'INV-2', 250, '2026-02-01'),
    invoice('c', 'INV-3', 50, '2026-03-01'),
  ];

  it('settles the oldest invoice first', () => {
    expect(allocateOldestFirst(list, 100)).toEqual({ a: '100.00' });
  });

  it('spills into the next invoice once the first is covered', () => {
    expect(allocateOldestFirst(list, 300)).toEqual({ a: '100.00', b: '200.00' });
  });

  it('never allocates more than an invoice has outstanding', () => {
    const all = allocateOldestFirst(list, 1000);
    expect(all).toEqual({ a: '100.00', b: '250.00', c: '50.00' });
    // 400 applied out of 1000; the remaining 600 is a credit on account, which
    // the caller reports rather than forcing onto an invoice.
    expect(allocatedCents(all)).toBe(40000);
  });

  it('takes the list in the order given rather than re-sorting it', () => {
    // The server orders by invoice date then number and the reader supplying
    // this list uses the same order. Sorting again here would be a third
    // opinion about what "oldest" means.
    const reversed = [...list].reverse();
    expect(allocateOldestFirst(reversed, 100)).toEqual({ c: '50.00', b: '50.00' });
  });

  it('allocates nothing for a zero or negative amount', () => {
    expect(allocateOldestFirst(list, 0)).toEqual({});
    expect(allocateOldestFirst(list, -50)).toEqual({});
  });

  it('skips invoices that have nothing left on them', () => {
    const withSettled = [invoice('a', 'INV-1', 0), invoice('b', 'INV-2', 75)];
    expect(allocateOldestFirst(withSettled, 75)).toEqual({ b: '75.00' });
  });

  it('works in whole cents, so a part payment does not leave a rounding crumb', () => {
    const odd = [invoice('a', 'INV-1', 33.33), invoice('b', 'INV-2', 66.67)];
    const all = allocateOldestFirst(odd, 100);
    expect(all).toEqual({ a: '33.33', b: '66.67' });
    expect(allocatedCents(all)).toBe(10000);
  });
});

describe('what stops a receipt being posted', () => {
  const list = [invoice('a', 'INV-1', 100), invoice('b', 'INV-2', 250)];

  it('accepts an allocation that fits', () => {
    expect(allocationProblem(list, { a: '100.00', b: '50.00' }, 150)).toBeNull();
  });

  it('accepts allocating nothing, which leaves the money on account', () => {
    expect(allocationProblem(list, {}, 500)).toBeNull();
  });

  it('refuses allocating more than was received', () => {
    expect(allocationProblem(list, { a: '100.00', b: '250.00' }, 200))
      .toBe('The invoice allocations come to more than the amount received.');
  });

  it('refuses over-paying a single invoice, and names it', () => {
    expect(allocationProblem(list, { a: '150.00' }, 500))
      .toBe('More has been allocated to INV-1 than it has outstanding.');
  });

  it('refuses a negative allocation', () => {
    expect(allocationProblem(list, { a: '-10' }, 500))
      .toBe('The amount applied to INV-1 cannot be negative.');
  });

  it('ignores blank and unparseable boxes rather than failing on them', () => {
    expect(allocationProblem(list, { a: '', b: 'abc' }, 100)).toBeNull();
    expect(allocatedCents({ a: '', b: 'abc' })).toBe(0);
  });
});
