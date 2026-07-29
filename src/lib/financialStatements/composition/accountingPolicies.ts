/**
 * V15.0 — Accounting Policy Architecture.
 *
 * Accounting Policies are NOT disclosure notes.
 * They describe recognition, measurement, presentation, derecognition,
 * classification, judgements, and estimates.
 *
 * Policies exist independently, appear once, and are never duplicated into notes.
 */
import type { DocPolicyNode, DocPolicySetNode, DocNoteNode } from '../document/documentModel';
import { isPolicyNote, POLICY_NOTE_CODES } from '../document/documentModel';
import type { CompositionPolicy, PolicyDomain } from './types';

const DOMAIN_BY_CODE: Array<{ patterns: string[]; domain: PolicyDomain }> = [
  { patterns: ['BASIS', 'PREPARATION', 'GOING'], domain: 'basis_of_preparation' },
  { patterns: ['JUDGEMENT', 'JUDGMENT'], domain: 'judgements' },
  { patterns: ['ESTIMATE', 'CRITICAL'], domain: 'estimates' },
  { patterns: ['REVENUE', 'RECOGN'], domain: 'recognition' },
  { patterns: ['MEASURE', 'FAIR', 'COST', 'AMORT'], domain: 'measurement' },
  { patterns: ['PRESENT', 'OFFSET'], domain: 'presentation' },
  { patterns: ['DERECOG', 'DISPOSAL'], domain: 'derecognition' },
  { patterns: ['CLASSIF'], domain: 'classification' },
];

export function resolvePolicyDomain(policyCode: string, title: string): PolicyDomain {
  const hay = `${policyCode} ${title}`.toUpperCase();
  for (const row of DOMAIN_BY_CODE) {
    if (row.patterns.some((p) => hay.includes(p))) return row.domain;
  }
  return 'other';
}

/**
 * Codes that are policy vessels (legacy note that only hosts policy set bodies).
 * These are excluded from Phase 4 note numbering so policies appear once in Phase 3.
 */
export function isAccountingPolicyNoteCode(code: string): boolean {
  return POLICY_NOTE_CODES.includes(String(code || '').toUpperCase());
}

/**
 * Build the unique policy catalogue for Phase 3.
 * Deduplicates by policy_code — policies appear exactly once.
 */
export function assembleAccountingPolicies(
  policySets: DocPolicySetNode[],
  overridesHidden?: Set<string>,
): CompositionPolicy[] {
  const seen = new Set<string>();
  const out: CompositionPolicy[] = [];

  for (const set of policySets) {
    const policies = [...(set.policies || [])].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    for (const p of policies) {
      if (overridesHidden?.has(p.id)) continue;
      if (p.status === 'superseded') continue;
      const uniqueKey = String(p.policy_code || p.id).toUpperCase();
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);
      out.push(mapPolicy(p));
    }
  }

  return out;
}

function mapPolicy(p: DocPolicyNode): CompositionPolicy {
  return {
    id: p.id,
    kind: 'policy',
    policyCode: p.policy_code,
    title: p.title,
    body: p.body || '',
    domain: resolvePolicyDomain(p.policy_code, p.title),
    sortOrder: p.sort_order ?? 0,
    source: p.source || 'framework',
    uniqueKey: String(p.policy_code || p.id).toUpperCase(),
  };
}

/**
 * Group policies into professional policy domains for Phase 3 sections.
 */
export function groupPoliciesByDomain(policies: CompositionPolicy[]): Array<{
  domain: PolicyDomain;
  title: string;
  policies: CompositionPolicy[];
}> {
  const titles: Record<PolicyDomain, string> = {
    basis_of_preparation: 'Basis of Preparation',
    recognition: 'Recognition',
    measurement: 'Measurement',
    presentation: 'Presentation',
    derecognition: 'Derecognition',
    classification: 'Classification',
    judgements: 'Critical Judgements',
    estimates: 'Accounting Estimates',
    other: 'Significant Accounting Policies',
  };

  const order: PolicyDomain[] = [
    'basis_of_preparation',
    'judgements',
    'estimates',
    'recognition',
    'measurement',
    'presentation',
    'derecognition',
    'classification',
    'other',
  ];

  const byDomain = new Map<PolicyDomain, CompositionPolicy[]>();
  for (const p of policies) {
    const list = byDomain.get(p.domain) || [];
    list.push(p);
    byDomain.set(p.domain, list);
  }

  // Collapse sparse technical domains into Significant Accounting Policies for presentation
  const significant: CompositionPolicy[] = [];
  for (const domain of ['recognition', 'measurement', 'presentation', 'derecognition', 'classification', 'other'] as PolicyDomain[]) {
    significant.push(...(byDomain.get(domain) || []));
  }

  const groups: Array<{ domain: PolicyDomain; title: string; policies: CompositionPolicy[] }> = [];
  for (const domain of order) {
    if (
      domain === 'recognition' ||
      domain === 'measurement' ||
      domain === 'presentation' ||
      domain === 'derecognition' ||
      domain === 'classification' ||
      domain === 'other'
    ) {
      continue;
    }
    const list = byDomain.get(domain) || [];
    if (list.length) groups.push({ domain, title: titles[domain], policies: list });
  }
  if (significant.length) {
    groups.push({
      domain: 'other',
      title: titles.other,
      policies: significant.sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }
  return groups;
}

/** Filter notes that are policy vessels (must not be numbered as disclosures). */
export function excludePolicyNotes(notes: DocNoteNode[]): DocNoteNode[] {
  return notes.filter((n) => !isPolicyNote(n) && !isAccountingPolicyNoteCode(n.disclosure_code));
}

/** Notes that carry policy-class content (excluded from Phase 4 numbering). */
export function policyClassNotes(notes: DocNoteNode[]): DocNoteNode[] {
  return notes.filter((n) => isPolicyNote(n) || isAccountingPolicyNoteCode(n.disclosure_code));
}
