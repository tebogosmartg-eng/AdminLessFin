/**
 * Turning a reporting PERIOD into the single date a point-in-time report is
 * drawn up to.
 *
 * Most reports in this app cover a range: a profit and loss, a statement of
 * account, a general ledger. An age analysis does not. It ages whatever is
 * still open at ONE date, and every bucket is measured as the days between a
 * document's due date and that date. So a point-in-time report reads the
 * period's CLOSING date — the same way a balance sheet reads its "as at".
 *
 * Kept as pure functions, and tested, because the cap below is not obvious and
 * getting it wrong is silent: the report still renders, still reconciles, and
 * still totals correctly. Only the ageing is wrong.
 */

/** An ISO date (YYYY-MM-DD) for a Date, in local time rather than UTC. */
export function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The as-at date for a point-in-time report covering `periodEnd`, never later
 * than `today`.
 *
 * The cap is the whole point. "Current Financial Year" runs to the year END,
 * which is in the future for most of the year — and on a calendar with several
 * open years, so can "Previous Financial Year". Ageing an open document against
 * a future date adds the months between now and then to every bucket: an
 * invoice a fortnight overdue would print in the 90+ day column, and the report
 * would carry a date that has not happened yet. Neither survives an audit.
 *
 * ISO dates compare correctly as strings, so no parsing is needed.
 */
export function asAtForPeriod(periodEnd: string | null | undefined, today: string): string {
  if (!periodEnd) return today;
  return periodEnd < today ? periodEnd : today;
}

/** True when the period closes after `today`, so the report was held back to today. */
export function isCappedToToday(periodEnd: string | null | undefined, today: string): boolean {
  return !!periodEnd && periodEnd > today;
}

/**
 * The date a control account ledger should open on, for a report drawn up to
 * `asOf`.
 *
 * A ledger cannot open after it closes: the opening balance would sweep in
 * transactions the closing balance never sees, and the closing balance would
 * stop agreeing with the age analysis — the one thing the ledger exists to
 * demonstrate. A period starting after the as-at date (a future custom range)
 * therefore falls back to inception, which is always coherent.
 */
export function ledgerStartForPeriod(
  periodStart: string | null | undefined,
  asOf: string,
): string | null {
  if (!periodStart) return null;
  return periodStart <= asOf ? periodStart : null;
}
