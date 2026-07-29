/**
 * AdminLess Fin V16.2 — Asset Intelligence (architecture only).
 * No AI model calls. Prepares insight contracts for future activation.
 */

export type AssetIntelligenceInsightKind =
  | 'useful_life_anomaly'
  | 'replacement_recommendation'
  | 'verification_reminder'
  | 'impairment_indicator'
  | 'maintenance_risk';

export type AssetIntelligenceInsight = {
  kind: AssetIntelligenceInsightKind;
  assetId: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  summary: string;
  recommendedAction?: string;
  score?: number;
};

export type AssetIntelligenceContext = {
  assetId: string;
  purchaseCost: number;
  netBookValue: number;
  usefulLifeYears: number | null;
  ageYears: number;
  verificationStatus?: string | null;
  nextVerificationDue?: string | null;
  impairmentAmount?: number;
  maintenanceCostYtd?: number;
  downtimeHoursYtd?: number;
  lastServiceDate?: string | null;
};

/**
 * Deterministic heuristic stubs — replace with model-backed scoring later.
 * Safe to call from UI; returns empty when data is incomplete.
 */
export function evaluateAssetIntelligence(
  ctx: AssetIntelligenceContext
): AssetIntelligenceInsight[] {
  const insights: AssetIntelligenceInsight[] = [];

  if (ctx.usefulLifeYears && ctx.ageYears > ctx.usefulLifeYears * 0.85) {
    insights.push({
      kind: 'useful_life_anomaly',
      assetId: ctx.assetId,
      severity: ctx.ageYears >= ctx.usefulLifeYears ? 'critical' : 'warning',
      title: 'Useful life nearing exhaustion',
      summary: `Asset age (${ctx.ageYears.toFixed(1)}y) is approaching configured life (${ctx.usefulLifeYears}y).`,
      recommendedAction: 'Review residual value and plan replacement or life extension.',
      score: Math.min(1, ctx.ageYears / ctx.usefulLifeYears),
    });
  }

  if (ctx.netBookValue > 0 && ctx.netBookValue / Math.max(ctx.purchaseCost, 1) < 0.15) {
    insights.push({
      kind: 'replacement_recommendation',
      assetId: ctx.assetId,
      severity: 'info',
      title: 'Low remaining book value',
      summary: 'Net book value is below 15% of acquisition cost.',
      recommendedAction: 'Evaluate replacement vs. continued use.',
      score: 1 - ctx.netBookValue / Math.max(ctx.purchaseCost, 1),
    });
  }

  if (
    ctx.verificationStatus === 'overdue' ||
    (ctx.nextVerificationDue && new Date(ctx.nextVerificationDue) < new Date())
  ) {
    insights.push({
      kind: 'verification_reminder',
      assetId: ctx.assetId,
      severity: 'warning',
      title: 'Verification overdue or due',
      summary: 'Physical verification window requires attention.',
      recommendedAction: 'Schedule verification and update register status.',
    });
  }

  if ((ctx.impairmentAmount ?? 0) > 0 || ctx.netBookValue > ctx.purchaseCost * 0.9 && ctx.ageYears > 3) {
    if ((ctx.impairmentAmount ?? 0) > 0) {
      insights.push({
        kind: 'impairment_indicator',
        assetId: ctx.assetId,
        severity: 'warning',
        title: 'Impairment recorded',
        summary: `Impairment of ${ctx.impairmentAmount} is on file.`,
        recommendedAction: 'Confirm recoverability and disclosure impact.',
      });
    }
  }

  if ((ctx.downtimeHoursYtd ?? 0) > 40 || (ctx.maintenanceCostYtd ?? 0) > ctx.purchaseCost * 0.2) {
    insights.push({
      kind: 'maintenance_risk',
      assetId: ctx.assetId,
      severity: 'warning',
      title: 'Elevated maintenance risk',
      summary: 'Downtime or maintenance spend suggests reliability risk.',
      recommendedAction: 'Review service schedule and critical spares.',
    });
  }

  return insights;
}

export const ASSET_INTELLIGENCE_CAPABILITIES = [
  'useful_life_anomalies',
  'replacement_recommendations',
  'verification_reminders',
  'potential_impairment_indicators',
  'maintenance_risk',
] as const;
