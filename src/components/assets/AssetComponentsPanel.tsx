import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, RefreshCw, Calculator } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { EmptyState } from '../EmptyState';
import { formatCurrency } from '../../lib/utils';
import { showError, showSuccess } from '../../utils/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Textarea } from '../ui/textarea';

export type AssetComponentRow = {
  id: string;
  component_code: string;
  description: string;
  cost: number;
  useful_life_years?: number | null;
  residual_value?: number | null;
  accumulated_depreciation?: number | null;
  depreciation_method?: string | null;
  status: string;
  last_depreciation_date?: string | null;
};

type Props = {
  assetId: string;
  components: AssetComponentRow[];
  onChanged: () => void;
};

const emptyForm = {
  component_code: '',
  description: '',
  cost: '0',
  useful_life_years: '5',
  residual_value: '0',
  depreciation_method: 'straight-line',
};

const AssetComponentsPanel = ({ assetId, components, onChanged }: Props) => {
  const { activeCompany } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replaceForm, setReplaceForm] = useState(emptyForm);
  const [replaceNotes, setReplaceNotes] = useState('');

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No company');
      if (!form.component_code.trim() || !form.description.trim()) {
        throw new Error('Code and description are required');
      }
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'UPSERT_COMPONENT',
          company_id: activeCompany.id,
          assetId,
          component: {
            component_code: form.component_code.trim(),
            description: form.description.trim(),
            cost: Number(form.cost) || 0,
            useful_life_years: Number(form.useful_life_years) || null,
            residual_value: Number(form.residual_value) || 0,
            depreciation_method: form.depreciation_method || 'straight-line',
            status: 'active',
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Component saved.');
      setShowAdd(false);
      setForm(emptyForm);
      onChanged();
    },
    onError: (e: Error) => showError(e.message),
  });

  const replaceMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !replaceId) throw new Error('Missing context');
      if (!replaceForm.component_code.trim() || !replaceForm.description.trim()) {
        throw new Error('Replacement code and description required');
      }
      const { error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'REPLACE_COMPONENT',
          company_id: activeCompany.id,
          componentId: replaceId,
          notes: replaceNotes.trim() || undefined,
          replacement: {
            component_code: replaceForm.component_code.trim(),
            description: replaceForm.description.trim(),
            cost: Number(replaceForm.cost) || 0,
            useful_life_years: Number(replaceForm.useful_life_years) || null,
            residual_value: Number(replaceForm.residual_value) || 0,
            depreciation_method: replaceForm.depreciation_method || 'straight-line',
            status: 'active',
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess('Component replaced.');
      setReplaceId(null);
      setReplaceForm(emptyForm);
      setReplaceNotes('');
      onChanged();
    },
    onError: (e: Error) => showError(e.message),
  });

  const depreciateMutation = useMutation({
    mutationFn: async (componentId: string) => {
      if (!activeCompany) throw new Error('No company');
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'DEPRECIATE_COMPONENT',
          company_id: activeCompany.id,
          componentId,
        },
      });
      if (error) throw error;
      return data as { amount?: number; memo_only?: boolean; message?: string };
    },
    onSuccess: (data) => {
      showSuccess(
        data.message ||
          `Memo depreciation ${formatCurrency(Number(data.amount || 0))} applied. (No journal.)`
      );
      onChanged();
    },
    onError: (e: Error) => showError(e.message),
  });

  const nbv = (c: AssetComponentRow) =>
    Number(c.cost || 0) - Number(c.accumulated_depreciation || 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Component depreciation is memo-only and does not change parent asset depreciation or journals.
        </p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add component
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Components</CardTitle>
          <CardDescription>{components.length} component(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Life</TableHead>
                <TableHead className="text-right">Residual</TableHead>
                <TableHead className="text-right">Accum. depr</TableHead>
                <TableHead className="text-right">NBV</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {components.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState
                      icon={Plus}
                      title="No components"
                      description="Add major components for separate memo depreciation tracking."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                components.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.component_code}</TableCell>
                    <TableCell>{c.description}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(c.cost)}</TableCell>
                    <TableCell className="text-right">{c.useful_life_years ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(c.residual_value || 0))}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(c.accumulated_depreciation || 0))}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(nbv(c))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.status === 'active' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => depreciateMutation.mutate(c.id)}
                              disabled={depreciateMutation.isPending}
                            >
                              <Calculator className="mr-1 h-3 w-3" />
                              Depreciate
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReplaceId(c.id);
                                setReplaceForm({
                                  ...emptyForm,
                                  component_code: `${c.component_code}-R`,
                                  description: c.description,
                                  cost: String(c.cost),
                                  useful_life_years: String(c.useful_life_years || 5),
                                  residual_value: String(c.residual_value || 0),
                                });
                              }}
                            >
                              <RefreshCw className="mr-1 h-3 w-3" />
                              Replace
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add component</DialogTitle>
            <DialogDescription>Memo accounting only — parent journals unchanged.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                value={form.component_code}
                onChange={(e) => setForm((p) => ({ ...p, component_code: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Cost</Label>
              <Input
                type="number"
                value={form.cost}
                onChange={(e) => setForm((p) => ({ ...p, cost: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Useful life (years)</Label>
              <Input
                type="number"
                value={form.useful_life_years}
                onChange={(e) => setForm((p) => ({ ...p, useful_life_years: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Residual</Label>
              <Input
                type="number"
                value={form.residual_value}
                onChange={(e) => setForm((p) => ({ ...p, residual_value: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!replaceId} onOpenChange={(o) => !o && setReplaceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace component</DialogTitle>
            <DialogDescription>Marks the old component replaced and inserts a new one.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>New code</Label>
              <Input
                value={replaceForm.component_code}
                onChange={(e) => setReplaceForm((p) => ({ ...p, component_code: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Description</Label>
              <Input
                value={replaceForm.description}
                onChange={(e) => setReplaceForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Cost</Label>
              <Input
                type="number"
                value={replaceForm.cost}
                onChange={(e) => setReplaceForm((p) => ({ ...p, cost: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Useful life</Label>
              <Input
                type="number"
                value={replaceForm.useful_life_years}
                onChange={(e) =>
                  setReplaceForm((p) => ({ ...p, useful_life_years: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={replaceNotes}
                onChange={(e) => setReplaceNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplaceId(null)}>
              Cancel
            </Button>
            <Button onClick={() => replaceMutation.mutate()} disabled={replaceMutation.isPending}>
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssetComponentsPanel;
