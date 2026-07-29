/**
 * AFS Document Workspace — automatic note renumbering (V11.0 / V15.0).
 *
 * Single source of truth for note ordering + numbering, shared by the on-screen
 * document tree, the live preview, and the generated PDF so the three never
 * diverge. Reuses the canonical ordering semantics of `numberDisclosures` from
 * the existing (read-only) publication builder and overlays the workspace's
 * client-side visibility + custom ordering choices.
 *
 * V15.0: Accounting policy vessels (DISC.POLICIES / NOTE.POLICIES) are excluded
 * from note numbering — policies are composed in Phase 3, not as disclosure notes.
 */
import { numberDisclosures } from '../publication/afsProfessionalPdf';
import type { DocNoteNode } from './documentModel';
import { isPolicyNote } from './documentModel';
import { isHidden, resolvedTitle, type DocOverrides } from './documentStore';

export type NumberedNote = {
  note: DocNoteNode;
  noteNumber: number;
  title: string;
  heading: string;
};

/** Build a default rank by disclosure_code from the canonical publication order. */
function defaultRankByCode(notes: DocNoteNode[]): Map<string, number> {
  const canonical = numberDisclosures(
    notes.map((n) => ({
      disclosure_code: n.disclosure_code,
      title: n.title,
      status: n.status,
    })),
  ) as Array<{ disclosure_code?: string }>;
  const rank = new Map<string, number>();
  canonical.forEach((c, idx) => {
    const code = String(c.disclosure_code || '').toUpperCase();
    if (code && !rank.has(code)) rank.set(code, idx);
  });
  return rank;
}

function isVisible(note: DocNoteNode, overrides: DocOverrides): boolean {
  if (note.status === 'superseded') return false;
  if (isPolicyNote(note)) return false;
  if (isHidden(overrides, note.id)) return false;
  return true;
}

/**
 * Compute the ordered, visible, sequentially-numbered notes plus the set of
 * hidden note ids. Custom order (overrides.order) wins; otherwise canonical
 * publication order; otherwise the instance sort_order.
 *
 * Phase B: pair with `crossRefRewrite.buildNoteNumberResolution` — structural
 * baseline uses empty overrides; display numbering uses the live overrides.
 */
export function computeNoteNumbering(
  notes: DocNoteNode[],
  overrides: DocOverrides,
): { visible: NumberedNote[]; hiddenIds: string[] } {
  const rank = defaultRankByCode(notes);
  const hiddenIds: string[] = [];

  const effective = notes
    .filter((n) => {
      const visible = isVisible(n, overrides);
      if (!visible) hiddenIds.push(n.id);
      return visible;
    })
    .map((note) => {
      const code = String(note.disclosure_code || '').toUpperCase();
      const custom = overrides.order[note.id];
      const canonicalRank = rank.has(code) ? rank.get(code)! : 500 + note.sort_order;
      const orderKey = custom != null ? custom : canonicalRank;
      return { note, orderKey };
    })
    .sort((a, b) => a.orderKey - b.orderKey);

  const visible: NumberedNote[] = effective.map((entry, idx) => {
    const noteNumber = idx + 1;
    const title = resolvedTitle(overrides, entry.note.id, entry.note.title);
    return {
      note: entry.note,
      noteNumber,
      title,
      heading: `Note ${noteNumber}. ${title}`,
    };
  });

  return { visible, hiddenIds };
}
