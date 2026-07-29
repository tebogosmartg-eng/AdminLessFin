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
  const activeYear =
    years.find((y) => y.status === 'open') ||
    years.find((y) => y.status === 'reopened') ||
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
