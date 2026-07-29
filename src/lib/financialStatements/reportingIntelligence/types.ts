/**
 * V17.0 — Enterprise Reporting Intelligence Engine types.
 *
 * Decision-making layer above the Composition Engine.
 * Renderers consume PublicationContract output; they never make reporting decisions.
 */
import type { CompositionDocument } from '../composition/types';
import type { CorporateInformationModel } from '../corporateInformation';
import type { DisclosureConditionMap } from '../framework/knowledgeRepository/types';

/** Entity size classification profiles. */
export type EntitySizeProfile =
  | 'micro_entity'
  | 'small_sme'
  | 'medium_sme'
  | 'large_sme'
  | 'holding_company'
  | 'subsidiary'
  | 'investment_entity'
  | 'dormant_entity';

/** Industry / sector classification profiles. */
export type IndustryProfile =
  | 'retail'
  | 'manufacturing'
  | 'service'
  | 'professional_practice'
  | 'agriculture'
  | 'construction'
  | 'npo'
  | 'general';

/** Automatically identified reporting profile for an entity. */
export type EntityProfile = {
  size: EntitySizeProfile;
  industry: IndustryProfile;
  /** Human-readable profile labels applied to this entity. */
  labels: string[];
  /** Confidence score 0–1 for automatic profiling. */
  confidence: number;
  /** Derived financial characteristics. */
  characteristics: {
    totalAssets: number;
    totalRevenue: number;
    totalLiabilities: number;
    netProfit: number;
    assetIntensity: number;
    debtRatio: number;
    revenueGrowth: number;
    isLossMaking: boolean;
    isHighGrowth: boolean;
    isAssetIntensive: boolean;
    isDebtIntensive: boolean;
    isDormant: boolean;
  };
  /** Factors that influenced profiling. */
  factors: Record<string, boolean | number | string>;
};

/** Materiality classification for each disclosure. */
export type MaterialityClass =
  | 'mandatory'
  | 'conditional'
  | 'material'
  | 'immaterial'
  | 'zero_balance'
  | 'framework_required'
  | 'entity_specific'
  | 'future_use';

/** Materiality-driven presentation action. */
export type MaterialityAction =
  | 'suppress'
  | 'merge'
  | 'collapse'
  | 'expand'
  | 'highlight'
  | 'present';

export type MaterialityAssessment = {
  disclosureCode: string;
  materiality: MaterialityClass;
  action: MaterialityAction;
  reason: string;
  balanceImpact: number;
  percentOfAssets: number;
};

/** Disclosure existence and presentation decision. */
export type DisclosureDecision = {
  disclosureCode: string;
  exists: boolean;
  shouldExpand: boolean;
  shouldSimplify: boolean;
  shouldMerge: boolean;
  shouldSuppress: boolean;
  action: MaterialityAction;
  materiality: MaterialityClass;
  reason: string;
  mergedWith?: string;
};

export type AssetPresentation = 'current_non_current' | 'liquidity';
export type ExpensePresentation = 'nature' | 'function';

/** Statement presentation decisions. */
export type StatementPresentationDecision = {
  statementType: string;
  assetPresentation: AssetPresentation;
  expensePresentation: ExpensePresentation;
  showGrossProfit: boolean;
  showOperatingProfit: boolean;
  showProfitBeforeTax: boolean;
  subtotals: string[];
  layoutKey: string;
  entitySpecificLayout: boolean;
};

export type OrderingFactor = {
  code: string;
  frameworkOrder: number;
  materialityWeight: number;
  profileWeight: number;
  faceStatementRef: number;
  finalOrder: number;
};

export type ConsistencyIssue = {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  location?: string;
};

export type ConsistencyResult = {
  passed: boolean;
  issues: ConsistencyIssue[];
  validatedAreas: string[];
};

/**
 * Publication contract — identical reporting object for PDF, DOCX, Preview, HTML, XBRL.
 * Renderers MUST NOT make reporting decisions; they only render this contract.
 */
export type PublicationContract = {
  version: '17.0';
  entityProfile: EntityProfile;
  disclosureDecisions: DisclosureDecision[];
  statementPresentation: StatementPresentationDecision[];
  orderedDisclosureCodes: string[];
  materialitySummary: {
    mandatory: number;
    conditional: number;
    material: number;
    immaterial: number;
    suppressed: number;
    expanded: number;
  };
  conditions: DisclosureConditionMap;
  /** Intelligence-refined composition — sole source for renderers. */
  composition: CompositionDocument;
  /** V16.1 — Canonical corporate information for all publication formats. */
  corporateInformation: CorporateInformationModel;
  /** Certification gate — false when consistency validation fails. */
  certified: boolean;
  consistency: ConsistencyResult;
  contractFingerprint: string;
};

/** Complete reporting intelligence output package. */
export type ReportingPackage = {
  version: '17.0';
  entityProfile: EntityProfile;
  materiality: MaterialityAssessment[];
  disclosureDecisions: DisclosureDecision[];
  statementPresentation: StatementPresentationDecision[];
  orderedDisclosureCodes: string[];
  consistency: ConsistencyResult;
  composition: CompositionDocument;
  publicationContract: PublicationContract;
  certified: boolean;
  /** V16.1 — Canonical corporate information model. */
  corporateInformation: CorporateInformationModel;
};

export type RegressionScenarioId =
  | 'service_entity'
  | 'retail_entity'
  | 'manufacturing_entity'
  | 'investment_holding'
  | 'professional_practice'
  | 'npo'
  | 'dormant_entity'
  | 'high_growth_entity'
  | 'loss_making_entity'
  | 'asset_intensive_entity'
  | 'debt_intensive_entity';

export type RegressionScenarioResult = {
  scenarioId: RegressionScenarioId;
  entityProfile: EntityProfile;
  disclosureCount: number;
  suppressedCount: number;
  expandedCount: number;
  orderingValid: boolean;
  consistencyPassed: boolean;
  certified: boolean;
  pdfBytes: number;
  docxBytes: number;
  corporateInformationValid: boolean;
  levelOfAssurance: string;
};
