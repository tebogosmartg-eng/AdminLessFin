/**
 * AdminLess Fin V16.3 — Asset Health Engine (deterministic; AI-ready).
 * Does not post journals or alter depreciation.
 */

export type AssetHealthRisk = 'low' | 'medium' | 'high' | 'critical';

export type AssetHealthInput = {
  assetId: string;
  purchaseDate: string;
  usefulLifeYears: number | null;
  purchaseCost: number;
  netBookValue: number;
  impairmentAmount?: number;
  verificationStatus?: string | null;
  nextVerificationDue?: string | null;
  maintenanceEventsLast12m?: number;
  repairCostLast12m?: number;
  downtimeHoursLast12m?: number;
  status?: string;
};

export type AssetHealthResult = {
  assetId: string;
  healthPercent: number;
  riskRating: AssetHealthRisk;
  recommendedAction: string;
  factors: { label: string; score: number; weight: number }[];
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export function calculateAssetHealth(input: AssetHealthInput): AssetHealthResult {
  const ageYears =
    (Date.now() - new Date(input.purchaseDate).getTime()) / (365.25 * 24 * 3600 * 1000);
  const life = input.usefulLifeYears && input.usefulLifeYears > 0 ? input.usefulLifeYears : 5;
  const lifeRemainingRatio = clamp(1 - ageYears / life, 0, 1);

  const ageScore = lifeRemainingRatio * 100;
  const nbvRatio = input.purchaseCost > 0 ? input.netBookValue / input.purchaseCost : 1;
  const nbvScore = clamp(nbvRatio * 100);

  let verificationScore = 80;
  if (input.verificationStatus === 'verified') verificationScore = 100;
  else if (input.verificationStatus === 'overdue' || input.verificationStatus === 'disputed')
    verificationScore = 30;
  else if (input.verificationStatus === 'unverified') verificationScore = 55;
  if (input.nextVerificationDue && new Date(input.nextVerificationDue) < new Date()) {
    verificationScore = Math.min(verificationScore, 35);
  }

  const maintCount = input.maintenanceEventsLast12m ?? 0;
  const repairCost = input.repairCostLast12m ?? 0;
  const downtime = input.downtimeHoursLast12m ?? 0;
  const maintScore = clamp(
    100 - maintCount * 8 - (input.purchaseCost > 0 ? (repairCost / input.purchaseCost) * 100 : 0) - downtime * 0.5
  );

  const impairmentScore =
    (input.impairmentAmount ?? 0) > 0
      ? clamp(100 - ((input.impairmentAmount ?? 0) / Math.max(input.purchaseCost, 1)) * 200)
      : 100;

  const factors = [
    { label: 'Useful life remaining', score: ageScore, weight: 0.3 },
    { label: 'Net book value', score: nbvScore, weight: 0.2 },
    { label: 'Verification', score: verificationScore, weight: 0.15 },
    { label: 'Maintenance / downtime', score: maintScore, weight: 0.25 },
    { label: 'Impairment indicators', score: impairmentScore, weight: 0.1 },
  ];

  let healthPercent = factors.reduce((s, f) => s + f.score * f.weight, 0);
  if (input.status === 'disposed') healthPercent = 0;
  if (input.status === 'fully-depreciated') healthPercent = Math.min(healthPercent, 40);
  healthPercent = Math.round(clamp(healthPercent));

  let riskRating: AssetHealthRisk = 'low';
  if (healthPercent < 35) riskRating = 'critical';
  else if (healthPercent < 55) riskRating = 'high';
  else if (healthPercent < 75) riskRating = 'medium';

  const recommendedAction =
    riskRating === 'critical'
      ? 'Prioritise replacement or major overhaul; review impairment.'
      : riskRating === 'high'
        ? 'Schedule inspection and maintenance; consider replacement forecast.'
        : riskRating === 'medium'
          ? 'Monitor verification and service schedule.'
          : 'Continue standard operating cadence.';

  return {
    assetId: input.assetId,
    healthPercent,
    riskRating,
    recommendedAction,
    factors,
  };
}

export const ASSET_HEALTH_AI_HOOKS = [
  'predictive_failure',
  'optimal_replacement_window',
  'anomaly_detection',
] as const;
