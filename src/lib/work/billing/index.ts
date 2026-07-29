/** Billing bridge — project locked EWM time to legacy timesheet projection shape. */

export type TimesheetProjection = {
  company_id: string;
  project_id: string;
  user_id: string;
  date: string;
  hours: number;
  notes: string | null;
  is_billed: boolean;
  ewm_time_entry_id?: string;
};

export function toTimesheetProjection(params: {
  companyId: string;
  legacyProjectId: string;
  userId: string;
  entryDate: string;
  hours: number;
  notes?: string | null;
  timeEntryId: string;
}): TimesheetProjection {
  if (!params.legacyProjectId) {
    throw new Error('Billing bridge requires linked legacy project_id on EWM project.');
  }
  return {
    company_id: params.companyId,
    project_id: params.legacyProjectId,
    user_id: params.userId,
    date: params.entryDate,
    hours: params.hours,
    notes: params.notes ?? `EWM:${params.timeEntryId}`,
    is_billed: false,
    ewm_time_entry_id: params.timeEntryId,
  };
}
