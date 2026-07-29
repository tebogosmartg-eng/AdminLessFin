/**
 * Filter Engine — domain-agnostic (V3.6.3)
 */

export type FilterPredicate<T> = (row: T) => boolean;

export function applyFilters<T>(rows: T[], predicates: FilterPredicate<T>[] = []): T[] {
  if (!predicates.length) return rows;
  return rows.filter((row) => predicates.every((p) => p(row)));
}

export function dateRangeFilter<T>(
  getDate: (row: T) => string | null | undefined,
  start?: string,
  end?: string
): FilterPredicate<T> {
  return (row) => {
    const d = getDate(row);
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };
}

export function equalsFilter<T>(
  getValue: (row: T) => string | number | boolean | null | undefined,
  expected: string | number | boolean | null | undefined
): FilterPredicate<T> {
  return (row) => getValue(row) === expected;
}

export function inSetFilter<T>(
  getValue: (row: T) => string | null | undefined,
  allowed: Set<string> | string[]
): FilterPredicate<T> {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  return (row) => {
    const v = getValue(row);
    if (v == null) return false;
    return set.has(v);
  };
}
