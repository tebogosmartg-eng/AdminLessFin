export type ReportingDateFormatOptions = {
  locale?: string;
  uppercase?: boolean;
};

function safeDate(iso: string): Date | null {
  const raw = String(iso || '').slice(0, 10);
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Canonical reporting end-date formatter.
 * Defaults to the current English rendering and supports future localisation.
 */
export function formatReportingEndDate(
  isoDate: string | null | undefined,
  options: ReportingDateFormatOptions = {},
): string | null {
  if (!isoDate) return null;
  const d = safeDate(isoDate);
  if (!d) return String(isoDate);
  const formatted = d.toLocaleDateString(options.locale || 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return options.uppercase ? formatted.toUpperCase() : formatted;
}

export function reportingPeriodCoverTitle(
  endDateIso: string | null | undefined,
  options: ReportingDateFormatOptions = {},
): string {
  const end = formatReportingEndDate(endDateIso, { ...options, uppercase: true });
  return end ? `FOR THE YEAR ENDED ${end}` : 'FOR THE REPORTING PERIOD';
}

export function reportingPeriodLabel(endDateIso: string | null | undefined): string {
  const end = formatReportingEndDate(endDateIso);
  return end ? `Year ended ${end}` : 'Current reporting period';
}
