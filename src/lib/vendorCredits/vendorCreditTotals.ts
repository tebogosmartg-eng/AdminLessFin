/**
 * What a supplier credit comes to, worked out the way the ledger works it out.
 *
 * post_vendor_credit_atomic rounds each line to the cent, then rounds that
 * line's VAT to the cent, then adds -- the same arithmetic, to the same rules,
 * as post_credit_note_atomic on the customer side. Rather than keep two copies
 * of it that could drift apart, this is the same function under the name that
 * fits where it is called.
 */
export { roundCents, creditNoteTotals as vendorCreditTotals } from '@/lib/creditNotes/creditNoteTotals';
export type {
  CreditNoteLineInput as VendorCreditLineInput,
  CreditNoteLineTotals as VendorCreditLineTotals,
  CreditNoteTotals as VendorCreditTotals,
  TaxRateLike,
} from '@/lib/creditNotes/creditNoteTotals';
