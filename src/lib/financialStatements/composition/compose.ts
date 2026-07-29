/**
 * V16.0 — Enterprise Disclosure Composition Engine.
 *
 * Transforms a DocumentModel into a canonical CompositionDocument hierarchy.
 * Does not recalculate accounting, frameworks, or ledger facts.
 */
import type { DocumentModel } from '../document/documentModel';
import { isHidden, resolvedTitle, type DocOverrides } from '../document/documentStore';
import {
  formatLongDate,
  humanFrameworkLabel,
  professionalStatementTitle,
  statementPeriodCaption,
} from '../publication/afsProfessionalPdf';
import { assembleAccountingPolicies } from './accountingPolicies';
import { evaluateConditionalDisclosures } from './conditionalDisclosureEngine';
import { toCompositionDisclosureNote } from './disclosureNotes';
import { disclosureCodeForLine, resolveLineLinks } from './disclosureLinking';
import { buildEnterpriseDisclosures } from './enterpriseDisclosure';
import { validateCompositionDocument } from './disclosureValidation';
import { computeCompositionNoteNumbering } from './noteNumbering';
import { buildPublicationHints } from './publicationHints';
import {
  createEmptyPhases,
  flattenSequencedSections,
  sequencePhases,
  defaultPublicationProfile,
} from './sequencing';
import {
  classifyStatementLine,
  groupLinesByClassification,
} from './statementClassification';
import {
  buildCorporateInformationPresentation,
  presentationToNarratives,
} from '../corporateInformation/presentation';
import { provideCorporateInformation } from '../corporateInformation';
import { corporateDisplayFromModel } from '../corporateInformation/accessors';
import type {
  CompositionDocument,
  CompositionPhase,
  CompositionSection,
  CompositionStatement,
  CompositionStatementLine,
  DisclosureLinkSet,
} from './types';

function fingerprintComposition(parts: {
  phases: CompositionPhase[];
  noteNumbers: Record<string, number>;
  policyCodes: string[];
}): string {
  const lines: string[] = ['V16'];
  for (const phase of parts.phases) {
    lines.push(`PH|${phase.phaseNumber}|${phase.id}|${phase.sections.length}`);
    for (const s of phase.sections) {
      lines.push(`SEC|${s.id}|${s.kind}|${s.title}|${s.active ? 1 : 0}`);
      if (s.note) lines.push(`NOTE|${s.note.noteNumber}|${s.note.disclosureCode}`);
      if (s.policies) {
        for (const p of s.policies) lines.push(`POL|${p.uniqueKey}`);
      }
    }
  }
  lines.push(
    `NUM|${Object.entries(parts.noteNumbers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([c, n]) => `${c}:${n}`)
      .join(',')}`,
  );
  lines.push(`POLS|${parts.policyCodes.join(',')}`);
  return lines.join('\n');
}

function buildCompositionStatement(
  model: DocumentModel,
  overrides: DocOverrides,
  statementId: string,
  noteNumberByCode: Map<string, number>,
): CompositionStatement | null {
  const stmt = model.statements.find((s) => s.id === statementId || s.statement_type === statementId);
  if (!stmt || isHidden(overrides, stmt.id)) return null;

  const lines: CompositionStatementLine[] = (stmt.lines || []).map((line) => {
    const links = resolveLineLinks(stmt.statement_type, line);
    let noteRef: number | string | null =
      line.note_ref != null && line.note_ref !== '' ? line.note_ref : null;
    if (noteRef == null) {
      const disc = disclosureCodeForLine(String(line.line_code || ''));
      if (disc) {
        const num = noteNumberByCode.get(disc);
        if (num != null) noteRef = num;
      }
    }
    return {
      lineCode: String(line.line_code || ''),
      label: String(line.label || ''),
      classification: classifyStatementLine(stmt.statement_type, line),
      amount: line.amount ?? null,
      priorAmount: (line as { prior_amount?: number | null }).prior_amount ?? null,
      noteRef,
      isHeader: !!(line.is_header || line.is_subheader),
      isTotal: !!line.is_total,
      links,
    };
  });

  return {
    id: stmt.id,
    kind: 'statement',
    statementType: stmt.statement_type,
    title: professionalStatementTitle(
      stmt.statement_type,
      resolvedTitle(overrides, stmt.id, stmt.title),
    ),
    periodCaption: statementPeriodCaption(stmt.statement_type, model.period || {}),
    populated: stmt.populated,
    lines,
    classificationGroups: groupLinesByClassification(stmt.statement_type, stmt.lines || []),
  };
}

/**
 * Compose the enterprise Accounts Production document from the locked
 * DocumentModel + presentation overrides.
 */
export function composeDocument(
  model: DocumentModel,
  overrides: DocOverrides,
): CompositionDocument {
  const corporateInformation = provideCorporateInformation(model);
  const corporatePresentation = buildCorporateInformationPresentation(corporateInformation);
  const corporateDisplay = corporateDisplayFromModel(model);
  const companyName = corporateDisplay.registeredName;
  const frameworkLabel = humanFrameworkLabel(
    { engagement: { framework: { framework_key: model.frameworkKey, name: model.frameworkLabel } } },
    { framework_key: model.frameworkKey || undefined, framework_label: model.frameworkLabel },
  );
  const currency = corporateDisplay.reportingCurrency;
  const currencyLabel =
    currency === 'ZAR' || currency === 'R'
      ? 'Figures are stated in South African Rand'
      : `Figures are stated in ${currency}`;
  const endLong = formatLongDate(model.period?.end_date);
  const periodCaption = endLong
    ? `For the year ended ${endLong}`
    : model.period?.label || 'For the reporting period';

  const numbering = computeCompositionNoteNumbering(model.notes, overrides);
  const hiddenPolicyIds = new Set(
    model.policySets.flatMap((s) =>
      (s.policies || []).filter((p) => isHidden(overrides, p.id)).map((p) => p.id),
    ),
  );
  const accountingPolicies = assembleAccountingPolicies(model.policySets, hiddenPolicyIds);

  // Line → disclosure links across all statements
  const disclosureLinks: Array<{
    statementType: string;
    lineCode: string;
    links: DisclosureLinkSet;
  }> = [];
  for (const stmt of model.statements) {
    for (const line of stmt.lines || []) {
      if (!line.line_code) continue;
      disclosureLinks.push({
        statementType: stmt.statement_type,
        lineCode: String(line.line_code),
        links: resolveLineLinks(stmt.statement_type, line),
      });
    }
  }

  const phases = createEmptyPhases();
  const phaseById = (id: CompositionPhase['id']) => phases.find((p) => p.id === id)!;

  // ── Phase 1: Front Matter ───────────────────────────────────────────────
  const front = phaseById('front_matter');
  const frontSections: Array<{ kind: CompositionSection['kind']; title: string; indent?: number }> =
    [
      { kind: 'cover', title: 'Cover' },
      { kind: 'contents', title: 'Contents' },
      { kind: 'directors_responsibilities', title: "Directors' Responsibilities and Approval" },
      { kind: 'directors_report', title: "Directors' Report" },
      { kind: 'independent_auditor', title: "Independent Auditor's Report" },
      { kind: 'corporate_information', title: 'Corporate Information' },
    ];
  front.sections = frontSections.map((s, idx) => ({
    id: `front:${s.kind}`,
    kind: s.kind,
    title: s.title,
    phaseId: 'front_matter',
    sortOrder: (idx + 1) * 10,
    publication: defaultPublicationProfile({
      pageBreakBefore: s.kind !== 'cover' && s.kind !== 'contents',
      includeInContents: s.kind !== 'cover',
      contentsIndent: 0,
      runningHeaderMode: s.kind === 'cover' ? 'none' : 'standard',
    }),
    narratives:
      s.kind === 'corporate_information'
        ? presentationToNarratives(corporatePresentation)
        : undefined,
    corporatePresentation:
      s.kind === 'corporate_information' ? corporatePresentation : undefined,
    active: true,
  }));

  // ── Phase 2: Primary Statements ─────────────────────────────────────────
  const primary = phaseById('primary_statements');
  const statementOrder = [
    'financial_position',
    'financial_performance',
    'changes_in_equity',
    'cash_flows',
  ];
  primary.sections = statementOrder
    .map((type, idx) => {
      const compositionStmt = buildCompositionStatement(
        model,
        overrides,
        type,
        numbering.noteNumberByCode,
      );
      if (!compositionStmt) return null;
      const section: CompositionSection = {
        id: `stmt:${compositionStmt.id}`,
        kind: 'statement',
        title: compositionStmt.title,
        phaseId: 'primary_statements',
        sortOrder: (idx + 1) * 10,
        publication: defaultPublicationProfile({
          pageBreakBefore: true,
          contentsIndent: 0,
        }),
        statement: compositionStmt,
        active: true,
      };
      return section;
    })
    .filter((s): s is CompositionSection => !!s);

  // ── Phase 3: Accounting Policies (independent of notes; appear once) ────
  const policiesPhase = phaseById('accounting_policies');
  policiesPhase.sections = [
    {
      id: 'policies:significant',
      kind: 'policy_group',
      title: 'Significant Accounting Policies',
      phaseId: 'accounting_policies',
      sortOrder: 10,
      publication: defaultPublicationProfile({ pageBreakBefore: true }),
      policies: accountingPolicies,
      narratives:
        accountingPolicies.length === 0
          ? [
              {
                id: 'policies:placeholder',
                kind: 'narrative',
                text: `Significant accounting policies are applied in accordance with ${frameworkLabel}.`,
              },
            ]
          : undefined,
      active: true,
    },
  ];

  // ── Phase 4: Disclosure Notes ───────────────────────────────────────────
  const notesPhase = phaseById('notes');
  const numberedNotes = numbering.visible
    .map((n) =>
      toCompositionDisclosureNote(n.note, {
        noteNumber: n.noteNumber,
        title: n.title,
        allLineLinks: disclosureLinks,
      }),
    )
    .filter((n): n is NonNullable<typeof n> => !!n);

  notesPhase.sections = [
    {
      id: 'notes:header',
      kind: 'disclosure_note',
      title: 'Notes to the Financial Statements',
      phaseId: 'notes',
      sortOrder: 1,
      publication: defaultPublicationProfile({
        pageBreakBefore: true,
        numberingMode: 'note_seq',
      }),
      active: true,
    },
    ...numberedNotes.map((note, idx) => ({
      id: `note:${note.id}`,
      kind: 'disclosure_note' as const,
      title: note.heading || note.title,
      phaseId: 'notes' as const,
      sortOrder: 10 + idx,
      publication: defaultPublicationProfile({
        pageBreakBefore: false,
        numberingMode: 'note_seq' as const,
        headingLevel: 2 as const,
        contentsIndent: 1,
        includeInContents: idx < 8,
        spacingAfter: 'normal' as const,
      }),
      note,
      active: true,
    })),
  ];

  // ── Phase 5: Supplementary (populated after enterprise disclosures built) ─
  const supp = phaseById('supplementary');

  // ── Phase 6: Approval ────────────────────────────────────────────────────
  const approval = phaseById('approval');
  approval.sections = [
    {
      id: 'approval:signatures',
      kind: 'signatures',
      title: 'Approval of Annual Financial Statements',
      phaseId: 'approval',
      sortOrder: 10,
      publication: defaultPublicationProfile({ pageBreakBefore: true }),
      active: (model.signatures || []).length > 0,
    },
  ];

  const conditionalActivation = evaluateConditionalDisclosures(model);

  const noteNumberByCode: Record<string, number> = {};
  for (const [code, num] of numbering.noteNumberByCode) noteNumberByCode[code] = num;

  const enterpriseDisclosures = buildEnterpriseDisclosures(
    model,
    numbering.visible.map((n) => ({
      note: n.note,
      noteNumber: n.noteNumber,
      title: n.title,
    })),
    disclosureLinks,
  );

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
        publication: defaultPublicationProfile({
          pageBreakBefore: scheduleIdx === 1,
          headingLevel: 2,
        }),
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
  supp.sections = [
    {
      id: 'supp:schedules',
      kind: 'schedule',
      title: 'Supplementary Information',
      phaseId: 'supplementary',
      sortOrder: 1,
      publication: defaultPublicationProfile({ pageBreakBefore: true }),
      narratives: [
        {
          id: 'supp:intro',
          kind: 'narrative',
          text: 'The schedules that follow are presented as supplementary information and do not form part of the audited annual financial statements.',
        },
      ],
      active: scheduleSections.length > 0,
    },
    ...scheduleSections,
  ];

  const orderedPhases = sequencePhases(phases);
  const sequencedSections = flattenSequencedSections(orderedPhases);

  const publicationHints = buildPublicationHints(
    'Annual Financial Statements',
    sequencedSections,
  );

  const draftDoc: CompositionDocument = {
    version: '16.0',
    title: 'Annual Financial Statements',
    companyName,
    frameworkKey: model.frameworkKey,
    frameworkLabel,
    periodCaption,
    currencyLabel,
    phases: orderedPhases,
    sequencedSections,
    numberedNotes,
    enterpriseDisclosures,
    accountingPolicies,
    disclosureLinks,
    noteNumberByCode,
    conditionalActivation: {
      activated: conditionalActivation.activated,
      suppressed: conditionalActivation.suppressed,
    },
    validationSummary: {
      passed: true,
      disclosureCount: 0,
      movementScheduleCount: 0,
      reconciliationCount: 0,
      failedRules: [],
    },
    compositionFingerprint: '',
    publicationHints,
    corporateInformation,
  };

  const validation = validateCompositionDocument(draftDoc);
  const corporateFailed = corporateInformation.validation.issues
    .filter((i) => i.blocking)
    .map((i) => `VAL.CORP.${i.field}`);
  draftDoc.validationSummary = {
    ...validation.summary,
    passed: validation.summary.passed && corporateInformation.validation.passed,
    failedRules: [...validation.summary.failedRules, ...corporateFailed],
  };

  const compositionFingerprint = fingerprintComposition({
    phases: orderedPhases,
    noteNumbers: noteNumberByCode,
    policyCodes: accountingPolicies.map((p) => p.uniqueKey),
  });
  draftDoc.compositionFingerprint = compositionFingerprint;

  return draftDoc;
}
