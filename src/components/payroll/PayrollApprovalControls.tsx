import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import { showError, showSuccess } from '../../utils/toast';
import { invokePayroll } from '../../lib/payrollOperations';
import { payrollControlsQueryKey, usePayrollControls, type PayrollControls } from './usePayrollControls';

/**
 * Separation of duties on payroll approval. The person who prepares a run cannot
 * approve it; only the owner can allow self-approval, with a reason, for a one-person payroll.
 */
const PayrollApprovalControls = () => {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const { data, isLoading } = usePayrollControls(companyId);
  const [allow, setAllow] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!data) return;
    setAllow(data.allow_self_approval);
    setReason(data.self_approval_reason ?? '');
  }, [data]);

  const save = useMutation({
    mutationFn: () => invokePayroll<PayrollControls>({
      method: 'UPDATE_PAYROLL_CONTROLS',
      company_id: companyId,
      allow_self_approval: allow,
      reason: allow ? reason : null,
    }),
    onSuccess: (saved) => {
      queryClient.setQueryData(payrollControlsQueryKey(companyId ?? ''), saved);
      showSuccess(saved.allow_self_approval ? 'Self-approval allowed. Each self-approval is recorded in the audit trail.' : 'Separation of duties is enforced.');
    },
    onError: (error: Error) => showError(error.message),
  });

  if (isLoading || !data) return <Skeleton className="h-40 w-full" />;

  const dirty = allow !== data.allow_self_approval || (allow && reason !== (data.self_approval_reason ?? ''));
  const reasonTooShort = allow && reason.trim().length < 10;

  return (
    <Card data-testid="payroll-approval-controls">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Payroll Approval</CardTitle>
        <CardDescription>
          The person who prepares a payroll run (generates or edits payslips, or changes its inputs) cannot approve it.
          Another owner or admin must approve.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="allow-self-approval" className="font-medium">Allow self-approval (one-person payroll)</Label>
            <p className="text-sm text-muted-foreground">
              For a business with only one person running payroll. Every self-approved run is flagged in the audit trail.
              {!data.can_change && ' Only the company owner can change this.'}
            </p>
          </div>
          <Switch
            id="allow-self-approval"
            checked={allow}
            disabled={!data.can_change || save.isPending}
            onCheckedChange={setAllow}
          />
        </div>
        {allow && (
          <div className="space-y-1">
            <Label htmlFor="self-approval-reason">Reason</Label>
            <Textarea
              id="self-approval-reason"
              value={reason}
              disabled={!data.can_change || save.isPending}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Sole owner runs payroll; there is no second administrator."
            />
            {reasonTooShort && data.can_change && (
              <p className="text-xs text-destructive">Give a reason of at least 10 characters.</p>
            )}
          </div>
        )}
        {data.updated_at && (
          <p className="text-xs text-muted-foreground">Last changed {format(new Date(data.updated_at), 'PPP p')}.</p>
        )}
        {data.can_change && (
          <Button onClick={() => save.mutate()} disabled={!dirty || reasonTooShort || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Approval Setting'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default PayrollApprovalControls;
