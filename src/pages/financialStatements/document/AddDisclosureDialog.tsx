import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { showError, showSuccess } from '../../../utils/toast';
import type { DocumentModel } from '../../../lib/financialStatements/document/documentModel';
import type { DocumentOverridesApi } from '../../../lib/financialStatements/document/documentStore';
import { computeNoteNumbering } from '../../../lib/financialStatements/document/renumber';
import {
  buildInsertionOrder,
  createCompanyDisclosure,
  nextCompanyDisclosureCode,
  pickNotesStructureNodeCode,
  resolveNotesStructureNodeCode,
  type DisclosurePlacement,
  type RawInstanceStructure,
} from '../../../lib/financialStatements/document/createDisclosure';
import { invokeFinancialStatements } from '../../../lib/financialStatements/api';

const DISCLOSURE_KINDS: Array<{ value: string; label: string }> = [
  { value: 'note', label: 'Disclosure note' },
  { value: 'accounting_policy', label: 'Accounting policy' },
  { value: 'significant_judgement', label: 'Significant judgement / estimate' },
  { value: 'other', label: 'Other disclosure' },
];

/**
 * "Add Disclosure" dialog — creates a new company-specific disclosure note via
 * the existing CREATE_DISCLOSURE_INSTANCE edge API and inserts it at the chosen
 * position in the document. The created note immediately becomes part of the
 * canonical Document Model on refresh.
 */
export default function AddDisclosureDialog({
  open,
  onOpenChange,
  companyId,
  workspaceId,
  model,
  overridesApi,
  frameworkPackId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  workspaceId: string;
  model: DocumentModel;
  overridesApi: DocumentOverridesApi;
  frameworkPackId?: string | null;
  onCreated: (newNoteId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('note');
  const [placementValue, setPlacementValue] = useState('end');

  const visibleNotes = useMemo(
    () => computeNoteNumbering(model.notes, overridesApi.overrides).visible,
    [model.notes, overridesApi.overrides],
  );

  const instancesQuery = useQuery({
    queryKey: ['efs_disc_instances_for_add', companyId, workspaceId],
    enabled: open,
    queryFn: () =>
      invokeFinancialStatements<RawInstanceStructure[]>(companyId, 'LIST_DISCLOSURE_INSTANCES', {
        workspace_id: workspaceId,
      }),
  });

  const structureNodeCode = useMemo(
    () => pickNotesStructureNodeCode(instancesQuery.data || []),
    [instancesQuery.data],
  );

  const existingCodes = useMemo(
    () => (instancesQuery.data || []).map((i) => i.disclosure_code || '').filter(Boolean),
    [instancesQuery.data],
  );

  const placement = useMemo<DisclosurePlacement>(() => {
    if (placementValue === 'beginning') return { position: 'beginning' };
    if (placementValue === 'end') return { position: 'end' };
    return { position: 'after', afterNoteId: placementValue };
  }, [placementValue]);

  const create = useMutation({
    mutationFn: async () => {
      const nodeCode =
        structureNodeCode || (await resolveNotesStructureNodeCode(companyId, workspaceId));
      if (!nodeCode) {
        throw new Error(
          'Cannot attach a new disclosure yet — generate the financial statements first so a document structure exists.',
        );
      }
      const disclosureCode = nextCompanyDisclosureCode(existingCodes);
      const created = await createCompanyDisclosure({
        companyId,
        workspaceId,
        title,
        disclosureCode,
        structureNodeCode: nodeCode,
        disclosureKind: kind,
        frameworkPackId,
      });
      const orderMap = buildInsertionOrder(model.notes, overridesApi.overrides, created.id, placement);
      Object.entries(orderMap).forEach(([id, idx]) => overridesApi.setOrder(id, idx));
      return created;
    },
    onSuccess: (created) => {
      showSuccess('Company-specific disclosure created');
      setTitle('');
      setKind('note');
      setPlacementValue('end');
      onOpenChange(false);
      onCreated(created.id);
    },
    onError: (e: Error) => showError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add company-specific disclosure</DialogTitle>
          <DialogDescription>
            Create a new engagement-owned disclosure note. It becomes part of the document and can
            be edited, hidden, reordered and published like any other note.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="disc-title">Title</Label>
            <Input
              id="disc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Directors' emoluments"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Disclosure type</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCLOSURE_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Placement</Label>
            <Select value={placementValue} onValueChange={setPlacementValue}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginning">At the beginning of the notes</SelectItem>
                {visibleNotes.map((v) => (
                  <SelectItem key={v.note.id} value={v.note.id}>
                    After Note {v.noteNumber}. {v.title}
                  </SelectItem>
                ))}
                <SelectItem value="end">At the end of the notes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !title.trim() || instancesQuery.isLoading}
          >
            {create.isPending ? 'Creating…' : 'Create disclosure'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
