/**
 * Measure Engine — amount / count / average / variance / YTD / MTD from facts
 */

import type { AggregationFn } from './aggregationEngine';
import { aggregateValues } from './aggregationEngine';
import type { PayrollFact } from '../facts/PayrollFact';
import { measureFactItemAmount } from '../facts/adapters';

export type ReportMeasureKind = 'amount' | 'count' | 'average' | 'ytd' | 'mtd' | 'variance';

export function extractMeasureValue(
  fact: PayrollFact,
  options: { kind?: ReportMeasureKind; itemCode?: string }
): number {
  const kind = options.kind ?? 'amount';
  if (kind === 'count') return 1;
  if (options.itemCode) return measureFactItemAmount(fact, options.itemCode);
  return fact.totals.grossPay;
}

export function aggregateMeasure(values: number[], kind: ReportMeasureKind = 'amount'): number {
  if (kind === 'count') return values.length;
  if (kind === 'average') return aggregateValues(values, 'avg');
  return aggregateValues(values, 'sum');
}

export function measureToAggregationFn(kind: ReportMeasureKind): AggregationFn {
  if (kind === 'count') return 'count';
  if (kind === 'average') return 'avg';
  return 'sum';
}
