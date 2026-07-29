/**
 * AdminLess Fin V16.3 — Lifecycle types & analytics helpers.
 */

export type AcquisitionStatus =
  | 'draft'
  | 'purchased'
  | 'received'
  | 'pending_capitalisation'
  | 'capitalised'
  | 'cancelled';

export type LifecycleEventType =
  | 'created'
  | 'purchased'
  | 'capitalised'
  | 'transferred'
  | 'maintained'
  | 'verified'
  | 'depreciated'
  | 'revalued'
  | 'impaired'
  | 'disposed'
  | 'restored'
  | 'component_added'
  | 'component_replaced'
  | 'relationship_linked'
  | 'document_uploaded'
  | 'label_generated'
  | 'bulk_action'
  | 'acquisition_received';

export type AssetRelationshipType =
  | 'parent_child'
  | 'component'
  | 'dependency'
  | 'trailer'
  | 'related';

export type BulkOperationType =
  | 'transfer'
  | 'verification'
  | 'disposal_preview'
  | 'category_update'
  | 'custodian_update'
  | 'location_update'
  | 'maintenance_schedule'
  | 'label_generation';

export type FinancialCockpitKpis = {
  grossAssetValue: number;
  netBookValue: number;
  accumulatedDepreciation: number;
  depreciationThisMonth: number;
  depreciationThisYear: number;
  nearEndOfLife: number;
  fullyDepreciated: number;
  highMaintenance: number;
  awaitingVerification: number;
  impaired: number;
};

export function computeFinancialCockpitKpis(
  assets: Array<{
    purchase_cost: number;
    accumulated_depreciation?: number | null;
    net_book_value?: number;
    depreciation_ytd?: number | null;
    useful_life_years?: number | null;
    purchase_date: string;
    status: string;
    impairment_amount?: number | null;
    verification_status?: string | null;
    last_depreciation_date?: string | null;
  }>,
  maintenanceCostByAsset?: Record<string, number>
): FinancialCockpitKpis {
  const active = assets.filter((a) => a.status !== 'disposed');
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  let depreciationThisMonth = 0;
  for (const a of active) {
    if (!a.last_depreciation_date) continue;
    const d = new Date(a.last_depreciation_date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      // Approximate monthly share from YTD when last dep is this month
      const ytd = Number(a.depreciation_ytd || 0);
      depreciationThisMonth += ytd > 0 ? ytd / Math.max(month + 1, 1) : 0;
    }
  }

  const nearEndOfLife = active.filter((a) => {
    const life = a.useful_life_years || 0;
    if (!life) return false;
    const age =
      (now.getTime() - new Date(a.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000);
    return age / life >= 0.85 && a.status === 'active';
  }).length;

  const highMaintenance = maintenanceCostByAsset
    ? Object.entries(maintenanceCostByAsset).filter(([id, cost]) => {
        const asset = assets.find((x) => (x as { id?: string }).id === id);
        return asset && cost > Number(asset.purchase_cost || 0) * 0.15;
      }).length
    : 0;

  return {
    grossAssetValue: active.reduce((s, a) => s + Number(a.purchase_cost || 0), 0),
    netBookValue: active.reduce(
      (s, a) =>
        s +
        Number(
          a.net_book_value ??
            Number(a.purchase_cost || 0) - Number(a.accumulated_depreciation || 0)
        ),
      0
    ),
    accumulatedDepreciation: active.reduce(
      (s, a) => s + Number(a.accumulated_depreciation || 0),
      0
    ),
    depreciationThisMonth,
    depreciationThisYear: active.reduce((s, a) => s + Number(a.depreciation_ytd || 0), 0),
    nearEndOfLife,
    fullyDepreciated: assets.filter((a) => a.status === 'fully-depreciated').length,
    highMaintenance,
    awaitingVerification: active.filter(
      (a) =>
        !a.verification_status ||
        a.verification_status === 'unverified' ||
        a.verification_status === 'overdue' ||
        a.verification_status === 'in_progress'
    ).length,
    impaired: active.filter((a) => Number(a.impairment_amount || 0) > 0).length,
  };
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function rowsToCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

/** Lightweight printable HTML → user can Save as PDF from browser print. */
export function openPrintableReport(title: string, bodyHtml: string) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>
      body{font-family:Segoe UI,system-ui,sans-serif;padding:24px;color:#0f172a}
      h1{font-size:20px;margin:0 0 8px} table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left} th{background:#f1f5f9}
      .muted{color:#64748b;font-size:12px;margin-bottom:16px}
    </style></head><body>
    <h1>${title}</h1><p class="muted">AdminLess Fin · Generated ${new Date().toLocaleString()}</p>
    ${bodyHtml}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}
