/**
 * V15.0 — Document Phase Engine.
 *
 * Explicit professional reporting phases. The document model understands these
 * phases; sequencing and publication consume them.
 */
import type { DocumentPhaseId, PublicationProfile } from './types';

export type PhaseDefinition = {
  id: DocumentPhaseId;
  phaseNumber: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  sortOrder: number;
  description: string;
  publication: PublicationProfile;
  defaultSections: Array<{
    kind: string;
    title: string;
    required: boolean;
  }>;
};

const phasePublication = (
  pageBreakBefore: boolean,
  headingLevel: 1 | 2 | 3 = 1,
): PublicationProfile => ({
  pageBreakBefore,
  numberingMode: 'none',
  headingLevel,
  spacingAfter: 'section',
  runningHeaderMode: 'standard',
  includeInContents: true,
  contentsIndent: 0,
});

/** Canonical six-phase Accounts Production document architecture. */
export const DOCUMENT_PHASES: PhaseDefinition[] = [
  {
    id: 'front_matter',
    phaseNumber: 1,
    title: 'Front Matter',
    sortOrder: 100,
    description:
      'Cover, contents, directors\' responsibilities, directors\' report, independent auditor / review, corporate information.',
    publication: { ...phasePublication(false), runningHeaderMode: 'none' },
    defaultSections: [
      { kind: 'cover', title: 'Cover', required: true },
      { kind: 'contents', title: 'Contents', required: true },
      { kind: 'directors_responsibilities', title: "Directors' Responsibilities and Approval", required: true },
      { kind: 'directors_report', title: "Directors' Report", required: true },
      { kind: 'independent_auditor', title: "Independent Auditor's Report", required: true },
      { kind: 'corporate_information', title: 'Corporate Information', required: true },
    ],
  },
  {
    id: 'primary_statements',
    phaseNumber: 2,
    title: 'Primary Financial Statements',
    sortOrder: 200,
    description:
      'Statement of Financial Position, Profit or Loss and OCI, Changes in Equity, Cash Flows.',
    publication: phasePublication(true),
    defaultSections: [
      { kind: 'statement', title: 'Statement of Financial Position', required: true },
      {
        kind: 'statement',
        title: 'Statement of Profit or Loss and Other Comprehensive Income',
        required: true,
      },
      { kind: 'statement', title: 'Statement of Changes in Equity', required: true },
      { kind: 'statement', title: 'Statement of Cash Flows', required: true },
    ],
  },
  {
    id: 'accounting_policies',
    phaseNumber: 3,
    title: 'Accounting Policies',
    sortOrder: 300,
    description:
      'Basis of preparation, significant accounting policies, critical judgements, accounting estimates. Not disclosure notes.',
    publication: phasePublication(true),
    defaultSections: [
      { kind: 'policy_group', title: 'Basis of Preparation', required: true },
      { kind: 'policy_group', title: 'Significant Accounting Policies', required: true },
      { kind: 'policy_group', title: 'Critical Judgements', required: false },
      { kind: 'policy_group', title: 'Accounting Estimates', required: false },
    ],
  },
  {
    id: 'notes',
    phaseNumber: 4,
    title: 'Notes to the Financial Statements',
    sortOrder: 400,
    description:
      'Supporting disclosures, movement schedules, reconciliations, analysis tables, narratives.',
    publication: {
      ...phasePublication(true),
      numberingMode: 'note_seq',
    },
    defaultSections: [
      { kind: 'disclosure_note', title: 'Supporting disclosures', required: true },
    ],
  },
  {
    id: 'supplementary',
    phaseNumber: 5,
    title: 'Supplementary Information',
    sortOrder: 500,
    description: 'Detailed income statement, tax computation, management schedules.',
    publication: phasePublication(true),
    defaultSections: [
      { kind: 'schedule', title: 'Supplementary schedules', required: false },
    ],
  },
  {
    id: 'approval',
    phaseNumber: 6,
    title: 'Approval',
    sortOrder: 600,
    description: 'Board approval, signatures, authorisation, dates.',
    publication: phasePublication(true),
    defaultSections: [
      { kind: 'signatures', title: 'Approval of Annual Financial Statements', required: true },
      { kind: 'authorisation', title: 'Authorisation', required: false },
    ],
  },
];

export function getPhaseDefinition(id: DocumentPhaseId): PhaseDefinition {
  const found = DOCUMENT_PHASES.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown document phase: ${id}`);
  return found;
}

export function phaseSortOrder(id: DocumentPhaseId): number {
  return getPhaseDefinition(id).sortOrder;
}
