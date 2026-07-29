/**
 * V15.0 — Document Sequencing Engine.
 *
 * The final document assembles itself. Ordering is driven by:
 * document phase → statement order → framework order → disclosure priority →
 * conditional activation → publication rules.
 *
 * No manual ordering of the published pack.
 */
import type {
  CompositionPhase,
  CompositionSection,
  DocumentPhaseId,
  PublicationProfile,
} from './types';
import { DOCUMENT_PHASES, phaseSortOrder } from './documentPhases';

export function defaultPublicationProfile(
  partial?: Partial<PublicationProfile>,
): PublicationProfile {
  return {
    pageBreakBefore: false,
    numberingMode: 'none',
    headingLevel: 1,
    spacingAfter: 'normal',
    runningHeaderMode: 'standard',
    includeInContents: true,
    contentsIndent: 0,
    ...partial,
  };
}

/**
 * Sort phases into canonical enterprise order, dropping inactive empty phases
 * only when they have zero active sections (except always-required phases).
 */
export function sequencePhases(phases: CompositionPhase[]): CompositionPhase[] {
  const required: DocumentPhaseId[] = [
    'front_matter',
    'primary_statements',
    'accounting_policies',
    'notes',
    'approval',
  ];

  return [...phases]
    .map((phase) => ({
      ...phase,
      sections: [...phase.sections]
        .filter((s) => s.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
    }))
    .filter(
      (phase) =>
        phase.sections.length > 0 || required.includes(phase.id),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || phaseSortOrder(a.id) - phaseSortOrder(b.id));
}

/** Flatten sequenced phases into the publication section stream. */
export function flattenSequencedSections(phases: CompositionPhase[]): CompositionSection[] {
  const ordered = sequencePhases(phases);
  const out: CompositionSection[] = [];
  for (const phase of ordered) {
    for (const section of phase.sections) {
      if (section.active) out.push(section);
    }
  }
  return out;
}

/** Build contents entries from sequenced sections using publication metadata. */
export function buildContentsEntries(
  sections: CompositionSection[],
): Array<{ label: string; sectionId: string; phaseId: DocumentPhaseId; indent: number }> {
  return sections
    .filter((s) => s.publication.includeInContents && s.kind !== 'cover')
    .map((s) => ({
      label: s.title,
      sectionId: s.id,
      phaseId: s.phaseId,
      indent: s.publication.contentsIndent,
    }));
}

/** Seed empty phase shells from the phase engine definitions. */
export function createEmptyPhases(): CompositionPhase[] {
  return DOCUMENT_PHASES.map((def) => ({
    id: def.id,
    kind: 'phase' as const,
    phaseNumber: def.phaseNumber,
    title: def.title,
    sortOrder: def.sortOrder,
    sections: [],
    publication: def.publication,
  }));
}
