/**
 * Apply a credit note to the customer's open invoices.
 *
 * The invoices and what is left on each come from the same allocation engine
 * the receipt dialog uses, and the credit is applied through it too, so an
 * invoice settled by a credit note is settled in every view -- its status, its
 * ageing, its printed balance -- exactly as if it had been paid.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { edgeErrorMessage } from '@/lib/platform/edgeError';
import { formatCurrency } from '@/lib/utils';
import { roundCents } from '@/lib/creditNotes/creditNoteTotals';
import { refreshAfterCreditNoteChange } from '@/lib/creditNotes/creditNoteQueries';
import { showError, showSuccess } from '@/utils/toast';
import { format } from 'date-fns';

type OpenInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  outstanding: number;
};

export type ApplyCreditNoteTarget = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  remaining: number;
};

export default function ApplyCreditNoteDialog({
  isOpen,
  setIsOpen,
  creditNote,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  creditNote: ApplyCreditNoteTarget;
}) {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) setAmounts({});
  }, [isOpen]);

  const { data: invoices, isLoading } = useQuery<OpenInvoice[]>({
    queryKey: ['customer_open_invoices', activeCompany?.id, creditNote.customerId],
    enabled: isOpen && !!activeCompany,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('payments', {
        body: {
          method: 'GET_CUSTOMER_OPEN_INVOICES',
          company_id: activeCompany!.id,
          customerId: creditNote.customerId,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The open invoices could not be loaded.'));
      return (data ?? []) as OpenInvoice[];
    },
  });

  const allocations = useMemo(
    () =>
      Object.entries(amounts)
        .map(([invoiceId, value]) => ({ invoice_id: invoiceId, amount: roundCents(Number(value)) }))
        .filter((a) => Number.isFinite(a.amount) && a.amount > 0),
    [amounts],
  );
  const totalApplied = roundCents(allocations.reduce((t, a) => t + a.amount, 0));
  const overInvoice = allocations.find((a) => {
    const invoice = invoices?.find((i) => i.id === a.invoice_id);
    return invoice ? a.amount > invoice.outstanding + 0.005 : false;
  });
  const problem =
    totalApplied > creditNote.remaining + 0.005
      ? `Only ${formatCurrency(creditNote.remaining)} of this credit is left to apply.`
      : overInvoice
        ? `${invoices?.find((i) => i.id === overInvoice.invoice_id)?.invoice_number} has only ${formatCurrency(
            invoices?.find((i) => i.id === overInvoice.invoice_id)?.outstanding ?? 0,
          )} outstanding.`
        : null;

  /** Oldest first, never more than the invoice owes or the credit has left. */
  const fillOldestFirst = () => {
    let left = creditNote.remaining;
    const next: Record<string, string> = {};
    for (const invoice of invoices ?? []) {
      if (left <= 0) break;
      const take = roundCents(Math.min(invoice.outstanding, left));
      if (take > 0) next[invoice.id] = take.toFixed(2);
      left = roundCents(left - take);
    }
    setAmounts(next);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('credit-notes', {
        body: {
          method: 'APPLY',
          company_id: activeCompany!.id,
          creditNoteId: creditNote.id,
          allocations,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The credit could not be applied.'));
      return data as { applied_now: number; remaining: number };
    },
    onSuccess: (result) => {
      refreshAfterCreditNoteChange(queryClient);
      showSuccess(
        result.remaining > 0
          ? `${formatCurrency(result.applied_now)} applied. ${formatCurrency(result.remaining)} is still held on account.`
          : `${formatCurrency(result.applied_now)} applied. ${creditNote.number} is now applied in full.`,
      );
      setIsOpen(false);
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : 'The credit could not be applied.'),
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply credit note {creditNote.number}</DialogTitle>
          <DialogDescription>
            {formatCurrency(creditNote.remaining)} is available to set against {creditNote.customerName}&rsquo;s
            open invoices.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Applying: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(totalApplied)}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fillOldestFirst}
            disabled={!invoices || invoices.length === 0}
          >
            Apply oldest first
          </Button>
        </div>

        <div className="max-h-[320px] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="w-[140px] text-right">Apply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ) : invoices && invoices.length > 0 ? (
                invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{format(new Date(invoice.invoice_date + 'T00:00:00'), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(invoice.outstanding)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="text-right"
                        aria-label={`Amount to apply to ${invoice.invoice_number}`}
                        value={amounts[invoice.id] ?? ''}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [invoice.id]: e.target.value }))}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    {creditNote.customerName} has no open invoices. The credit stays on account until one is raised.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {problem && <p className="text-sm font-medium text-destructive">{problem}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || allocations.length === 0 || !!problem}
          >
            {mutation.isPending ? 'Applying…' : 'Apply credit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
