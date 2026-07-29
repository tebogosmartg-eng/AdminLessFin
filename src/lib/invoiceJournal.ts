/**
 * Invoice commercial data (amounts + line items) is not stored on the invoice —
 * it is derived from the invoice's primary journal entry, embedded through the
 * `invoices.journal_entry_id` → `journal_entries.id` foreign key.
 *
 * That FK is a to-one relationship, so PostgREST returns `journal_entries` as a
 * single OBJECT. Earlier code assumed an array and read `journal_entries[0]`,
 * which is `undefined` on an object — collapsing every invoice total to 0 and
 * blanking every line item while the underlying journal remained correct.
 *
 * These helpers normalise both shapes (object today, array-tolerant for safety)
 * so callers always read the invoice's primary journal entry. Reading the to-one
 * `journal_entry_id` entry (not the reverse to-many `invoice_id` set) is
 * intentional: it is the original posting, excluding void-reversal entries that
 * would otherwise double-count.
 */

export interface JournalItemLike {
  type: 'debit' | 'credit';
  amount: number;
}

export interface JournalEntryLike<TItem = JournalItemLike> {
  journal_entry_items: TItem[];
}

type JournalEntriesEmbed<TItem> = JournalEntryLike<TItem> | JournalEntryLike<TItem>[] | null | undefined;

/** The invoice's primary journal entry, whether the embed came back as object or array. */
export function invoiceJournalEntry<TItem>(
  journalEntries: JournalEntriesEmbed<TItem>,
): JournalEntryLike<TItem> | undefined {
  if (!journalEntries) return undefined;
  return Array.isArray(journalEntries) ? journalEntries[0] : journalEntries;
}

/** The invoice's journal entry items (empty array when there is no linked entry). */
export function invoiceJournalItems<TItem = JournalItemLike>(
  journalEntries: JournalEntriesEmbed<TItem>,
): TItem[] {
  return invoiceJournalEntry(journalEntries)?.journal_entry_items ?? [];
}

/**
 * Invoice total = the debit (Accounts Receivable) side of the primary journal
 * entry, which equals the gross invoice amount (net + tax).
 */
export function invoiceTotal(journalEntries: JournalEntriesEmbed<JournalItemLike>): number {
  return invoiceJournalItems(journalEntries)
    .filter((item) => item.type === 'debit')
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
}
