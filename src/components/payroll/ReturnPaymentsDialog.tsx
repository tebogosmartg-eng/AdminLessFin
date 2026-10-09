import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { accountsQuery } from '../../lib/queries';
import { showError, showSuccess } from '../../utils/toast';

export type PaymentTarget = {
  returnId: string;
  period: string;
  totalPayable: number;
  submissionReference: string | null;
};

type Payment = {
  id: string;
  amount: number;
  paid_on: string;
  payment_reference: string;
  journal_entry_id: string | null;
  recorded_at: string;
  voided_at: string | null;
  void_reason: string | null;
};
type LedgerEvent = { event_type: string; created_at: string; event_payload: Record<string, unknown> };
type Account = { id: string; name: string; type: string };

const EVENT_LABEL: Record<string, string> = {
  generated: 'Filed',
  validated: 'Approved',
  exported: 'e@syFile file produced',
  submitted: 'Submission recorded',
  superseded: 'Replaced by a correction',
};

/** Payments to SARS against a filed return, and the return's evidence trail. */
export default function ReturnPaymentsDialog({ target, onClose }: { target: PaymentTarget | null; onClose: () => void }) {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [reference, setReference] = useState('');
  const [liabilityAccountId, setLiabilityAccountId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const activityKey = ['statutory-return-activity', companyId, target?.returnId];
  const { data: activity } = useQuery({
    queryKey: activityKey,
    queryFn: () => invokePayroll<{ payments: Payment[]; events: LedgerEvent[] }>({ method: 'LIST_RETURN_ACTIVITY', company_id: companyId, returnId: target?.returnId }),
    enabled: !!companyId && !!target,
  });
  const { data: accounts } = useQuery({ ...accountsQuery(companyId ?? ''), enabled: !!companyId && !!target });

  const paid = (activity?.payments ?? []).filter((p) => !p.voided_at).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.round(((target?.totalPayable ?? 0) - paid) * 100) / 100;

  useEffect(() => {
    if (!target) return;
    setReference(target.submissionReference ?? '');
    setLiabilityAccountId('');
    setBankAccountId('');
  }, [target]);
  useEffect(() => {
    if (activity) setAmount(outstanding > 0 ? outstanding.toFixed(2) : '');
  }, [activity, outstanding]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: activityKey });
    queryClient.invalidateQueries({ queryKey: ['statutory-workspace', companyId] });
  };

  const record = useMutation({
    mutationFn: () => invokePayroll({
      method: 'RECORD_RETURN_PAYMENT', company_id: companyId, returnId: target?.returnId,
      amount: Number(amount), paidOn, reference: reference.trim(),
      post: liabilityAccountId && bankAccountId ? { liabilityAccountId, bankAccountId } : undefined,
    }),
    onSuccess: () => { showSuccess('Payment recorded.'); refresh(); },
    onError: (error: Error) => showError(error.message),
  });

  const voidPayment = useMutation({
    mutationFn: () => invokePayroll({ method: 'VOID_RETURN_PAYMENT', company_id: companyId, paymentId: voiding?.id, reason: voidReason.trim() }),
    onSuccess: () => { showSuccess('Payment voided.'); setVoiding(null); setVoidReason(''); refresh(); },
    onError: (error: Error) => showError(error.message),
  });

  const liabilities = (accounts as Account[] | undefined)?.filter((a) => a.type === 'Liability') ?? [];
  const banks = (accounts as Account[] | undefined)?.filter((a) => a.type === 'Asset') ?? [];

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="return-payments">
        <DialogHeader>
          <DialogTitle>Payments to SARS — EMP201 {target?.period}</DialogTitle>
          <DialogDescription>
            Payable {formatCurrency(target?.totalPayable ?? 0)} · paid {formatCurrency(paid)} · outstanding {formatCurrency(outstanding)}
          </DialogDescription>
        </DialogHeader>

        {(activity?.payments ?? []).length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>PRN</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity!.payments.map((p) => (
                <TableRow key={p.id} className={p.voided_at ? 'opacity-60' : undefined}>
                  <TableCell>{p.paid_on}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {p.payment_reference}
                    {p.journal_entry_id && <Badge variant="secondary" className="ml-2">Posted</Badge>}
                    {p.voided_at && <div className="text-xs text-muted-foreground">Voided: {p.void_reason}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(Number(p.amount))}</TableCell>
                  <TableCell className="text-right">
                    {!p.voided_at && <Button size="sm" variant="ghost" onClick={() => setVoiding(p)}>Void</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {voiding ? (
          <div className="space-y-2 rounded-md border p-3">
            <Label htmlFor="void-reason">Why is the payment of {formatCurrency(Number(voiding.amount))} wrong?</Label>
            <Textarea id="void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setVoiding(null)}>Keep it</Button>
              <Button variant="destructive" disabled={voidReason.trim().length < 10 || voidPayment.isPending} onClick={() => voidPayment.mutate()}>Void payment</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="payment-amount">Amount paid</Label>
              <Input id="payment-amount" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-date">Date paid</Label>
              <Input id="payment-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payment-reference">Payment reference (PRN)</Label>
              <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <p className="text-xs text-muted-foreground">Optionally post it to the ledger (Dr payroll liability, Cr bank). Leave blank if the bank feed already records it.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={liabilityAccountId} onValueChange={setLiabilityAccountId}>
                  <SelectTrigger aria-label="Payroll liability account"><SelectValue placeholder="Payroll liability account…" /></SelectTrigger>
                  <SelectContent>{liabilities.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger aria-label="Bank account"><SelectValue placeholder="Bank account…" /></SelectTrigger>
                  <SelectContent>{banks.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {(activity?.events ?? []).length > 0 && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Evidence trail</div>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {activity!.events.map((e, i) => (
                <li key={i}>{format(new Date(e.created_at), 'PPP p')} — {EVENT_LABEL[e.event_type] ?? e.event_type}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {!voiding && (
            <Button
              onClick={() => record.mutate()}
              disabled={record.isPending || !(Number(amount) > 0) || !paidOn || reference.trim().length < 4 || (!!liabilityAccountId !== !!bankAccountId)}
              data-testid="record-payment"
            >
              {record.isPending ? 'Saving…' : 'Record payment'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
