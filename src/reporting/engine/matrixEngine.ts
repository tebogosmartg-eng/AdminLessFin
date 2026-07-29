/**
 * Generic Matrix Engine — domain-agnostic (V3.6.3)
 *
 * Accepts rows, columns, measures, grouping, and aggregation definitions.
 * Never performs business / statutory calculations — aggregates supplied measures only.
 */

import { accumulate, type AggregationFn } from './aggregationEngine';
import { applyFilters, type FilterPredicate } from './filterEngine';
import { groupBy, sortedGroupKeys } from './groupingEngine';

export type MatrixMeasureDef<T = Record<string, unknown>> = {
  id: string;
  label: string;
  /** Extract numeric measure from a source row. */
  value: (row: T) => number;
  aggregation?: AggregationFn;
};

export type MatrixColumnDef<T = Record<string, unknown>> = {
  /** Resolve column key for a source row. */
  key: (row: T) => string;
  /** Fixed column order (e.g. SA FY months). When omitted, discovered + sorted. */
  order?: string[];
  label?: (key: string) => string;
};

export type MatrixBuildInput<T = Record<string, unknown>> = {
  data: T[];
  /** Measures rendered as matrix rows (ERP style). */
  measures: MatrixMeasureDef<T>[];
  columns: MatrixColumnDef<T>;
  filters?: FilterPredicate<T>[];
  includeTotalColumn?: boolean;
  includeTotalRow?: boolean;
  totalColumnLabel?: string;
  totalRowLabel?: string;
};

export type GenericMatrix = {
  rowKeys: string[];
  rowLabels: Record<string, string>;
  columns: string[];
  /** cells[measureId][columnKey] */
  cells: Record<string, Record<string, number>>;
  measureIds: string[];
  factCount: number;
};

/**
 * Build a domain-agnostic matrix: measures × column dimension.
 */
export function buildMatrix<T>(input: MatrixBuildInput<T>): GenericMatrix {
  const filtered = applyFilters(input.data, input.filters ?? []);
  const includeTotal = input.includeTotalColumn !== false;
  const totalLabel = input.totalColumnLabel ?? 'Total';

  const groups = groupBy(filtered, (row) => input.columns.key(row) || '—');
  let columns = sortedGroupKeys(groups, input.columns.order);
  // Preserve fixed order even when empty groups (e.g. FY months with no activity)
  if (input.columns.order?.length) {
    columns = [...input.columns.order];
  }

  const measureIds = input.measures.map((m) => m.id);
  const rowLabels = Object.fromEntries(input.measures.map((m) => [m.id, m.label]));
  const cells: Record<string, Record<string, number>> = {};

  for (const measure of input.measures) {
    cells[measure.id] = Object.fromEntries(columns.map((c) => [c, 0]));
    const fn = measure.aggregation ?? 'sum';
    for (const col of columns) {
      const rows = groups.get(col) ?? [];
      let acc: number | undefined;
      for (const row of rows) {
        acc = accumulate(acc, measure.value(row) || 0, fn);
      }
      if (fn === 'avg' && rows.length > 0) {
        cells[measure.id][col] = (acc ?? 0) / rows.length;
      } else {
        cells[measure.id][col] = acc ?? 0;
      }
    }
  }

  if (includeTotal) {
    for (const measure of input.measures) {
      const total = columns.reduce((s, c) => s + (cells[measure.id][c] ?? 0), 0);
      cells[measure.id][totalLabel] = total;
    }
    columns = [...columns, totalLabel];
  }

  if (input.includeTotalRow) {
    const totalRowId = '__total__';
    measureIds.push(totalRowId);
    rowLabels[totalRowId] = input.totalRowLabel ?? 'Total';
    cells[totalRowId] = {};
    for (const col of columns) {
      cells[totalRowId][col] = input.measures.reduce((s, m) => s + (cells[m.id][col] ?? 0), 0);
    }
  }

  return {
    rowKeys: measureIds,
    rowLabels,
    columns,
    cells,
    measureIds,
    factCount: filtered.length,
  };
}

export function matrixToRows(
  matrix: GenericMatrix,
  options?: { metricHeader?: string }
): Record<string, string | number>[] {
  const header = options?.metricHeader ?? 'Metric';
  return matrix.rowKeys.map((key) => {
    const row: Record<string, string | number> = {
      [header]: matrix.rowLabels[key] ?? key,
    };
    for (const col of matrix.columns) {
      row[col] = Number((matrix.cells[key][col] ?? 0).toFixed(2));
    }
    return row;
  });
}

/**
 * Column-sequence variance (e.g. month-over-month) from matrix cells only.
 */
export function buildColumnVariance(
  matrix: GenericMatrix,
  measureIds: string[] = matrix.measureIds
): {
  measureId: string;
  label: string;
  periods: { column: string; amount: number; variance: number | null; variancePct: number | null }[];
}[] {
  const cols = matrix.columns.filter((c) => c !== 'Total');

  return measureIds
    .filter((id) => id !== '__total__')
    .map((measureId) => {
      const periods = cols.map((column, idx) => {
        const amount = matrix.cells[measureId]?.[column] ?? 0;
        if (idx === 0) return { column, amount, variance: null, variancePct: null };
        const prev = matrix.cells[measureId]?.[cols[idx - 1]] ?? 0;
        const variance = amount - prev;
        const variancePct = prev === 0 ? (amount === 0 ? 0 : null) : (variance / prev) * 100;
        return { column, amount, variance, variancePct };
      });
      return {
        measureId,
        label: matrix.rowLabels[measureId] ?? measureId,
        periods,
      };
    });
}
