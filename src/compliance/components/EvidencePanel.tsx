import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Link2, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { FormDialog } from '../../components/ui/form-dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { invokeCompliance, uploadComplianceEvidence } from '../api';
import { complianceKeys } from '../queries';
import { formatDate, SOURCE_TABLE_LABEL } from '../labels';
import type { CycleDetail, ObligationDetail } from '../types';
import { ActionDialog } from './ActionDialog';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt';

function useDetailWriter(companyId: string, obligationId: string) {
  const qc = useQueryClient();
  return (detail: ObligationDetail) => {
    qc.setQueryData(complianceKeys.obligation(companyId, obligationId), detail);
    qc.invalidateQueries({ queryKey: complianceKeys.overview(companyId) });
  };
}

function UploadDialog({ open, onOpenChange, companyId, obligationId, cycle }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  obligationId: string;
  cycle: CycleDetail;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const write = useDetailWriter(companyId, obligationId);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a file first.');
      const evidenceId = await uploadComplianceEvidence(companyId, cycle.id, file, title || file.name);
      return invokeCompliance<ObligationDetail>(companyId, 'EVIDENCE_CONFIRM_UPLOAD', { evidence_id: evidenceId });
    },
    onSuccess: (detail) => {
      write(detail);
      toast.success('Proof uploaded');
      setFile(null);
      setTitle('');
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
    onSettled: () => {
      lock.current = false;
    },
  });

  return (
    <FormDialog open={open} onOpenChange={(o) => { if (!o) { setFile(null); setTitle(''); setError(null); } onOpenChange(o); }} dirty={!!file && !upload.isPending}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload proof</DialogTitle>
          <DialogDescription>
            Stored privately for this company only. PDF, image, Word, Excel or text, up to 20 MB.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setError(null);
            upload.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="evidence-file">File</Label>
            <Input
              id="evidence-file"
              type="file"
              accept={ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ''));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evidence-title">Description</Label>
            <Input id="evidence-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. CIPC confirmation 2026" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={upload.isPending}>Cancel</Button>
            </DialogClose>
            <Button type="submit" disabled={!file || upload.isPending}>
              {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </FormDialog>
  );
}

function LinkDialog({ open, onOpenChange, companyId, obligationId, cycle, sources }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  obligationId: string;
  cycle: CycleDetail;
  sources: string[];
}) {
  const [table, setTable] = useState(sources[0] ?? '');
  const [sourceId, setSourceId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const write = useDetailWriter(companyId, obligationId);
  const list = useQuery({
    queryKey: ['compliance', companyId, 'sources', table],
    queryFn: () => invokeCompliance<{ sources: Array<{ id: string; label: string }> }>(companyId, 'EVIDENCE_LIST_SOURCES', { source_table: table }),
    enabled: open && !!table,
  });
  const link = useMutation({
    mutationFn: () =>
      invokeCompliance<ObligationDetail>(companyId, 'EVIDENCE_ADD_REFERENCE', {
        cycle_id: cycle.id,
        source_table: table,
        source_id: sourceId,
      }),
    onSuccess: (detail) => {
      write(detail);
      toast.success('Record linked as proof');
      setSourceId('');
      onOpenChange(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} dirty={!!sourceId && !link.isPending}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a record as proof</DialogTitle>
          <DialogDescription>
            The record stays where it is; Compliance only points to it. Nothing is copied.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {sources.length > 1 && (
            <div className="space-y-1.5">
              <Label>Kind of record</Label>
              <Select value={table} onValueChange={(v) => { setTable(v); setSourceId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sources.map((s) => <SelectItem key={s} value={s}>{SOURCE_TABLE_LABEL[s] ?? s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{SOURCE_TABLE_LABEL[table] ?? 'Record'}</Label>
            {list.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : list.isError ? (
              <p className="text-sm text-destructive">{(list.error as Error).message}</p>
            ) : (list.data?.sources.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No records of this kind yet.</p>
            ) : (
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger><SelectValue placeholder="Choose a record" /></SelectTrigger>
                <SelectContent>
                  {list.data!.sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={link.isPending}>Cancel</Button>
          </DialogClose>
          <Button onClick={() => { setError(null); link.mutate(); }} disabled={!sourceId || link.isPending}>
            {link.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Link record
          </Button>
        </DialogFooter>
      </DialogContent>
    </FormDialog>
  );
}

export function EvidencePanel({ companyId, detail, cycle, canAdd }: {
  companyId: string;
  detail: ObligationDetail;
  cycle: CycleDetail;
  canAdd: boolean;
}) {
  const navigate = useNavigate();
  const obligationId = detail.obligation.id;
  const write = useDetailWriter(companyId, obligationId);
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const sources = detail.rule?.evidence_sources ?? [];
  const active = cycle.evidence.filter((e) => !e.deleted_at);
  const removed = cycle.evidence.filter((e) => e.deleted_at);

  // The tab for a file is opened synchronously on the click (so no pop-up
  // blocker stops it) and pointed at the short-lived signed link once the
  // server issues it. A linked record opens where it lives, in the app.
  const openEvidence = async (e: CycleDetail['evidence'][number]) => {
    const tab = e.kind === 'upload' ? window.open('about:blank', '_blank') : null;
    try {
      const res = await invokeCompliance<{ kind: 'upload' | 'reference'; url?: string; route?: string }>(
        companyId,
        'EVIDENCE_OPEN',
        { evidence_id: e.id },
      );
      if (res.kind === 'upload' && res.url) {
        if (tab) {
          tab.opener = null;
          tab.location.href = res.url;
        } else {
          window.location.assign(res.url);
        }
      } else if (res.route) {
        navigate(res.route);
      }
    } catch (err) {
      tab?.close();
      toast.error('Could not open the proof', { description: err instanceof Error ? err.message : undefined });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Proof{detail.rule?.evidence_required ? ' (required to complete)' : ''}
        </p>
        {canAdd && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setUploading(true)}>
              <Paperclip className="mr-1 h-3.5 w-3.5" /> Upload
            </Button>
            {sources.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setLinking(true)}>
                <Link2 className="mr-1 h-3.5 w-3.5" /> Link record
              </Button>
            )}
          </div>
        )}
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No proof added yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {active.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              {e.kind === 'upload' ? <FileText className="h-4 w-4 text-muted-foreground" /> : <Link2 className="h-4 w-4 text-muted-foreground" />}
              <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => void openEvidence(e)}>
                {e.title}
              </button>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {e.kind === 'reference' ? SOURCE_TABLE_LABEL[e.source_table ?? ''] : 'Upload'} · {e.uploaded_by_name ?? 'Unknown'} · {formatDate(e.created_at)}
              </span>
              <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove ${e.title}`} onClick={() => setRemoving(e.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {removed.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">{removed.length} removed</summary>
          <ul className="mt-1 space-y-0.5 pl-4">
            {removed.map((e) => (
              <li key={e.id}>
                {e.title} — removed by {e.deleted_by_name ?? 'unknown'} on {formatDate(e.deleted_at)}: {e.delete_reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <UploadDialog open={uploading} onOpenChange={setUploading} companyId={companyId} obligationId={obligationId} cycle={cycle} />
      {sources.length > 0 && (
        <LinkDialog open={linking} onOpenChange={setLinking} companyId={companyId} obligationId={obligationId} cycle={cycle} sources={sources} />
      )}
      <ActionDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this proof?"
        description="It is kept on record as removed, with your reason; it no longer counts as proof."
        fields={[{ name: 'reason', label: 'Reason', type: 'textarea', required: true, minLength: 3 }]}
        submitLabel="Remove"
        destructive
        onSubmit={async (v) => {
          const detailAfter = await invokeCompliance<ObligationDetail>(companyId, 'EVIDENCE_DELETE', {
            evidence_id: removing,
            reason: v.reason,
          });
          write(detailAfter);
          toast.success('Proof removed');
        }}
      />
    </div>
  );
}
