// Governance Foundation — Security service.
//
// Proxies the EXISTING `settings` edge function methods GET_TEAM_MEMBERS /
// UPDATE_MEMBER_ROLE / REMOVE_MEMBER. Phase G3.6 activates this domain and
// migrates TeamMembersSettings + teamMembersQuery onto these methods.
//
// This service intentionally does NOT yet implement the centralized
// permission-check layer Volume I §8 calls for (the fix for the Banking
// role-check-bypass defect G1 found) — inventing allow/deny evaluators would
// be a behaviour change. G3.6 only centralizes the team/role data access
// that already exists.

import { supabase } from '@/integrations/supabase/client';
import { assertGovernanceDomainActive } from '@/governance/featureFlags';
import type { GovernanceMutationResult } from '@/governance/types';
import { validateRoleAssignment, type CompanyMemberDomainModel } from './model';

/** Edge payload shape — preserved for Chat / TeamMembersSettings consumers. */
export type RawCompanyMemberRow = {
  user_id: string;
  role: CompanyMemberDomainModel['role'];
  profiles: {
    full_name: string | null;
    email: string | null;
    avatar_url?: string | null;
  } | null;
};

export interface SecurityReadAPI {
  getCompanyMembers(companyId: string): Promise<CompanyMemberDomainModel[]>;
  getCompanyMembersRaw(companyId: string): Promise<RawCompanyMemberRow[]>;
}

export interface SecurityMutationAPI {
  updateMemberRole(
    companyId: string,
    userId: string,
    role: CompanyMemberDomainModel['role'],
  ): Promise<GovernanceMutationResult>;
  removeMember(companyId: string, userId: string): Promise<GovernanceMutationResult>;
}

export class SecurityService implements SecurityReadAPI, SecurityMutationAPI {
  /**
   * Low-level list returning the RAW edge shape so Chat and TeamMembersSettings
   * keep byte-identical field access (user_id / profiles.full_name / avatar_url).
   */
  async getCompanyMembersRaw(companyId: string): Promise<RawCompanyMemberRow[]> {
    assertGovernanceDomainActive('security');
    const { data, error } = await supabase.functions.invoke('settings', {
      body: { method: 'GET_TEAM_MEMBERS', company_id: companyId },
    });
    if (error) throw new Error(error.message);
    // Preserve pre-migration teamMembersQuery parseFunctionResult semantics:
    // edge may return a JSON body with an `error` field without HTTP failure.
    if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
      throw new Error((data as { error: string }).error);
    }
    return (data as RawCompanyMemberRow[] | null) ?? [];
  }

  async getCompanyMembers(companyId: string): Promise<CompanyMemberDomainModel[]> {
    assertGovernanceDomainActive('security');
    const rows = await this.getCompanyMembersRaw(companyId);
    return rows.map((row) => ({
      userId: row.user_id,
      role: row.role,
      fullName: row.profiles?.full_name ?? null,
      email: row.profiles?.email ?? null,
    }));
  }

  async updateMemberRole(
    companyId: string,
    userId: string,
    role: CompanyMemberDomainModel['role'],
  ): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('security');
    const validation = validateRoleAssignment(role);
    if (!validation.valid) return { success: false, error: validation.errors.join(' ') };

    // Verified against supabase/functions/settings/index.ts — the edge
    // function reads `body.new_role` / `body.target_user_id`.
    const { error } = await supabase.functions.invoke('settings', {
      body: {
        method: 'UPDATE_MEMBER_ROLE',
        company_id: companyId,
        target_user_id: userId,
        new_role: role,
      },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async removeMember(companyId: string, userId: string): Promise<GovernanceMutationResult> {
    assertGovernanceDomainActive('security');
    // Verified against supabase/functions/settings/index.ts — reads
    // `body.user_id_to_remove`.
    const { error } = await supabase.functions.invoke('settings', {
      body: { method: 'REMOVE_MEMBER', company_id: companyId, user_id_to_remove: userId },
    });
    return error ? { success: false, error: error.message } : { success: true };
  }
}

export function createSecurityService(): SecurityService {
  return new SecurityService();
}

// Shared singleton — stateless façade, matching companyService /
// financialCalendarService / accountingPoliciesService.
export const securityService = createSecurityService();
