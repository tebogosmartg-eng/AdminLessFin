import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { accountingPoliciesService } from '../../governance/domains/accountingPolicies/service';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { showSuccess, showError } from '../../utils/toast';

// Phase 4C Part 7: the one administration surface for company_materiality_settings.
// Owner/admin only (mirrors SET_MATERIALITY_SETTINGS' own server-side check).
// Phase G3.4 — Materiality authority migrated to the Governance Accounting
// Policies Service. Underlying accounting edge GET_/SET_MATERIALITY_SETTINGS
// calls are unchanged; only the resolution path goes through Governance.
export default function MaterialitySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['materiality-settings', companyId],
    queryFn: () => accountingPoliciesService.getMaterialitySettings(companyId!),
    enabled: open && !!companyId,
  });

  const [percentageThreshold, setPercentageThreshold] = useState('5');
  const [absoluteThreshold, setAbsoluteThreshold] = useState('1000');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setPercentageThreshold(String(data.percentageThreshold ?? 5));
      setAbsoluteThreshold(String(data.absoluteThreshold ?? 1000));
    }
  }, [data]);

  const handleSave = async () => {
    if (!companyId) return;
    const pct = Number(percentageThreshold);
    const abs = Number(absoluteThreshold);
    if (!Number.isFinite(pct) || pct < 0 || !Number.isFinite(abs) || abs < 0) {
      showError('Thresholds must be non-negative numbers');
      return;
    }
    setSaving(true);
    try {
      const result = await accountingPoliciesService.setMaterialitySettings(companyId, pct, abs);
      if (!result.success) throw new Error(result.error || 'Failed to update materiality thresholds');
      await queryClient.invalidateQueries({ queryKey: ['materiality-settings', companyId] });
      showSuccess('Materiality thresholds updated');
      onOpenChange(false);
    } catch (e: unknown) {
      showError(e instanceof Error ? e.message : 'Failed to update materiality thresholds');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Materiality Settings</DialogTitle>
          <DialogDescription>
            Movements below both thresholds are treated as immaterial and are suppressed from
            the Dashboard, Drivers, Insights and Variance workspaces so small fluctuations don't
            dominate the view.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pct-threshold">Percentage threshold (%)</Label>
            <Input
              id="pct-threshold"
              type="number"
              min="0"
              step="0.1"
              value={percentageThreshold}
              onChange={(e) => setPercentageThreshold(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="abs-threshold">Absolute threshold (amount)</Label>
            <Input
              id="abs-threshold"
              type="number"
              min="0"
              step="1"
              value={absoluteThreshold}
              onChange={(e) => setAbsoluteThreshold(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A movement is material if it clears <strong>either</strong> threshold — e.g. a small
            percentage move on a large balance, or a large absolute move on a small one.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || isLoading}>{saving ? 'Saving…' : 'Save thresholds'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
