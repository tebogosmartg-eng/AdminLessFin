/**
 * V6.10.1 — Financial Statements Generation Experience (experience layer only).
 *
 * Reporting Snapshots, versions, and lineage remain internal platform concerns.
 * This module only decides accountant-facing mode and messaging.
 */

export type GenerationMode = 'generate_required' | 'refresh_required' | 'up_to_date';

export const GENERATION_COPY = {
  notPrepared: 'Annual Financial Statements have not yet been prepared.',
  alreadyPrepared: 'Annual Financial Statements have already been prepared.',
  accountingChanged:
    'The accounting information has changed since the last generation. Would you like to refresh the Financial Statements?',
  upToDate: 'Financial Statements are up to date.',
  requireRefresh:
    'Financial Statements require refreshing because accounting information has changed.',
  generateAction: 'Generate Annual Financial Statements',
  refreshAction: 'Refresh Financial Statements',
  cancelAction: 'Cancel',
  viewAction: 'View Financial Statements',
  openSchedules: 'Open Supporting Schedules',
  reviewNotes: 'Review Notes',
  downloadPdf: 'Download PDF',
  downloadWord: 'Download Word',
  downloadExcel: 'Download Excel',
  preparingGenerate: 'Preparing Annual Financial Statements…',
  preparingRefresh: 'Refreshing Financial Statements…',
  successGenerate: 'Annual Financial Statements prepared successfully',
  successRefresh: 'Financial Statements refreshed',
} as const;

/**
 * Smart automation: platform decides generate / refresh / no action.
 * Accountant never chooses lineage, draft, or version operations.
 */
export function resolveGenerationMode(opts: {
  hasStatements: boolean;
  accountingChanged: boolean;
}): GenerationMode {
  if (!opts.hasStatements) return 'generate_required';
  if (opts.accountingChanged) return 'refresh_required';
  return 'up_to_date';
}

/** Map platform / PostgREST failures to accountant language (never expose snapshot/lineage). */
export function accountantPrepareErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'An unexpected error occurred.';

  const m = raw.toLowerCase();
  if (
    m.includes('23505') ||
    m.includes('duplicate') ||
    m.includes('lineage') ||
    m.includes('snapshot') ||
    m.includes('unique constraint')
  ) {
    return 'Financial Statements could not be prepared. Please try again.';
  }
  if (m.includes('permission') || m.includes('not authenticated') || m.includes('jwt')) {
    return 'Your session expired. Please sign in again.';
  }
  if (m.includes('workspace') && m.includes('not found')) {
    return 'This engagement could not be found.';
  }
  if (m.includes('framework')) {
    return 'Confirm the reporting framework, then try again.';
  }
  // Strip residual engineering tokens if a platform message leaked through.
  const cleaned = raw
    .replace(/Reporting Snapshot/gi, 'Financial Statements')
    .replace(/Snapshot Version/gi, 'Financial Statements')
    .replace(/\bSnapshot\b/gi, 'Financial Statements')
    .replace(/\blineage\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || 'Financial Statements could not be prepared. Please try again.';
}

/**
 * Whether journals after capture imply refresh is needed.
 * Pure date comparison — Close readiness supplies latest_journal_at.
 */
export function isAccountingChangedSinceCapture(opts: {
  latestJournalAt?: string | null;
  capturedAt?: string | null;
  periodLocked?: boolean;
}): boolean {
  if (opts.periodLocked) return false;
  if (!opts.latestJournalAt || !opts.capturedAt) return false;
  return new Date(opts.latestJournalAt).getTime() > new Date(opts.capturedAt).getTime();
}
