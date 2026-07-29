/**
 * V17.0 — Entity Profiling Engine.
 *
 * Automatically identifies reporting profiles from entity facts and engagement data.
 */
import type { DocumentModel } from '../document/documentModel';
import { corporateDisplayFromModel } from '../corporateInformation/accessors';
import { extractStatementFacts } from './facts';
import type { EntityProfile, EntitySizeProfile, IndustryProfile } from './types';

const SIZE_THRESHOLDS = {
  micro_assets: 5_000_000,
  small_assets: 50_000_000,
  medium_assets: 250_000_000,
  micro_revenue: 10_000_000,
  small_revenue: 100_000_000,
  medium_revenue: 500_000_000,
};

function inferSizeProfile(facts: ReturnType<typeof extractStatementFacts>): EntitySizeProfile {
  const { totalAssets, totalRevenue, investmentBalance, ppeBalance, inventoryBalance } = facts;

  if (totalAssets < 100_000 && totalRevenue < 50_000) return 'dormant_entity';

  const investmentRatio = totalAssets > 0 ? investmentBalance / totalAssets : 0;
  if (investmentRatio > 0.6 && ppeBalance / Math.max(totalAssets, 1) < 0.15) {
    return 'investment_entity';
  }

  if (investmentBalance > totalAssets * 0.4 && ppeBalance < totalAssets * 0.2) {
    return 'holding_company';
  }

  const score = Math.max(totalAssets, totalRevenue);
  if (score < SIZE_THRESHOLDS.micro_assets || totalRevenue < SIZE_THRESHOLDS.micro_revenue) {
    return 'micro_entity';
  }
  if (score < SIZE_THRESHOLDS.small_assets || totalRevenue < SIZE_THRESHOLDS.small_revenue) {
    return 'small_sme';
  }
  if (score < SIZE_THRESHOLDS.medium_assets || totalRevenue < SIZE_THRESHOLDS.medium_revenue) {
    return 'medium_sme';
  }
  return 'large_sme';
}

function inferIndustryProfile(
  model: DocumentModel,
  facts: ReturnType<typeof extractStatementFacts>,
): IndustryProfile {
  const nature = (corporateDisplayFromModel(model).natureOfBusiness || '').toLowerCase();

  if (/npo|non.?profit|charity|ngo|foundation|trust/i.test(nature)) return 'npo';
  if (/agricultur|farming|livestock|crop/i.test(nature)) return 'agriculture';
  if (/construct|building|contractor|civil/i.test(nature)) return 'construction';
  if (/manufactur|factory|production|industrial/i.test(nature)) return 'manufacturing';
  if (/retail|wholesale|shop|store|trading/i.test(nature)) return 'retail';
  if (/professional|audit|legal|consult|account|advisory/i.test(nature)) return 'professional_practice';
  if (/service|software|technology|it\b/i.test(nature)) return 'service';

  const { totalAssets, ppeBalance, inventoryBalance, receivablesBalance } = facts;
  if (totalAssets <= 0) return 'general';

  const ppeRatio = ppeBalance / totalAssets;
  const invRatio = inventoryBalance / totalAssets;
  const recRatio = receivablesBalance / totalAssets;

  if (invRatio > 0.25 && ppeRatio > 0.2) return 'manufacturing';
  if (invRatio > 0.2) return 'retail';
  if (ppeRatio > 0.4) return 'manufacturing';
  if (recRatio > 0.3 && invRatio < 0.1) return 'service';
  if (ppeRatio < 0.1 && invRatio < 0.05) return 'professional_practice';

  return 'service';
}

function buildLabels(
  size: EntitySizeProfile,
  industry: IndustryProfile,
  facts: ReturnType<typeof extractStatementFacts> & EntityProfile['characteristics'],
): string[] {
  const labels: string[] = [];
  labels.push(size.replace(/_/g, ' '));
  labels.push(industry.replace(/_/g, ' '));
  if (facts.isLossMaking) labels.push('loss making');
  if (facts.isHighGrowth) labels.push('high growth');
  if (facts.isAssetIntensive) labels.push('asset intensive');
  if (facts.isDebtIntensive) labels.push('debt intensive');
  if (facts.isDormant) labels.push('dormant');
  return labels;
}

/** Profile an entity from its document model and sealed facts. */
export function profileEntity(model: DocumentModel): EntityProfile {
  const facts = extractStatementFacts(model);
  const totalAssets = facts.totalAssets;
  const debtRatio = totalAssets > 0 ? facts.totalLiabilities / totalAssets : 0;
  const assetIntensity = totalAssets > 0 ? facts.ppeBalance / totalAssets : 0;
  const revenueGrowth =
    facts.priorRevenue > 0
      ? (facts.totalRevenue - facts.priorRevenue) / facts.priorRevenue
      : 0;

  const characteristics = {
    totalAssets,
    totalRevenue: facts.totalRevenue,
    totalLiabilities: facts.totalLiabilities,
    netProfit: facts.netProfit,
    assetIntensity,
    debtRatio,
    revenueGrowth,
    isLossMaking: facts.netProfit < 0,
    isHighGrowth: revenueGrowth > 0.25,
    isAssetIntensive: assetIntensity > 0.35,
    isDebtIntensive: debtRatio > 0.6,
    isDormant: totalAssets < 100_000 && facts.totalRevenue < 50_000,
  };

  const size = inferSizeProfile(facts);
  const industry = inferIndustryProfile(model, facts);

  const display = corporateDisplayFromModel(model);
  const factors: Record<string, boolean | number | string> = {
    ppeRatio: assetIntensity,
    inventoryRatio: totalAssets > 0 ? facts.inventoryBalance / totalAssets : 0,
    debtRatio,
    revenueGrowth,
    investmentRatio: totalAssets > 0 ? facts.investmentBalance / totalAssets : 0,
    natureOfBusiness: display.natureOfBusiness,
    frameworkKey: model.frameworkKey || '',
  };

  let confidence = 0.75;
  if (display.natureOfBusiness) confidence += 0.1;
  if (totalAssets > 0) confidence += 0.1;
  if (facts.totalRevenue > 0) confidence += 0.05;

  return {
    size,
    industry,
    labels: buildLabels(size, industry, { ...facts, ...characteristics }),
    confidence: Math.min(confidence, 1),
    characteristics,
    factors,
  };
}
