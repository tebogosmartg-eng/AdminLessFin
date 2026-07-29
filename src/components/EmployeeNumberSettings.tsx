import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { showError, showSuccess } from '../utils/toast';
import { supabase } from '../integrations/supabase/client';
import {
  POLICY_PRESETS,
  POLICY_TOKEN_OPTIONS,
  DISPLAY_FORMAT_OPTIONS,
  QR_STYLE_OPTIONS,
  BARCODE_STYLE_OPTIONS,
  previewEmployeeNumber,
  type EmployeeNumberingPolicy,
} from '../lib/employeeIdentity';

const EmployeeNumberSettings = () => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<EmployeeNumberingPolicy>({
    format_template: 'EMP-{SEQ}',
    sequence_padding: 6,
    next_sequence: 1,
    starting_number: 1,
    company_code: '',
    branch_code: 'MAIN',
    qr_style: 'standard',
    barcode_style: 'code128',
    display_format: 'stacked',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['employee_numbering_policy', activeCompany?.id],
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke('employees', {
        body: { method: 'GET_NUMBERING_POLICY', company_id: activeCompany!.id },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result as EmployeeNumberingPolicy & { employees_assigned?: number };
    },
    enabled: !!activeCompany,
  });

  useEffect(() => {
    if (data) {
      setLocal({
        format_template: data.format_template,
        sequence_padding: data.sequence_padding,
        next_sequence: data.next_sequence,
        starting_number: data.starting_number ?? data.next_sequence,
        company_code: data.company_code ?? '',
        branch_code: data.branch_code ?? 'MAIN',
        qr_style: data.qr_style ?? 'standard',
        barcode_style: data.barcode_style ?? 'code128',
        display_format: data.display_format ?? 'stacked',
      });
    }
  }, [data]);

  const preview = useMemo(
    () => previewEmployeeNumber(local),
    [local]
  );

  const nextPreview = useMemo(
    () => previewEmployeeNumber(local, (local.next_sequence ?? 1) + 1),
    [local]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company selected');
      const { data: result, error } = await supabase.functions.invoke('employees', {
        body: {
          method: 'UPDATE_NUMBERING_POLICY',
          company_id: activeCompany.id,
          policy: {
            format_template: local.format_template,
            sequence_padding: local.sequence_padding,
            company_code: local.company_code || null,
            branch_code: local.branch_code || 'MAIN',
            starting_number: local.starting_number,
            qr_style: local.qr_style,
            barcode_style: local.barcode_style,
            display_format: local.display_format,
          },
        },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee_numbering_policy', activeCompany?.id] });
      showSuccess('Employee numbering policy saved. Existing numbers are unchanged.');
    },
    onError: (err: Error) => showError(err.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Identity</CardTitle>
        <CardDescription>
          Configure employee numbering, display format, and identity codes for new employees.
          Changing the pattern never modifies existing employee numbers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {POLICY_PRESETS.map((preset) => (
            <Button
              key={preset.pattern}
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setLocal((prev) => ({ ...prev, format_template: preset.pattern }))}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pattern">Pattern</Label>
            <Input
              id="pattern"
              value={local.format_template}
              onChange={(e) => setLocal((p) => ({ ...p, format_template: e.target.value }))}
              placeholder="EMP-{SEQ}"
            />
            <div className="flex flex-wrap gap-1">
              {POLICY_TOKEN_OPTIONS.map((t) => (
                <Badge
                  key={t.token}
                  variant="secondary"
                  className="text-[10px] cursor-pointer"
                  title={t.description}
                  onClick={() =>
                    setLocal((p) => ({
                      ...p,
                      format_template: `${p.format_template}${t.token}`,
                    }))
                  }
                >
                  {t.token}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_code">Company Code ({'{COMPANY}'})</Label>
            <Input
              id="company_code"
              value={local.company_code ?? ''}
              onChange={(e) => setLocal((p) => ({ ...p, company_code: e.target.value.toUpperCase() }))}
              placeholder="SPC"
              maxLength={12}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch_code">Branch Code ({'{BRANCH}'})</Label>
            <Input
              id="branch_code"
              value={local.branch_code ?? ''}
              onChange={(e) => setLocal((p) => ({ ...p, branch_code: e.target.value.toUpperCase() }))}
              placeholder="PTA"
              maxLength={12}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="padding">Sequence Padding</Label>
            <Input
              id="padding"
              type="number"
              min={1}
              max={12}
              value={local.sequence_padding}
              onChange={(e) =>
                setLocal((p) => ({ ...p, sequence_padding: Number(e.target.value) || 6 }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="next_seq">Next Sequence (read-only)</Label>
            <Input id="next_seq" value={local.next_sequence} readOnly disabled className="font-mono" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Display Format</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={local.display_format ?? 'stacked'}
              onChange={(e) => setLocal((p) => ({ ...p, display_format: e.target.value as EmployeeNumberingPolicy['display_format'] }))}
            >
              {DISPLAY_FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>QR Style</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={local.qr_style ?? 'standard'}
              onChange={(e) => setLocal((p) => ({ ...p, qr_style: e.target.value as EmployeeNumberingPolicy['qr_style'] }))}
            >
              {QR_STYLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Barcode Style</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={local.barcode_style ?? 'code128'}
              onChange={(e) => setLocal((p) => ({ ...p, barcode_style: e.target.value as EmployeeNumberingPolicy['barcode_style'] }))}
            >
              {BARCODE_STYLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-md border bg-muted/40 p-4 space-y-2">
          <p className="text-sm font-medium">Preview</p>
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div>
              <span className="text-muted-foreground">Next employee: </span>
              <span className="font-mono font-medium">{preview}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Following: </span>
              <span className="font-mono text-muted-foreground">{nextPreview}</span>
            </div>
          </div>
          {data?.employees_assigned != null && (
            <p className="text-xs text-muted-foreground">
              {data.employees_assigned} employee(s) already assigned — their numbers will not change.
            </p>
          )}
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save Numbering Policy'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default EmployeeNumberSettings;
