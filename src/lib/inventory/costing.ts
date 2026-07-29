/**
 * AdminLess Fin V17.0 — Inventory costing helpers (deterministic).
 * Does not modify the journal engine; callers post JE separately.
 */

export type CostMethod = 'fifo' | 'weighted_average' | 'standard' | 'specific';

export type CostLayer = {
  id: string;
  qty_remaining: number;
  unit_cost: number;
  received_at: string;
};

export function computeWeightedAverage(
  currentQty: number,
  currentAvgCost: number,
  receiptQty: number,
  receiptUnitCost: number
): number {
  const q0 = Math.max(Number(currentQty) || 0, 0);
  const c0 = Number(currentAvgCost) || 0;
  const q1 = Number(receiptQty) || 0;
  const c1 = Number(receiptUnitCost) || 0;
  const denom = q0 + q1;
  if (denom <= 0) return c1;
  return (q0 * c0 + q1 * c1) / denom;
}

/** Consume qty from FIFO layers (oldest first). Returns unit costs used and remaining layers. */
export function consumeFifo(
  layers: CostLayer[],
  qtyToIssue: number
): { totalCost: number; unitCost: number; layers: CostLayer[]; insufficient: boolean } {
  let remaining = qtyToIssue;
  let totalCost = 0;
  const next = layers.map((l) => ({ ...l }));
  for (const layer of next) {
    if (remaining <= 0) break;
    const take = Math.min(layer.qty_remaining, remaining);
    totalCost += take * layer.unit_cost;
    layer.qty_remaining -= take;
    remaining -= take;
  }
  const issued = qtyToIssue - remaining;
  return {
    totalCost,
    unitCost: issued > 0 ? totalCost / issued : 0,
    layers: next.filter((l) => l.qty_remaining > 0.0000001),
    insufficient: remaining > 0.0000001,
  };
}

export function valuationAmount(qty: number, unitCost: number): number {
  return Number(qty || 0) * Number(unitCost || 0);
}

export function stockTurnover(cogsPeriod: number, averageInventoryValue: number): number {
  if (!averageInventoryValue || averageInventoryValue <= 0) return 0;
  return cogsPeriod / averageInventoryValue;
}

export type InventoryKpis = {
  skuCount: number;
  onHandQty: number;
  inventoryValue: number;
  lowStock: number;
  reservedQty: number;
  warehouseCount: number;
  slowMoving: number;
  deadStock: number;
};

export function classifyMovementAgeDays(days: number): 'current' | 'slow' | 'dead' {
  if (days > 365) return 'dead';
  if (days > 180) return 'slow';
  return 'current';
}
