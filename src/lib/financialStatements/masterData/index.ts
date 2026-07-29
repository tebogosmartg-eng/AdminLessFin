/**
 * V16.1 — Company Master Data client API.
 *
 * Phase G3.3 — Company Master Data authority migrated to the Governance
 * Platform. These two functions now delegate to the Governance Corporate
 * Governance Service, which itself delegates to the same
 * `invokeFinancialStatements` wrapper these functions used before (so the
 * network call and its error semantics — including the structured
 * EFS_V161_DEPLOYMENT_BLOCKED 503 — are byte-for-byte identical). The public
 * signatures are unchanged, so every existing caller (EngagementInformation,
 * masterData/modules, and the hydration helpers below) is unaffected; they
 * now simply resolve Company Master Data through Governance.
 */
import { corporateGovernanceService } from '@/governance/domains/corporateGovernance/service';
import type { CompanyMasterData, MasterDataModuleId } from './types';

export async function getCompanyMasterData(companyId: string): Promise<CompanyMasterData> {
  return corporateGovernanceService.getCompanyMasterData(companyId);
}

export async function upsertCompanyMasterDataModule(
  companyId: string,
  moduleId: MasterDataModuleId,
  payload: unknown,
): Promise<CompanyMasterData> {
  return corporateGovernanceService.upsertCompanyMasterDataModule(companyId, moduleId, payload);
}

export { hydrateWorkspaceFromMasterData } from './hydration';
export {
  buildLegacyHydratedMasterRow,
  extractMasterDataFromEngagement,
  isMasterDataEmpty,
  needsLegacyHydration,
  stripLegacyMasterFieldsFromEngagement,
  ENGAGEMENT_ONLY_FIELDS,
  LEGACY_MASTER_DATA_FIELDS,
} from './legacyHydration';
export { MASTER_DATA_MODULE_LABELS } from './types';
export type * from './types';
export {
  verifyV161Deployment,
  assertV161DeploymentReady,
  parseDeploymentError,
  deploymentErrorMessage,
  V161DeploymentError,
} from './verifyDeployment';
export type { DeploymentReadinessReport } from './deploymentVerification';
