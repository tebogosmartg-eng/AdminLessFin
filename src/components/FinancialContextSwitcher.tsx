/**
 * Global financial year and period switcher.
 *
 * Shows, at all times, the financial year every screen is using (code and
 * dates) and the part of it on screen (whole year, one accounting period, or a
 * page preset), with the status of what is shown. Choosing here changes the
 * ONE reporting context (ReportingPeriodContext); pages never keep their own.
 *
 * Status is the database's: which year and period are current comes from
 * financial_year_current() / accounting_period_current(), and a period's
 * status is shown exactly as assert_period_open() treats it.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarRange, Check, ChevronsUpDown, Lock, RotateCcw } from 'lucide-react';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { parseIsoDateSafe } from '../lib/reportingPeriod/presets';
import { formatPeriodName, formatYearRange } from '../lib/reportingPeriod/selection';
import {
  periodStatusMeta,
  STATUS_TONE_CLASSES,
  STATUS_TONE_DOT,
  yearStatusMeta,
} from '../lib/reportingPeriod/status';
import type { AccountingPeriodDomainModel } from '../governance/domains/financialCalendar/model';

function StatusPill({ label, tone, className }: { label: string; tone: keyof typeof STATUS_TONE_CLASSES; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-1.5 py-0 text-[11px] font-medium leading-5', STATUS_TONE_CLASSES[tone], className)}>
      {label}
    </span>
  );
}

function shortMonth(period: AccountingPeriodDomainModel): string {
  const from = parseIsoDateSafe(period.startDate);
  return from ? format(from, 'MMM yy') : `P${period.periodNumber}`;
}

export default function FinancialContextSwitcher({ className }: { className?: string }) {
  const {
    financialYears,
    activeFinancialYear,
    currentFinancialYear,
    isCurrentFinancialYear,
    periodsInActiveYear,
    currentAccountingPeriod,
    selectedAccountingPeriod,
    selectedPreset,
    reportingRangeLabel,
    isCalendarFallback,
    isLoading,
    setFinancialYear,
    setAccountingPeriod,
    resetToCurrentFinancialYear,
  } = useReportingPeriod();
  const [open, setOpen] = useState(false);

  const yearMeta = activeFinancialYear ? yearStatusMeta(activeFinancialYear.status) : null;
  const shownPeriodMeta = selectedAccountingPeriod ? periodStatusMeta(selectedAccountingPeriod.status) : null;
  const atDefault = isCurrentFinancialYear && selectedPreset === 'current_financial_year';

  const triggerLine1 = activeFinancialYear
    ? `${activeFinancialYear.yearCode} · ${formatYearRange(activeFinancialYear)}`
    : isCalendarFallback
      ? `No financial year · calendar ${new Date().getFullYear()}`
      : 'Loading financial year…';

  // The dot on the trigger: the shown period's status when one period is on
  // screen, otherwise the year's.
  const triggerTone = shownPeriodMeta?.tone ?? yearMeta?.tone ?? 'future';
  const triggerStatus = shownPeriodMeta?.label ?? yearMeta?.label ?? '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          aria-label={`Financial year ${activeFinancialYear?.yearCode ?? ''}, ${reportingRangeLabel}. Change financial year or period`}
          data-testid="financial-context-switcher"
          data-year-id={activeFinancialYear?.id ?? ''}
          data-year-code={activeFinancialYear?.yearCode ?? ''}
          data-current-year={isCurrentFinancialYear ? 'true' : 'false'}
          disabled={isLoading && !activeFinancialYear}
          className={cn(
            'h-11 min-w-0 justify-between gap-2 px-2.5 text-left',
            !isCurrentFinancialYear && activeFinancialYear && 'border-amber-400/70 bg-amber-50/60 dark:bg-amber-950/20',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight" data-testid="active-financial-year">
                {triggerLine1}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-xs font-normal leading-tight text-muted-foreground">
                {triggerStatus && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_TONE_DOT[triggerTone])} aria-hidden />}
                <span className="truncate" data-testid="active-reporting-range">
                  {reportingRangeLabel}
                  {triggerStatus ? ` · ${triggerStatus}` : ''}
                  {!isCurrentFinancialYear && activeFinancialYear ? ' · not the current year' : ''}
                </span>
              </span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="max-h-[var(--radix-popover-content-available-height)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-0"
        align="start"
        collisionPadding={8}
      >
        <div className="border-b px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Financial year</p>
        </div>
        {financialYears.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            This company has no financial year yet. Set one up in Settings → Financials; until then, screens show the calendar year.
          </p>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            <ul role="listbox" aria-label="Financial years" className="p-1">
              {financialYears.map((year) => {
                const meta = yearStatusMeta(year.status);
                const selected = year.id === activeFinancialYear?.id;
                return (
                  <li key={year.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-testid="financial-year-option"
                      data-year-id={year.id}
                      data-year-code={year.yearCode}
                      onClick={() => { setFinancialYear(year.id); }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                        selected && 'bg-accent/60',
                      )}
                    >
                      <Check className={cn('h-4 w-4 shrink-0 text-primary', selected ? 'opacity-100' : 'opacity-0')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium">{year.yearCode}</span>
                          {year.isCurrent && (
                            <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Current</span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{formatYearRange(year)}</span>
                      </span>
                      <StatusPill label={meta.label} tone={meta.tone} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {activeFinancialYear && (
          <div className="border-t px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Period in {activeFinancialYear.yearCode}
              </p>
              <button
                type="button"
                onClick={() => setAccountingPeriod(null)}
                aria-pressed={selectedPreset === 'current_financial_year'}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-accent',
                  selectedPreset === 'current_financial_year' && 'border-primary bg-primary/10 text-primary',
                )}
              >
                Whole year
              </button>
            </div>
            {periodsInActiveYear.length === 0 ? (
              <p className="text-xs text-muted-foreground">No accounting periods have been generated for this year.</p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5" role="listbox" aria-label="Accounting periods">
                {periodsInActiveYear.map((period) => {
                  const meta = periodStatusMeta(period.status);
                  const selected = selectedAccountingPeriod?.id === period.id;
                  const isNow = currentAccountingPeriod?.id === period.id;
                  return (
                    <button
                      key={period.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      title={`${formatPeriodName(period)} — ${meta.label}. ${meta.description}`}
                      aria-label={`${formatPeriodName(period)}, ${meta.label}${isNow ? ', current period' : ''}`}
                      data-testid="accounting-period-option"
                      data-period-id={period.id}
                      data-period-start={period.startDate}
                      data-period-status={period.status}
                      onClick={() => { setAccountingPeriod(period.id); }}
                      className={cn(
                        'relative flex flex-col items-center rounded-md border px-1 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border',
                        isNow && !selected && 'ring-1 ring-primary/50',
                      )}
                    >
                      <span className="leading-tight">{shortMonth(period)}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] leading-none text-muted-foreground">
                        {meta.acceptsPostings
                          ? <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_TONE_DOT[meta.tone])} aria-hidden />
                          : <Lock className="h-2.5 w-2.5 text-rose-600" aria-hidden />}
                        {meta.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedAccountingPeriod && shownPeriodMeta && (
              <p className={cn('mt-2 text-xs', shownPeriodMeta.acceptsPostings ? 'text-muted-foreground' : 'font-medium text-rose-700 dark:text-rose-400')}>
                {formatPeriodName(selectedAccountingPeriod)}: {shownPeriodMeta.description}
              </p>
            )}
            {currentAccountingPeriod && (
              <p className="mt-1 text-xs text-muted-foreground">
                Current period: {formatPeriodName(currentAccountingPeriod)} ({periodStatusMeta(currentAccountingPeriod.status).label})
              </p>
            )}
          </div>
        )}

        {!atDefault && currentFinancialYear && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => { resetToCurrentFinancialYear(); setOpen(false); }}
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Back to current year ({currentFinancialYear.yearCode}, whole year)
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
