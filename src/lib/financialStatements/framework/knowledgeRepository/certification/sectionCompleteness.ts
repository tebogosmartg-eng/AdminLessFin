/**
 * IFRS for SMEs Section Completeness Matrix (V14.3).
 *
 * A section is COMPLETE only when every applicable completeness criterion is met
 * against the Knowledge Repository pack. No overall percentage is produced.
 */
import { getFrameworkDefinition } from '../registry';
import type { FrameworkNoteDef, FrameworkPolicyDef } from '../types';

export type SectionStatus = 'COMPLETE' | 'PARTIAL' | 'NOT_APPLICABLE';

export type SectionCriterion =
  | 'accounting_policies'
  | 'disclosure_definitions'
  | 'professional_narratives'
  | 'tables'
  | 'trial_balance_mapping'
  | 'validation_rules'
  | 'conditional_logic'
  | 'cross_references'
  | 'repository_metadata'
  | 'certification_mapping';

export type SectionCompletenessRow = {
  section: number;
  title: string;
  status: SectionStatus;
  policyCodes: string[];
  disclosureCodes: string[];
  missing: SectionCriterion[];
};

const CRITERIA: SectionCriterion[] = [
  'accounting_policies',
  'disclosure_definitions',
  'professional_narratives',
  'tables',
  'trial_balance_mapping',
  'validation_rules',
  'conditional_logic',
  'cross_references',
  'repository_metadata',
  'certification_mapping',
];

type SectionSpec = {
  section: number;
  title: string;
  /** Conceptual / out-of-scope for AFS knowledge content. */
  notApplicable?: boolean;
  policyCodes?: string[];
  disclosureCodes?: string[];
  /** Presentation sections satisfied by statement defs + supporting notes. */
  presentationSection?: boolean;
  /** Whether tables are required (false for narrative-only sections). */
  requiresTables?: boolean;
  /** Whether TB mapping is required when tables exist. */
  requiresTbMapping?: boolean;
};

/**
 * IFRS for SMEs Standard sections (1–35) mapped to repository artefacts.
 */
export const IFRS_SME_SECTION_SPECS: SectionSpec[] = [
  { section: 1, title: 'Small and Medium-sized Entities', notApplicable: true },
  { section: 2, title: 'Concepts and Pervasive Principles', notApplicable: true },
  {
    section: 3,
    title: 'Financial Statement Presentation',
    policyCodes: ['POL.BASIS'],
    disclosureCodes: ['DISC.GENERAL', 'DISC.BASIS', 'DISC.GOINGCONCERN', 'DISC.CAPITAL'],
    presentationSection: true,
    requiresTables: false,
    requiresTbMapping: false,
  },
  {
    section: 4,
    title: 'Statement of Financial Position',
    policyCodes: ['POL.BASIS', 'POL.EQUITY'],
    disclosureCodes: ['DISC.SHARECAPITAL', 'DISC.PPE'],
    presentationSection: true,
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 5,
    title: 'Statement of Comprehensive Income and Income Statement',
    policyCodes: ['POL.BASIS', 'POL.REVENUE'],
    disclosureCodes: ['DISC.REVENUE', 'DISC.TAX', 'DISC.DISCONTINUED'],
    presentationSection: true,
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 6,
    title: 'Statement of Changes in Equity and Statement of Income and Retained Earnings',
    policyCodes: ['POL.EQUITY'],
    disclosureCodes: ['DISC.SHARECAPITAL'],
    presentationSection: true,
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 7,
    title: 'Statement of Cash Flows',
    policyCodes: ['POL.BASIS'],
    disclosureCodes: ['DISC.CASHFLOW'],
    presentationSection: true,
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 8,
    title: 'Notes to the Financial Statements',
    policyCodes: ['POL.BASIS'],
    disclosureCodes: ['DISC.POLICIES', 'DISC.JUDGEMENTS'],
    requiresTables: false,
    requiresTbMapping: false,
  },
  {
    section: 9,
    title: 'Consolidated and Separate Financial Statements',
    policyCodes: ['POL.CONSOLIDATION'],
    disclosureCodes: ['DISC.CONSOLIDATION'],
    requiresTables: false,
    requiresTbMapping: false,
  },
  {
    section: 10,
    title: 'Accounting Policies, Estimates and Errors',
    policyCodes: ['POL.BASIS'],
    disclosureCodes: ['DISC.POLICIES', 'DISC.JUDGEMENTS', 'DISC.POLICYCHANGES'],
    requiresTables: true,
    requiresTbMapping: false,
  },
  {
    section: 11,
    title: 'Basic Financial Instruments',
    policyCodes: ['POL.FININST'],
    disclosureCodes: ['DISC.FININST', 'DISC.RECEIVABLES', 'DISC.PAYABLES', 'DISC.BORROWINGS'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 12,
    title: 'Other Financial Instruments Issues',
    policyCodes: ['POL.FININST'],
    disclosureCodes: ['DISC.FININST'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 13,
    title: 'Inventories',
    policyCodes: ['POL.INVENTORY'],
    disclosureCodes: ['DISC.INVENTORIES'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 14,
    title: 'Investments in Associates',
    policyCodes: ['POL.ASSOCIATES'],
    disclosureCodes: ['DISC.ASSOCIATES'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 15,
    title: 'Investments in Joint Ventures',
    policyCodes: ['POL.JOINTVENTURES'],
    disclosureCodes: ['DISC.JOINTVENTURES'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 16,
    title: 'Investment Property',
    policyCodes: ['POL.INVPROP'],
    disclosureCodes: ['DISC.INVPROP'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 17,
    title: 'Property, Plant and Equipment',
    policyCodes: ['POL.PPE'],
    disclosureCodes: ['DISC.PPE', 'DISC.COMMITMENTS'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 18,
    title: 'Intangible Assets other than Goodwill',
    policyCodes: ['POL.INTANGIBLES'],
    disclosureCodes: ['DISC.INTANGIBLES'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 19,
    title: 'Business Combinations and Goodwill',
    policyCodes: ['POL.BUSCOMB'],
    disclosureCodes: ['DISC.BUSCOMB'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 20,
    title: 'Leases',
    policyCodes: ['POL.LEASES'],
    disclosureCodes: ['DISC.LEASES'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 21,
    title: 'Provisions and Contingencies',
    policyCodes: ['POL.PROVISIONS'],
    disclosureCodes: ['DISC.PROVISIONS', 'DISC.CONTINGENT'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 22,
    title: 'Liabilities and Equity',
    policyCodes: ['POL.EQUITY'],
    disclosureCodes: ['DISC.SHARECAPITAL'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 23,
    title: 'Revenue',
    policyCodes: ['POL.REVENUE'],
    disclosureCodes: ['DISC.REVENUE'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 24,
    title: 'Government Grants',
    policyCodes: ['POL.GRANTS'],
    disclosureCodes: ['DISC.GRANTS'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 25,
    title: 'Borrowing Costs',
    policyCodes: ['POL.BORROWINGCOST'],
    disclosureCodes: ['DISC.BORROWINGCOST'],
    requiresTables: false,
    requiresTbMapping: false,
  },
  {
    section: 26,
    title: 'Share-based Payment',
    policyCodes: ['POL.SBP'],
    disclosureCodes: ['DISC.SBP'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 27,
    title: 'Impairment of Assets',
    policyCodes: ['POL.IMPAIRMENT'],
    disclosureCodes: ['DISC.IMPAIRMENT'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 28,
    title: 'Employee Benefits',
    policyCodes: ['POL.EMPLOYEE'],
    disclosureCodes: ['DISC.EMPLOYEE'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 29,
    title: 'Income Tax',
    policyCodes: ['POL.TAX'],
    disclosureCodes: ['DISC.TAX'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 30,
    title: 'Foreign Currency Translation',
    policyCodes: ['POL.FOREX'],
    disclosureCodes: ['DISC.FOREX'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 31,
    title: 'Hyperinflation',
    policyCodes: ['POL.HYPERINFLATION'],
    disclosureCodes: ['DISC.HYPERINFLATION'],
    requiresTables: false,
    requiresTbMapping: false,
  },
  {
    section: 32,
    title: 'Events after the End of the Reporting Period',
    policyCodes: ['POL.BASIS'],
    disclosureCodes: ['DISC.EVENTS'],
    requiresTables: false,
    requiresTbMapping: false,
  },
  {
    section: 33,
    title: 'Related Party Disclosures',
    policyCodes: ['POL.BASIS'],
    disclosureCodes: ['DISC.RELATED'],
    requiresTables: true,
    requiresTbMapping: false,
  },
  {
    section: 34,
    title: 'Specialised Activities',
    policyCodes: [],
    disclosureCodes: ['DISC.BIOLOGICAL'],
    requiresTables: true,
    requiresTbMapping: true,
  },
  {
    section: 35,
    title: 'Transition to the IFRS for SMEs',
    policyCodes: ['POL.BASIS'],
    disclosureCodes: ['DISC.TRANSITION'],
    requiresTables: true,
    requiresTbMapping: false,
  },
];

function hasNarrative(n: FrameworkNoteDef): boolean {
  return Boolean((n.narrative && n.narrative.trim()) || (n.narratives && n.narratives.length > 0));
}

function noteTables(n: FrameworkNoteDef) {
  return [...(n.table ? [n.table] : []), ...(n.tables || [])];
}

function hasTbMapping(n: FrameworkNoteDef): boolean {
  return noteTables(n).some((t) => (t.factMappings || []).length > 0);
}

function hasTables(n: FrameworkNoteDef): boolean {
  return noteTables(n).length > 0;
}

function isProfessionalPolicy(p: FrameworkPolicyDef): boolean {
  const body = p.body || '';
  if (!body || body.length < 40) return false;
  if (/lorem ipsum|TODO|TBD|placeholder|\[ — \]/i.test(body)) return false;
  // Must not cite full IFRS revenue/lease standards for SME policies
  if (p.code === 'POL.REVENUE' && /IFRS 15/i.test((p.standards || []).join(' '))) return false;
  if (p.code === 'POL.LEASES' && /IFRS 16/i.test((p.standards || []).join(' '))) return false;
  return (p.standards || []).some((s) => /IFRS for SMEs/i.test(s)) || p.code === 'POL.BASIS';
}

function evaluateSection(
  spec: SectionSpec,
  policies: Map<string, FrameworkPolicyDef>,
  notes: Map<string, FrameworkNoteDef>,
  statementTypes: Set<string>,
): SectionCompletenessRow {
  if (spec.notApplicable) {
    return {
      section: spec.section,
      title: spec.title,
      status: 'NOT_APPLICABLE',
      policyCodes: [],
      disclosureCodes: [],
      missing: [],
    };
  }

  const missing: SectionCriterion[] = [];
  const policyCodes = spec.policyCodes || [];
  const disclosureCodes = spec.disclosureCodes || [];
  const sectionNotes = disclosureCodes.map((c) => notes.get(c)).filter(Boolean) as FrameworkNoteDef[];
  const sectionPolicies = policyCodes.map((c) => policies.get(c)).filter(Boolean) as FrameworkPolicyDef[];

  // accounting policies
  if (policyCodes.length === 0) {
    if (spec.section !== 34) missing.push('accounting_policies');
  } else if (sectionPolicies.length < policyCodes.length || !sectionPolicies.every(isProfessionalPolicy)) {
    missing.push('accounting_policies');
  }

  // disclosure definitions
  if (disclosureCodes.length === 0 || sectionNotes.length < disclosureCodes.length) {
    missing.push('disclosure_definitions');
  }

  // narratives
  if (!sectionNotes.length || !sectionNotes.every(hasNarrative)) {
    missing.push('professional_narratives');
  }

  // tables
  const requiresTables = spec.requiresTables !== false;
  if (requiresTables) {
    if (!sectionNotes.some(hasTables)) missing.push('tables');
  }

  // TB mapping
  const requiresTb = spec.requiresTbMapping === true;
  if (requiresTb) {
    if (!sectionNotes.some(hasTbMapping)) missing.push('trial_balance_mapping');
  }

  // validation rules
  if (!sectionNotes.every((n) => (n.validationRules || []).length > 0)) {
    missing.push('validation_rules');
  }

  // conditional logic — every optional/conditional note must have conditionKey;
  // required notes satisfy the criterion by disclosureClass required
  const condOk = sectionNotes.every((n) => {
    if (n.disclosureClass === 'required' || n.requirement === 'mandatory') return true;
    return Boolean(n.conditionKey);
  });
  if (!condOk) missing.push('conditional_logic');

  // cross references — at least one note in the section carries crossRefs or dependencies,
  // or presentation sections linked via statements
  const xrefOk =
    sectionNotes.some(
      (n) =>
        (n.crossReferences || []).length > 0 ||
        (n.dependencies || []).length > 0 ||
        (n.policyReferences || []).length > 0,
    ) || Boolean(spec.presentationSection && statementTypes.size >= 4);
  if (!xrefOk) missing.push('cross_references');

  // repository metadata
  const metaOk = sectionNotes.every(
    (n) =>
      Boolean(n.frameworkVersion || n.sectionReferences?.length || n.category || n.presentationHints) &&
      Boolean(n.purpose),
  );
  if (!metaOk) missing.push('repository_metadata');

  // certification mapping
  const certOk = sectionNotes.every((n) => (n.checklistRefs || []).length > 0);
  if (!certOk) missing.push('certification_mapping');

  // Presentation sections also require the four primary statements to exist
  if (spec.presentationSection) {
    const needed = ['financial_position', 'financial_performance', 'changes_in_equity', 'cash_flows'];
    if (!needed.every((t) => statementTypes.has(t))) {
      if (!missing.includes('disclosure_definitions')) missing.push('disclosure_definitions');
    }
  }

  // Deduplicate missing against only applicable criteria
  const applicable = new Set<SectionCriterion>(CRITERIA);
  if (spec.requiresTables === false) applicable.delete('tables');
  if (spec.requiresTbMapping === false) applicable.delete('trial_balance_mapping');
  if (spec.section === 34 && policyCodes.length === 0) applicable.delete('accounting_policies');

  const filtered = missing.filter((m) => applicable.has(m));

  return {
    section: spec.section,
    title: spec.title,
    status: filtered.length === 0 ? 'COMPLETE' : 'PARTIAL',
    policyCodes,
    disclosureCodes,
    missing: filtered,
  };
}

export function evaluateIfrsSmeSectionCompleteness(): SectionCompletenessRow[] {
  const def = getFrameworkDefinition('IFRS_SME');
  const policies = new Map(def.policies.map((p) => [p.code, p]));
  const notes = new Map(def.notes.map((n) => [n.code, n]));
  // Include extension notes for specialised activities
  for (const ext of def.extensionPoints) {
    for (const n of ext.notes || []) notes.set(n.code, n);
  }
  const statementTypes = new Set(def.statements.map((s) => s.statement_type));

  return IFRS_SME_SECTION_SPECS.map((spec) => evaluateSection(spec, policies, notes, statementTypes));
}

/** Format matrix lines: "Section N .... STATUS" */
export function formatSectionCompletenessMatrix(
  rows: SectionCompletenessRow[] = evaluateIfrsSmeSectionCompleteness(),
): string[] {
  return rows.map((r) => {
    const label = `Section ${r.section}`.padEnd(12, '.');
    return `${label} ${r.status}`;
  });
}
