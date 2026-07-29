/**
 * V17.0 — Disclosure Ordering Engine.
 *
 * Determines disclosure order using framework requirements, face statement references,
 * materiality, entity profile, and presentation priority. No hardcoded ordering.
 */
import { noteSortOrder } from '../framework/knowledgeRepository/assets/noteOrdering';
import type { DisclosureDecision, EntityProfile, MaterialityAssessment, OrderingFactor } from './types';

const PROFILE_PRIORITY_BOOST: Record<string, Record<string, number>> = {
  retail: { 'DISC.INVENTORIES': -50, 'DISC.RECEIVABLES': -30, 'DISC.REVENUE': -40 },
  manufacturing: { 'DISC.PPE': -60, 'DISC.INVENTORIES': -40, 'DISC.REVENUE': -30 },
  service: { 'DISC.RECEIVABLES': -40, 'DISC.REVENUE': -50 },
  professional_practice: { 'DISC.RECEIVABLES': -30, 'DISC.REVENUE': -40 },
  agriculture: { 'DISC.BIOLOGICAL': -80, 'DISC.PPE': -40 },
  construction: { 'DISC.PPE': -50, 'DISC.REVENUE': -30 },
  npo: { 'DISC.GRANTS': -60, 'DISC.REVENUE': -40 },
  general: {},
};

const FACE_STATEMENT_REF: Record<string, number> = {
  'DISC.PPE': 100,
  'DISC.INVENTORIES': 110,
  'DISC.RECEIVABLES': 120,
  'DISC.CASHFLOW': 130,
  'DISC.BORROWINGS': 140,
  'DISC.PAYABLES': 150,
  'DISC.TAX': 160,
  'DISC.SHARECAPITAL': 170,
};

const MATERIALITY_WEIGHT: Record<string, number> = {
  mandatory: -100,
  framework_required: -90,
  material: -50,
  conditional: 0,
  immaterial: 50,
  zero_balance: 1000,
  entity_specific: -30,
  future_use: 200,
};

function computeOrderingFactor(
  code: string,
  profile: EntityProfile,
  materiality: MaterialityAssessment | undefined,
  decision: DisclosureDecision | undefined,
): OrderingFactor {
  const frameworkOrder = noteSortOrder(code);
  const matClass = materiality?.materiality ?? 'conditional';
  const materialityWeight = MATERIALITY_WEIGHT[matClass] ?? 0;
  const profileBoost = PROFILE_PRIORITY_BOOST[profile.industry]?.[code] ?? 0;
  const faceStatementRef = FACE_STATEMENT_REF[code] ?? 500;

  let profileWeight = profileBoost;
  if (profile.size === 'investment_entity' || profile.size === 'holding_company') {
    if (/INVEST|ASSOCIATE|SUBSIDIAR/i.test(code)) profileWeight -= 80;
  }
  if (decision?.shouldExpand) profileWeight -= 20;
  if (decision?.shouldSuppress) profileWeight += 500;

  const finalOrder =
    frameworkOrder + materialityWeight + profileWeight + Math.floor(faceStatementRef / 10);

  return {
    code,
    frameworkOrder,
    materialityWeight,
    profileWeight,
    faceStatementRef,
    finalOrder,
  };
}

/** Order disclosure codes using intelligence factors. */
export function orderDisclosures(
  disclosureCodes: string[],
  profile: EntityProfile,
  materiality: MaterialityAssessment[],
  decisions: DisclosureDecision[],
): { orderedCodes: string[]; factors: OrderingFactor[] } {
  const materialityByCode = new Map(materiality.map((m) => [m.disclosureCode, m]));
  const decisionByCode = new Map(decisions.map((d) => [d.disclosureCode, d]));

  const activeCodes = disclosureCodes.filter((code) => {
    const decision = decisionByCode.get(code);
    return decision?.exists !== false && !decision?.shouldSuppress;
  });

  const factors = activeCodes.map((code) =>
    computeOrderingFactor(
      code,
      profile,
      materialityByCode.get(code),
      decisionByCode.get(code),
    ),
  );

  factors.sort((a, b) => a.finalOrder - b.finalOrder || a.code.localeCompare(b.code));

  return {
    orderedCodes: factors.map((f) => f.code),
    factors,
  };
}

/** Re-order composition note sections according to intelligence ordering. */
export function applyOrderingToNoteSections<T extends { disclosureCode: string; sortOrder: number }>(
  notes: T[],
  orderedCodes: string[],
): T[] {
  const orderMap = new Map(orderedCodes.map((code, idx) => [code, (idx + 1) * 10]));
  return [...notes]
    .map((note) => ({
      ...note,
      sortOrder: orderMap.get(note.disclosureCode) ?? note.sortOrder + 10000,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
