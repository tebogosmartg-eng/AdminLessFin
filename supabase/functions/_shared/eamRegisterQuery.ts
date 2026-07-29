// @ts-nocheck
/** Server-side asset register paging/filtering (mirrors src/lib/assets/eamTypes register helpers). */

export const DEFAULT_REGISTER_PAGE_SIZE = 50;
export const MAX_REGISTER_PAGE_SIZE = 100;

export function normalizeRegisterPageRequest(body) {
  const page = Math.max(1, Math.floor(Number(body.page) || 1));
  const pageSize = Math.min(
    MAX_REGISTER_PAGE_SIZE,
    Math.max(1, Math.floor(Number(body.pageSize) || DEFAULT_REGISTER_PAGE_SIZE)),
  );
  const filters = body.filters || {};
  return {
    page,
    pageSize,
    filters: {
      search: String(filters.search || ''),
      categoryId: filters.categoryId || 'all',
      status: filters.status || 'all',
      department: filters.department || 'all',
      custodian: filters.custodian || 'all',
      location: filters.location || 'all',
      sortBy: filters.sortBy || 'purchase_date',
      sortDir: filters.sortDir === 'asc' ? 'asc' : 'desc',
    },
  };
}

export function withNetBookValue(rows) {
  return (rows || []).map((asset) => ({
    ...asset,
    net_book_value: Number(asset.purchase_cost ?? 0) - Number(asset.accumulated_depreciation ?? 0),
  }));
}

export function computeAssetRegisterKpis(assets) {
  const activeLike = (assets || []).filter((a) => a.status !== 'disposed');
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
          a.verification_status === 'in_progress'),
    ).length,
  };
}

function custodianLabel(a) {
  return (
    a.custodian_name ||
    [a.employees?.first_name, a.employees?.last_name].filter(Boolean).join(' ') ||
    ''
  );
}

export function applyRegisterFilters(rows, filters) {
  const q = filters.search.trim().toLowerCase();
  let out = (rows || []).filter((a) => {
    if (filters.categoryId !== 'all' && a.category_id !== filters.categoryId) return false;
    if (filters.status !== 'all' && a.status !== filters.status) return false;
    const dept = a.department || a.employees?.department || '';
    if (filters.department !== 'all' && dept !== filters.department) return false;
    if (filters.custodian !== 'all' && custodianLabel(a) !== filters.custodian) return false;
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
  out = [...out].sort((a, b) => {
    let av = a[filters.sortBy];
    let bv = b[filters.sortBy];
    if (filters.sortBy === 'net_book_value') {
      av = Number(a.purchase_cost ?? 0) - Number(a.accumulated_depreciation ?? 0);
      bv = Number(b.purchase_cost ?? 0) - Number(b.accumulated_depreciation ?? 0);
    }
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
  });
  return out;
}

export function paginateRows(rows, page, pageSize) {
  const totalCount = rows.length;
  const start = (page - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    totalCount,
    page,
    pageSize,
  };
}

export async function fetchRegisterFacets(supabaseAdmin, company_id) {
  const { data: assets, error } = await supabaseAdmin
    .from('fixed_assets')
    .select('category_id, status, department, location, custodian_name, asset_categories(name)')
    .eq('company_id', company_id);
  if (error) throw error;

  const categoriesMap = new Map();
  const departments = new Set();
  const custodians = new Set();
  const locations = new Set();
  const statuses = new Set();

  for (const a of assets || []) {
    if (a.category_id && a.asset_categories?.name) {
      categoriesMap.set(a.category_id, { id: a.category_id, name: a.asset_categories.name });
    }
    if (a.status) statuses.add(a.status);
    if (a.department) departments.add(a.department);
    if (a.custodian_name) custodians.add(a.custodian_name);
    if (a.location) locations.add(a.location);
  }

  return {
    categories: [...categoriesMap.values()].sort((x, y) => x.name.localeCompare(y.name)),
    departments: [...departments].sort(),
    custodians: [...custodians].sort(),
    locations: [...locations].sort(),
    statuses: [...statuses].sort(),
  };
}

export async function fetchRegisterPage(supabaseAdmin, company_id, req) {
  const { page, pageSize, filters } = normalizeRegisterPageRequest(req);

  let query = supabaseAdmin
    .from('fixed_assets')
    .select('*, asset_categories(name), employees(employee_number, first_name, last_name, department)')
    .eq('company_id', company_id);

  if (filters.categoryId !== 'all') query = query.eq('category_id', filters.categoryId);
  if (filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.department !== 'all') query = query.eq('department', filters.department);
  if (filters.custodian !== 'all') query = query.eq('custodian_name', filters.custodian);
  if (filters.location !== 'all') query = query.eq('location', filters.location);

  const q = filters.search.trim();
  if (q) {
    const like = `%${q.replace(/%/g, '')}%`;
    query = query.or(
      [
        `asset_code.ilike.${like}`,
        `description.ilike.${like}`,
        `location.ilike.${like}`,
        `department.ilike.${like}`,
        `custodian_name.ilike.${like}`,
        `serial_number.ilike.${like}`,
        `asset_tag.ilike.${like}`,
      ].join(','),
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = applyRegisterFilters(withNetBookValue(data || []), filters);
  const kpis = computeAssetRegisterKpis(rows);
  const paged = paginateRows(rows, page, pageSize);
  return { ...paged, kpis };
}
