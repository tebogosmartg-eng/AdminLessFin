/**
 * Enterprise Reporting Knowledge Repository — canonical knowledge model (V14.2).
 *
 * Additive extensions to the Framework Content Library contract. Existing
 * Framework* types remain the runtime shape consumed by the Framework Content
 * Engine; Knowledge* types carry repository metadata (versioning, checklist
 * traceability, presentation, applicability) without changing engine behaviour.
 */

export type FrameworkKey = 'IFRS' | 'IFRS_SME' | 'GRAP' | 'IPSAS';

export type FrameworkRequirement = 'mandatory' | 'optional';

export type DisclosureClass = 'required' | 'conditional' | 'optional';

export type DisclosureCategory =
  | 'general'
  | 'presentation'
  | 'accounting_policy'
  | 'statement_note'
  | 'financial_instrument'
  | 'related_party'
  | 'contingency'
  | 'subsequent_event'
  | 'industry'
  | 'other';

/** Maps a disclosure-table row to a trial-balance / statement fact line code. */
export type FrameworkFactMapping = {
  label: string;
  line_code: string;
  comparative_line_code?: string;
};

export type FrameworkTableDef = {
  title: string;
  caption?: string;
  columns: string[];
  factMappings?: FrameworkFactMapping[];
  manualRows?: string[];
};

export type FrameworkPolicyDef = {
  code: string;
  title: string;
  body: string;
  recognition?: string;
  initialMeasurement?: string;
  subsequentMeasurement?: string;
  derecognition?: string;
  judgements?: string;
  estimates?: string;
  presentation?: string;
  standards?: string[];
  /** Repository metadata — framework version that owns this policy. */
  frameworkVersion?: string;
  /** Section / standard paragraph references for certification. */
  sectionReferences?: string[];
  /** Checklist requirement ids (certification only; not runtime PDF). */
  checklistRefs?: string[];
};

export type PresentationHints = {
  /** Preferred note sort order within the notes section (lower first). */
  sortOrder?: number;
  /** Whether the note typically appears before primary statements. */
  frontMatter?: boolean;
  /** Suggested heading style for publication. */
  headingStyle?: 'note' | 'policy' | 'schedule';
};

/**
 * Structured disclosure knowledge object. Extends the engine-facing note
 * definition with repository metadata. All new fields are optional so the
 * Framework Content Engine continues to consume the same runtime shape.
 */
export type FrameworkNoteDef = {
  code: string;
  title: string;
  requirement: FrameworkRequirement;
  disclosureClass?: DisclosureClass;
  purpose?: string;
  conditionKey?: string;
  narrative?: string;
  narratives?: string[];
  table?: FrameworkTableDef;
  tables?: FrameworkTableDef[];
  crossReferences?: string[];
  dependencies?: string[];
  standards?: string[];

  // ── V14.2 Knowledge Repository metadata (additive) ─────────────────────────
  /** Framework key that owns this disclosure (set by pack assembly). */
  framework?: FrameworkKey;
  /** Pack version id, e.g. '2026.1'. */
  frameworkVersion?: string;
  /** Framework section reference(s), e.g. 'IFRS for SMEs Section 17'. */
  sectionReferences?: string[];
  /** Disclosure category for repository navigation. */
  category?: DisclosureCategory;
  /** Accounting policy codes referenced by this disclosure. */
  policyReferences?: string[];
  /** Certification checklist requirement ids (never loaded from PDF at runtime). */
  checklistRefs?: string[];
  /** Validation rule codes that assert completeness of this disclosure. */
  validationRules?: string[];
  /** Industry applicability tags (empty = all industries). */
  industryApplicability?: string[];
  /** Entity-form applicability (e.g. company, partnership, trust). */
  entityApplicability?: string[];
  /** Presentation / ordering hints for publication. */
  presentationHints?: PresentationHints;
  /** Professional wording register key into the terminology asset. */
  terminologyKey?: string;
};

export type FrameworkStatementDef = {
  statement_type: string;
  title: string;
  purpose?: string;
  frameworkVersion?: string;
  checklistRefs?: string[];
  presentationHints?: PresentationHints;
};

export type FrameworkExtensionPoint = {
  code: string;
  title: string;
  description: string;
  conditionKey: string;
  notes?: FrameworkNoteDef[];
  industryApplicability?: string[];
};

export type FrameworkDefinition = {
  key: FrameworkKey;
  label: string;
  scope: string;
  statements: FrameworkStatementDef[];
  policies: FrameworkPolicyDef[];
  notes: FrameworkNoteDef[];
  extensionPoints: FrameworkExtensionPoint[];
  /** Pack version bound to this definition (repository versioning). */
  versionId?: string;
  /** Content URI aligned with efs_framework_packs.content_ref. */
  contentRef?: string;
};

/** Versioned framework pack registered in the Knowledge Repository. */
export type FrameworkKnowledgePack = {
  key: FrameworkKey;
  versionId: string;
  label: string;
  scope: string;
  contentRef: string;
  status: 'active' | 'draft' | 'superseded';
  definition: FrameworkDefinition;
  /** Certification asset ids linked to this pack. */
  certificationAssets?: string[];
};

/** Structured checklist requirement used only for certification traceability. */
export type ChecklistRequirement = {
  id: string;
  /** ED / Standard paragraph, e.g. '16.29'. */
  paragraph: string;
  section: string;
  title: string;
  /** Repository disclosure codes that satisfy this requirement. */
  disclosureCodes: string[];
  /** Coverage status against the current repository. */
  coverage: 'implemented' | 'partial' | 'not_implemented' | 'not_applicable';
};

export type DisclosureConditionMap = Record<string, boolean>;
