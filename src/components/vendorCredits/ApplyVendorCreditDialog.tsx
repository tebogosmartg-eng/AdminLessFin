/**
 * Set a supplier credit off against the supplier's open bills.
 *
 * The bills and what is left on each come from the same allocation table the
 * payment posting writes, and the credit is applied through it too, so a bill
 * settled by a supplier credit is settled in every view -- its status, its
 * ageing, its balance -- exactly as if it had been paid.
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
import { roundCents } from '@/lib/vendorCredits/vendorCreditTotals';
import { refreshAfterVendorCreditChange } from '@/lib/vendorCredits/vendorCreditQueries';
import { showError, showSuccess } from '@/utils/toast';
import { safeFormatDate } from '@/lib/dates';

type OpenBill = {
  id: string;
  bill_number: string;
  bill_date: string;
  due_date: string | null;
  outstanding: number;
};

export type ApplyVendorCreditTarget = {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  remaining: number;
};

export default function ApplyVendorCreditDialog({
  isOpen,
  setIsOpen,
  vendorCredit,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  vendorCredit: ApplyVendorCreditTarget;
}) {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) setAmounts({});
  }, [isOpen]);

  const { data: bills, isLoading } = useQuery<OpenBill[]>({
    queryKey: ['vendor_open_bills', activeCompany?.id, vendorCredit.vendorId],
    enabled: isOpen && !!activeCompany,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: {
          method: 'GET_OPEN_BILLS',
          company_id: activeCompany!.id,
          vendorId: vendorCredit.vendorId,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The open bills could not be loaded.'));
      return (data ?? []) as OpenBill[];
    },
  });

  const allocations = useMemo(
    () =>
      Object.entries(amounts)
        .map(([billId, value]) => ({ bill_id: billId, amount: roundCents(Number(value)) }))
        .filter((a) => Number.isFinite(a.amount) && a.amount > 0),
    [amounts],
  );
  const totalApplied = roundCents(allocations.reduce((t, a) => t + a.amount, 0));
  const overBill = allocations.find((a) => {
    const bill = bills?.find((b) => b.id === a.bill_id);
    return bill ? a.amount > bill.outstanding + 0.005 : false;
  });
  const problem =
    totalApplied > vendorCredit.remaining + 0.005
      ? `Only ${formatCurrency(vendorCredit.remaining)} of this credit is left to apply.`
      : overBill
        ? `${bills?.find((b) => b.id === overBill.bill_id)?.bill_number} has only ${formatCurrency(
            bills?.find((b) => b.id === overBill.bill_id)?.outstanding ?? 0,
          )} outstanding.`
        : null;

  /** Oldest first, never more than the bill owes or the credit has left. */
  const fillOldestFirst = () => {
    let left = vendorCredit.remaining;
    const next: Record<string, string> = {};
    for (const bill of bills ?? []) {
      if (left <= 0) break;
      const take = roundCents(Math.min(bill.outstanding, left));
      if (take > 0) next[bill.id] = take.toFixed(2);
      left = roundCents(left - take);
    }
    setAmounts(next);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('vendor-credits', {
        body: {
          method: 'APPLY',
          company_id: activeCompany!.id,
          vendorCreditId: vendorCredit.id,
          allocations,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'The credit could not be applied.'));
      return data as { applied_now: number; remaining: number };
    },
    onSuccess: (result) => {
      refreshAfterVendorCreditChange(queryClient);
      showSuccess(
        result.remaining > 0
          ? `${formatCurrency(result.applied_now)} applied. ${formatCurrency(result.remaining)} is still held on account.`
          : `${formatCurrency(result.applied_now)} applied. ${vendorCredit.number} is now applied in full.`,
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
          <DialogTitle>Apply supplier credit {vendorCredit.number}</DialogTitle>
          <DialogDescription>
            {formatCurrency(vendorCredit.remaining)} is available to set against {vendorCredit.vendorName}&rsquo;s
            open bills.
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
            disabled={!bills || bills.length === 0}
          >
            Apply oldest first
          </Button>
        </div>

        <div className="max-h-[320px] overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill</TableHead>
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
              ) : bills && bills.length > 0 ? (
                bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-medium">{bill.bill_number}</TableCell>
                    <TableCell>{safeFormatDate(bill.bill_date, 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(bill.outstanding)}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className="text-right"
                        aria-label={`Amount to apply to ${bill.bill_number}`}
                        value={amounts[bill.id] ?? ''}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [bill.id]: e.target.value }))}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    {vendorCredit.vendorName} has no open bills. The credit stays on account until one is received.
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
