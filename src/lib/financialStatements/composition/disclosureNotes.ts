/**
 * V16.0 — Disclosure Note Architecture.
 *
 * Disclosure notes are composed from reusable disclosure components.
 * They reference statements, lines, categories, framework sections,
 * tables, narratives, cross-references, and conditional logic.
 */
import type { DocNoteNode, DocSection, DocParagraph, DocTable } from '../document/documentModel';
import type {
  CompositionDisclosureComponent,
  CompositionDisclosureNote,
  CompositionNarrative,
  CompositionTable,
  DisclosureComponentKind,
  DisclosureLinkSet,
} from './types';
import {
  buildDisclosureLibraryComponents,
  inferTableComponentKind,
  libraryToCompositionComponents,
  tableToCompositionRows,
} from './disclosureComponents';
import { emptyDisclosureLinks, linksForDisclosure } from './disclosureLinking';
import { isAccountingPolicyNoteCode } from './accountingPolicies';

function buildComponents(note: DocNoteNode): CompositionDisclosureComponent[] {
  const library = buildDisclosureLibraryComponents(note);
  const { grouped } = libraryToCompositionComponents(library, note.id);

  return grouped.map((g) => ({
    id: g.id,
    kind: 'disclosure_component' as const,
    componentKind: g.componentKind,
    title: g.title,
    narratives: g.narratives,
    tables: g.tables,
  }));
}

export function isDisclosureNote(note: DocNoteNode): boolean {
  return !isAccountingPolicyNoteCode(note.disclosure_code);
}

/**
 * Map a document-model note into a composition disclosure note.
 * Policy vessels are rejected — use the Accounting Policy Architecture instead.
 */
export function toCompositionDisclosureNote(
  note: DocNoteNode,
  opts: {
    noteNumber: number | null;
    title: string;
    links?: DisclosureLinkSet;
    allLineLinks?: Array<{ statementType: string; lineCode: string; links: DisclosureLinkSet }>;
  },
): CompositionDisclosureNote | null {
  if (!isDisclosureNote(note)) return null;

  const links =
    opts.links ||
    (opts.allLineLinks
      ? linksForDisclosure(note.disclosure_code, opts.allLineLinks)
      : emptyDisclosureLinks());

  const heading =
    opts.noteNumber != null ? `Note ${opts.noteNumber}. ${opts.title}` : null;

  return {
    id: note.id,
    kind: 'disclosure_note',
    disclosureCode: note.disclosure_code,
    title: opts.title,
    noteNumber: opts.noteNumber,
    heading,
    status: note.status,
    requirementLevel: note.requirement_level,
    sortOrder: note.sort_order,
    links,
    components: buildComponents(note),
    source: note.source || 'framework',
  };
}

/** Strip accidental policy-only wording from disclosure narrative blocks (soft). */
export function sanitizeDisclosureNarrative(text: string): string {
  // Composition rule: disclosures explain balances — do not rewrite knowledge content.
  // Reserved for future framework-flagged policy leakage detection.
  return text;
}

export type { DocSection, DocParagraph, DocTable };
