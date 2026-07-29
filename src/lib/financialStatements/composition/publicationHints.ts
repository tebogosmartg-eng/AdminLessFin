/**
 * V15.0 — Composition → Publication formatting metadata.
 *
 * Formatting derives from composition metadata — not hardcoded in renderers.
 */
import type { CompositionDocument, CompositionPublicationHints, CompositionSection } from './types';
import { buildContentsEntries } from './sequencing';

export function buildPublicationHints(
  documentTitle: string,
  sequencedSections: CompositionSection[],
): CompositionPublicationHints {
  return {
    documentTitle,
    phaseOrder: [
      'front_matter',
      'primary_statements',
      'accounting_policies',
      'notes',
      'supplementary',
      'approval',
    ],
    contentsEntries: buildContentsEntries(sequencedSections),
    typography: {
      sectionSpacing: 14,
      noteSpacing: 12,
      policySpacing: 10,
      statementSpacing: 8,
    },
    pageBreaks: {
      beforePrimaryStatements: true,
      beforeAccountingPolicies: true,
      beforeNotes: true,
      beforeSupplementary: true,
      beforeApproval: true,
      eachPrimaryStatement: true,
    },
    runningHeader: {
      left: 'company',
      right: 'section',
    },
    runningFooter: {
      showPageNumbers: true,
      showPeriod: true,
    },
  };
}

/** Spacing after value derived from composition publication profile. */
export function spacingAfterPx(
  hints: CompositionPublicationHints,
  kind: 'section' | 'note' | 'policy' | 'statement',
): number {
  switch (kind) {
    case 'section':
      return hints.typography.sectionSpacing;
    case 'note':
      return hints.typography.noteSpacing;
    case 'policy':
      return hints.typography.policySpacing;
    case 'statement':
      return hints.typography.statementSpacing;
    default:
      return 10;
  }
}

export function compositionContentsLabels(doc: CompositionDocument): string[] {
  return doc.publicationHints.contentsEntries.map((e) => e.label);
}
