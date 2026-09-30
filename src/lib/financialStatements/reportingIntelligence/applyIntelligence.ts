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

  const renumberedNotes = [...composition.numberedNotes].sort((a, b) => {
    const orderA = orderMap.get(a.disclosureCode) ?? a.sortOrder + 10000;
    const orderB = orderMap.get(b.disclosureCode) ?? b.sortOrder + 10000;
    return orderA - orderB;
  });
  // The sections that print the notes follow the notes, rather than being
  // sorted by a rule of their own that could put them in a different order.
  const position = new Map(renumberedNotes.map((n, idx) => [n.id, idx]));

  const phases = composition.phases.map((phase) => {
    if (phase.id !== 'notes') return phase;
    const header = phase.sections.find((s) => s.id === 'notes:header');
    const noteSections = phase.sections
      .filter((s) => s.kind === 'disclosure_note' && s.note)
      .sort(
        (a, b) =>
          (position.get(a.note!.id) ?? Number.MAX_SAFE_INTEGER) -
          (position.get(b.note!.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .map((s, idx) => ({ ...s, sortOrder: 10 + idx }));

    const other = phase.sections.filter((s) => s.kind !== 'disclosure_note' || !s.note);
    return {
      ...phase,
      sections: [...(header ? [header] : []), ...noteSections, ...other.filter((s) => s.id !== 'notes:header')],
    };
  });

  return {
    ...composition,
    phases,
    numberedNotes: renumberedNotes,
  };
}

/**
 * The number the notes start from. The accounting policies read as note 1 of
 * a published set — "1. Basis of preparation…", "1.2 Financial instruments" —
 * so the first disclosure note is note 2, the way a professionally produced
 * set of statements numbers them.
 */
export const FIRST_NOTE_NUMBER = 2;

/**
 * Number the notes that will be printed, in the order they print.
 *
 * This is the one place a note gets its number. It runs after suppression and
 * ordering, so a note the engine withheld leaves no gap and cannot be
 * referred to, and every copy of the number — the note, its section, its
 * heading, the enterprise disclosure and the code lookup the statements use —
 * is written here together, so none of them can disagree. Headings print the
 * way a published set prints them: "3. Property, plant and equipment".
 */
function renumberPrintedNotes(composition: CompositionDocument): CompositionDocument {
  const noteNumberByCode: Record<string, number> = {};
  const assigned = new Map<string, { noteNumber: number; heading: string }>();
  const numberedNotes = composition.numberedNotes.map((n, idx) => {
    const noteNumber = idx + FIRST_NOTE_NUMBER;
    const heading = `${noteNumber}. ${n.title}`;
    const code = String(n.disclosureCode || '').toUpperCase();
    if (code && noteNumberByCode[code] == null) noteNumberByCode[code] = noteNumber;
    assigned.set(n.id, { noteNumber, heading });
    return { ...n, noteNumber, heading };
  });

  const phases = composition.phases.map((phase) => {
    if (phase.id !== 'notes') return phase;
    return {
      ...phase,
      sections: phase.sections.map((section) => {
        const given = section.note ? assigned.get(section.note.id) : undefined;
        if (!section.note || !given) return section;
        return { ...section, title: given.heading, note: { ...section.note, ...given } };
      }),
    };
  });

  const enterpriseDisclosures = composition.enterpriseDisclosures.map((ed) => {
    const given = assigned.get(ed.id);
    return given ? { ...ed, ...given } : ed;
  });

  return { ...composition, phases, numberedNotes, enterpriseDisclosures, noteNumberByCode };
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
              // Only notes that are printed can be referred to.
              const disc = disclosureCodeForLine(
                line.lineCode,
                Object.keys(composition.noteNumberByCode),
              );
              const newNum = disc ? composition.noteNumberByCode[disc] : null;
              return { ...line, noteRef: newNum ?? null };
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
  // The order map also holds where paragraphs and tables sit inside a note;
  // only a position given to a note itself is an arrangement of the notes.
  const noteIds = new Set(composition.numberedNotes.map((n) => n.id));
  const hasUserOrder =
    userOrderOverride != null && Object.keys(userOrderOverride).some((key) => noteIds.has(key));
  if (!hasUserOrder) {
    result = applyDisclosureOrdering(result, orderedCodes);
  }
  result = renumberPrintedNotes(result);
  result = remapStatementNoteRefs(result);
  result = resequenceSections(result);
  return result;
}
