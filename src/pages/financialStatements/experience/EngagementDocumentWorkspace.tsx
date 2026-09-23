import { useState } from 'react';
import type {
  EfsDashboard,
  EfsWorkspaceGeneralInformation,
} from '../../../lib/financialStatements/api';
import { useDocumentModel } from '../../../lib/financialStatements/document/useDocumentModel';
import { useDocumentOverrides } from '../../../lib/financialStatements/document/documentStore';
import DocumentTree from '../document/DocumentTree';
import DocumentEditor from '../document/DocumentEditor';
import DocumentPreview from '../document/DocumentPreview';
import DocumentPropertiesPanel from '../document/DocumentPropertiesPanel';
import ReadinessReview from '../document/ReadinessReview';
import AddDisclosureDialog from '../document/AddDisclosureDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Skeleton } from '../../../components/ui/skeleton';
import { Button } from '../../../components/ui/button';
import { RefreshCw } from 'lucide-react';

/** Selection contract shared across the document workspace panels. */
export type DocSelection =
  | { kind: 'cover'; id: string }
  | { kind: 'information'; id: string }
  | { kind: 'contents'; id: string }
  | { kind: 'statement'; id: string }
  | { kind: 'policySet'; id: string }
  | { kind: 'policy'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'signature'; id: string };

/**
 * The document workspace: structure on the left, the page in the middle, its
 * properties and the readiness of the whole set on the right.
 *
 * It reads the statements the engine produced and never recomputes a figure.
 * What it does own is authored content and presentation, and both now persist
 * on the engagement rather than in the browser, so everyone working on this set
 * of financial statements is reading the same document.
 */
export default function WorkspaceDocumentWorkspace({
  companyId,
  companyName,
  workspaceId,
  dashboard,
  generalInfo,
  selection,
  onSelect,
  locked = false,
}: {
  companyId: string;
  companyName?: string;
  workspaceId: string;
  dashboard: EfsDashboard;
  generalInfo: EfsWorkspaceGeneralInformation | null;
  /** Owned by the page, so a readiness finding can open the page it concerns. */
  selection: DocSelection;
  onSelect: (selection: DocSelection) => void;
  /** The statements have been marked final; the document is read-only. */
  locked?: boolean;
}) {
  const [addDisclosureOpen, setAddDisclosureOpen] = useState(false);
  const overridesApi = useDocumentOverrides(workspaceId, companyId);
  const setSelection = onSelect;

  const modelQuery = useDocumentModel({
    companyId,
    companyName,
    workspaceId,
    dashboard,
    generalInfo,
  });

  const invalidateModel = modelQuery.reload;

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {/* The framework is the only thing worth saying here; the company, the
            year and the status are already in the page header above. */}
        <p className="text-sm text-muted-foreground">{model.frameworkLabel}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => invalidateModel()}
          disabled={modelQuery.isFetching}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${modelQuery.isFetching ? 'animate-spin' : ''}`} />
          Reload
        </Button>
      </div>

      {/* Losing a reviewer's ordering quietly is worse than saying it failed. */}
      {overridesApi.error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          A presentation change could not be saved: {overridesApi.error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
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
                workspaceId={workspaceId}
                model={model}
                selection={selection}
                overridesApi={overridesApi}
                generalInfo={generalInfo}
                locked={locked}
                onSaved={invalidateModel}
                onNoteStored={(id) => setSelection({ kind: 'note', id })}
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
              {/* The same assessment the Review mode shows. There were two
                  panels on different query keys, which could disagree. */}
              <ReadinessReview model={model} onOpen={setSelection} />
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
