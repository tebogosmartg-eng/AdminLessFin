import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EfsDashboard,
  EfsWorkspaceGeneralInformation,
} from '../../../lib/financialStatements/api';
import {
  ensureGenericDocument,
  loadDocumentModel,
} from '../../../lib/financialStatements/document/documentModel';
import { useDocumentOverrides } from '../../../lib/financialStatements/document/documentStore';
import { resolveEngagementReportingPeriod } from '../../../lib/financialStatements/calendarYearBinding';
import { useReportingPeriod } from '../../../contexts/ReportingPeriodContext';
import DocumentTree from '../document/DocumentTree';
import DocumentEditor from '../document/DocumentEditor';
import DocumentPreview from '../document/DocumentPreview';
import DocumentPropertiesPanel from '../document/DocumentPropertiesPanel';
import DocumentValidationPanel from '../document/DocumentValidationPanel';
import AddDisclosureDialog from '../document/AddDisclosureDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { RefreshCw } from 'lucide-react';

/** Selection contract shared across the document workspace panels. */
export type DocSelection =
  | { kind: 'cover'; id: string }
  | { kind: 'contents'; id: string }
  | { kind: 'statement'; id: string }
  | { kind: 'policySet'; id: string }
  | { kind: 'policy'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'signature'; id: string };

/**
 * V11.0 — Accounts Production document workspace.
 *
 * A single surface combining Document Tree + Editor + Live Preview + Validation
 * + Properties inside the existing Financial Statements engagement dashboard.
 * Fully additive: consumes existing edge APIs (read + existing edit methods) and
 * persists presentation-only choices client-side. Never modifies the engine.
 */
export default function WorkspaceDocumentWorkspace({
  companyId,
  workspaceId,
  dashboard,
  generalInfo,
  onNavigate,
}: {
  companyId: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
  onNavigate?: (target: string) => void;
}) {
  const qc = useQueryClient();
  const { financialYears, activeFinancialYear } = useReportingPeriod();
  const [selection, setSelection] = useState<DocSelection>({ kind: 'cover', id: 'cover' });
  const [addDisclosureOpen, setAddDisclosureOpen] = useState(false);
  const overridesApi = useDocumentOverrides(workspaceId);

  const modelQuery = useQuery({
    queryKey: ['efs_doc_model', companyId, workspaceId],
    queryFn: async () => {
      await ensureGenericDocument({
        companyId,
        workspaceId,
        frameworkPackId: dashboard.framework?.id ?? null,
      });
      return loadDocumentModel({ companyId, workspaceId, dashboard, generalInfo });
    },
  });

  const invalidateModel = () =>
    qc.invalidateQueries({ queryKey: ['efs_doc_model', companyId, workspaceId] });

  if (modelQuery.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <Skeleton className="h-[600px]" />
        <Skeleton className="h-[600px]" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (modelQuery.isError || !modelQuery.data) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {(modelQuery.error as Error)?.message ||
          'The financial statement document could not be assembled.'}
      </div>
    );
  }

  const model = modelQuery.data;
  const fy = resolveEngagementReportingPeriod(
    model.period || dashboard.reportingPeriod,
    financialYears,
    activeFinancialYear,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Financial Statement Document</h2>
          <p className="text-sm text-muted-foreground">
            {model.frameworkLabel}
            {` · ${fy.displayLabel}`}
            {model.trialBalanceCaptured
              ? ' · Populated from trial balance'
              : ' · Generic document (awaiting trial balance)'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!model.trialBalanceCaptured && onNavigate ? (
            <>
              <Button variant="default" size="sm" onClick={() => onNavigate('trial-balance')}>
                Open Trial Balance
              </Button>
              <Button variant="outline" size="sm" onClick={() => onNavigate('statements')}>
                Generate Statements
              </Button>
            </>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => invalidateModel()}
            disabled={modelQuery.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${modelQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh document
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        <div className="rounded-md border bg-card">
          <DocumentTree
            model={model}
            overrides={overridesApi.overrides}
            selection={selection}
            onSelect={setSelection}
            onToggleHidden={overridesApi.toggleHidden}
            onAddDisclosure={() => setAddDisclosureOpen(true)}
          />
        </div>

        <div className="min-w-0">
          <Tabs defaultValue="editor" className="space-y-3">
            <TabsList>
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="preview">Live Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="editor" className="mt-0">
              <DocumentEditor
                companyId={companyId}
                model={model}
                selection={selection}
                overridesApi={overridesApi}
                onSaved={invalidateModel}
              />
            </TabsContent>
            <TabsContent value="preview" className="mt-0">
              <DocumentPreview model={model} overrides={overridesApi.overrides} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="min-w-0">
          <Tabs defaultValue="properties" className="space-y-3">
            <TabsList>
              <TabsTrigger value="properties">Properties</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
            </TabsList>
            <TabsContent value="properties" className="mt-0">
              <DocumentPropertiesPanel
                model={model}
                selection={selection}
                overridesApi={overridesApi}
              />
            </TabsContent>
            <TabsContent value="validation" className="mt-0">
              <DocumentValidationPanel
                companyId={companyId}
                workspaceId={workspaceId}
                model={model}
                overrides={overridesApi.overrides}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AddDisclosureDialog
        open={addDisclosureOpen}
        onOpenChange={setAddDisclosureOpen}
        companyId={companyId}
        workspaceId={workspaceId}
        model={model}
        overridesApi={overridesApi}
        frameworkPackId={dashboard.framework?.id ?? null}
        onCreated={(newNoteId) => {
          setSelection({ kind: 'note', id: newNoteId });
          invalidateModel();
        }}
      />
    </div>
  );
}
