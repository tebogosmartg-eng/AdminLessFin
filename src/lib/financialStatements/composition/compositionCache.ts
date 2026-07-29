/**
 * V16.0 — Phase 12: Composition Performance Engine.
 *
 * Lazy disclosure loading, metadata indexing, incremental composition,
 * dependency tracking, and fast regeneration after Trial Balance changes.
 *
 * Architecture:
 *   - Fingerprint-based cache: skip recomposition when inputs unchanged
 *   - Dependency graph: tracks which disclosures depend on which facts
 *   - Incremental composition: recompute only affected disclosures
 *   - Lazy loading: defer enterprise disclosure object building until needed
 */
import type { DocumentModel } from '../document/documentModel';
import type { DocOverrides } from '../document/documentStore';
import type { CompositionDocument, EnterpriseDisclosureObject } from './types';

// ── Fingerprinting ──────────────────────────────────────────────────────────

/** Fingerprint a DocumentModel for cache keying. */
export function fingerprintDocumentModel(
  model: DocumentModel,
  overrides: DocOverrides,
): string {
  const parts: string[] = [
    model.frameworkKey || '',
    model.workspaceId || '',
    JSON.stringify(model.period || {}),
    // Trial balance: hash line amounts
    model.statements
      .flatMap((s) => s.lines.map((l) => `${l.line_code}:${l.amount ?? 0}`))
      .sort()
      .join(','),
    // Note identity and status (not full content — titles and codes only)
    model.notes.map((n) => `${n.id}:${n.disclosure_code}:${n.status}`).join(','),
    // Policy set codes
    model.policySets.map((ps) => ps.id).join(','),
    // Overrides
    JSON.stringify({ hidden: overrides.hidden, order: overrides.order }),
  ];
  return parts.join('|');
}

/** Fingerprint just the trial balance facts for delta detection. */
export function fingerprintTrialBalance(model: DocumentModel): string {
  return model.statements
    .flatMap((s) =>
      s.lines.map((l) => `${s.statement_type}:${l.line_code}:${l.amount ?? 0}:${(l as { prior_amount?: number | null }).prior_amount ?? 0}`),
    )
    .sort()
    .join('|');
}

// ── Dependency Graph ────────────────────────────────────────────────────────

export type DisclosureDependency = {
  disclosureCode: string;
  /** Trial balance line codes this disclosure draws from. */
  factLineCodes: string[];
  /** Policy codes this disclosure references. */
  policyCodes: string[];
  /** Schedule codes this disclosure owns. */
  scheduleCodes: string[];
  /** Other disclosure codes this disclosure cross-references. */
  crossRefCodes: string[];
};

/** Build a dependency graph for all enterprise disclosures. */
export function buildDependencyGraph(
  disclosures: EnterpriseDisclosureObject[],
): Map<string, DisclosureDependency> {
  const graph = new Map<string, DisclosureDependency>();
  for (const ed of disclosures) {
    graph.set(ed.disclosureCode, {
      disclosureCode: ed.disclosureCode,
      factLineCodes: ed.links.statementLines,
      policyCodes: ed.links.policyCodes,
      scheduleCodes: ed.links.scheduleCodes,
      crossRefCodes: ed.crossReferences.map((xr) => xr.targetId),
    });
  }
  return graph;
}

/** Given changed trial balance line codes, return disclosure codes that are affected. */
export function affectedDisclosures(
  changedLineCodes: string[],
  graph: Map<string, DisclosureDependency>,
): string[] {
  const changed = new Set(changedLineCodes.map((c) => c.toLowerCase()));
  const affected: string[] = [];
  for (const [code, dep] of graph) {
    const touches = dep.factLineCodes.some((lc) => changed.has(lc.toLowerCase()));
    if (touches) affected.push(code);
  }
  return affected;
}

// ── Metadata Index ──────────────────────────────────────────────────────────

export type DisclosureMetadataIndex = {
  /** Fast lookup: disclosureCode → enterprise object */
  byCode: Map<string, EnterpriseDisclosureObject>;
  /** Fast lookup: noteId → enterprise object */
  byId: Map<string, EnterpriseDisclosureObject>;
  /** Fast lookup: statementLine → disclosure codes */
  byLine: Map<string, string[]>;
  /** Fast lookup: policyCode → disclosure codes */
  byPolicy: Map<string, string[]>;
  /** Active disclosures only */
  active: EnterpriseDisclosureObject[];
  /** Disclosures with movement schedules */
  withMovements: EnterpriseDisclosureObject[];
  /** Disclosures with reconciliations */
  withReconciliations: EnterpriseDisclosureObject[];
};

/** Build a searchable metadata index over enterprise disclosures. */
export function buildDisclosureMetadataIndex(
  disclosures: EnterpriseDisclosureObject[],
): DisclosureMetadataIndex {
  const byCode = new Map<string, EnterpriseDisclosureObject>();
  const byId = new Map<string, EnterpriseDisclosureObject>();
  const byLine = new Map<string, string[]>();
  const byPolicy = new Map<string, string[]>();

  for (const ed of disclosures) {
    byCode.set(ed.disclosureCode, ed);
    byId.set(ed.id, ed);

    for (const lineCode of ed.links.statementLines) {
      const key = lineCode.toLowerCase();
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(ed.disclosureCode);
    }

    for (const policyCode of ed.links.policyCodes) {
      if (!byPolicy.has(policyCode)) byPolicy.set(policyCode, []);
      byPolicy.get(policyCode)!.push(ed.disclosureCode);
    }
  }

  return {
    byCode,
    byId,
    byLine,
    byPolicy,
    active: disclosures.filter((d) => d.active),
    withMovements: disclosures.filter((d) => d.movementSchedules.length > 0),
    withReconciliations: disclosures.filter((d) => d.reconciliations.length > 0),
  };
}

// ── In-Memory Composition Cache ─────────────────────────────────────────────

type CacheEntry = {
  fingerprint: string;
  composition: CompositionDocument;
  index: DisclosureMetadataIndex;
  dependencyGraph: Map<string, DisclosureDependency>;
  cachedAt: number;
};

const MAX_CACHE_ENTRIES = 8;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const compositionCache = new Map<string, CacheEntry>();

/** Retrieve a cached composition or null if stale / absent. */
export function getCachedComposition(
  model: DocumentModel,
  overrides: DocOverrides,
): { composition: CompositionDocument; index: DisclosureMetadataIndex } | null {
  const key = model.workspaceId || 'default';
  const entry = compositionCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.cachedAt > CACHE_TTL_MS) {
    compositionCache.delete(key);
    return null;
  }

  const fingerprint = fingerprintDocumentModel(model, overrides);
  if (entry.fingerprint !== fingerprint) return null;

  return { composition: entry.composition, index: entry.index };
}

/** Store a composition result in the cache. */
export function setCachedComposition(
  model: DocumentModel,
  overrides: DocOverrides,
  composition: CompositionDocument,
): DisclosureMetadataIndex {
  const key = model.workspaceId || 'default';
  const fingerprint = fingerprintDocumentModel(model, overrides);
  const index = buildDisclosureMetadataIndex(composition.enterpriseDisclosures);
  const dependencyGraph = buildDependencyGraph(composition.enterpriseDisclosures);

  // Evict oldest entry if at capacity
  if (compositionCache.size >= MAX_CACHE_ENTRIES && !compositionCache.has(key)) {
    const oldest = [...compositionCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
    if (oldest) compositionCache.delete(oldest[0]);
  }

  compositionCache.set(key, { fingerprint, composition, index, dependencyGraph, cachedAt: Date.now() });
  return index;
}

/** Invalidate cache for a workspace (e.g. after trial balance upload). */
export function invalidateCompositionCache(workspaceId: string): void {
  compositionCache.delete(workspaceId);
}

/** Get cache statistics for diagnostics. */
export function getCompositionCacheStats(): {
  entries: number;
  workspaceIds: string[];
  oldestMs: number | null;
  newestMs: number | null;
} {
  const entries = [...compositionCache.values()];
  return {
    entries: entries.length,
    workspaceIds: [...compositionCache.keys()],
    oldestMs: entries.length ? Math.min(...entries.map((e) => e.cachedAt)) : null,
    newestMs: entries.length ? Math.max(...entries.map((e) => e.cachedAt)) : null,
  };
}

// ── Incremental Recomposition ────────────────────────────────────────────────

export type IncrementalCompositionResult = {
  /** Full composition with updated disclosures. */
  composition: CompositionDocument;
  /** Disclosure codes that were recomputed. */
  recomputedCodes: string[];
  /** Disclosure codes served from prior state (unchanged). */
  preservedCodes: string[];
  /** New metadata index. */
  index: DisclosureMetadataIndex;
};

/**
 * Perform incremental recomposition after trial balance changes.
 *
 * Only disclosures whose fact dependencies overlap with changed lines are
 * recomputed. All other enterprise disclosure objects are preserved from
 * the prior composition.
 */
export function incrementalRecompose(
  prior: CompositionDocument,
  priorGraph: Map<string, DisclosureDependency>,
  changedLineCodes: string[],
  recompute: (codes: string[]) => EnterpriseDisclosureObject[],
): IncrementalCompositionResult {
  const affected = affectedDisclosures(changedLineCodes, priorGraph);
  const affectedSet = new Set(affected);

  const preserved = prior.enterpriseDisclosures.filter(
    (ed) => !affectedSet.has(ed.disclosureCode),
  );
  const recomputed = recompute(affected);

  const merged = [
    ...preserved,
    ...recomputed,
  ].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const updatedComposition: CompositionDocument = {
    ...prior,
    enterpriseDisclosures: merged,
  };

  const index = buildDisclosureMetadataIndex(merged);

  return {
    composition: updatedComposition,
    recomputedCodes: affected,
    preservedCodes: preserved.map((e) => e.disclosureCode),
    index,
  };
}
