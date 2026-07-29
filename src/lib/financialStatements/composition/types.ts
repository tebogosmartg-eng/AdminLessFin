import type { CorporateInformationModel } from '../corporateInformation';

/**
 * V16.0 — Enterprise Disclosure Composition Model.
 *
 * Canonical document hierarchy for professional Accounts Production.
 * Renderers consume this hierarchy; they do not invent document structure.
 *
 * Hierarchy:
 *   Annual Financial Statements
 *     → Document Phase
 *       → Document Section
 *         → Statement / Schedule | Accounting Policy | Disclosure Note
 *           → Enterprise Disclosure Object
 *             → Disclosure Sections → Narratives | Tables
 *               → Movement Schedules | Reconciliations | Estimates | Judgements
 *                 → Cross References | Validation Rules
 *                   → Publication
 */

/** Document phases in professional Accounts Production order. */
export type DocumentPhaseId =
  | 'front_matter'
  | 'primary_statements'
  | 'accounting_policies'
  | 'notes'
  | 'supplementary'
  | 'approval';

export type DocumentSectionKind =
  | 'cover'
  | 'contents'
  | 'directors_responsibilities'
  | 'directors_report'
  | 'independent_auditor'
  | 'corporate_information'
  | 'statement'
  | 'policy_group'
  | 'policy'
  | 'disclosure_note'
  | 'schedule'
  | 'signatures'
  | 'authorisation';

export type CompositionNodeKind =
  | DocumentSectionKind
  | 'phase'
  | 'table'
  | 'narrative'
  | 'cross_reference'
  | 'disclosure_component';

/** Publication formatting profile — metadata only; no hardcoded pixels in consumers. */
export type PublicationProfile = {
  pageBreakBefore: boolean;
  numberingMode: 'none' | 'arabic' | 'note_seq' | 'roman';
  headingLevel: 1 | 2 | 3;
  spacingAfter: 'tight' | 'normal' | 'loose' | 'section';
  runningHeaderMode: 'none' | 'standard' | 'section';
  includeInContents: boolean;
  contentsIndent: number;
};

export type StatementClassification =
  | 'non_current_assets'
  | 'current_assets'
  | 'equity'
  | 'non_current_liabilities'
  | 'current_liabilities'
  | 'revenue'
  | 'cost_of_sales'
  | 'gross_profit'
  | 'other_income'
  | 'operating_expenses'
  | 'finance_costs'
  | 'taxation'
  | 'profit'
  | 'other_comprehensive_income'
  | 'operating'
  | 'investing'
  | 'financing'
  | 'share_capital'
  | 'reserves'
  | 'retained_earnings'
  | 'other_equity'
  | 'header'
  | 'total'
  | 'unclassified';

export type PolicyDomain =
  | 'basis_of_preparation'
  | 'recognition'
  | 'measurement'
  | 'presentation'
  | 'derecognition'
  | 'classification'
  | 'judgements'
  | 'estimates'
  | 'other';

export type DisclosureComponentKind =
  | 'narrative'
  | 'movement_schedule'
  | 'reconciliation'
  | 'analysis_table'
  | 'supporting_table'
  | 'cross_reference';

/** V16.0 — Disclosure archetypes with rendering rules. */
export type DisclosureArchetype =
  | 'general'
  | 'policy_backed'
  | 'movement_schedule'
  | 'reconciliation'
  | 'age_analysis'
  | 'maturity_analysis'
  | 'sensitivity_analysis'
  | 'rollforward'
  | 'tax_reconciliation'
  | 'cash_flow_reconciliation'
  | 'equity_movement'
  | 'financial_instrument_categories'
  | 'related_party'
  | 'events_after_reporting';

/** V16.0 — Reusable disclosure component library kinds. */
export type DisclosureLibraryComponentKind =
  | 'heading'
  | 'subheading'
  | 'paragraph'
  | 'bullet_list'
  | 'definition'
  | 'policy_reference'
  | 'recognition_criteria'
  | 'measurement_basis'
  | 'judgement'
  | 'estimate'
  | 'narrative'
  | 'movement_table'
  | 'reconciliation_table'
  | 'category_table'
  | 'comparative_table'
  | 'totals'
  | 'signatures'
  | 'cross_reference_block'
  | 'framework_citation';

export type DisclosureLibraryComponent = {
  id: string;
  kind: 'library_component';
  componentKind: DisclosureLibraryComponentKind;
  text: string | null;
  bold?: boolean;
  title: string | null;
  rows: string[][] | null;
  items: string[] | null;
  targetNoteNumber: number | null;
  frameworkSection: string | null;
  policyCode: string | null;
};

/** V16.0 — Movement schedule column dimension (asset-agnostic). */
export type MovementColumnRole =
  | 'opening'
  | 'additions'
  | 'disposals'
  | 'transfers'
  | 'depreciation'
  | 'impairment'
  | 'revaluation'
  | 'foreign_exchange'
  | 'other_movements'
  | 'closing';

export type MovementScheduleRow = {
  rowCode: string;
  label: string;
  values: Partial<Record<MovementColumnRole, number | null>>;
  isTotal?: boolean;
};

/** V16.0 — Generic movement schedule (not asset-specific). */
export type MovementSchedule = {
  id: string;
  scheduleCode: string;
  title: string;
  categoryKey: string;
  columns: MovementColumnRole[];
  rows: MovementScheduleRow[];
  /** opening + movements = closing validation */
  validated: boolean;
  validationMessage: string | null;
  comparativeRows: MovementScheduleRow[] | null;
};

export type ReconciliationSchedule = {
  id: string;
  scheduleCode: string;
  title: string;
  openingBalance: number | null;
  closingBalance: number | null;
  reconcilingItems: Array<{ label: string; amount: number | null }>;
  validated: boolean;
  validationMessage: string | null;
};

export type AccountingEstimateBlock = {
  id: string;
  label: string;
  narrative: string;
  sensitivityRef: string | null;
};

export type JudgementBlock = {
  id: string;
  label: string;
  narrative: string;
  frameworkSection: string | null;
};

export type DisclosureCategoryMeta = {
  accountCategories: StatementClassification[];
  financialStatementLine: string | null;
  disclosureCategory: string;
  frameworkSection: string | null;
  presentationPriority: number;
  supportingScheduleCodes: string[];
  sourceLedgerAccounts: string[];
};

export type ComparativePeriodInfo = {
  currentPeriodLabel: string;
  priorPeriodLabel: string | null;
  hasRestatement: boolean;
  hasReclassification: boolean;
  isFirstTimeAdoption: boolean;
  comparativeNarratives: CompositionNarrative[];
  comparativeTables: CompositionTable[];
};

export type DisclosureValidationRule = {
  ruleCode: string;
  label: string;
  passed: boolean;
  message: string | null;
};

/** V16.0 — Structured enterprise disclosure object. */
export type EnterpriseDisclosureSection = {
  id: string;
  title: string | null;
  sortOrder: number;
  libraryComponents: DisclosureLibraryComponent[];
  narratives: CompositionNarrative[];
  tables: CompositionTable[];
};

export type EnterpriseDisclosureObject = {
  id: string;
  disclosureCode: string;
  archetype: DisclosureArchetype;
  title: string;
  noteNumber: number | null;
  heading: string | null;
  status: string;
  requirementLevel: string;
  sortOrder: number;
  source: 'engagement' | 'framework';
  links: DisclosureLinkSet;
  sections: EnterpriseDisclosureSection[];
  movementSchedules: MovementSchedule[];
  reconciliations: ReconciliationSchedule[];
  accountingEstimates: AccountingEstimateBlock[];
  judgements: JudgementBlock[];
  crossReferences: CompositionCrossReference[];
  validationRules: DisclosureValidationRule[];
  comparatives: ComparativePeriodInfo;
  category: DisclosureCategoryMeta;
  active: boolean;
};

export type CompositionCrossReference = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  displayNoteNumber: number | null;
};

export type CompositionNarrative = {
  id: string;
  kind: 'narrative';
  text: string;
  bold?: boolean;
};

export type CompositionTable = {
  id: string;
  kind: 'table';
  title: string;
  rows: string[][];
  componentKind: DisclosureComponentKind;
};

export type CompositionDisclosureComponent = {
  id: string;
  kind: 'disclosure_component';
  componentKind: DisclosureComponentKind;
  title: string | null;
  narratives: CompositionNarrative[];
  tables: CompositionTable[];
};

export type CompositionPolicy = {
  id: string;
  kind: 'policy';
  policyCode: string;
  title: string;
  body: string;
  domain: PolicyDomain;
  sortOrder: number;
  source: 'engagement' | 'framework';
  /** Policies appear once — never duplicated into disclosure notes. */
  uniqueKey: string;
};

export type CompositionDisclosureNote = {
  id: string;
  kind: 'disclosure_note';
  disclosureCode: string;
  title: string;
  /** Display number from final document assembly; null if excluded. */
  noteNumber: number | null;
  heading: string | null;
  status: string;
  requirementLevel: string;
  sortOrder: number;
  /** Statement / line / category / framework links. */
  links: DisclosureLinkSet;
  components: CompositionDisclosureComponent[];
  source: 'engagement' | 'framework';
};

export type DisclosureLinkSet = {
  statements: string[];
  statementLines: string[];
  accountCategories: StatementClassification[];
  frameworkSections: string[];
  policyCodes: string[];
  scheduleCodes: string[];
  validationRules: string[];
};

export type CompositionStatementLine = {
  lineCode: string;
  label: string;
  classification: StatementClassification;
  amount: number | null;
  priorAmount: number | null;
  noteRef: number | string | null;
  isHeader: boolean;
  isTotal: boolean;
  links: DisclosureLinkSet;
};

export type CompositionStatement = {
  id: string;
  kind: 'statement';
  statementType: string;
  title: string;
  periodCaption: string;
  populated: boolean;
  lines: CompositionStatementLine[];
  classificationGroups: Array<{
    classification: StatementClassification;
    label: string;
    lineCodes: string[];
  }>;
};

export type CompositionSection = {
  id: string;
  kind: DocumentSectionKind;
  title: string;
  phaseId: DocumentPhaseId;
  sortOrder: number;
  publication: PublicationProfile;
  /** Typed payload references. */
  statement?: CompositionStatement;
  policies?: CompositionPolicy[];
  note?: CompositionDisclosureNote;
  narratives?: CompositionNarrative[];
  /** V16.1 — Professional corporate information presentation rows. */
  corporatePresentation?: import('../corporateInformation/presentationTypes').CorporateInformationPresentation;
  active: boolean;
};

export type CompositionPhase = {
  id: DocumentPhaseId;
  kind: 'phase';
  phaseNumber: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  sortOrder: number;
  sections: CompositionSection[];
  publication: PublicationProfile;
};

/** Root composition document — the sole structure renderers should consume. */
export type CompositionDocument = {
  version: '16.0';
  title: string;
  companyName: string;
  frameworkKey: string | null;
  frameworkLabel: string;
  periodCaption: string;
  currencyLabel: string;
  phases: CompositionPhase[];
  /** Flat sequenced sections after conditional activation + ordering. */
  sequencedSections: CompositionSection[];
  /** Numbered disclosure notes only (policies excluded). */
  numberedNotes: CompositionDisclosureNote[];
  /** V16.0 — Structured enterprise disclosure objects (metadata-driven). */
  enterpriseDisclosures: EnterpriseDisclosureObject[];
  /** Deduplicated accounting policies (Phase 3). */
  accountingPolicies: CompositionPolicy[];
  /** Statement → disclosure automatic links. */
  disclosureLinks: Array<{
    statementType: string;
    lineCode: string;
    links: DisclosureLinkSet;
  }>;
  /** Note number map by disclosure code (final document). */
  noteNumberByCode: Record<string, number>;
  /** V16.0 — Conditional disclosure activation summary. */
  conditionalActivation: {
    activated: string[];
    suppressed: string[];
  };
  /** V16.0 — Document-level validation summary. */
  validationSummary: {
    passed: boolean;
    disclosureCount: number;
    movementScheduleCount: number;
    reconciliationCount: number;
    failedRules: string[];
  };
  /** Composition structure fingerprint. */
  compositionFingerprint: string;
  publicationHints: CompositionPublicationHints;
  /** V16.1 — Canonical corporate information model for all publication formats. */
  corporateInformation: CorporateInformationModel;
};

export type CompositionPublicationHints = {
  documentTitle: string;
  phaseOrder: DocumentPhaseId[];
  contentsEntries: Array<{
    label: string;
    sectionId: string;
    phaseId: DocumentPhaseId;
    indent: number;
  }>;
  typography: {
    sectionSpacing: number;
    noteSpacing: number;
    policySpacing: number;
    statementSpacing: number;
  };
  pageBreaks: {
    beforePrimaryStatements: boolean;
    beforeAccountingPolicies: boolean;
    beforeNotes: boolean;
    beforeSupplementary: boolean;
    beforeApproval: boolean;
    eachPrimaryStatement: boolean;
  };
  runningHeader: {
    left: 'company' | 'document';
    right: 'section' | 'period';
  };
  runningFooter: {
    showPageNumbers: boolean;
    showPeriod: boolean;
  };
};
