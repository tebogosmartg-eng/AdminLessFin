/**
 * Void a supplier credit: reverse its journal and withdraw what it settled.
 *
 * A reason is required because the reversal is permanent and is read later by
 * someone who was not there -- an auditor, or the supplier asking why a credit
 * they gave no longer appears against their account.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { edgeErrorMessage } from '@/lib/platform/edgeError';
import { formatCurrency } from '@/lib/utils';
import { refreshAfterVendorCreditChange } from '@/lib/vendorCredits/vendorCreditQueries';
import { showError, showSuccess } from '@/utils/toast';

export default function VoidVendorCreditDialog({
  isOpen,
  setIsOpen,
  vendorCredit,
  onVoided,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  vendorCredit: { id: string; number: string; total: number; applied: number };
  onVoided?: () => void;
}) {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!isOpen) setReason('');
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: { method: 'VOID', company_id: activeCompany!.id, vendorCreditId: vendorCredit.id, reason },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The supplier credit could not be voided.'));
      return data as { reversal_journal_number?: string };
    },
    onSuccess: (result) => {
      refreshAfterVendorCreditChange(queryClient);
      showSuccess(
        `${vendorCredit.number} voided${result?.reversal_journal_number ? ` and reversed by ${result.reversal_journal_number}` : ''}.`,
      );
      setIsOpen(false);
      onVoided?.();
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : 'The supplier credit could not be voided.'),
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Void supplier credit {vendorCredit.number}?</DialogTitle>
          <DialogDescription>
            Its journal is reversed today and the {formatCurrency(vendorCredit.total)} credit no longer reduces what
            is owed to the supplier.
            {vendorCredit.applied > 0 &&
              ` The ${formatCurrency(vendorCredit.applied)} set off against bills is withdrawn, so those bills are owed again.`}{' '}
            The credit stays on record, marked void.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="void-vendor-credit-reason">Reason</Label>
          <Textarea
            id="void-vendor-credit-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Recorded against the wrong supplier"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || reason.trim().length === 0}
          >
            {mutation.isPending ? 'Voiding…' : 'Void supplier credit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
