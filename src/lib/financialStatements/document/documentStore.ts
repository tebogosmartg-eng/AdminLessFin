/**
 * How a set of financial statements is presented.
 *
 * Which sections are shown, the order they appear in, any renamed heading. This
 * is presentation, not accounting — no figure is changed here — but it decides
 * what the printed document contains, so it belongs to the engagement rather
 * than to whoever happened to open it.
 *
 * It used to live in localStorage. That made it private to one browser profile
 * on one machine: a reviewer opening the same engagement saw the default
 * document, and the PDF they generated was not the one the preparer had been
 * reading. It now persists server-side, attributably, and what any earlier
 * browser stored is carried over the first time that workspace is opened.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeFinancialStatements } from '../api';

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

/** Where presentation state used to be kept, read once to carry it over. */
const LEGACY_PREFIX = 'efs.docws.v1.';

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

function normalise(parsed: Partial<DocOverrides> | null | undefined): DocOverrides {
  return {
    ...emptyOverrides(),
    ...(parsed || {}),
    hidden: parsed?.hidden || {},
    order: parsed?.order || {},
    titleOverrides: parsed?.titleOverrides || {},
    formatting: parsed?.formatting || {},
  };
}

function hasAnyChoice(o: DocOverrides): boolean {
  return (
    Object.keys(o.hidden).length > 0 ||
    Object.keys(o.order).length > 0 ||
    Object.keys(o.titleOverrides).length > 0
  );
}

/** Presentation state a previous version left in this browser, if any. */
function readLegacy(workspaceId: string): DocOverrides | null {
  if (typeof window === 'undefined' || !workspaceId) return null;
  try {
    const raw = window.localStorage.getItem(`${LEGACY_PREFIX}${workspaceId}`);
    if (!raw) return null;
    return normalise(JSON.parse(raw) as Partial<DocOverrides>);
  } catch {
    return null;
  }
}

function clearLegacy(workspaceId: string): void {
  try {
    window.localStorage.removeItem(`${LEGACY_PREFIX}${workspaceId}`);
  } catch {
    /* private browsing and quota errors are not worth failing a save over */
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
 * The workspace's presentation choices, with mutators that persist them.
 *
 * Changes apply on screen immediately and are written behind them; a failed
 * write is surfaced rather than swallowed, because silently losing a reviewer's
 * ordering is worse than telling them it did not save.
 */
export function useDocumentOverrides(workspaceId: string, companyId?: string) {
  const [overrides, setOverrides] = useState<DocOverrides>(emptyOverrides);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId || !companyId) return;

    (async () => {
      let server = emptyOverrides();
      try {
        const res = await invokeFinancialStatements<{ overrides?: Partial<DocOverrides> }>(
          companyId,
          'GET_DOCUMENT_PRESENTATION',
          { workspace_id: workspaceId },
        );
        server = normalise(res?.overrides);
      } catch {
        // Fall through to whatever this browser has; the document still renders.
      }
      if (cancelled) return;

      // Carry over work done before this was stored on the engagement, but
      // never let a stale browser copy overwrite choices already saved.
      const legacy = readLegacy(workspaceId);
      if (legacy && hasAnyChoice(legacy) && !hasAnyChoice(server)) {
        setOverrides(legacy);
        loaded.current = workspaceId;
        try {
          await invokeFinancialStatements(companyId, 'SAVE_DOCUMENT_PRESENTATION', {
            workspace_id: workspaceId,
            overrides: legacy,
          });
          clearLegacy(workspaceId);
        } catch {
          /* it stays in the browser and will be offered again next time */
        }
        return;
      }

      setOverrides(server);
      loaded.current = workspaceId;
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, companyId]);

  const mutate = useCallback(
    (updater: (prev: DocOverrides) => DocOverrides) => {
      setOverrides((prev) => {
        const next = { ...updater(prev), updatedAt: new Date().toISOString() };
        if (companyId && workspaceId && loaded.current === workspaceId) {
          invokeFinancialStatements(companyId, 'SAVE_DOCUMENT_PRESENTATION', {
            workspace_id: workspaceId,
            overrides: next,
          })
            .then(() => setError(null))
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : 'This change could not be saved.'),
            );
        }
        return next;
      });
    },
    [workspaceId, companyId],
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
    error,
    setHidden,
    toggleHidden,
    setOrder,
    setTitleOverride,
    setFormatting,
  };
}

export type DocumentOverridesApi = ReturnType<typeof useDocumentOverrides>;
