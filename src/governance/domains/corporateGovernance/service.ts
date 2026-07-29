// Governance Foundation — Corporate Governance service.
//
// Authoritative owner of Company Master Data (directors, board members,
// company secretary, auditor, accounting officer, registered office, share
// capital / reporting metadata, principal bankers, plus the company-profile,
// address, and tax-registration master modules), per Enterprise Constitution
// Volume I §3.2.
//
// Phase G3.3 activates this domain. Its two authoritative methods
// (getCompanyMasterData / upsertCompanyMasterDataModule) delegate to the
// EXISTING `invokeFinancialStatements` wrapper (src/lib/financialStatements/
// api.ts) — the SAME wrapper the current getCompanyMasterData/
// upsertCompanyMasterDataModule functions already use. This is deliberate:
// that wrapper carries load-bearing behaviour (auth-failure detection,
// EFS_V161_DEPLOYMENT_BLOCKED envelope handling, platform-error unwrapping).
// Delegating to it — rather than re-invoking the edge function directly —
// guarantees the migration preserves byte-for-byte identical network calls
// AND identical error semantics. src/lib/financialStatements/masterData/
// index.ts now routes through this service, so every Financial Statements
// master-data consumer resolves through Governance without any UI change.
//
// NOTE ON LAYERING: this service imports from src/lib/financialStatements
// (a higher-level module) rather than the reverse. That inversion is
// accepted for now because behaviour-identity is paramount this phase — a
// future consolidation phase may relocate `invokeFinancialStatements` (or an
// equivalent low-level edge client) beneath Governance so the dependency
// points the conventional way. Recorded as technical debt, not hidden.

import { invokeFinancialStatements } from '@/lib/financialStatements/api';
import type { CompanyMasterData, MasterDataModuleId } from '@/lib/financialStatements/masterData/types';
import { assertGovernanceDomainActive } from '@/governance/featureFlags';

export interface CorporateGovernanceReadAPI {
  getCompanyMasterData(companyId: string): Promise<CompanyMasterData>;
}

export interface CorporateGovernanceMutationAPI {
  upsertCompanyMasterDataModule(
    companyId: string,
    moduleId: MasterDataModuleId,
    payload: unknown,
  ): Promise<CompanyMasterData>;
}

export class CorporateGovernanceService implements CorporateGovernanceReadAPI, CorporateGovernanceMutationAPI {
  async getCompanyMasterData(companyId: string): Promise<CompanyMasterData> {
    assertGovernanceDomainActive('corporateGovernance');
    // Identical call to the one src/lib/financialStatements/masterData/index.ts
    // made before this migration — same method, same (empty) payload, same
    // error handling via invokeFinancialStatements.
    return invokeFinancialStatements<CompanyMasterData>(companyId, 'GET_COMPANY_MASTER_DATA', {});
  }

  async upsertCompanyMasterDataModule(
    companyId: string,
    moduleId: MasterDataModuleId,
    payload: unknown,
  ): Promise<CompanyMasterData> {
    assertGovernanceDomainActive('corporateGovernance');
    return invokeFinancialStatements<CompanyMasterData>(
      companyId,
      'UPSERT_COMPANY_MASTER_DATA_MODULE',
      { module_id: moduleId, payload },
    );
  }
}

export function createCorporateGovernanceService(): CorporateGovernanceService {
  return new CorporateGovernanceService();
}

// Shared singleton — stateless façade, consumed the same way as
// financialCalendarService / companyService.
export const corporateGovernanceService = createCorporateGovernanceService();
