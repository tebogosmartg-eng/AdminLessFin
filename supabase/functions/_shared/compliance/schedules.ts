/**
 * Turns a rule's schedule plus the company's anchors into dated periods.
 *
 * Each schedule type is an evaluator change with tests, never a content
 * change: content may only pick a type and its parameters.
 */
import {
  addBusinessDays,
  addDays,
  addMonths,
  adjustToBusinessDay,
  anniversaryIn,
  daysInMonth,
  isIsoDate,
  makeDate,
  yearOf,
  type HolidayCalendar,
} from './dates.ts';
import type { MonthDay, Occurrence, Schedule, VatFilingFrequency } from './types.ts';

export type ScheduleAnchors = {
  incorporation_date?: string | null;
  financial_year_end?: MonthDay | null;
  vat_filing_frequency?: VatFilingFrequency | null;
};

export type OccurrenceResult =
  | { ok: true; occurrences: Occurrence[] }
  | { ok: false; missing: string[] };

/** Which anchor facts a schedule needs before any period can be dated. */
export function scheduleAnchorNeeds(schedule: Schedule): Array<keyof ScheduleAnchors> {
  switch (schedule.type) {
    case 'anniversary_business_days':
      return ['incorporation_date'];
    case 'months_after_year_end':
      return ['financial_year_end'];
    case 'periodic':
      return schedule.frequency === 'from_vat_filing_frequency' ? ['vat_filing_frequency'] : [];
    default:
      return [];
  }
}

export function cycleKindFor(schedule: Schedule): 'filing' | 'term' | 'once' {
  if (schedule.type === 'certificate_expiry') return 'term';
  if (schedule.type === 'once_off') return 'once';
  return 'filing';
}

function periodEndMonths(frequency: 'monthly' | VatFilingFrequency): number[] {
  if (frequency === 'monthly') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (frequency === 'bimonthly_odd') return [1, 3, 5, 7, 9, 11];
  return [2, 4, 6, 8, 10, 12];
}

/**
 * Every period whose opening date falls inside [from, to], in date order.
 * Recurring schedules only; terms and once-off obligations have no calendar.
 */
export function occurrencesBetween(
  schedule: Schedule,
  anchors: ScheduleAnchors,
  holidays: HolidayCalendar,
  from: string,
  to: string,
): OccurrenceResult {
  const missing = scheduleAnchorNeeds(schedule).filter((k) => {
    const v = anchors[k];
    if (k === 'incorporation_date') return !isIsoDate(v);
    return v === null || v === undefined;
  });
  if (missing.length) return { ok: false, missing };

  const out: Occurrence[] = [];
  const firstYear = yearOf(from) - 1;
  const lastYear = yearOf(to) + 1;

  switch (schedule.type) {
    case 'anniversary_business_days': {
      const incorporated = anchors.incorporation_date as string;
      for (let y = Math.max(firstYear, yearOf(incorporated) + 1); y <= lastYear; y++) {
        const anniversary = anniversaryIn(incorporated, y);
        out.push({
          period_key: String(y),
          opens_on: anniversary,
          due_date: addBusinessDays(anniversary, schedule.business_days, holidays),
        });
      }
      break;
    }
    case 'annual_fixed_month_day': {
      for (let y = firstYear; y <= lastYear; y++) {
        const raw = makeDate(y, schedule.month, Math.min(schedule.day, daysInMonth(y, schedule.month)));
        const due = adjustToBusinessDay(raw, schedule.adjust, holidays);
        out.push({ period_key: String(y), opens_on: addDays(due, -schedule.opens_days_before_due), due_date: due });
      }
      break;
    }
    case 'months_after_year_end': {
      const fye = anchors.financial_year_end as MonthDay;
      // Wide enough that negative offsets (due before the year ends) are covered.
      for (let y = firstYear - 1; y <= lastYear + 1; y++) {
        const yearEnd = makeDate(y, fye.month, Math.min(fye.day, daysInMonth(y, fye.month)));
        const due = adjustToBusinessDay(addMonths(yearEnd, schedule.months), schedule.adjust, holidays);
        out.push({
          period_key: `FY${yearEnd}`,
          opens_on: addDays(due, -schedule.opens_days_before_due),
          due_date: due,
        });
      }
      break;
    }
    case 'periodic': {
      const frequency =
        schedule.frequency === 'monthly' ? 'monthly' : (anchors.vat_filing_frequency as VatFilingFrequency);
      const span = frequency === 'monthly' ? 1 : 2;
      const endMonths = periodEndMonths(frequency);
      for (let y = firstYear; y <= lastYear; y++) {
        for (const m of endMonths) {
          const periodEnd = makeDate(y, m, daysInMonth(y, m));
          const periodStart = addMonths(makeDate(y, m, 1), -(span - 1));
          const dueMonthStart = addMonths(makeDate(y, m, 1), 1);
          const [dy, dm] = dueMonthStart.split('-').map(Number);
          const rawDue = makeDate(dy, dm, Math.min(schedule.due_day, daysInMonth(dy, dm)));
          out.push({
            period_key: periodEnd.slice(0, 7),
            opens_on: periodStart,
            due_date: adjustToBusinessDay(rawDue, schedule.adjust, holidays),
          });
        }
      }
      break;
    }
    default:
      return { ok: true, occurrences: [] };
  }

  const inRange = out
    .filter((o) => o.opens_on >= from && o.opens_on <= to)
    .sort((a, b) => (a.opens_on < b.opens_on ? -1 : a.opens_on > b.opens_on ? 1 : 0));
  return { ok: true, occurrences: inRange };
}

/**
 * The periods a company should see, given when tracking started:
 *  - every period that has opened since `trackingFrom`, and
 *  - the next upcoming period, unless an opened, unfinished period is still
 *    running (so "what is due next" is always visible, without clutter).
 * `isFinished(periodKey)` reports whether that period is completed.
 */
export function wantedOccurrences(
  schedule: Schedule,
  anchors: ScheduleAnchors,
  holidays: HolidayCalendar,
  trackingFrom: string,
  today: string,
  isFinished: (periodKey: string) => boolean,
): OccurrenceResult {
  const res = occurrencesBetween(schedule, anchors, holidays, trackingFrom, addDays(today, 800));
  if (!res.ok) return res;
  const opened = res.occurrences.filter((o) => o.opens_on <= today);
  const upcoming = res.occurrences.find((o) => o.opens_on > today);
  const stillRunning = opened.some((o) => !isFinished(o.period_key) && (o.due_date ?? today) >= today);
  const wanted = [...opened];
  if (upcoming && !stillRunning) wanted.push(upcoming);
  // Never flood a company: at most the latest 24 opened periods.
  return { ok: true, occurrences: wanted.slice(-25) };
}

/**
 * Where tracking starts for a newly applicable obligation: the opening date
 * of the most recent period (so a period that is already running, or just
 * missed, is shown), or today when no period has opened yet.
 */
export function initialTrackingFrom(
  schedule: Schedule,
  anchors: ScheduleAnchors,
  holidays: HolidayCalendar,
  today: string,
): string {
  const res = occurrencesBetween(schedule, anchors, holidays, addDays(today, -800), today);
  if (!res.ok || res.occurrences.length === 0) return today;
  return res.occurrences[res.occurrences.length - 1].opens_on;
}
