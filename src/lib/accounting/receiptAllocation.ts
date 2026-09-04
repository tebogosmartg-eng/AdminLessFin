/**
 * Applying a customer receipt to their open invoices, oldest first.
 *
 * The server applies exactly this rule when a receipt arrives with no
 * allocations, and the dialog shows the result before anything is posted. The
 * two must agree — a preview that does not match what happens is worse than no
 * preview — so the rule is written once, here, and tested.
 *
 * Money is handled in whole cents throughout. Allocating in floating point is
 * how a fully paid invoice ends up a hundredth of a rand short and stays open.
 */

export type OpenInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  gross: number;
  allocated: number;
  /** What is genuinely left on this invoice, per the allocation table. */
  outstanding: number;
};

const toCents = (n: number) => Math.round(n * 100);

/**
 * Oldest invoice first, capped at each invoice's outstanding balance, stopping
 * when the receipt runs out.
 *
 * The list is taken in the order given: the server orders by invoice date then
 * invoice number, and the reader that supplies this list uses the same order,
 * so re-sorting here would be a third opinion about what "oldest" means.
 *
 * Returns the amounts as strings because they populate text inputs; only rows
 * that receive something appear.
 */
export function allocateOldestFirst(
  invoices: OpenInvoice[],
  amount: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  let remaining = toCents(amount);
  if (remaining <= 0) return out;

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const outstanding = toCents(invoice.outstanding);
    if (outstanding <= 0) continue;
    const applied = Math.min(outstanding, remaining);
    out[invoice.id] = (applied / 100).toFixed(2);
    remaining -= applied;
  }
  return out;
}

/** Total of the amounts typed into the allocation boxes, in cents. */
export function allocatedCents(allocations: Record<string, string>): number {
  return Object.values(allocations).reduce((sum, v) => sum + toCents(Number(v) || 0), 0);
}

/**
 * Why the receipt cannot be posted as it stands, or null if it can.
 *
 * Returned as a sentence rather than a boolean because this is what the clerk
 * reads: an amount that silently refuses to save is the defect this whole
 * change exists to remove.
 */
export function allocationProblem(
  invoices: OpenInvoice[],
  allocations: Record<string, string>,
  amount: number,
): string | null {
  const applied = allocatedCents(allocations);
  if (applied > toCents(amount)) {
    return 'The invoice allocations come to more than the amount received.';
  }
  for (const invoice of invoices) {
    const value = toCents(Number(allocations[invoice.id]) || 0);
    if (value > toCents(invoice.outstanding)) {
      return `More has been allocated to ${invoice.invoice_number} than it has outstanding.`;
    }
    if (value < 0) {
      return `The amount applied to ${invoice.invoice_number} cannot be negative.`;
    }
  }
  return null;
}
