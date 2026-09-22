/**
 * Global accounting context: the ONE source for which financial year and which
 * part of it every screen is showing.
 *
 * Source of truth chain:
 *   financial_years / accounting_periods (company calendar, database)
 *     → financial_year_current() / accounting_period_current() (is_current flags)
 *       → useEnterpriseCalendar + the periods query (read adapters)
 *         → ReportingPeriodContext (ONLY app-facing facade)
 *
 * The company comes from AuthContext and nowhere else. The user chooses a
 * financial year (default: the current one) and, within it, a preset or an
 * accounting period; every date range this context hands out lies inside the
 * selected year. No page may derive FY bounds, the active year or reporting
 * defaults for itself.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useEnterpriseCalendar } from '@/hooks/useEnterpriseCalendar';
import { financialCalendarService } from '@/governance/domains/financialCalendar/service';
import type {
  AccountingPeriodDomainModel,
  FinancialYearDomainModel,
} from '@/governance/domains/financialCalendar/model';
import {
  calendarYearFallback,
  parseIsoDateSafe,
  presetRange,
  resolveReportingPeriodPreset,
  toIsoDate,
  type ReportingPeriodPreset,
  type ReportingPeriodRange,
} from '@/lib/reportingPeriod/presets';
import {
  DEFAULT_SELECTION,
  describeReportingRange,
  formatYearRange,
  periodsOfYear,
  readSelection,
  resolveSelectedPeriod,
  resolveSelectedYear,
  selectionStorageKey,
  writeSelection,
  type StoredSelection,
} from '@/lib/reportingPeriod/selection';

export type ReportingPeriodContextValue = {
  companyId: string | null;
  companyName: string | null;

  /** Full Financial Calendar (open + closed + draft). */
  financialYears: FinancialYearDomainModel[];
  /** The year the database says is current (financial_year_current()). */
  currentFinancialYear: FinancialYearDomainModel | null;
  /**
   * The year every screen is showing: the one selected in the header, which
   * is the current year unless the user chose another.
   */
  activeFinancialYear: FinancialYearDomainModel | null;
  /** True when the selected year is the current year. */
  isCurrentFinancialYear: boolean;
  openFinancialYears: FinancialYearDomainModel[];
  closedFinancialYears: FinancialYearDomainModel[];
  /** Every accounting period of the company. */
  accountingPeriods: AccountingPeriodDomainModel[];
  /** The periods of the selected year, in order. */
  periodsInActiveYear: AccountingPeriodDomainModel[];
  /** The period the database says is current (accounting_period_current()). */
  currentAccountingPeriod: AccountingPeriodDomainModel | null;
  /** The accounting period chosen in the header, when the range is one period. */
  selectedAccountingPeriod: AccountingPeriodDomainModel | null;

  financialYearStart: Date | null;
  financialYearEnd: Date | null;
  /** The selected year's code (e.g. FY2027). */
  yearCode: string | null;
  /** "FY2027 · 01 Mar 2026 – 28 Feb 2027" for the selected year. */
  activeFinancialYearLabel: string | null;
  /** The part of the year on screen, in words: "Full year", "September 2026", … */
  reportingRangeLabel: string;

  currentReportingPeriod: ReportingPeriodRange | null;
  selectedPreset: ReportingPeriodPreset;
  customRange: ReportingPeriodRange | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** True when no financial year exists yet and the calendar year is shown instead. */
  isCalendarFallback: boolean;
  isReady: boolean;
  isLoading: boolean;

  setFinancialYear: (yearId: string) => void;
  setAccountingPeriod: (periodId: string | null) => void;
  setPreset: (preset: ReportingPeriodPreset) => void;
  setCustomRange: (range: ReportingPeriodRange) => void;
  /** Whether a preset has any range inside the selected year. */
  isPresetAvailable: (preset: ReportingPeriodPreset) => boolean;
  /** Back to the current year, whole year. */
  resetToCurrentFinancialYear: () => void;
  refetchCalendar: () => void;
};

const ReportingPeriodContext = createContext<ReportingPeriodContextValue | null>(null);

type Selection = StoredSelection & { companyId: string | null };

export function ReportingPeriodProvider({ children }: { children: ReactNode }) {
  const { activeCompany, user } = useAuth();
  const companyId = activeCompany?.id ?? null;
  const userId = user?.id ?? null;
  const storageKey = userId && companyId ? selectionStorageKey(userId, companyId) : null;

  const { years, isLoading: yearsLoading, refetch } = useEnterpriseCalendar(companyId);

  const periodsQuery = useQuery({
    queryKey: ['financial-periods', companyId],
    queryFn: () => financialCalendarService.getAccountingPeriods(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });
  const periods = useMemo(() => periodsQuery.data ?? [], [periodsQuery.data]);

  // The selection belongs to one company. When the company changes, the other
  // company's selection is never used, not even for one render: until the
  // stored choice for the new company is loaded, the default applies.
  const [selectionState, setSelectionState] = useState<Selection>(() => ({
    ...(readSelection(storageKey) ?? DEFAULT_SELECTION),
    companyId,
  }));
  const selection: Selection = selectionState.companyId === companyId
    ? selectionState
    : { ...(readSelection(storageKey) ?? DEFAULT_SELECTION), companyId };

  useEffect(() => {
    if (selectionState.companyId !== companyId) setSelectionState(selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const update = useCallback((patch: Partial<StoredSelection>) => {
    setSelectionState((prev) => {
      const base: Selection = prev.companyId === companyId
        ? prev
        : { ...(readSelection(storageKey) ?? DEFAULT_SELECTION), companyId };
      const next: Selection = { ...base, ...patch, companyId };
      const { companyId: _c, ...stored } = next;
      writeSelection(storageKey, stored);
      return next;
    });
  }, [companyId, storageKey]);

  // ---- resolve against the company's own calendar -----------------------
  const currentFinancialYear = useMemo(() => years.find((y) => y.isCurrent) ?? null, [years]);
  const activeYear = useMemo(() => resolveSelectedYear(years, selection.yearId), [years, selection.yearId]);
  const periodsInActiveYear = useMemo(() => periodsOfYear(periods, activeYear), [periods, activeYear]);
  const currentAccountingPeriod = useMemo(() => periods.find((p) => p.isCurrent) ?? null, [periods]);
  const selectedPeriod = useMemo(
    () => (selection.preset === 'accounting_period'
      ? resolveSelectedPeriod(periods, activeYear, selection.periodId)
      : null),
    [periods, activeYear, selection.preset, selection.periodId],
  );

  const fyStartIso = activeYear?.startDate ?? null;
  const fyEndIso = activeYear?.endDate ?? null;
  // RB-001: parse via the safe boundary parser. A malformed FY date becomes
  // null — which every guard below handles — instead of an Invalid Date.
  const financialYearStart = useMemo(() => parseIsoDateSafe(fyStartIso), [fyStartIso]);
  const financialYearEnd = useMemo(() => parseIsoDateSafe(fyEndIso), [fyEndIso]);

  const customRange = useMemo<ReportingPeriodRange | null>(() => {
    const from = parseIsoDateSafe(selection.customFrom);
    const to = parseIsoDateSafe(selection.customTo);
    return from && to ? { from, to } : null;
  }, [selection.customFrom, selection.customTo]);

  // A choice that no longer fits (an accounting period of another year, a
  // "previous month" in the first month) falls back to the full year.
  const effectivePreset: ReportingPeriodPreset = useMemo(() => {
    if (!financialYearStart || !financialYearEnd) return selection.preset;
    if (selection.preset === 'accounting_period' && !selectedPeriod) return 'current_financial_year';
    const range = presetRange({
      preset: selection.preset,
      financialYearStart,
      financialYearEnd,
      customRange,
      accountingPeriod: selectedPeriod,
    });
    return range ? selection.preset : 'current_financial_year';
  }, [selection.preset, financialYearStart, financialYearEnd, customRange, selectedPeriod]);

  const isLoading = !!companyId && (yearsLoading || periodsQuery.isLoading);
  const isCalendarFallback = !!companyId && !yearsLoading && years.length === 0;

  const periodsLoading = periodsQuery.isLoading;
  const currentReportingPeriod = useMemo((): ReportingPeriodRange | null => {
    if (!companyId) return null;
    // A remembered period cannot be resolved until the periods arrive. Showing
    // the whole year meanwhile would fetch (and flash) figures for a range
    // other than the one about to be shown.
    if (selection.preset === 'accounting_period' && periodsLoading) return null;
    if (financialYearStart && financialYearEnd) {
      return resolveReportingPeriodPreset({
        preset: effectivePreset,
        financialYearStart,
        financialYearEnd,
        customRange,
        accountingPeriod: selectedPeriod,
      });
    }
    if (isCalendarFallback) {
      // Bootstrap only: this company has no financial year yet.
      const fallback = calendarYearFallback();
      return resolveReportingPeriodPreset({
        preset: effectivePreset === 'accounting_period' ? 'current_financial_year' : effectivePreset,
        financialYearStart: fallback.from,
        financialYearEnd: fallback.to,
        customRange,
      });
    }
    return null;
  }, [companyId, selection.preset, periodsLoading, financialYearStart, financialYearEnd, effectivePreset, customRange, selectedPeriod, isCalendarFallback]);

  const activeFinancialYearLabel = useMemo(() => {
    if (!activeYear) return null;
    return `${activeYear.yearCode} · ${formatYearRange(activeYear)}`;
  }, [activeYear]);

  const reportingRangeLabel = useMemo(
    () => describeReportingRange(effectivePreset, currentReportingPeriod, selectedPeriod),
    [effectivePreset, currentReportingPeriod, selectedPeriod],
  );

  const openFinancialYears = useMemo(
    () => years.filter((y) => y.status === 'open' || y.status === 'reopened'),
    [years],
  );
  const closedFinancialYears = useMemo(
    () => years.filter((y) => y.status === 'closed' || y.status === 'locked'),
    [years],
  );

  // ---- actions -------------------------------------------------------------
  const setFinancialYear = useCallback((yearId: string) => {
    // A new year starts as the whole year; a period of the old year means
    // nothing in the new one.
    update({ yearId, preset: 'current_financial_year', periodId: null, customFrom: null, customTo: null });
  }, [update]);

  const setAccountingPeriod = useCallback((periodId: string | null) => {
    if (!periodId) {
      update({ preset: 'current_financial_year', periodId: null });
      return;
    }
    const period = periods.find((p) => p.id === periodId);
    if (!period) return;
    // Choosing a period also chooses its year, so the two can never disagree.
    update({ yearId: period.financialYearId, preset: 'accounting_period', periodId, customFrom: null, customTo: null });
  }, [periods, update]);

  const setPreset = useCallback((preset: ReportingPeriodPreset) => {
    update(preset === 'custom' ? { preset } : { preset, customFrom: null, customTo: null, periodId: preset === 'accounting_period' ? selection.periodId : null });
  }, [update, selection.periodId]);

  const setCustomRange = useCallback((range: ReportingPeriodRange) => {
    if (!range?.from || !range?.to) return;
    update({ preset: 'custom', customFrom: toIsoDate(range.from), customTo: toIsoDate(range.to), periodId: null });
  }, [update]);

  const isPresetAvailable = useCallback((preset: ReportingPeriodPreset) => {
    if (!financialYearStart || !financialYearEnd) return preset !== 'accounting_period';
    if (preset === 'custom') return true;
    return presetRange({ preset, financialYearStart, financialYearEnd, accountingPeriod: selectedPeriod }) !== null;
  }, [financialYearStart, financialYearEnd, selectedPeriod]);

  const resetToCurrentFinancialYear = useCallback(() => {
    update({ ...DEFAULT_SELECTION, yearId: currentFinancialYear?.id ?? null });
  }, [update, currentFinancialYear]);

  const refetchCalendar = useCallback(() => {
    void refetch();
    void periodsQuery.refetch();
  }, [refetch, periodsQuery]);

  const value = useMemo<ReportingPeriodContextValue>(
    () => ({
      companyId,
      companyName: activeCompany?.name ?? null,
      financialYears: years,
      currentFinancialYear,
      activeFinancialYear: activeYear,
      isCurrentFinancialYear: !!activeYear && (!currentFinancialYear || activeYear.id === currentFinancialYear.id),
      openFinancialYears,
      closedFinancialYears,
      accountingPeriods: periods,
      periodsInActiveYear,
      currentAccountingPeriod,
      selectedAccountingPeriod: selectedPeriod,
      financialYearStart,
      financialYearEnd,
      yearCode: activeYear?.yearCode ?? null,
      activeFinancialYearLabel,
      reportingRangeLabel,
      currentReportingPeriod,
      selectedPreset: effectivePreset,
      customRange: effectivePreset === 'custom' ? customRange : null,
      dateFrom: currentReportingPeriod ? toIsoDate(currentReportingPeriod.from) : null,
      dateTo: currentReportingPeriod ? toIsoDate(currentReportingPeriod.to) : null,
      isCalendarFallback,
      isReady: !!currentReportingPeriod,
      isLoading,
      setFinancialYear,
      setAccountingPeriod,
      setPreset,
      setCustomRange,
      isPresetAvailable,
      resetToCurrentFinancialYear,
      refetchCalendar,
    }),
    [
      companyId,
      activeCompany?.name,
      years,
      currentFinancialYear,
      activeYear,
      openFinancialYears,
      closedFinancialYears,
      periods,
      periodsInActiveYear,
      currentAccountingPeriod,
      selectedPeriod,
      financialYearStart,
      financialYearEnd,
      activeFinancialYearLabel,
      reportingRangeLabel,
      currentReportingPeriod,
      effectivePreset,
      customRange,
      isCalendarFallback,
      isLoading,
      setFinancialYear,
      setAccountingPeriod,
      setPreset,
      setCustomRange,
      isPresetAvailable,
      resetToCurrentFinancialYear,
      refetchCalendar,
    ],
  );

  return (
    <ReportingPeriodContext.Provider value={value}>
      {children}
    </ReportingPeriodContext.Provider>
  );
}

export function useReportingPeriod(): ReportingPeriodContextValue {
  const ctx = useContext(ReportingPeriodContext);
  if (!ctx) {
    throw new Error('useReportingPeriod must be used within ReportingPeriodProvider');
  }
  return ctx;
}

/** Optional hook for surfaces that may render outside the provider (tests / isolated). */
export function useReportingPeriodOptional(): ReportingPeriodContextValue | null {
  return useContext(ReportingPeriodContext);
}
