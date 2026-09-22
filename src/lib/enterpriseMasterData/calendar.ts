/**
 * Enterprise Financial Calendar resolution (G3.6C / G3.6D).
 * ONE source: financialCalendarService — no profile/engagement duplicate ownership.
 * Financial Statements consumes these years; it must never invent Financial Years.
 */
import { financialCalendarService } from '@/governance/domains/financialCalendar/service';
import type { FinancialYearDomainModel } from '@/governance/domains/financialCalendar/model';

export type EnterpriseCalendarContext = {
  years: FinancialYearDomainModel[];
  activeYear: FinancialYearDomainModel | null;
  startDate: string | null;
  endDate: string | null;
  yearCode: string | null;
};

export function calendarContextFromYears(years: FinancialYearDomainModel[]): EnterpriseCalendarContext {
  // Which year is current is decided once, by financial_year_current() in the
  // database, and arrives on the row. This used to be worked out here as well,
  // with a rule that did not match the one the edge functions used: a company
  // with two open years containing today could be shown a different year by the
  // Accounting workspace than by Financial Statements.
  const flagged = years.find((y) => y.isCurrent);
  const openYears = years.filter((y) => y.status === 'open' || y.status === 'reopened');
  const today = new Date().toISOString().slice(0, 10);
  const activeYear =
    flagged ||
    // Fallback only for a response from before the flag existed.
    openYears.find((y) => y.startDate <= today && today <= y.endDate) ||
    [...openYears].sort((a, b) => (a.endDate < b.endDate ? 1 : -1))[0] ||
    years[0] ||
    null;
  return {
    years,
    activeYear,
    startDate: activeYear?.startDate ?? null,
    endDate: activeYear?.endDate ?? null,
    yearCode: activeYear?.yearCode ?? null,
  };
}

export async function resolveEnterpriseCalendar(companyId: string): Promise<EnterpriseCalendarContext> {
  const years = await financialCalendarService.getFinancialYears(companyId);
  return calendarContextFromYears(years);
}
