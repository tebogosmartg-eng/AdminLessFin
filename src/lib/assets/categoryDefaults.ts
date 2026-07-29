import type { AssetCategoryIntelligence } from './eamTypes';

export type CategoryDefaultPreview = {
  useful_life_years?: number;
  residual_value?: number;
  depreciation_method?: 'straight-line' | 'reducing-balance';
  asset_account_id?: string;
  accumulated_depreciation_account_id?: string;
  depreciation_expense_account_id?: string;
  capitalisation_threshold?: number;
  default_verification_frequency_months?: number;
  component_accounting_enabled?: boolean;
};

/**
 * Maps category intelligence onto asset acquire form defaults.
 * Users can override any field before save.
 */
export function categoryDefaultsForAsset(
  category: AssetCategoryIntelligence | null | undefined,
  purchaseCost: number,
): CategoryDefaultPreview {
  if (!category) return {};
  const cost = Number.isFinite(purchaseCost) ? purchaseCost : 0;
  const pct = Number(category.residual_value_pct ?? 0);
  const residual = Math.round(cost * (pct / 100) * 100) / 100;
  const method =
    category.depreciation_method === 'reducing-balance' ? 'reducing-balance' : 'straight-line';

  return {
    useful_life_years: category.useful_life_years ?? undefined,
    residual_value: residual,
    depreciation_method: method,
    asset_account_id: category.gl_asset_account_id ?? undefined,
    accumulated_depreciation_account_id:
      category.accumulated_depreciation_account_id ?? undefined,
    depreciation_expense_account_id: category.depreciation_expense_account_id ?? undefined,
    capitalisation_threshold: category.capitalisation_threshold ?? undefined,
    default_verification_frequency_months:
      category.default_verification_frequency_months ?? undefined,
    component_accounting_enabled: category.component_accounting_enabled ?? false,
  };
}

export function nextVerificationDueFromFrequency(
  purchaseDateIso: string,
  frequencyMonths: number | undefined,
): string | undefined {
  if (!frequencyMonths || frequencyMonths <= 0) return undefined;
  const base = new Date(purchaseDateIso);
  if (Number.isNaN(base.getTime())) return undefined;
  base.setMonth(base.getMonth() + frequencyMonths);
  return base.toISOString().split('T')[0];
}
