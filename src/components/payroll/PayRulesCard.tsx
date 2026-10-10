import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Timer } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';

type Policies = { allowNegativeLeave: boolean; updatedAt: string | null };

/** The company's payroll rules: whether leave may be taken beyond the balance. */
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
  const [allowNegativeLeave, setAllowNegativeLeave] = useState(false);
  useEffect(() => { if (data) setAllowNegativeLeave(data.allowNegativeLeave); }, [data]);

  const save = useMutation({
    mutationFn: () => invokePayroll<Policies>({ method: 'UPDATE_PAYROLL_POLICIES', company_id: companyId, allowNegativeLeave }),
    onSuccess: (saved) => { queryClient.setQueryData(key, saved); showSuccess('Payroll rules saved.'); },
    onError: (e: Error) => showError(e.message),
  });

  if (isLoading || !data) return <Skeleton className="h-32 w-full" />;
  return (
    <Card data-testid="pay-rules">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5" /> Payroll rules</CardTitle>
        <CardDescription>Daily-paid staff are paid days × daily rate and hourly-paid staff hours × hourly rate. Add overtime or anything extra as a once-off earning on the payslip.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <Switch id="allow-negative-leave" checked={allowNegativeLeave} onCheckedChange={setAllowNegativeLeave} />
          <div>
            <Label htmlFor="allow-negative-leave" className="font-normal">Allow leave beyond the available balance</Label>
            <p className="text-xs text-muted-foreground">Off: leave over the balance is refused (record it as unpaid or adjust the balance). On: it is recorded and the balance goes negative.</p>
          </div>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || allowNegativeLeave === data.allowNegativeLeave}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}
