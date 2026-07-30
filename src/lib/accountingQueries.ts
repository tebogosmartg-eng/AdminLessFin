import { useQuery } from '@tanstack/react-query';
import { accountingApi, type AccountingFilters } from '../lib/accountingWorkspace';
import { financialCalendarService } from '@/governance/domains/financialCalendar/service';

export function accountingDashboardQuery(companyId: string) {
  return {
    queryKey: ['accounting-dashboard', companyId] as const,
    queryFn: () => accountingApi.dashboard(companyId),
  };
}

export function accountingContextQuery(companyId: string) {
  return {
    queryKey: ['accounting-context', companyId] as const,
    queryFn: () => accountingApi.context(companyId),
  };
}

export function enterpriseLedgerQuery(companyId: string, page: number, pageSize: number, filters: AccountingFilters) {
  return {
    queryKey: ['enterprise-ledger', companyId, page, pageSize, filters] as const,
    queryFn: () => accountingApi.ledger(companyId, page, pageSize, filters),
  };
}

export function trialBalanceQuery(companyId: string, startDate: string, endDate: string) {
  return {
    queryKey: ['trial-balance', companyId, startDate, endDate] as const,
    queryFn: () => accountingApi.trialBalance(companyId, startDate, endDate),
  };
}

export function hierarchicalTrialBalanceQuery(companyId: string, startDate: string, endDate: string) {
  return {
    queryKey: ['hierarchical-trial-balance', companyId, startDate, endDate] as const,
    queryFn: () => accountingApi.hierarchicalTrialBalance(companyId, startDate, endDate),
  };
}

export function postingRequestsQuery(companyId: string, page: number, pageSize: number, filters: AccountingFilters) {
  return {
    queryKey: ['posting-requests', companyId, page, pageSize, filters] as const,
    queryFn: () => accountingApi.postingRequests(companyId, page, pageSize, filters),
  };
}

export function accountingExceptionsQuery(companyId: string) {
  return {
    queryKey: ['accounting-exceptions', companyId] as const,
    queryFn: () => accountingApi.exceptions(companyId),
  };
}

// Phase G3.2 — Financial Calendar migration: these two factories now go
// through the Governance Foundation's FinancialCalendarService instead of
// calling accountingApi.periods/years directly. The underlying edge function
// call is unchanged (the service proxies the same GET_FINANCIAL_PERIODS/
// GET_FINANCIAL_YEARS methods) — only the access path changed. The returned
// shape is now the camelCase FinancialYearDomainModel/AccountingPeriodDomainModel
// (not the old raw snake_case rows); src/pages/accounting/FinancialYears.tsx,
// src/pages/accounting/FinancialPeriods.tsx, and src/pages/GeneralLedger.tsx
// were updated in the same migration to read the new field names.
// COMPATIBILITY: Prefer useReportingPeriod().financialYears / accountingPeriods.
// These query helpers remain for non-React tooling only — do not use for reporting defaults.
export function accountingPeriodsQuery(companyId: string) {
  return {
    queryKey: ['accounting-periods', companyId] as const,
    queryFn: () => financialCalendarService.getAccountingPeriods(companyId),
  };
}

export function accountingYearsQuery(companyId: string) {
  return {
    queryKey: ['accounting-years', companyId] as const,
    queryFn: () => financialCalendarService.getFinancialYears(companyId),
  };
}

export function accountingAuditQuery(companyId: string, page: number, pageSize: number, tableName?: string) {
  return {
    queryKey: ['accounting-audit', companyId, page, pageSize, tableName] as const,
    queryFn: () => accountingApi.audit(companyId, page, pageSize, tableName),
  };
}

export function accountActivityQuery(companyId: string, accountId: string, opts: Record<string, unknown>) {
  return {
    queryKey: ['account-activity', companyId, accountId, opts] as const,
    queryFn: () => accountingApi.accountActivity(companyId, accountId, opts as any),
  };
}

export function financialHealthQuery(companyId: string) {
  return {
    queryKey: ['financial-health', companyId] as const,
    queryFn: () => accountingApi.financialHealth(companyId),
  };
}

export function periodCloseReadinessQuery(companyId: string) {
  return {
    queryKey: ['period-close-readiness', companyId] as const,
    queryFn: () => accountingApi.periodCloseReadiness(companyId),
  };
}

export function accountingTimelineQuery(companyId: string, page: number, pageSize: number, filters: AccountingFilters) {
  return {
    queryKey: ['accounting-timeline', companyId, page, pageSize, filters] as const,
    queryFn: () => accountingApi.accountingTimeline(companyId, page, pageSize, filters),
  };
}

export function useAccountingContext(companyId: string | undefined) {
  return useQuery({
    ...accountingContextQuery(companyId!),
    enabled: !!companyId,
  });
}
