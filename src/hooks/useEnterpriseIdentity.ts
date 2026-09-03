/**
 * React access to Enterprise Master Data identity (G3.6C).
 * Shares cache key with Master Data editors — one fetch, many consumers.
 */
import { useQuery } from '@tanstack/react-query';
import { getCompanyMasterData } from '@/lib/financialStatements/masterData';
import {
  identityAsCompanyProp,
  identityFromMaster,
  type EnterpriseIdentity,
} from '@/lib/enterpriseMasterData/identity';

export function useEnterpriseIdentity(companyId: string | undefined | null) {
  const query = useQuery({
    queryKey: ['efs_company_master_data', companyId],
    queryFn: () => getCompanyMasterData(companyId!),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const identity: EnterpriseIdentity | null =
    companyId && query.data !== undefined
      ? identityFromMaster(companyId, query.data)
      : companyId && !query.isLoading && query.isError
        ? identityFromMaster(companyId, null)
        : null;

  const companyProp = identity
    ? identityAsCompanyProp(identity)
    : companyId
      ? { id: companyId, name: 'Your Company', address: '', tax_id: '', email: '' }
      : null;

  return {
    identity,
    companyProp,
    master: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
