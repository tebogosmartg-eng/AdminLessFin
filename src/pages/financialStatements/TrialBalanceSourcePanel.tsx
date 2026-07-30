import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../lib/financialStatements/api';
import { parseCsvTrialBalance } from '../../lib/financialStatements/frp/canonicalTrialBalance';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { EMPTY_SELECT_VALUE } from '../../lib/constants';
import { toast } from 'sonner';

type Props = {
  companyId: string;
  workspaceId: string;
  reportingPeriodId: string | null;
  frameworkPackId: string | null;
  snapshotVersionId: string | null;
};

const SOURCE_SYSTEMS = [
  { value: 'csv', label: 'CSV' },
  { value: 'excel', label: 'Excel (as CSV rows)' },
  { value: 'sage', label: 'Sage' },
  { value: 'xero', label: 'Xero' },
  { value: 'quickbooks', label: 'QuickBooks' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'sap', label: 'SAP' },
  { value: 'dynamics365', label: 'Dynamics 365' },
  { value: 'netsuite', label: 'NetSuite' },
  { value: 'other', label: 'Other' },
] as const;

/**
 * V7.0.0 — Trial Balance source panel.
 * Native GL continues via existing capture/refresh. This panel adds imported TB → Canonical TB.
 */
export default function TrialBalanceSourcePanel({
  companyId,
  workspaceId,
  reportingPeriodId,
  frameworkPackId,
  snapshotVersionId,
}: Props) {
  const qc = useQueryClient();
  const [sourceSystem, setSourceSystem] = useState<string>('csv');
  const [csvText, setCsvText] = useState('');
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [resolveType, setResolveType] = useState<string>('Asset');
  const [selectedQueueId, setSelectedQueueId] = useState<string>(EMPTY_SELECT_VALUE);

  const sourcesQ = useQuery({
    queryKey: ['efs-frp-sources', companyId, workspaceId],
    enabled: !!companyId && !!workspaceId,
    queryFn: () =>
      invokeFinancialStatements<{ sources: Array<Record<string, unknown>> }>(
        companyId,
        'FRP_LIST_SOURCES',
        { workspace_id: workspaceId },
      ),
  });

  const ctbQ = useQuery({
    queryKey: ['efs-frp-ctb', companyId, workspaceId],
    enabled: !!companyId && !!workspaceId,
    queryFn: () =>
      invokeFinancialStatements<{ canonical_trial_balances: Array<Record<string, unknown>> }>(
        companyId,
        'FRP_LIST_CANONICAL_TB',
        { workspace_id: workspaceId },
      ),
  });

  const queueQ = useQuery({
    queryKey: ['efs-frp-queue', companyId, activeImportId],
    enabled: !!companyId && !!activeImportId,
    queryFn: () =>
      invokeFinancialStatements<{ queue: Array<Record<string, unknown>> }>(
        companyId,
        'FRP_LIST_MAPPING_QUEUE',
        { import_id: activeImportId },
      ),
  });

  const previewCount = useMemo(() => {
    if (!csvText.trim()) return 0;
    try {
      return parseCsvTrialBalance(csvText).length;
    } catch {
      return 0;
    }
  }, [csvText]);

  const importMut = useMutation({
    mutationFn: async () => {
      if (!reportingPeriodId) throw new Error('Reporting period is required.');
      const sourceRes = await invokeFinancialStatements<{ source: { id: string } }>(
        companyId,
        'FRP_CREATE_SOURCE',
        {
          workspace_id: workspaceId,
          reporting_period_id: reportingPeriodId,
          snapshot_version_id: snapshotVersionId,
          source_kind: 'imported_tb',
          source_system: sourceSystem,
          label: `Imported Trial Balance (${sourceSystem})`,
        },
      );
      const imp = await invokeFinancialStatements<{ import: { id: string }; line_count: number }>(
        companyId,
        'FRP_IMPORT_TRIAL_BALANCE',
        {
          source_id: sourceRes.source.id,
          csv_text: csvText,
          format: sourceSystem === 'excel' ? 'excel' : 'csv',
          file_name: `tb-import.${sourceSystem === 'excel' ? 'xlsx' : 'csv'}`,
        },
      );
      let mappingSetId: string | null = null;
      if (frameworkPackId) {
        const ms = await invokeFinancialStatements<{ mapping_set: { id: string } }>(
          companyId,
          'FRP_ENSURE_MAPPING_SET',
          {
            framework_pack_id: frameworkPackId,
            source_system: sourceSystem,
          },
        );
        mappingSetId = ms.mapping_set.id;
      }
      const mapped = await invokeFinancialStatements<{
        queued: number;
        auto_mapped: number;
        status: string;
      }>(companyId, 'FRP_RUN_MAPPING_ENGINE', {
        import_id: imp.import.id,
        mapping_set_id: mappingSetId,
      });
      return { ...imp, mapped };
    },
    onSuccess: (data) => {
      setActiveImportId(data.import.id);
      toast.success(
        `Imported ${data.line_count} lines · ${data.mapped.auto_mapped} auto-mapped · ${data.mapped.queued} queued`,
      );
      qc.invalidateQueries({ queryKey: ['efs-frp-sources', companyId, workspaceId] });
      qc.invalidateQueries({ queryKey: ['efs-frp-queue', companyId, data.import.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: async () => {
      if (!selectedQueueId || selectedQueueId === EMPTY_SELECT_VALUE) {
        throw new Error('Select a mapping queue item.');
      }
      return invokeFinancialStatements(companyId, 'FRP_RESOLVE_MAPPING_QUEUE_ITEM', {
        queue_id: selectedQueueId,
        canonical_account_type: resolveType,
        action: 'resolve',
      });
    },
    onSuccess: () => {
      toast.success('Mapping resolved');
      setSelectedQueueId(EMPTY_SELECT_VALUE);
      qc.invalidateQueries({ queryKey: ['efs-frp-queue', companyId, activeImportId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sealMut = useMutation({
    mutationFn: async () => {
      if (!activeImportId) throw new Error('Import a Trial Balance first.');
      const sealed = await invokeFinancialStatements<{
        canonical_trial_balance: { id: string };
        line_count: number;
      }>(companyId, 'FRP_SEAL_CANONICAL_TB_FROM_IMPORT', {
        import_id: activeImportId,
        snapshot_version_id: snapshotVersionId,
      });
      if (snapshotVersionId) {
        await invokeFinancialStatements(companyId, 'FRP_PROJECT_TO_FACT_SNAPSHOT', {
          canonical_tb_id: sealed.canonical_trial_balance.id,
          snapshot_version_id: snapshotVersionId,
        });
      }
      return sealed;
    },
    onSuccess: (data) => {
      toast.success(
        `Canonical Trial Balance sealed (${data.line_count} lines)${
          snapshotVersionId ? ' and projected to the reporting pack' : ''
        }`,
      );
      qc.invalidateQueries({ queryKey: ['efs-frp-ctb', companyId, workspaceId] });
      qc.invalidateQueries({ queryKey: ['efs-workspace-dashboard', companyId, workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const queue = queueQ.data?.queue || [];
  const ctbs = ctbQ.data?.canonical_trial_balances || [];
  const sources = sourcesQ.data?.sources || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Trial Balance source</CardTitle>
          <CardDescription>
            Annual Financial Statements consume one Canonical Trial Balance — whether captured from
            AdminLess accounting or imported from an external system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            Prefer AdminLess books? Use <strong className="text-foreground">Generate</strong> or{' '}
            <strong className="text-foreground">Refresh Financial Statements</strong> on the Financial
            Statements tab — the platform captures the Trial Balance from accounting automatically.
            Use this panel only when importing a Trial Balance from an external system (CSV / Excel
            from Sage, Xero, QuickBooks, Pastel, SAP, and others).
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Source system</Label>
              <Select value={sourceSystem} onValueChange={setSourceSystem}>
                <SelectTrigger>
                  <SelectValue placeholder="Select system" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_SYSTEMS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <p className="text-sm text-muted-foreground">
                Preview: <strong className="text-foreground">{previewCount}</strong> account lines
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tb-csv">Trial Balance CSV</Label>
            <Textarea
              id="tb-csv"
              className="min-h-[160px] font-mono text-xs"
              placeholder={
                'account_code,account_name,account_type,debit,credit\n1000,Bank,Asset,50000,0\n2000,Payables,Liability,0,12000'
              }
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!csvText.trim() || !reportingPeriodId || importMut.isPending}
              onClick={() => importMut.mutate()}
            >
              {importMut.isPending ? 'Importing…' : 'Import & map'}
            </Button>
            <Button
              variant="secondary"
              disabled={!activeImportId || queue.length > 0 || sealMut.isPending}
              onClick={() => sealMut.mutate()}
            >
              {sealMut.isPending ? 'Sealing…' : 'Seal Canonical Trial Balance'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {activeImportId && (
        <Card>
          <CardHeader>
            <CardTitle>Manual mapping queue</CardTitle>
            <CardDescription>
              Unmapped imported accounts must be classified before the Canonical Trial Balance can
              be sealed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue clear — ready to seal.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Queue item</Label>
                  <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select unmapped account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EMPTY_SELECT_VALUE}>Select account</SelectItem>
                      {queue.map((q) => {
                        const line = q.efs_tb_import_lines as
                          | { source_account_name?: string; source_account_code?: string }
                          | undefined;
                        const label = `${line?.source_account_code || ''} ${line?.source_account_name || q.import_line_id}`.trim();
                        return (
                          <SelectItem key={String(q.id)} value={String(q.id)}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Canonical account type</Label>
                  <Select value={resolveType} onValueChange={setResolveType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['Asset', 'Liability', 'Equity', 'Income', 'Expense'].map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button disabled={resolveMut.isPending} onClick={() => resolveMut.mutate()}>
                  Resolve mapping
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Canonical Trial Balances</CardTitle>
          <CardDescription>Sealed reporting substrate for this engagement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ctbs.length === 0 && sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Canonical Trial Balance sealed yet.</p>
          ) : (
            ctbs.map((c) => (
              <div
                key={String(c.id)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{String(c.source_kind)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {String(c.line_count)} lines · {String(c.period_end)}
                  </span>
                </div>
                <Badge variant="outline">{String(c.status)}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
