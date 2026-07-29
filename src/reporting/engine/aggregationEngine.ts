/**
 * Aggregation Engine — domain-agnostic (V3.6.3)
 * Aggregates numeric measures only; never performs business calculations.
 */

export type AggregationFn = 'sum' | 'count' | 'avg' | 'min' | 'max';

export function aggregateValues(values: number[], fn: AggregationFn = 'sum'): number {
  if (values.length === 0) {
    if (fn === 'count') return 0;
    if (fn === 'min') return 0;
    if (fn === 'max') return 0;
    return 0;
  }
  switch (fn) {
    case 'count':
      return values.length;
    case 'sum':
      return values.reduce((s, v) => s + v, 0);
    case 'avg':
      return values.reduce((s, v) => s + v, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return values.reduce((s, v) => s + v, 0);
  }
}

export function accumulate(current: number | undefined, next: number, fn: AggregationFn = 'sum'): number {
  if (current === undefined) {
    return fn === 'count' ? 1 : next;
  }
  switch (fn) {
    case 'count':
      return current + 1;
    case 'sum':
      return current + next;
    case 'avg':
      // avg requires pair storage — callers should use aggregateValues for true avg
      return current + next;
    case 'min':
      return Math.min(current, next);
    case 'max':
      return Math.max(current, next);
    default:
      return current + next;
  }
}
