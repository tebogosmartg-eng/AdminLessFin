// Governance Foundation — Financial Calendar domain model (Phase G3.1).
//
// Mirrors the shape of the existing `financial_years` / `accounting_periods`
// tables (erp_v10), which Enterprise Constitution Volume II (G3 §2.1-2.2)
// designates as the sole future authority for period state. No new table is
// introduced here — this is a typed read model over data that already exists.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

export type FinancialYearStatus = 'draft' | 'open' | 'closed' | 'locked' | 'reopened';
export type AccountingPeriodStatus = 'future' | 'open' | 'soft_closed' | 'hard_closed' | 'locked' | 'reopened';

export interface FinancialYearDomainModel {
  id: string;
  companyId: string;
  yearCode: string;
  startDate: string;
  endDate: string;
  status: FinancialYearStatus;
  previousFinancialYearId: string | null;
  createdAt: string | null;
}

export interface AccountingPeriodDomainModel {
  id: string;
  financialYearId: string;
  companyId: string;
  periodNumber: number;
  startDate: string;
  endDate: string;
  status: AccountingPeriodStatus;
  // The joined financial year's year_code (e.g. "FY2025") — present because
  // Phase G3.2's real consumer, FinancialPeriods.tsx, renders this column and
  // the existing GET_FINANCIAL_PERIODS edge function already returns it via
  // a `financial_years ( id, year_code, status, start_date, end_date )` join
  // (confirmed at supabase/functions/accounting/index.ts:1100). Added during
  // migration, not present in the original G3.1 scaffold — the scaffold's
  // model was a plausible read shape, not yet checked against every real
  // consumer's actual field usage.
  financialYearCode: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// Validation model
export function validateFinancialYearClose(endDate: string | null | undefined): ValidationResult {
  const errors: string[] = [];
  if (!endDate) errors.push('endDate is required to close a financial year.');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialYearReopen(closedYearId: string | null | undefined): ValidationResult {
  const errors: string[] = [];
  if (!closedYearId) errors.push('closedYearId is required to reopen a financial year.');
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const FINANCIAL_CALENDAR_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'financialCalendar.view',
    requiredRole: 'member',
    description: 'View financial years and accounting periods.',
  },
  close: {
    action: 'financialCalendar.close',
    requiredRole: 'admin',
    description: 'Close a financial year.',
  },
  reopen: {
    action: 'financialCalendar.reopen',
    requiredRole: 'owner',
    description: 'Reopen a closed financial year. Deliberately a higher bar than close, per Volume II §9 (G1 found today\'s reopen has no confirmed role check at all).',
  },
};
