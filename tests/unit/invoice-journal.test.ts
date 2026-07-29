import { describe, it, expect } from 'vitest';
import {
  invoiceJournalEntry,
  invoiceJournalItems,
  invoiceTotal,
} from '../../src/lib/invoiceJournal';

/**
 * Regression guard for the R0.00 invoice bug: the invoices→journal_entries embed
 * is a to-one FK, so PostgREST returns a single OBJECT. The list/detail derived
 * commercial data via `journal_entries[0]`, which is undefined on an object,
 * zeroing every total and blanking every line. These tests use the exact object
 * shape captured live from the invoices edge.
 */

// Live shape captured from the `invoices` edge (GET_ALL/GET_ONE): a single object.
const objectEmbed = {
  journal_entry_items: [
    { type: 'credit' as const, amount: 1000 }, // revenue
    { type: 'credit' as const, amount: 150 }, // tax
    { type: 'debit' as const, amount: 1150 }, // AR = gross total
  ],
};

// Defensive: an older/reverse embed could arrive as an array.
const arrayEmbed = [objectEmbed];

describe('invoiceJournal — to-one embed normalisation', () => {
  it('reads items from the object shape the API actually returns', () => {
    expect(invoiceJournalItems(objectEmbed)).toHaveLength(3);
    expect(invoiceJournalEntry(objectEmbed)).toBe(objectEmbed);
  });

  it('still reads items from an array shape (defensive)', () => {
    expect(invoiceJournalItems(arrayEmbed)).toHaveLength(3);
    expect(invoiceJournalEntry(arrayEmbed)).toBe(objectEmbed);
  });

  it('returns empty/zero for null or undefined without throwing', () => {
    expect(invoiceJournalItems(null)).toEqual([]);
    expect(invoiceJournalItems(undefined)).toEqual([]);
    expect(invoiceTotal(null)).toBe(0);
  });

  it('computes the invoice total from the debit (AR) side = gross amount', () => {
    // The regression produced 0 here; the fix must produce 1150.
    expect(invoiceTotal(objectEmbed)).toBe(1150);
    expect(invoiceTotal(arrayEmbed)).toBe(1150);
  });

  it('does not sum the credit side into the total (no double count)', () => {
    const items = invoiceJournalItems(objectEmbed);
    const creditSum = items
      .filter((i) => i.type === 'credit')
      .reduce((s, i) => s + i.amount, 0);
    expect(creditSum).toBe(1150); // revenue + tax
    expect(invoiceTotal(objectEmbed)).toBe(1150); // equals AR debit, not credit+debit
  });
});
