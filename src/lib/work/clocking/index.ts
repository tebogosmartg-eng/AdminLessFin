/** Clocking / Time Capture channel — produces duration for Time Engine. */

export function sessionHours(params: {
  clockedInAt: string | Date;
  clockedOutAt: string | Date;
  breakMinutes?: number;
}): number {
  const start = new Date(params.clockedInAt).getTime();
  const end = new Date(params.clockedOutAt).getTime();
  if (!(end > start)) return 0;
  const breakMs = (Number(params.breakMinutes) || 0) * 60_000;
  return Math.round(Math.max(0, end - start - breakMs) / 3_600_000 * 10_000) / 10_000;
}

export type ClockEventType = 'clock_in' | 'clock_out' | 'break_start' | 'break_end';

export function nextSessionStatus(
  current: 'open' | 'on_break' | 'closed' | 'cancelled',
  event: ClockEventType,
): 'open' | 'on_break' | 'closed' | 'cancelled' {
  if (current === 'closed' || current === 'cancelled') {
    throw new Error(`Session is ${current}; create a new session.`);
  }
  if (event === 'clock_in') {
    if (current !== 'open') throw new Error('Already clocked in.');
    return 'open';
  }
  if (event === 'break_start') {
    if (current !== 'open') throw new Error('Cannot start break unless session is open.');
    return 'on_break';
  }
  if (event === 'break_end') {
    if (current !== 'on_break') throw new Error('Cannot end break unless on break.');
    return 'open';
  }
  // clock_out
  return 'closed';
}
