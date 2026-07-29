/**
 * Grouping Engine — domain-agnostic (V3.6.3)
 */

export function groupBy<T>(
  rows: T[],
  keyFn: (row: T) => string
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row) || '—';
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

export function sortedGroupKeys(groups: Map<string, unknown[]>, order?: string[]): string[] {
  if (order?.length) {
    const present = new Set(groups.keys());
    const ordered = order.filter((k) => present.has(k));
    const rest = Array.from(present)
      .filter((k) => !order.includes(k))
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...rest];
  }
  return Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));
}
