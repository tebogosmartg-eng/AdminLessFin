import type { AssetRegisterFilters, AssetRegisterKpis, EnterpriseFixedAsset } from './eamTypes';
import { computeAssetRegisterKpis } from './eamTypes';

export const DEFAULT_REGISTER_PAGE_SIZE = 50;
export const MAX_REGISTER_PAGE_SIZE = 100;

export type AssetRegisterPageRequest = {
  companyId: string;
  page: number;
  pageSize: number;
  filters: AssetRegisterFilters;
};

export type AssetRegisterPageResponse = {
  rows: EnterpriseFixedAsset[];
  totalCount: number;
  page: number;
  pageSize: number;
  kpis: AssetRegisterKpis;
};

export type AssetRegisterFacets = {
  categories: { id: string; name: string }[];
  departments: string[];
  custodians: string[];
  locations: string[];
  statuses: string[];
};

export function normalizeRegisterPageRequest(
  req: Partial<AssetRegisterPageRequest>,
): AssetRegisterPageRequest {
  const page = Math.max(1, Math.floor(Number(req.page) || 1));
  const pageSize = Math.min(
    MAX_REGISTER_PAGE_SIZE,
    Math.max(1, Math.floor(Number(req.pageSize) || DEFAULT_REGISTER_PAGE_SIZE)),
  );
  return {
    companyId: req.companyId || '',
    page,
    pageSize,
    filters: req.filters || {
      search: '',
      categoryId: 'all',
      status: 'all',
      department: 'all',
      custodian: 'all',
      location: 'all',
      sortBy: 'purchase_date',
      sortDir: 'desc',
    },
  };
}

/** Attach NBV for register rows (same contract as fixedAssetsQuery). */
export function withNetBookValue<T extends { purchase_cost?: number; accumulated_depreciation?: number }>(
  rows: T[],
): (T & { net_book_value: number })[] {
  return rows.map((asset) => ({
    ...asset,
    net_book_value:
      Number(asset.purchase_cost ?? 0) - Number(asset.accumulated_depreciation ?? 0),
  }));
}

export function kpisFromAssetRows(rows: EnterpriseFixedAsset[]): AssetRegisterKpis {
  return computeAssetRegisterKpis(rows);
}

export const ASSET_CODE_PATTERN = /^AST-\d{4}-\d{6}$/;

export function isEnterpriseAssetCode(code: string): boolean {
  return ASSET_CODE_PATTERN.test(code.trim());
}
