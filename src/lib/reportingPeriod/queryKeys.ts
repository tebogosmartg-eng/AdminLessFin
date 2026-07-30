/**
 * Invalidate Reporting Period calendar when Settings Financials changes.
 * Settings writes already invalidate `financial_years`; this documents the contract.
 */
export const REPORTING_PERIOD_QUERY_KEYS = {
  financialYears: (companyId: string | null | undefined) => ['financial_years', companyId] as const,
  accountingPeriods: (companyId: string | null | undefined) => ['financial-periods', companyId] as const,
} as const;
