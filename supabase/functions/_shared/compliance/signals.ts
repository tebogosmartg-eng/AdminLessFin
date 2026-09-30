/**
 * Time signals and reminder timing. Computed on the server in
 * Africa/Johannesburg, so the badge a user sees and the reminder they receive
 * always agree.
 */
import { daysBetween } from './dates.ts';
import type { CycleRow, TimeSignal } from './types.ts';
import { OPEN_CYCLE_STATUSES } from './types.ts';

export const DUE_SOON_DAYS = 30;

export function isOpenStatus(status: string): boolean {
  return (OPEN_CYCLE_STATUSES as readonly string[]).includes(status);
}

export function timeSignalFor(
  cycle: Pick<CycleRow, 'kind' | 'status' | 'due_date' | 'expiry_date'>,
  today: string,
): TimeSignal {
  if (!isOpenStatus(cycle.status)) return 'none';
  if (cycle.kind === 'term') {
    if (cycle.expiry_date && cycle.expiry_date < today) return 'expired';
    if (cycle.due_date && cycle.due_date <= today) return 'due_soon';
    if (cycle.expiry_date && daysBetween(today, cycle.expiry_date) <= DUE_SOON_DAYS) return 'due_soon';
    return 'none';
  }
  if (!cycle.due_date) return 'none';
  if (cycle.due_date < today) return 'overdue';
  if (daysBetween(today, cycle.due_date) <= DUE_SOON_DAYS) return 'due_soon';
  return 'none';
}

/** Offset used for the single "overdue" reminder per cycle. */
export const OVERDUE_OFFSET = -1;

/**
 * Which reminder, if any, is due today for a cycle. Only the tightest offset
 * that has been reached is returned, so a cycle created five days before its
 * due date sends one reminder, not three.
 */
export function reminderOffsetDue(
  cycle: Pick<CycleRow, 'status' | 'due_date' | 'expiry_date' | 'kind'>,
  offsets: number[],
  today: string,
): number | null {
  if (!isOpenStatus(cycle.status)) return null;
  const target = cycle.due_date ?? (cycle.kind === 'term' ? cycle.expiry_date : null);
  if (!target) return null;
  const days = daysBetween(today, target);
  if (days < 0) return OVERDUE_OFFSET;
  const reached = offsets.filter((o) => o >= 0 && days <= o);
  if (!reached.length) return null;
  return Math.min(...reached);
}
