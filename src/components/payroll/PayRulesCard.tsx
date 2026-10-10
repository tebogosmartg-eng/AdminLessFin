import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Timer } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription } from '../ui/alert';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';
import { BCEA_TIME_POLICY, policyBelowBcea, type TimePolicy } from '../../lib/payrollRulesEngine/timePay';

type Policies = TimePolicy & { allowNegativeLeave: boolean; belowBcea: string[]; updatedAt: string | null };

const FIELDS: Array<{ key: keyof TimePolicy; label: string; help: string; step: string }> = [
  { key: 'overtimeMultiplier', label: 'Overtime', help: 'BCEA: at least 1.5×', step: '0.05' },
  { key: 'sundayMultiplier', label: 'Sunday work', help: 'BCEA: 2×', step: '0.05' },
  { key: 'sundayMultiplierRegular', label: 'Sunday work (regular Sunday workers)', help: 'BCEA: 1.5×', step: '0.05' },
  { key: 'publicHolidayMultiplier', label: 'Public holiday work', help: 'BCEA: 2×', step: '0.05' },
  { key: 'minimumShiftHours', label: 'Minimum paid shift (hours)', help: 'BCEA s9A: 4 hours; 0 = off', step: '0.5' },
];

/**
 * The company's pay rules for time worked. BCEA rates are the defaults; the employer may
 * choose others. Rates below the BCEA are allowed and shown as advice only.
 */
export default function PayRulesCard() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const key = ['payroll-policies', companyId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => invokePayroll<Policies>({ method: 'GET_PAYROLL_POLICIES', company_id: companyId }),
    enabled: !!companyId,
  });
  const [form, setForm] = useState<Record<keyof TimePolicy, string>>(() => Object.fromEntries(Object.entries(BCEA_TIME_POLICY).map(([k, v]) => [k, String(v)])) as Record<keyof TimePolicy, string>);
  const [allowNegativeLeave, setAllowNegativeLeave] = useState(false);
  useEffect(() => {
    if (!data) return;
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(data[f.key])])) as Record<keyof TimePolicy, string>);
    setAllowNegativeLeave(data.allowNegativeLeave);
  }, [data]);

  const current = Object.fromEntries(FIELDS.map((f) => [f.key, Number(form[f.key])])) as TimePolicy;
  const advice = policyBelowBcea(current);
  const save = useMutation({
    mutationFn: () => invokePayroll<Policies>({ method: 'UPDATE_PAYROLL_POLICIES', company_id: companyId, ...current, allowNegativeLeave }),
    onSuccess: (saved) => {
      queryClient.setQueryData(key, saved);
      queryClient.invalidateQueries({ queryKey: ['payroll-timesheet'] });
      showSuccess('Pay rules saved. Regenerate draft payslips to apply them.');
    },
    onError: (e: Error) => showError(e.message),
  });

  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;
  return (
    <Card data-testid="pay-rules">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5" /> Pay rules for time worked</CardTitle>
        <CardDescription>Multipliers for overtime, Sunday and public holiday work, the minimum paid shift, and leave beyond the balance. The BCEA rates are the defaults.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`pay-rule-${f.key}`}>{f.label}</Label>
              <Input id={`pay-rule-${f.key}`} type="number" step={f.step} min={f.key === 'minimumShiftHours' ? 0 : 1} max={f.key === 'minimumShiftHours' ? 12 : 5}
                value={form[f.key]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} />
              <p className="text-xs text-muted-foreground">{f.help}</p>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3">
          <Switch id="allow-negative-leave" checked={allowNegativeLeave} onCheckedChange={setAllowNegativeLeave} />
          <div>
            <Label htmlFor="allow-negative-leave" className="font-normal">Allow leave beyond the available balance</Label>
            <p className="text-xs text-muted-foreground">Off: leave over the balance is refused (record it as unpaid or adjust the balance). On: it is recorded and the balance goes negative.</p>
          </div>
        </div>
        {advice.length > 0 && (
          <Alert>
            <AlertDescription>
              Below the BCEA minimum (allowed, but the employer carries the risk): {advice.join('; ')}.
            </AlertDescription>
          </Alert>
        )}
        <Button onClick={() => save.mutate()} disabled={save.isPending || FIELDS.some((f) => form[f.key].trim() === '' || Number.isNaN(Number(form[f.key])))}>
          {save.isPending ? 'Saving…' : 'Save pay rules'}
        </Button>
      </CardContent>
    </Card>
  );
}
