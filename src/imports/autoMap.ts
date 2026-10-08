/**
 * Intelligent column matching: proposes which file column feeds each import
 * field, from the field aliases the server publishes in GET_SPEC. Users can
 * override every suggestion; nothing here decides silently.
 */

export interface MappableField {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const squash = (s: string) => norm(s).replace(/ /g, '');

function score(header: string, field: MappableField): number {
  const h = norm(header);
  const hs = squash(header);
  if (!h) return 0;
  if (hs === squash(field.key) || hs === squash(field.label)) return 100;
  let best = 0;
  field.aliases.forEach((alias, index) => {
    const a = norm(alias);
    // Earlier aliases are the more specific ones.
    if (squash(alias) === hs) best = Math.max(best, 90 - Math.min(index, 20));
    else if (a.length >= 4 && (h.startsWith(`${a} `) || h.endsWith(` ${a}`))) best = Math.max(best, 40);
  });
  return best;
}

/**
 * Greedy one-to-one assignment: the highest-scoring (field, header) pairs
 * win first, so "Invoice Date" goes to invoice_date before the generic
 * "date" alias of another field can claim it.
 */
export function autoMapColumns(headers: string[], fields: MappableField[]): Record<string, string> {
  const pairs: Array<{ field: string; header: string; score: number; order: number }> = [];
  fields.forEach((field, order) => {
    for (const header of headers) {
      const s = score(header, field);
      if (s > 0) pairs.push({ field: field.key, header, score: s, order });
    }
  });
  pairs.sort((a, b) => b.score - a.score || a.order - b.order);
  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();
  for (const pair of pairs) {
    if (mapping[pair.field] || usedHeaders.has(pair.header)) continue;
    mapping[pair.field] = pair.header;
    usedHeaders.add(pair.header);
  }
  // A required field outranks an optional one for a header both recognise:
  // in a Sage Pastel stock list "Description" IS the item name.
  const requiredByKey = new Map(fields.map(f => [f.key, f.required]));
  for (const field of fields) {
    if (!field.required || mapping[field.key]) continue;
    const claim = pairs.find(p =>
      p.field === field.key &&
      Object.entries(mapping).some(([holder, header]) => header === p.header && !requiredByKey.get(holder)));
    if (!claim) continue;
    const holder = Object.entries(mapping).find(([, header]) => header === claim.header)![0];
    delete mapping[holder];
    mapping[field.key] = claim.header;
  }
  return mapping;
}

export function missingRequired(mapping: Record<string, string>, fields: MappableField[]): MappableField[] {
  return fields.filter(f => f.required && !mapping[f.key]);
}
