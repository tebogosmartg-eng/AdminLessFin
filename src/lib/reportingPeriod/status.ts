/**
 * What a financial year's or accounting period's status means, in one place.
 *
 * `acceptsPostings` restates the database rule, it does not make one:
 * assert_period_open() refuses a posting dated in a period that is
 * `hard_closed` or `locked`, and allows every other status. The screens show
 * that truthfully (a soft-closed period here still accepts postings), and the
 * database remains the only thing that enforces it.
 */
import type {
  AccountingPeriodStatus,
  FinancialYearStatus,
} from '@/governance/domains/financialCalendar/model';

export type StatusTone = 'open' | 'future' | 'caution' | 'closed' | 'reopened';

export type StatusMeta = {
  label: string;
  tone: StatusTone;
  acceptsPostings: boolean;
  description: string;
};

const PERIOD_STATUS: Record<AccountingPeriodStatus, StatusMeta> = {
  open: {
    label: 'Open',
    tone: 'open',
    acceptsPostings: true,
    description: 'Open for posting.',
  },
  future: {
    label: 'Future',
    tone: 'future',
    acceptsPostings: true,
    description: 'Not started yet. Postings dated in it are still accepted.',
  },
  soft_closed: {
    label: 'Soft-closed',
    tone: 'caution',
    acceptsPostings: true,
    description: 'Being closed. Postings are still accepted.',
  },
  hard_closed: {
    label: 'Closed',
    tone: 'closed',
    acceptsPostings: false,
    description: 'Closed. Postings dated in this period are refused.',
  },
  locked: {
    label: 'Locked',
    tone: 'closed',
    acceptsPostings: false,
    description: 'Locked. Postings dated in this period are refused.',
  },
  reopened: {
    label: 'Reopened',
    tone: 'reopened',
    acceptsPostings: true,
    description: 'Reopened for adjustments. Postings are accepted.',
  },
};

const YEAR_STATUS: Record<FinancialYearStatus, Omit<StatusMeta, 'acceptsPostings'>> = {
  open: { label: 'Open', tone: 'open', description: 'The year is open.' },
  draft: { label: 'Draft', tone: 'future', description: 'The year is being set up.' },
  reopened: { label: 'Reopened', tone: 'reopened', description: 'The year was reopened for adjustments.' },
  closed: { label: 'Closed', tone: 'closed', description: 'The year is closed.' },
  locked: { label: 'Locked', tone: 'closed', description: 'The year is locked.' },
};

const UNKNOWN: StatusMeta = {
  label: 'Unknown',
  tone: 'caution',
  acceptsPostings: true,
  description: 'Status not recognised.',
};

export function periodStatusMeta(status: string | null | undefined): StatusMeta {
  return PERIOD_STATUS[String(status ?? '').toLowerCase() as AccountingPeriodStatus] ?? UNKNOWN;
}

export function yearStatusMeta(status: string | null | undefined): Omit<StatusMeta, 'acceptsPostings'> {
  return YEAR_STATUS[String(status ?? '').toLowerCase() as FinancialYearStatus] ?? UNKNOWN;
}

/** Tailwind classes for a status pill, by tone. Kept here so every screen colours a status the same way. */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  open: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  future: 'bg-muted text-muted-foreground border-border',
  caution: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  closed: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  reopened: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
};

/** A small dot colour, by tone. */
export const STATUS_TONE_DOT: Record<StatusTone, string> = {
  open: 'bg-emerald-500',
  future: 'bg-muted-foreground/40',
  caution: 'bg-amber-500',
  closed: 'bg-rose-500',
  reopened: 'bg-sky-500',
};
