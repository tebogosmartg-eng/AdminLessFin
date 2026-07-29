/**
 * AFS Document Workspace — cross-reference rewrite (V11.4 / Phase B).
 *
 * Render-time ONLY. Never mutates stored disclosure/policy prose.
 *
 * Accountants author "Note N" / "Refer to Note N" against the *structural*
 * baseline numbering (all non-superseded notes, no hide/reorder overlays).
 * When presentation overrides change display numbers, the renderer rewrites
 * those references so Preview, PDF, and Print stay consistent.
 */
import type { DocNoteNode } from './documentModel';
import { computeNoteNumbering, type NumberedNote } from './renumber';
import { emptyOverrides, type DocOverrides } from './documentStore';

export type NoteNumberResolution = {
  /** Structural baseline number → current display number (visible notes only). */
  baselineToCurrent: Map<number, number>;
  /** Structural baseline number → note id. */
  baselineToNoteId: Map<number, string>;
  /** Note id → current display number. */
  noteIdToCurrent: Map<string, number>;
  /** Note id → structural baseline number. */
  noteIdToBaseline: Map<string, number>;
  /** Baseline numbers whose notes are hidden (or superseded) in the current view. */
  hiddenBaselineNumbers: number[];
  baseline: NumberedNote[];
  current: NumberedNote[];
};

export type CrossReferenceIssue = {
  id: string;
  label: string;
  detail: string;
  pass: boolean;
};

/** Structural baseline: ignore hide + custom order so authored "Note N" stays stable. */
export function computeStructuralBaseline(
  notes: DocNoteNode[],
): ReturnType<typeof computeNoteNumbering> {
  return computeNoteNumbering(notes, emptyOverrides());
}

/**
 * Build the resolution map used by the renderer and advisory validation.
 * Current numbering applies the full presentation overrides (hide + order).
 */
export function buildNoteNumberResolution(
  notes: DocNoteNode[],
  overrides: DocOverrides,
): NoteNumberResolution {
  const baseline = computeStructuralBaseline(notes);
  const current = computeNoteNumbering(notes, overrides);

  const noteIdToCurrent = new Map<string, number>();
  for (const n of current.visible) noteIdToCurrent.set(n.note.id, n.noteNumber);

  const noteIdToBaseline = new Map<string, number>();
  const baselineToNoteId = new Map<number, string>();
  for (const n of baseline.visible) {
    noteIdToBaseline.set(n.note.id, n.noteNumber);
    baselineToNoteId.set(n.noteNumber, n.note.id);
  }

  const baselineToCurrent = new Map<number, number>();
  const hiddenBaselineNumbers: number[] = [];

  for (const n of baseline.visible) {
    const display = noteIdToCurrent.get(n.note.id);
    if (display == null) {
      hiddenBaselineNumbers.push(n.noteNumber);
    } else {
      baselineToCurrent.set(n.noteNumber, display);
    }
  }

  return {
    baselineToCurrent,
    baselineToNoteId,
    noteIdToCurrent,
    noteIdToBaseline,
    hiddenBaselineNumbers,
    baseline: baseline.visible,
    current: current.visible,
  };
}

function normalizeTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

function findNoteByTitle(notes: DocNoteNode[], title: string): DocNoteNode | undefined {
  const needle = normalizeTitle(title);
  if (!needle) return undefined;
  return notes.find((n) => {
    const t = normalizeTitle(n.title);
    return t === needle || t.includes(needle) || needle.includes(t);
  });
}

/**
 * Rewrite cross-reference phrases in a single text block.
 * Does not write back to the document model or server.
 */
export function rewriteCrossReferenceText(
  text: string,
  resolution: NoteNumberResolution,
  notes: DocNoteNode[] = [],
): string {
  if (!text) return text;
  let out = text;

  // Pass 1 — bare "Note N" / "Notes N" (not title-qualified "Note N - …").
  // Single-pass lookup avoids cascading replacements (Note 11 → Note 1 → …).
  out = out.replace(
    /\b([Nn]otes?)(\s+)(\d+)\b(?!\s*[-–—])/g,
    (match, word: string, space: string, numStr: string) => {
      const baselineNum = Number(numStr);
      if (!Number.isFinite(baselineNum)) return match;
      if (resolution.hiddenBaselineNumbers.includes(baselineNum)) return match;
      const current = resolution.baselineToCurrent.get(baselineNum);
      if (current == null || current === baselineNum) return match;
      return `${word}${space}${current}`;
    },
  );

  // Pass 2 — "Note N - Title": resolve by title identity (stable across insert/reorder).
  out = out.replace(
    /\b([Nn]ote)\s+(\d+)\s*([-–—])\s*([^\n.;]+)/g,
    (match, noteWord: string, _num: string, dash: string, title: string) => {
      const found = findNoteByTitle(notes, title);
      if (found) {
        const current = resolution.noteIdToCurrent.get(found.id);
        if (current != null) {
          return `${noteWord} ${current} ${dash} ${title.trim()}`;
        }
        return match;
      }
      return match;
    },
  );

  return out;
}

/** Scan engagement prose for references to hidden baseline note numbers (advisory only). */
export function collectCrossReferenceIssues(
  notes: DocNoteNode[],
  overrides: DocOverrides,
): CrossReferenceIssue[] {
  const resolution = buildNoteNumberResolution(notes, overrides);
  const issues: CrossReferenceIssue[] = [];

  if (resolution.hiddenBaselineNumbers.length === 0) {
    issues.push({
      id: 'XREF.HIDDEN',
      label: 'Cross-references to hidden notes',
      detail: 'No references to hidden notes detected in presentation state.',
      pass: true,
    });
  }

  const hiddenSet = new Set(resolution.hiddenBaselineNumbers);
  const refPattern = /\b[Nn]otes?\s+(\d+)\b/g;
  const offenders = new Map<number, string>();

  const scan = (body: string, where: string) => {
    if (!body) return;
    refPattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = refPattern.exec(body)) !== null) {
      const n = Number(m[1]);
      if (hiddenSet.has(n) && !offenders.has(n)) {
        const noteId = resolution.baselineToNoteId.get(n);
        const title = notes.find((x) => x.id === noteId)?.title || `Note ${n}`;
        offenders.set(n, `${where} references hidden ${title} (baseline Note ${n}).`);
      }
    }
  };

  for (const note of notes) {
    for (const p of note.paragraphs) scan(p.body, note.title);
    for (const s of note.sections) scan(s.body, note.title);
  }

  if (offenders.size === 0 && resolution.hiddenBaselineNumbers.length > 0) {
    issues.push({
      id: 'XREF.HIDDEN',
      label: 'Cross-references to hidden notes',
      detail: 'Hidden notes are present; no prose references to their baseline numbers were found.',
      pass: true,
    });
  }

  for (const [num, detail] of offenders) {
    issues.push({
      id: `XREF.HIDDEN.${num}`,
      label: `Reference to hidden Note ${num}`,
      detail: `${detail} Preview/PDF leave the authored wording unchanged; unhide the note or edit the wording when ready.`,
      pass: false,
    });
  }

  const drifted = [...resolution.baselineToCurrent.entries()].filter(([b, c]) => b !== c);
  issues.push({
    id: 'XREF.REWRITE',
    label: 'Automatic cross-reference rewrite',
    detail:
      drifted.length === 0
        ? 'Display numbering matches structural baseline; no rewrite required.'
        : `Renderer will rewrite ${drifted.length} baseline→display note number mapping(s) at preview/PDF time (stored prose is not mutated).`,
    pass: true,
  });

  return issues;
}
