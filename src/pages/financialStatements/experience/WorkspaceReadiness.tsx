import type {
  EfsDashboard,
  EfsWorkspaceGeneralInformation,
} from '../../../lib/financialStatements/api';
import { useDocumentModel } from '../../../lib/financialStatements/document/useDocumentModel';
import type { ReadinessLocation } from '../../../lib/financialStatements/readiness';
import ReadinessReview from '../document/ReadinessReview';
import { Skeleton } from '../../../components/ui/skeleton';

/**
 * The Review mode's assessment, read from the same document the reader edits.
 */
export default function WorkspaceReadiness({
  companyId,
  companyName,
  workspaceId,
  dashboard,
  generalInfo,
  generalInfoReady,
  onOpen,
}: {
  companyId: string;
  companyName?: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
  /** General information has been asked for and answered. */
  generalInfoReady?: boolean;
  onOpen: (location: ReadinessLocation) => void;
}) {
  const modelQuery = useDocumentModel({
    companyId,
    companyName,
    workspaceId,
    dashboard,
    generalInfo,
    generalInfoReady,
  });

  if (modelQuery.isLoading) return <Skeleton className="h-64 w-full" />;
  if (modelQuery.isError || !modelQuery.data) {
    return (
      <p className="text-sm text-destructive">
        {(modelQuery.error as Error)?.message || 'These statements could not be checked.'}
      </p>
    );
  }

  return <ReadinessReview model={modelQuery.data} onOpen={onOpen} />;
}
