/**
 * AdminLess Fin V16.2 — Enterprise Asset Management shared types & helpers.
 */

export type AssetVerificationStatus =
  | 'unverified'
  | 'verified'
  | 'overdue'
  | 'in_progress'
  | 'disputed';

export type AssetDocumentType =
  | 'image'
  | 'invoice'
  | 'warranty'
  | 'insurance'
  | 'manual'
  | 'inspection_report'
  | 'certificate'
  | 'attachment';

export type AssetRegisterFilters = {
  search: string;
  categoryId: string;
  status: string;
  department: string;
  custodian: string;
  location: string;
  sortBy: 'asset_code' | 'description' | 'purchase_date' | 'purchase_cost' | 'net_book_value' | 'status';
  sortDir: 'asc' | 'desc';
};

export type AssetSavedView = {
  id: string;
  name: string;
  filters: AssetRegisterFilters;
};

export const DEFAULT_ASSET_FILTERS: AssetRegisterFilters = {
  search: '',
  categoryId: 'all',
  status: 'all',
  department: 'all',
  custodian: 'all',
  location: 'all',
  sortBy: 'purchase_date',
  sortDir: 'desc',
};

export const ASSET_SAVED_VIEWS_KEY = (companyId: string) => `eam.v162.savedViews.${companyId}`;

export function loadSavedViews(companyId: string): AssetSavedView[] {
  try {
    const raw = localStorage.getItem(ASSET_SAVED_VIEWS_KEY(companyId));
    if (!raw) return [];
    return JSON.parse(raw) as AssetSavedView[];
  } catch {
    return [];
  }
}

export function persistSavedViews(companyId: string, views: AssetSavedView[]) {
  localStorage.setItem(ASSET_SAVED_VIEWS_KEY(companyId), JSON.stringify(views));
}

export type EnterpriseFixedAsset = {
  id: string;
  asset_code: string;
  description: string;
  purchase_date: string;
  purchase_cost: number;
  accumulated_depreciation: number;
  net_book_value: number;
  status: string;
  category_id?: string | null;
  location?: string | null;
  department?: string | null;
  custodian_name?: string | null;
  assigned_to_employee_id?: string | null;
  impairment_amount?: number | null;
  depreciation_ytd?: number | null;
  verification_status?: AssetVerificationStatus | string | null;
  last_verified_at?: string | null;
  next_verification_due?: string | null;
  verified_by_name?: string | null;
  qr_code?: string | null;
  barcode?: string | null;
  asset_tag?: string | null;
  serial_number?: string | null;
  useful_life_years?: number | null;
  residual_value?: number | null;
  depreciation_method?: string | null;
  last_depreciation_date?: string | null;
  asset_categories?: { name: string } | null;
  employees?: {
    employee_number?: string;
    first_name?: string;
    last_name?: string;
    department?: string | null;
  } | null;
};

export type AssetRegisterKpis = {
  totalAssets: number;
  netBookValue: number;
  acquisitionCost: number;
  depreciationYtd: number;
  impairments: number;
  awaitingVerification: number;
};

export function computeAssetRegisterKpis(assets: EnterpriseFixedAsset[]): AssetRegisterKpis {
  const activeLike = assets.filter((a) => a.status !== 'disposed');
  return {
    totalAssets: assets.length,
    netBookValue: activeLike.reduce((s, a) => s + Number(a.net_book_value || 0), 0),
    acquisitionCost: assets.reduce((s, a) => s + Number(a.purchase_cost || 0), 0),
    depreciationYtd: assets.reduce((s, a) => s + Number(a.depreciation_ytd || 0), 0),
    impairments: assets.reduce((s, a) => s + Number(a.impairment_amount || 0), 0),
    awaitingVerification: assets.filter(
      (a) =>
        a.status !== 'disposed' &&
        (!a.verification_status ||
          a.verification_status === 'unverified' ||
          a.verification_status === 'overdue' ||
          a.verification_status === 'in_progress')
    ).length,
  };
}

export function filterAndSortAssets(
  assets: EnterpriseFixedAsset[],
  filters: AssetRegisterFilters
): EnterpriseFixedAsset[] {
  const q = filters.search.trim().toLowerCase();
  let rows = assets.filter((a) => {
    if (filters.categoryId !== 'all' && a.category_id !== filters.categoryId) return false;
    if (filters.status !== 'all' && a.status !== filters.status) return false;
    const dept = a.department || a.employees?.department || '';
    if (filters.department !== 'all' && dept !== filters.department) return false;
    const custodian =
      a.custodian_name ||
      [a.employees?.first_name, a.employees?.last_name].filter(Boolean).join(' ') ||
      '';
    if (filters.custodian !== 'all' && custodian !== filters.custodian) return false;
    if (filters.location !== 'all' && (a.location || '') !== filters.location) return false;
    if (!q) return true;
    const hay = [
      a.asset_code,
      a.description,
      a.asset_categories?.name,
      a.location,
      a.department,
      a.custodian_name,
      a.serial_number,
      a.asset_tag,
      a.barcode,
      a.qr_code,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  const dir = filters.sortDir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const av = a[filters.sortBy];
    const bv = b[filters.sortBy];
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
  });
  return rows;
}

export type AssetCategoryIntelligence = {
  id: string;
  name: string;
  useful_life_years?: number | null;
  residual_value_pct?: number | null;
  depreciation_method?: string | null;
  gl_asset_account_id?: string | null;
  accumulated_depreciation_account_id?: string | null;
  depreciation_expense_account_id?: string | null;
  disposal_account_id?: string | null;
  revaluation_reserve_account_id?: string | null;
  impairment_account_id?: string | null;
  capitalisation_threshold?: number | null;
  component_accounting_enabled?: boolean | null;
  default_verification_frequency_months?: number | null;
};
