import { useQuery } from '@tanstack/react-query';
import type { MappableField } from './autoMap';
import { invokeImport, type EntitySpec, type EntityType, type ImportReferences, type ImportRun } from './api';

export const importKeys = {
  all: (companyId: string) => ['imports', companyId] as const,
  spec: (companyId: string) => ['imports', companyId, 'spec'] as const,
  references: (companyId: string) => ['imports', companyId, 'references'] as const,
  history: (companyId: string) => ['imports', companyId, 'history'] as const,
  rows: (companyId: string, runId: string, filter: string, page: number) =>
    ['imports', companyId, 'rows', runId, filter, page] as const,
  reconcile: (companyId: string, runId: string) => ['imports', companyId, 'reconcile', runId] as const,
};

export function useImportSpec(companyId: string | undefined) {
  return useQuery({
    queryKey: importKeys.spec(companyId ?? ''),
    queryFn: () => invokeImport<{ entities: Record<EntityType, EntitySpec>; max_rows: number; compare_fields: MappableField[] }>(companyId!, 'GET_SPEC'),
    enabled: !!companyId,
    staleTime: Infinity,
  });
}

export function useImportReferences(companyId: string | undefined) {
  return useQuery({
    queryKey: importKeys.references(companyId ?? ''),
    queryFn: () => invokeImport<ImportReferences>(companyId!, 'GET_REFERENCES'),
    enabled: !!companyId,
  });
}

export function useImportHistory(companyId: string | undefined) {
  return useQuery({
    queryKey: importKeys.history(companyId ?? ''),
    queryFn: () => invokeImport<{ runs: ImportRun[] }>(companyId!, 'LIST_RUNS', { limit: 100 }),
    enabled: !!companyId,
  });
}
