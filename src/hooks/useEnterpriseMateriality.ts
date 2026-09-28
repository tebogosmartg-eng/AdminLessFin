/**
 * Enterprise materiality settings (G3.6C) — single SoT for FS / validation / reporting.
 */
import { useMemo } from 'react';
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
  // Stable while the setting is unchanged: consumers memoise on it, and a new
  // object every render made the Live Preview rebuild its PDF every render.
  const options: ReportingIntelligenceOptions = useMemo(
    () => ({ companyMaterialityPercentage: percentage }),
    [percentage],
  );

  return {
    percentageThreshold: percentage,
    absoluteThreshold: query.data?.absoluteThreshold ?? null,
    options,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
