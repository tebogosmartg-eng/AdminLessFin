// Governance Foundation — Financial Calendar service.
//
// This service is a typed proxy in front of calls that ALREADY EXIST and
// already run in production: `accountingApi.years`/`accountingApi.periods`
// (src/lib/accountingWorkspace.ts, GET_FINANCIAL_YEARS/GET_FINANCIAL_PERIODS)
// and the legacy `financial-year` edge function (CLOSE/REOPEN). No backend
// behaviour is introduced, changed, or duplicated here.
//
// Phase G3.2 activated years/periods + close/reopen. Phase G3.5 completes
// the remaining FinancialYearSettings consumers: GET_CLOSED_YEARS and the
// calendar-config UPDATE_PROFILE writes (year-end month/day + active year
// start). Underlying settings/financial-year edge calls are unchanged.

import { accountingApi } from '@/lib/accountingWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { GovernanceMutationResult } from '@/governance/types';
import {
  validateFinancialYearClose,
  validateFinancialYearReopen,
  type FinancialYearDomainModel,
  type AccountingPeriodDomainModel,
} from './model';

export type ClosedFinancialYearRow = {
  id: string;
  start_date: string;
  end_date: string;
};

export interface FinancialCalendarReadAPI {
  getFinancialYears(companyId: string): Promise<FinancialYearDomainModel[]>;
  getAccountingPeriods(companyId: string): Promise<AccountingPeriodDomainModel[]>;
  getClosedYears(companyId: string): Promise<ClosedFinancialYearRow[]>;
}

export interface FinancialCalendarMutationAPI {
  closeFinancialYear(companyId: string, endDate: string): Promise<GovernanceMutationResult>;
  reopenFinancialYear(companyId: string, closedYearId: string): Promise<GovernanceMutationResult>;
  updateFinancialYearEndSettings(profileData: {
    financial_year_end_month: number;
    financial_year_end_day: number;
    current_financial_year_start: string;
  }): Promise<GovernanceMutationResult>;
  setActiveFinancialYearStart(currentFinancialYearStart: string): Promise<GovernanceMutationResult>;
  ensureFinancialYear(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<GovernanceMutationResult>;
}

// Loose shape of the rows GET_FINANCIAL_YEARS/GET_FINANCIAL_PERIODS actually
// return today (snake_case, per the existing edge function contract) — kept
// local to this file so the rest of the Governance Foundation only ever sees
// the camelCase domain model above.
//
// Verified directly against supabase/functions/accounting/index.ts:1097-1117
// during the G3.2 migration: GET_FINANCIAL_YEARS is `select('*')` on
// `financial_years` (so created_at is present); GET_FINANCIAL_PERIODS is
// `select('*, financial_years ( id, year_code, status, start_date, end_date ))`
// on `accounting_periods` (so created_at/updated_at and the joined year_code
// are present) — both fields the real consumer pages already render today.
type RawFinancialYearRow = {
  id: string;
  company_id: string;
  year_code: string;
  start_date: string;
  end_date: string;
  status: FinancialYearDomainModel['status'];
  previous_financial_year_id: string | null;
  created_at: string | null;
};

type RawAccountingPeriodRow = {
  id: string;
  financial_year_id: string;
  company_id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  status: AccountingPeriodDomainModel['status'];
  created_at: string | null;
  updated_at: string | null;
  financial_years?: { year_code: string } | null;
};

export class FinancialCalendarService implements FinancialCalendarReadAPI, FinancialCalendarMutationAPI {
  async getFinancialYears(companyId: string): Promise<FinancialYearDomainModel[]> {
    assertGovernanceDomainActive('financialCalendar');
    const raw = (await accountingApi.years(companyId)) as RawFinancialYearRow[] | null;
    return (raw ?? []).map((row) => ({
      id: row.id,
      companyId: row.company_id,
      yearCode: row.year_code,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      previousFinancialYearId: row.previous_financial_year_id ?? null,
      createdAt: row.created_at ?? null,
    }));
  }

  async getAccountingPeriods(companyId: string): Promise<AccountingPeriodDomainModel[]> {
    assertGovernanceDomainActive('financialCalendar');
    const raw = (await accountingApi.periods(companyId)) as RawAccountingPeriodRow[] | null;
    return (raw ?? []).map((row) => ({
      id: row.id,
      financialYearId: row.financial_year_id,
      companyId: row.company_id,
      periodNumber: row.period_number,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      financialYearCode: row.financial_years?.year_code ?? null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    }));
  }

  /** Pass-through of settings GET_CLOSED_YEARS — raw edge shape preserved. */
  async getClosedYears(companyId: string): Promise<ClosedFinancialYearRow[]> {
    assertGovernanceDomainActive('financialCalendar');
    const { data, error } = await supabase.functions.invoke('settings', {
      body: { method: 'GET_CLOSED_YEARS', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    return (data as ClosedFinancialYearRow[] | null) ?? [];
  }

  async closeFinancialYear(companyId: string, endDate: string): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('financialCalendar');
    const validation = validateFinancialYearClose(endDate);
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };

    const { error } = await supabase.functions.invoke('financial-year', {
      body: { method: 'CLOSE', company_id: companyId, end_date: endDate },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async reopenFinancialYear(companyId: string, closedYearId: string): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('financialCalendar');
    const validation = validateFinancialYearReopen(closedYearId);
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };

    const { error } = await supabase.functions.invoke('financial-year', {
      body: { method: 'REOPEN', company_id: companyId, closed_year_id: closedYearId },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  /**
   * Pass-through of settings UPDATE_PROFILE for financial-year-end calendar
   * config. Payload identical to pre-G3.5 FinancialYearSettings.
   */
  async updateFinancialYearEndSettings(profileData: {
    financial_year_end_month: number;
    financial_year_end_day: number;
    current_financial_year_start: string;
  }): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('financialCalendar');
    const { error } = await supabase.functions.invoke('settings', {
      body: { method: 'UPDATE_PROFILE', profileData },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  /**
   * Pass-through of settings UPDATE_PROFILE for active financial-year start.
   * Payload identical to pre-G3.5 FinancialYearSettings setActiveYearMutation.
   */
  async setActiveFinancialYearStart(currentFinancialYearStart: string): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('financialCalendar');
    const { error } = await supabase.functions.invoke('settings', {
      body: {
        method: 'UPDATE_PROFILE',
        profileData: { current_financial_year_start: currentFinancialYearStart },
      },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  /**
   * Materialises the first-class `financial_years` row for a calendar range.
   *
   * The calendar-config writes above only persist the legacy signals
   * (`profiles.current_financial_year_start` + year-end month/day), but the
   * posting engine stamps `journal_entries.financial_year_id` /
   * `accounting_period_id` from `financial_years`/`accounting_periods`. Without
   * this call the two models diverge and every entry posted outside a
   * migration-backfilled range is left permanently unbound to any year or
   * period, so period locking and year-scoped reporting silently skip it.
   *
   * Idempotent: the (company_id, start_date, end_date) unique constraint makes a
   * repeat call a no-op, and the `erp_v10_auto_generate_periods` AFTER INSERT
   * trigger generates the twelve monthly periods for genuinely new rows.
   */
  async ensureFinancialYear(
    companyId: string,
    startDate: string,
    endDate: string
  ): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('financialCalendar');
    if (!companyId) return { success: false, error: 'No active company.' };
    if (!startDate || !endDate) return { success: false, error: 'Financial year dates are required.' };
    if (endDate < startDate) {
      return { success: false, error: 'Financial year end date must fall on or after the start date.' };
    }

    const { error } = await supabase
      .from('financial_years')
      .upsert(
        {
          company_id: companyId,
          year_code: `FY${endDate.slice(0, 4)}`,
          start_date: startDate,
          end_date: endDate,
          status: 'open',
        },
        { onConflict: 'company_id,start_date,end_date', ignoreDuplicates: true }
      );

    return error ? { success: false, error: error.message } : { success: true };
  }
}

export function createFinancialCalendarService(): FinancialCalendarService {
  return new FinancialCalendarService();
}

// Shared singleton — the service is stateless (each method call is a fresh
// network request), so one instance is safe to reuse app-wide. Consumers
// import this directly rather than via the React GovernanceProvider/
// useGovernance() hook, matching how the existing `accountingApi` singleton
// (src/lib/accountingWorkspace.ts) is already consumed today — this keeps
// the migration consistent with the codebase's existing convention rather
// than introducing a second access pattern for the same kind of object.
export const financialCalendarService = createFinancialCalendarService();
