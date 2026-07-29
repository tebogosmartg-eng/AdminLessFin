/** Capacity helpers — utilisation from available vs booked/actual. */

export function utilisationPercent(availableHours: number, usedHours: number): number {
  if (availableHours <= 0) return usedHours > 0 ? 100 : 0;
  return Math.round((usedHours / availableHours) * 10_000) / 100;
}

export function capacityRemaining(availableHours: number, bookedHours: number): number {
  return Math.max(0, availableHours - bookedHours);
}

export function isOverallocated(availableHours: number, bookedHours: number, threshold = 1): boolean {
  if (availableHours <= 0) return bookedHours > 0;
  return bookedHours / availableHours > threshold;
}

export function isIdle(availableHours: number, actualHours: number, idleThreshold = 0.2): boolean {
  if (availableHours <= 0) return false;
  return actualHours / availableHours < idleThreshold;
}
