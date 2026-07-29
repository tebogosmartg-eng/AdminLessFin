// Governance Foundation — Currencies domain model (Phase G3.1).
//
// Genuinely greenfield: G1's audit confirmed there is NO company-level
// currency column anywhere today (`companies` has none), and no
// `exchange_rates`/`fx_rates` table exists — currency is currently fragmented
// across `bank_accounts.currency`, `efs_engagement_general_information.
// reporting_currency/functional_currency`, and a hardcoded `'ZAR'` literal in
// `formatCurrency()` (src/lib/utils.ts). This domain is the Volume I §3.6
// target shape only; there is nothing to proxy yet.

import type { GovernancePermissionBoundary, ValidationResult } from '../../types';

export interface CurrencyConfigDomainModel {
  companyId: string;
  baseCurrency: string;
  reportingCurrency: string;
}

// Validation model
export function validateCurrencyConfig(config: Partial<CurrencyConfigDomainModel>): ValidationResult {
  const errors: string[] = [];
  const isoLike = /^[A-Z]{3}$/;
  if (!config.baseCurrency || !isoLike.test(config.baseCurrency)) {
    errors.push('baseCurrency must be a 3-letter ISO 4217 code.');
  }
  if (!config.reportingCurrency || !isoLike.test(config.reportingCurrency)) {
    errors.push('reportingCurrency must be a 3-letter ISO 4217 code.');
  }
  return { valid: errors.length === 0, errors };
}

// Permission boundary
export const CURRENCIES_PERMISSIONS: Record<string, GovernancePermissionBoundary> = {
  view: {
    action: 'currencies.view',
    requiredRole: 'member',
    description: 'View base and reporting currency configuration.',
  },
  edit: {
    action: 'currencies.edit',
    requiredRole: 'owner',
    description: 'Change base or reporting currency — high-impact, owner-only.',
  },
};
