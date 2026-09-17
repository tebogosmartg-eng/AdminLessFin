/**
 * Void a credit note: reverse its journal and withdraw what it settled.
 *
 * A reason is required because the reversal is permanent and is read later by
 * someone who was not there -- an auditor, or the customer asking why a credit
 * they were sent no longer appears on their statement.
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
import { refreshAfterCreditNoteChange } from '@/lib/creditNotes/creditNoteQueries';
import { showError, showSuccess } from '@/utils/toast';

export default function VoidCreditNoteDialog({
  isOpen,
  setIsOpen,
  creditNote,
  onVoided,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  creditNote: { id: string; number: string; total: number; applied: number };
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
      const { data, error } = await supabase.functions.invoke('credit-notes', {
        body: { method: 'VOID', company_id: activeCompany!.id, creditNoteId: creditNote.id, reason },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The credit note could not be voided.'));
      return data as { reversal_journal_number?: string };
    },
    onSuccess: (result) => {
      refreshAfterCreditNoteChange(queryClient);
      showSuccess(
        `${creditNote.number} voided${result?.reversal_journal_number ? ` and reversed by ${result.reversal_journal_number}` : ''}.`,
      );
      setIsOpen(false);
      onVoided?.();
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : 'The credit note could not be voided.'),
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Void credit note {creditNote.number}?</DialogTitle>
          <DialogDescription>
            Its journal is reversed today and the {formatCurrency(creditNote.total)} credit no longer reduces the
            customer&rsquo;s balance.
            {creditNote.applied > 0 &&
              ` The ${formatCurrency(creditNote.applied)} applied to invoices is withdrawn, so those invoices are owed again.`}{' '}
            The credit note stays on record, marked void.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="void-credit-note-reason">Reason</Label>
          <Textarea
            id="void-credit-note-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Issued to the wrong customer"
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
            {mutation.isPending ? 'Voiding…' : 'Void credit note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
