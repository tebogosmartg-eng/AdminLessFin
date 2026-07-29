/**
 * V17.0 — Apply reporting intelligence decisions to a CompositionDocument.
 *
 * Does not recalculate accounting or redesign the Composition Engine.
 */
import type { CompositionDocument, CompositionSection } from '../composition/types';
import { disclosureCodeForLine } from '../composition/disclosureLinking';
import type { DisclosureDecision } from './types';

function validMovementSchedules(
  schedules: CompositionDocument['enterpriseDisclosures'][0]['movementSchedules'],
) {
  return schedules.filter(
    (schedule) =>
      schedule.rows.some((r) => r.values.opening != null) ||
      schedule.rows.some((r) => r.values.closing != null),
  );
}

function applyDisclosureSuppressions(
  composition: CompositionDocument,
  decisions: DisclosureDecision[],
): CompositionDocument {
  const suppressed = new Set(
    decisions.filter((d) => d.shouldSuppress || !d.exists).map((d) => d.disclosureCode),
  );

  const phases = composition.phases.map((phase) => {
    if (phase.id !== 'notes' && phase.id !== 'supplementary') return phase;
    return {
      ...phase,
      sections: phase.sections
        .map((section) => {
          if (section.kind !== 'disclosure_note' || !section.note) return section;
          if (suppressed.has(section.note.disclosureCode)) {
            return { ...section, active: false };
          }
          return section;
        })
        .filter((s) => s.active || s.id === 'notes:header'),
    };
  });

  const numberedNotes = composition.numberedNotes.filter(
    (n) => !suppressed.has(n.disclosureCode),
  );

  const enterpriseDisclosures = composition.enterpriseDisclosures
    .map((ed) => {
      const decision = decisions.find((d) => d.disclosureCode === ed.disclosureCode);
      if (decision?.shouldSuppress || !decision?.exists) return null;
      if (decision.shouldSimplify) {
        return { ...ed, movementSchedules: [], reconciliations: [] };
      }
      const movementSchedules = validMovementSchedules(ed.movementSchedules);
      if (movementSchedules.length !== ed.movementSchedules.length) {
        return { ...ed, movementSchedules };
      }
      return ed;
    })
    .filter((ed): ed is NonNullable<typeof ed> => ed != null);

  const activated = composition.conditionalActivation.activated.filter((c) => !suppressed.has(c));
  const suppressedCodes = [
    ...new Set([...composition.conditionalActivation.suppressed, ...suppressed]),
  ];

  const scheduleSections: CompositionSection[] = [];
  const seenScheduleCodes = new Set<string>();
  let scheduleIdx = 0;
  for (const ed of enterpriseDisclosures) {
    for (const schedule of ed.movementSchedules) {
      if (seenScheduleCodes.has(schedule.scheduleCode)) continue;
      seenScheduleCodes.add(schedule.scheduleCode);
      scheduleIdx += 1;
      scheduleSections.push({
        id: `supp:${schedule.scheduleCode}`,
        kind: 'schedule',
        title: schedule.title,
        phaseId: 'supplementary',
        sortOrder: 10 + scheduleIdx,
        publication: composition.phases
          .find((p) => p.id === 'supplementary')
          ?.sections[0]?.publication ?? {
          pageBreakBefore: scheduleIdx === 1,
          numberingMode: 'none',
          headingLevel: 2,
          spacingAfter: 'normal',
          runningHeaderMode: 'standard',
          includeInContents: true,
          contentsIndent: 0,
        },
        narratives: [
          {
            id: `${schedule.id}:caption`,
            kind: 'narrative',
            text: `Movement schedule — ${schedule.categoryKey.replace(/_/g, ' ')}`,
          },
        ],
        active: true,
      });
    }
  }

  const phasesWithSupp = phases.map((phase) => {
    if (phase.id !== 'supplementary') return phase;
    return {
      ...phase,
      sections: [
        {
          id: 'supp:schedules',
          kind: 'schedule' as const,
          title: 'Supplementary Information',
          phaseId: 'supplementary' as const,
          sortOrder: 1,
          publication: phase.sections[0]?.publication ?? {
            pageBreakBefore: true,
            numberingMode: 'none' as const,
            headingLevel: 1 as const,
            spacingAfter: 'normal' as const,
            runningHeaderMode: 'standard' as const,
            includeInContents: true,
            contentsIndent: 0,
          },
          narratives: [
            {
              id: 'supp:intro',
              kind: 'narrative' as const,
              text: 'The schedules that follow are presented as supplementary information and do not form part of the audited annual financial statements.',
            },
          ],
          active: scheduleSections.length > 0,
        },
        ...scheduleSections,
      ],
    };
  });

  return {
    ...composition,
    version: '16.0',
    phases: phasesWithSupp,
    numberedNotes,
    enterpriseDisclosures,
    conditionalActivation: { activated, suppressed: suppressedCodes },
  };
}

function applyDisclosureOrdering(
  composition: CompositionDocument,
  orderedCodes: string[],
): CompositionDocument {
  const orderMap = new Map(orderedCodes.map((code, idx) => [code, (idx + 1) * 10]));

  const phases = composition.phases.map((phase) => {
    if (phase.id !== 'notes') return phase;
    const header = phase.sections.find((s) => s.id === 'notes:header');
    const noteSections = phase.sections
      .filter((s) => s.kind === 'disclosure_note' && s.note)
      .sort((a, b) => {
        const orderA = orderMap.get(a.note!.disclosureCode) ?? a.sortOrder + 10000;
        const orderB = orderMap.get(b.note!.disclosureCode) ?? b.sortOrder + 10000;
        return orderA - orderB;
      })
      .map((s, idx) => ({ ...s, sortOrder: 10 + idx }));

    const other = phase.sections.filter((s) => s.kind !== 'disclosure_note' || !s.note);
    return {
      ...phase,
      sections: [...(header ? [header] : []), ...noteSections, ...other.filter((s) => s.id !== 'notes:header')],
    };
  });

  const renumberedNotes = [...composition.numberedNotes].sort((a, b) => {
    const orderA = orderMap.get(a.disclosureCode) ?? a.sortOrder;
    const orderB = orderMap.get(b.disclosureCode) ?? b.sortOrder;
    return orderA - orderB;
  });

  const noteNumberByCode: Record<string, number> = {};
  renumberedNotes.forEach((n, idx) => {
    noteNumberByCode[n.disclosureCode] = idx + 1;
    n.noteNumber = idx + 1;
    n.heading = `Note ${idx + 1}. ${n.title}`;
  });

  return {
    ...composition,
    phases,
    numberedNotes: renumberedNotes,
    noteNumberByCode,
  };
}

function remapStatementNoteRefs(composition: CompositionDocument): CompositionDocument {
  const phases = composition.phases.map((phase) => {
    if (phase.id !== 'primary_statements') return phase;
    return {
      ...phase,
      sections: phase.sections.map((section) => {
        if (!section.statement) return section;
        return {
          ...section,
          statement: {
            ...section.statement,
            lines: section.statement.lines.map((line) => {
              const disc = disclosureCodeForLine(line.lineCode);
              if (!disc) return line;
              const newNum = composition.noteNumberByCode[disc];
              if (newNum == null) {
                return { ...line, noteRef: null };
              }
              return { ...line, noteRef: newNum };
            }),
          },
        };
      }),
    };
  });
  return { ...composition, phases };
}

function resequenceSections(composition: CompositionDocument): CompositionDocument {
  const sequencedSections: CompositionSection[] = [];
  for (const phase of composition.phases) {
    for (const section of phase.sections) {
      if (section.active) sequencedSections.push(section);
    }
  }
  return { ...composition, sequencedSections };
}

/** Apply all intelligence decisions to a composed document. */
export function applyIntelligenceToComposition(
  composition: CompositionDocument,
  decisions: DisclosureDecision[],
  orderedCodes: string[],
  /** When provided, user-level ordering overrides intelligence ordering entirely. */
  userOrderOverride?: Record<string, number>,
): CompositionDocument {
  let result = applyDisclosureSuppressions(composition, decisions);
  // User order overrides take absolute precedence over intelligence ordering.
  // When any explicit user positions exist, skip intelligence reordering so
  // the user's arrangement (set via DocOverrides.order) is preserved.
  const hasUserOrder = userOrderOverride != null && Object.keys(userOrderOverride).length > 0;
  if (!hasUserOrder) {
    result = applyDisclosureOrdering(result, orderedCodes);
  }
  result = remapStatementNoteRefs(result);
  result = resequenceSections(result);
  return result;
}
