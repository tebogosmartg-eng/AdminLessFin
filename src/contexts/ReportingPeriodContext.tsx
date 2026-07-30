/**
 * Canonical Reporting Period Context — single Financial Calendar + reporting authority.
 *
 * Source of truth chain:
 *   Settings → Financials (FinancialYearSettings)
 *     → financialCalendarService / financial_years
 *       → useEnterpriseCalendar (read adapter)
 *         → ReportingPeriodContext (ONLY app-facing facade)
 *
 * Default on open: Current Financial Year.
 * No page may independently derive FY bounds, active year, or reporting defaults.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
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
  resolveReportingPeriodPreset,
  toIsoDate,
  type ReportingPeriodPreset,
  type ReportingPeriodRange,
} from '@/lib/reportingPeriod/presets';

export type ReportingPeriodContextValue = {
  companyId: string | null;
  companyName: string | null;

  /** Full Financial Calendar from Settings (open + closed + draft). */
  financialYears: FinancialYearDomainModel[];
  activeFinancialYear: FinancialYearDomainModel | null;
  openFinancialYears: FinancialYearDomainModel[];
  closedFinancialYears: FinancialYearDomainModel[];
  accountingPeriods: AccountingPeriodDomainModel[];

  financialYearStart: Date | null;
  financialYearEnd: Date | null;
  /** Canonical active year code from Settings calendar (e.g. FY2026). */
  yearCode: string | null;
  /** Display label for the active financial year. */
  activeFinancialYearLabel: string | null;

  currentReportingPeriod: ReportingPeriodRange | null;
  selectedPreset: ReportingPeriodPreset;
  customRange: ReportingPeriodRange | null;
  dateFrom: string | null;
  dateTo: string | null;
  isReady: boolean;
  isLoading: boolean;

  setPreset: (preset: ReportingPeriodPreset) => void;
  setCustomRange: (range: ReportingPeriodRange) => void;
  resetToCurrentFinancialYear: () => void;
  refetchCalendar: () => void;
};

const ReportingPeriodContext = createContext<ReportingPeriodContextValue | null>(null);

export function ReportingPeriodProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id ?? null;
  const {
    activeYear,
    startDate: fyStartIso,
    endDate: fyEndIso,
    yearCode,
    years,
    isLoading,
    refetch,
  } = useEnterpriseCalendar(companyId);

  const periodsQuery = useQuery({
    queryKey: ['financial-periods', companyId],
    queryFn: () => financialCalendarService.getAccountingPeriods(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const [selectedPreset, setSelectedPreset] = useState<ReportingPeriodPreset>('current_financial_year');
  const [customRange, setCustomRangeState] = useState<ReportingPeriodRange | null>(null);

  // RB-001: parse via the safe boundary parser. A malformed FY date (bad row,
  // import, malformed API) becomes null — which every guard below already
  // handles — instead of a truthy Invalid Date that white-screens the whole app.
  const financialYearStart = parseIsoDateSafe(fyStartIso);
  const financialYearEnd = parseIsoDateSafe(fyEndIso);

  const openFinancialYears = useMemo(
    () => years.filter((y) => y.status === 'open' || y.status === 'reopened'),
    [years],
  );
  const closedFinancialYears = useMemo(
    () => years.filter((y) => y.status === 'closed' || y.status === 'locked'),
    [years],
  );

  const activeFinancialYearLabel = useMemo(() => {
    if (!financialYearStart || !financialYearEnd) return null;
    return `Current Financial Year · ${format(financialYearStart, 'dd MMM yyyy')} – ${format(financialYearEnd, 'dd MMM yyyy')}`;
  }, [financialYearStart, financialYearEnd]);

  // Authority fingerprint: company + active FY bounds. Settings change → reset to Current FY.
  const authorityKey = `${companyId ?? ''}:${activeYear?.id ?? ''}:${fyStartIso ?? ''}:${fyEndIso ?? ''}`;
  const prevAuthorityKey = useRef<string | null>(null);

  useEffect(() => {
    if (prevAuthorityKey.current === null) {
      prevAuthorityKey.current = authorityKey;
      setSelectedPreset('current_financial_year');
      setCustomRangeState(null);
      return;
    }
    if (prevAuthorityKey.current !== authorityKey) {
      prevAuthorityKey.current = authorityKey;
      setSelectedPreset('current_financial_year');
      setCustomRangeState(null);
    }
  }, [authorityKey]);

  const currentReportingPeriod = useMemo((): ReportingPeriodRange | null => {
    if (financialYearStart && financialYearEnd) {
      return resolveReportingPeriodPreset({
        preset: selectedPreset,
        financialYearStart,
        financialYearEnd,
        years,
        customRange,
      });
    }
    if (!isLoading && companyId) {
      // Bootstrap only: Settings calendar not materialised yet.
      const fallback = calendarYearFallback();
      if (selectedPreset === 'custom' && customRange?.from && customRange?.to) {
        return customRange;
      }
      if (selectedPreset === 'current_financial_year' || selectedPreset === 'year_to_date') {
        return fallback;
      }
      return resolveReportingPeriodPreset({
        preset: selectedPreset,
        financialYearStart: fallback.from,
        financialYearEnd: fallback.to,
        years: [],
        customRange,
      });
    }
    return null;
  }, [
    financialYearStart,
    financialYearEnd,
    years,
    selectedPreset,
    customRange,
    isLoading,
    companyId,
  ]);

  const setPreset = useCallback((preset: ReportingPeriodPreset) => {
    setSelectedPreset(preset);
    if (preset !== 'custom') {
      setCustomRangeState(null);
    }
  }, []);

  const setCustomRange = useCallback((range: ReportingPeriodRange) => {
    if (!range?.from || !range?.to) return;
    setCustomRangeState(range);
    setSelectedPreset('custom');
  }, []);

  const resetToCurrentFinancialYear = useCallback(() => {
    setSelectedPreset('current_financial_year');
    setCustomRangeState(null);
  }, []);

  const refetchCalendar = useCallback(() => {
    void refetch();
    void periodsQuery.refetch();
  }, [refetch, periodsQuery]);

  const value = useMemo<ReportingPeriodContextValue>(
    () => ({
      companyId,
      companyName: activeCompany?.name ?? null,
      financialYears: years,
      activeFinancialYear: activeYear,
      openFinancialYears,
      closedFinancialYears,
      accountingPeriods: periodsQuery.data ?? [],
      financialYearStart,
      financialYearEnd,
      yearCode: yearCode ?? null,
      activeFinancialYearLabel,
      currentReportingPeriod,
      selectedPreset,
      customRange,
      dateFrom: currentReportingPeriod ? toIsoDate(currentReportingPeriod.from) : null,
      dateTo: currentReportingPeriod ? toIsoDate(currentReportingPeriod.to) : null,
      isReady: !!currentReportingPeriod,
      isLoading: !!companyId && (isLoading || periodsQuery.isLoading),
      setPreset,
      setCustomRange,
      resetToCurrentFinancialYear,
      refetchCalendar,
    }),
    [
      companyId,
      activeCompany?.name,
      years,
      activeYear,
      openFinancialYears,
      closedFinancialYears,
      periodsQuery.data,
      periodsQuery.isLoading,
      financialYearStart,
      financialYearEnd,
      yearCode,
      activeFinancialYearLabel,
      currentReportingPeriod,
      selectedPreset,
      customRange,
      isLoading,
      setPreset,
      setCustomRange,
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
