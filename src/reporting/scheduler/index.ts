/**
 * Report scheduler stubs — Enterprise Reporting Platform (V3.6.3)
 *
 * Scheduling infrastructure is defined here for future module consumption.
 * No UI / workflow changes in this release.
 */

export type ScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export type ReportSchedule = {
  id: string;
  reportId: string;
  companyId: string;
  frequency: ScheduleFrequency;
  filters: Record<string, unknown>;
  exportFormat: 'csv' | 'excel' | 'pdf' | 'json';
  nextRunAt?: string;
  enabled: boolean;
  createdAt: string;
};

const schedules = new Map<string, ReportSchedule>();

export function registerSchedule(
  input: Omit<ReportSchedule, 'createdAt' | 'enabled'> & { enabled?: boolean }
): ReportSchedule {
  const schedule: ReportSchedule = {
    ...input,
    enabled: input.enabled !== false,
    createdAt: new Date().toISOString(),
  };
  schedules.set(schedule.id, schedule);
  return schedule;
}

export function listSchedules(companyId?: string): ReportSchedule[] {
  return Array.from(schedules.values()).filter((s) =>
    companyId ? s.companyId === companyId : true
  );
}

export function clearSchedules(): void {
  schedules.clear();
}
