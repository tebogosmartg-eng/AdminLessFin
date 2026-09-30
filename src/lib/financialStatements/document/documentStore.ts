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

export type NarrativeBlockOverride = { heading?: string; body: string };

export type DocOverrides = {
  version: 1;
  hidden: Record<string, boolean>;
  order: Record<string, number>;
  titleOverrides: Record<string, string>;
  formatting: Record<string, DocFormatting>;
  /**
   * Whether a note's table line prints, by line key. Absent means the default:
   * it prints unless all it carries is placeholders waiting for figures.
   */
  lines: Record<string, boolean>;
  /** Notes that begin on a new page, by note id. */
  pageBreaks: Record<string, boolean>;
  /**
   * The preparer's own wording for a narrative section (the directors'
   * report, the responsibilities statement, the practitioner's report, the
   * approval wording), by section id. Absent means the generated statutory
   * wording prints.
   */
  narratives: Record<string, NarrativeBlockOverride[]>;
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
    lines: {},
    pageBreaks: {},
    narratives: {},
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
    lines: parsed?.lines || {},
    pageBreaks: parsed?.pageBreaks || {},
    narratives: parsed?.narratives || {},
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

  /**
   * Showing something again forgets that it was ever hidden, rather than
   * recording that it is not. Writing `false` left an entry behind for every
   * piece anyone had ever hidden and then restored, so the record of what this
   * document withholds filled up with things it does not.
   */
  const withHidden = (prev: DocOverrides, nodeId: string, hidden: boolean): DocOverrides => {
    const next = { ...prev.hidden };
    if (hidden) next[nodeId] = true;
    else delete next[nodeId];
    return { ...prev, hidden: next };
  };

  const setHidden = useCallback(
    (nodeId: string, hidden: boolean) => mutate((prev) => withHidden(prev, nodeId, hidden)),
    [mutate],
  );

  const toggleHidden = useCallback(
    (nodeId: string) => mutate((prev) => withHidden(prev, nodeId, !prev.hidden[nodeId])),
    [mutate],
  );

  const setOrder = useCallback(
    (nodeId: string, order: number) =>
      mutate((prev) => ({ ...prev, order: { ...prev.order, [nodeId]: order } })),
    [mutate],
  );

  /**
   * Place several at once. Moving one paragraph within a note restates where
   * every paragraph sits, and that is one change to the document, not five.
   */
  const setOrders = useCallback(
    (placements: Record<string, number>) =>
      mutate((prev) => ({ ...prev, order: { ...prev.order, ...placements } })),
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

  /**
   * Forget everything recorded about a piece that no longer exists.
   *
   * Deleting a paragraph used to leave its placement behind for good. Nothing
   * reads it, so nothing breaks — but the engagement's presentation grows by a
   * dead key every time anyone tidies a note, and a reviewer reading the record
   * of how this document was arranged finds entries for wording that was never
   * in it.
   */
  const forget = useCallback(
    (nodeId: string) =>
      mutate((prev) => {
        const drop = <T,>(map: Record<string, T>) => {
          if (!(nodeId in map)) return map;
          const next = { ...map };
          delete next[nodeId];
          return next;
        };
        return {
          ...prev,
          hidden: drop(prev.hidden),
          order: drop(prev.order),
          titleOverrides: drop(prev.titleOverrides),
          formatting: drop(prev.formatting),
          narratives: drop(prev.narratives || {}),
        };
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

  /**
   * Print a table line, or hold it back. Passing `null` forgets the choice,
   * so the line goes back to the default rather than being pinned to it.
   */
  const setLine = useCallback(
    (key: string, printed: boolean | null) =>
      mutate((prev) => {
        const next = { ...(prev.lines || {}) };
        if (printed === null) delete next[key];
        else next[key] = printed;
        return { ...prev, lines: next };
      }),
    [mutate],
  );

  /**
   * The preparer's wording for a narrative section. Passing `null` returns
   * the section to the generated statutory wording — the choice is forgotten,
   * not recorded, so the document's record only lists sections that were
   * actually rewritten.
   */
  const setNarrative = useCallback(
    (sectionId: string, blocks: NarrativeBlockOverride[] | null) =>
      mutate((prev) => {
        const next = { ...(prev.narratives || {}) };
        const kept = (blocks || [])
          .map((b) => ({ heading: b.heading?.trim() || undefined, body: String(b.body ?? '').trim() }))
          .filter((b) => b.body || b.heading);
        if (blocks === null || kept.length === 0) delete next[sectionId];
        else next[sectionId] = kept;
        return { ...prev, narratives: next };
      }),
    [mutate],
  );

  /** Start a note on a new page, or let it follow on. */
  const setPageBreak = useCallback(
    (noteId: string, breakBefore: boolean) =>
      mutate((prev) => {
        const next = { ...(prev.pageBreaks || {}) };
        if (breakBefore) next[noteId] = true;
        else delete next[noteId];
        return { ...prev, pageBreaks: next };
      }),
    [mutate],
  );

  return {
    overrides,
    error,
    setLine,
    setNarrative,
    setPageBreak,
    setHidden,
    toggleHidden,
    setOrder,
    setOrders,
    forget,
    setTitleOverride,
    setFormatting,
  };
}

export type DocumentOverridesApi = ReturnType<typeof useDocumentOverrides>;
