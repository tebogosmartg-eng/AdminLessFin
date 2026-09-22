// Accounting Readiness — account matching for the mapping SCREEN only.
//
// This file used to carry a second copy of the whole readiness verdict, mirrored
// from the edge function. Both are gone: the FACTS now come from the database
// function accounting_facts(company), and the one composition that turns them
// into steps and status lives in
// supabase/functions/_shared/accountingReadiness/compose.ts.
//
// What remains is the matcher the Control Account Mapping screen uses to SUGGEST
// which existing account fits which role. Suggesting on a name is fine and
// helpful. Deciding on a name is not, and nothing here decides anything.

import type { ControlAccountRole } from './model';

export type CoaRow = {
  id: string;
  name: string;
  type: string;
  account_role?: string | null;
  category?: string | null;
  subcategory?: string | null;
  control_account?: boolean | null;
  system_account?: boolean | null;
  tax_treatment?: string | null;
  financial_statement?: string | null;
  normal_balance?: string | null;
  account_code?: string | null;
  account_number?: number | null;
  description?: string | null;
  is_active?: boolean | null;
};

/** Role name used by the mapping screen -> the account_role stored on the chart. */
const ROLE_TO_ACCOUNT_ROLE: Record<string, string | string[]> = {
  trade_debtors: 'trade_receivable',
  trade_creditors: 'trade_payable',
  vat_control: ['vat_control', 'output_vat', 'input_vat'],
  retained_earnings: 'retained_earnings',
  inventory: 'inventory_asset',
  fixed_assets: 'fixed_asset',
  payroll_clearing: 'payroll_clearing',
};

export function accountSatisfiesControlRole(account: CoaRow, role: ControlAccountRole): boolean {
  return matchesRole(account, role);
}

function matchesRole(account: CoaRow, role: ControlAccountRole): boolean {
  if (role === 'bank') {
    return (
      account.account_role === 'bank' ||
      account.account_role === 'cash' ||
      account.subcategory === 'Cash and Cash Equivalents'
    );
  }
  if (role === 'vat_control') {
    return (
      account.account_role === 'vat_control' ||
      account.account_role === 'output_vat' ||
      account.account_role === 'input_vat' ||
      account.tax_treatment === 'vat_control' ||
      account.tax_treatment === 'vat_output' ||
      account.tax_treatment === 'vat_input'
    );
  }
  if (role === 'retained_earnings') {
    return account.account_role === 'retained_earnings' || account.system_account === true || account.account_code === '3020';
  }
  if (role === 'payroll_clearing') {
    return (
      account.account_role === 'payroll_clearing' ||
      account.tax_treatment === 'paye' ||
      account.tax_treatment === 'uif' ||
      account.tax_treatment === 'sdl'
    );
  }
  if (role === 'fixed_assets') {
    return account.account_role === 'fixed_asset' || account.subcategory === 'Property, Plant and Equipment';
  }
  if (role === 'inventory') {
    return account.account_role === 'inventory_asset' || account.subcategory === 'Inventory' || account.account_code === '1210';
  }
  const mapped = ROLE_TO_ACCOUNT_ROLE[role];
  if (!mapped) return false;
  const roles = Array.isArray(mapped) ? mapped : [mapped];
  if (account.account_role && roles.includes(account.account_role)) return true;
  // Stable template-code fallback for legacy charts — never display name.
  if (role === 'trade_debtors' && account.account_code === '1220') return true;
  if (role === 'trade_creditors' && account.account_code === '2110') return true;
  return false;
}
