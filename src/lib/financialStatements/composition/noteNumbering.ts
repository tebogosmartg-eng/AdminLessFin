/**
 * V15.0 — Note Numbering Engine.
 *
 * Automatic note numbering generated from the final document.
 * NEVER hardcoded. Hidden / conditional / policy notes are excluded;
 * remaining notes renumber without gaps; cross-references update via
 * the existing rewrite layer using this engine's output.
 */
import type { DocNoteNode } from '../document/documentModel';
import { computeNoteNumbering, type NumberedNote } from '../document/renumber';
import type { DocOverrides } from '../document/documentStore';
import { excludePolicyNotes } from './accountingPolicies';

export type CompositionNoteNumbering = {
  /** Numbered disclosure notes only (policies excluded). */
  visible: NumberedNote[];
  /** Ids excluded from numbering (hidden, superseded, or policy vessels). */
  excludedIds: string[];
  /** disclosure_code (upper) → display note number. */
  noteNumberByCode: Map<string, number>;
  /** note id → display note number. */
  noteNumberById: Map<string, number>;
};

/**
 * Compute final-document note numbers.
 *
 * Rules:
 * - Face statements reference these numbers
 * - Hidden notes excluded
 * - Policy vessels excluded (Accounting Policies are Phase 3)
 * - Conditional notes renumber automatically when visibility changes
 * - No numbering gaps
 */
export function computeCompositionNoteNumbering(
  notes: DocNoteNode[],
  overrides: DocOverrides,
): CompositionNoteNumbering {
  const disclosureNotes = excludePolicyNotes(notes);
  const policyExcluded = notes
    .filter((n) => !disclosureNotes.some((d) => d.id === n.id))
    .map((n) => n.id);

  const { visible, hiddenIds } = computeNoteNumbering(disclosureNotes, overrides);

  const noteNumberByCode = new Map<string, number>();
  const noteNumberById = new Map<string, number>();
  for (const n of visible) {
    noteNumberById.set(n.note.id, n.noteNumber);
    const code = String(n.note.disclosure_code || '').toUpperCase();
    if (code) noteNumberByCode.set(code, n.noteNumber);
  }

  return {
    visible,
    excludedIds: [...new Set([...hiddenIds, ...policyExcluded])],
    noteNumberByCode,
    noteNumberById,
  };
}

/** Resolve a disclosure code to its final note number (or null if excluded). */
export function resolveNoteNumber(
  numbering: CompositionNoteNumbering,
  disclosureCode: string,
): number | null {
  return numbering.noteNumberByCode.get(String(disclosureCode || '').toUpperCase()) ?? null;
}
