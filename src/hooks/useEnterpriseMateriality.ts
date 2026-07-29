/**
 * Enterprise materiality settings (G3.6C) — single SoT for FS / validation / reporting.
 */
import { useQuery } from '@tanstack/react-query';
import { accountingPoliciesService } from '@/governance/domains/accountingPolicies/service';
import type { ReportingIntelligenceOptions } from '@/lib/financialStatements/reportingIntelligence/orchestrator';

export function useEnterpriseMateriality(companyId: string | undefined | null) {
  const query = useQuery({
    queryKey: ['company_materiality_settings', companyId],
    queryFn: () => accountingPoliciesService.getMaterialitySettings(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const percentage = query.data?.percentageThreshold ?? null;
  const options: ReportingIntelligenceOptions = {
    companyMaterialityPercentage: percentage,
  };

  return {
    percentageThreshold: percentage,
    absoluteThreshold: query.data?.absoluteThreshold ?? null,
    options,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
