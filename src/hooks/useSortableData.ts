import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: string;
  direction: SortDirection;
}

/** A value the sorter knows how to compare. Accessors should return one of these. */
type Sortable = string | number | boolean | null | undefined;

function compare(a: Sortable, b: Sortable): number {
  // Nulls / undefined always sort last (regardless of direction feels wrong, so
  // we treat them as the largest value and let direction flip handle the rest).
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Client-side sorting for already-loaded rows. Pass an optional `getValue` to
 * map a column key to the comparable primitive (numbers for amounts,
 * timestamps for dates, strings for text). Defaults to `item[key]`.
 *
 *   const { items, sort, requestSort } = useSortableData(rows, (r, key) =>
 *     key === 'amount' ? total(r) : key === 'date' ? new Date(r.date).getTime() : r[key]);
 */
export function useSortableData<T>(
  items: T[],
  getValue: (item: T, key: string) => Sortable = (item, key) => (item as Record<string, Sortable>)[key],
  initial: SortState | null = null,
) {
  const [sort, setSort] = useState<SortState | null>(initial);

  const sorted = useMemo(() => {
    if (!sort) return items;
    const copy = [...items];
    copy.sort((a, b) => {
      const result = compare(getValue(a, sort.key), getValue(b, sort.key));
      return sort.direction === 'asc' ? result : -result;
    });
    return copy;
  }, [items, sort, getValue]);

  const requestSort = (key: string) =>
    setSort((prev) =>
      prev && prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );

  return { items: sorted, sort, requestSort };
}
