/**
 * AFS Document Workspace — client-side presentation state (V11.0).
 *
 * Persists the presentation choices that are NOT covered by the existing edge
 * APIs: per-node visibility (show/hide beyond the durable "superseded" status),
 * custom ordering, title overrides, and lightweight formatting. Content prose
 * (paragraphs, sections, tables, policy bodies) is persisted server-side via the
 * existing edit APIs and is intentionally NOT duplicated here.
 *
 * Storage is scoped per reporting workspace (engagement) in localStorage so the
 * enhancement stays fully additive — no database schema or edge API changes.
 */
import { useCallback, useEffect, useState } from 'react';

export type DocFormatting = {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
};

export type DocOverrides = {
  version: 1;
  hidden: Record<string, boolean>;
  order: Record<string, number>;
  titleOverrides: Record<string, string>;
  formatting: Record<string, DocFormatting>;
  updatedAt: string;
};

const STORAGE_PREFIX = 'efs.docws.v1.';

function storageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

export function emptyOverrides(): DocOverrides {
  return {
    version: 1,
    hidden: {},
    order: {},
    titleOverrides: {},
    formatting: {},
    updatedAt: new Date().toISOString(),
  };
}

export function loadOverrides(workspaceId: string): DocOverrides {
  if (typeof window === 'undefined' || !workspaceId) return emptyOverrides();
  try {
    const raw = window.localStorage.getItem(storageKey(workspaceId));
    if (!raw) return emptyOverrides();
    const parsed = JSON.parse(raw) as Partial<DocOverrides>;
    return {
      ...emptyOverrides(),
      ...parsed,
      hidden: parsed.hidden || {},
      order: parsed.order || {},
      titleOverrides: parsed.titleOverrides || {},
      formatting: parsed.formatting || {},
    };
  } catch {
    return emptyOverrides();
  }
}

export function saveOverrides(workspaceId: string, overrides: DocOverrides): void {
  if (typeof window === 'undefined' || !workspaceId) return;
  try {
    window.localStorage.setItem(
      storageKey(workspaceId),
      JSON.stringify({ ...overrides, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* best-effort persistence; quota / privacy modes are non-fatal */
  }
}

export function isHidden(overrides: DocOverrides, nodeId: string): boolean {
  return !!overrides.hidden[nodeId];
}

export function resolvedTitle(
  overrides: DocOverrides,
  nodeId: string,
  fallback: string,
): string {
  const override = overrides.titleOverrides[nodeId];
  return override && override.trim() ? override : fallback;
}

/**
 * React hook that exposes the workspace overrides plus persisting mutators.
 * Every mutation writes through to localStorage immediately so preview + PDF
 * always reflect the current presentation state.
 */
export function useDocumentOverrides(workspaceId: string) {
  const [overrides, setOverrides] = useState<DocOverrides>(() => loadOverrides(workspaceId));

  useEffect(() => {
    setOverrides(loadOverrides(workspaceId));
  }, [workspaceId]);

  const mutate = useCallback(
    (updater: (prev: DocOverrides) => DocOverrides) => {
      setOverrides((prev) => {
        const next = updater(prev);
        saveOverrides(workspaceId, next);
        return next;
      });
    },
    [workspaceId],
  );

  const setHidden = useCallback(
    (nodeId: string, hidden: boolean) =>
      mutate((prev) => ({ ...prev, hidden: { ...prev.hidden, [nodeId]: hidden } })),
    [mutate],
  );

  const toggleHidden = useCallback(
    (nodeId: string) =>
      mutate((prev) => ({
        ...prev,
        hidden: { ...prev.hidden, [nodeId]: !prev.hidden[nodeId] },
      })),
    [mutate],
  );

  const setOrder = useCallback(
    (nodeId: string, order: number) =>
      mutate((prev) => ({ ...prev, order: { ...prev.order, [nodeId]: order } })),
    [mutate],
  );

  const setTitleOverride = useCallback(
    (nodeId: string, title: string) =>
      mutate((prev) => {
        const next = { ...prev.titleOverrides };
        if (title && title.trim()) next[nodeId] = title;
        else delete next[nodeId];
        return { ...prev, titleOverrides: next };
      }),
    [mutate],
  );

  const setFormatting = useCallback(
    (nodeId: string, formatting: DocFormatting) =>
      mutate((prev) => ({
        ...prev,
        formatting: { ...prev.formatting, [nodeId]: { ...prev.formatting[nodeId], ...formatting } },
      })),
    [mutate],
  );

  return {
    overrides,
    setHidden,
    toggleHidden,
    setOrder,
    setTitleOverride,
    setFormatting,
  };
}

export type DocumentOverridesApi = ReturnType<typeof useDocumentOverrides>;
