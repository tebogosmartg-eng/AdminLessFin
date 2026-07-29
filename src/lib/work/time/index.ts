/** Time Engine — duration and labour cost (operational only; no PAYE/GL). */

export function calculateHours(params: {
  startAt?: string | Date | null;
  finishAt?: string | Date | null;
  breakMinutes?: number;
  hours?: number | null;
}): number {
  if (params.hours != null && Number.isFinite(Number(params.hours)) && Number(params.hours) > 0) {
    return round4(Number(params.hours));
  }
  if (!params.startAt || !params.finishAt) return 0;
  const start = new Date(params.startAt).getTime();
  const finish = new Date(params.finishAt).getTime();
  if (!(finish > start)) return 0;
  const breakMs = (Number(params.breakMinutes) || 0) * 60_000;
  const ms = Math.max(0, finish - start - breakMs);
  return round4(ms / 3_600_000);
}

export function calculateLabourCost(hours: number, operationalRate: number): number {
  return round4(Math.max(0, hours) * Math.max(0, operationalRate));
}

export function calculateBillableValue(hours: number, billableRate: number, billable: boolean): number {
  if (!billable) return 0;
  return round4(Math.max(0, hours) * Math.max(0, billableRate));
}

export function assertMutableStatus(status: string): void {
  if (status !== 'draft' && status !== 'submitted') {
    throw new Error(`Time entry status '${status}' is immutable. Use a compensating correction.`);
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
