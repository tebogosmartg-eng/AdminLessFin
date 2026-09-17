/**
 * What a credit note comes to, worked out the way the ledger works it out.
 *
 * post_credit_note_atomic rounds each line to the cent, then rounds that line's
 * VAT to the cent, then adds. The form uses this to show the clerk the figure
 * that will be posted, so the total on screen and the total in the books are
 * the same number rather than two that usually agree.
 */

export type CreditNoteLineInput = {
  quantity?: number | string | null;
  unit_price?: number | string | null;
  tax_rate_id?: string | null;
};

export type TaxRateLike = { id: string; name?: string | null; rate: number | string | null };

export type CreditNoteLineTotals = { amount: number; tax: number };

export type CreditNoteTotals = {
  lines: CreditNoteLineTotals[];
  subtotal: number;
  tax: number;
  total: number;
};

/**
 * Half away from zero, to the cent -- Postgres ROUND(numeric, 2).
 *
 * Plain Math.round(n * 100) / 100 disagrees with the database on values such
 * as 1.005, which is stored in binary as a hair under and would round down.
 * Rounding the magnitude through its own decimal representation avoids that.
 */
export function roundCents(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(n)}e2`);
  return (sign * Math.round(shifted)) / 100 || 0;
}

const toNumber = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function creditNoteTotals(
  lines: CreditNoteLineInput[],
  taxRates: TaxRateLike[] | null | undefined,
): CreditNoteTotals {
  const rateOf = new Map((taxRates ?? []).map((t) => [t.id, toNumber(t.rate)]));
  const perLine = lines.map((line) => {
    const amount = roundCents(toNumber(line.quantity) * toNumber(line.unit_price));
    const rate = line.tax_rate_id && line.tax_rate_id !== 'none' ? rateOf.get(line.tax_rate_id) : undefined;
    const tax = rate == null ? 0 : roundCents((amount * rate) / 100);
    return { amount, tax };
  });
  const subtotal = roundCents(perLine.reduce((t, l) => t + l.amount, 0));
  const tax = roundCents(perLine.reduce((t, l) => t + l.tax, 0));
  return { lines: perLine, subtotal, tax, total: roundCents(subtotal + tax) };
}
