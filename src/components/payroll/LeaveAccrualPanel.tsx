import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookCheck, Calculator } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useReportingPeriodOptional } from '../../contexts/ReportingPeriodContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';

type Accrual = {
  asOf: string;
  lines: Array<{ employeeId: string; name: string; employeeNumber: string | null; days: number; dailyRate: number; amount: number }>;
  total: number;
  unvalued: string[];
  annualLeaveTracked: boolean;
  ledgerBalance: number;
  adjustment: number;
  accounts: { expense: { id: string; name: string | null } | null; liability: { id: string; name: string | null } | null };
  posted?: boolean;
  journalNumber?: string | null;
};

/**
 * The leave pay accrual at a date (usually the year end): annual leave owing ×
 * each employee's daily rate, against what the accrued leave pay account holds.
 * The journal for the difference is posted only when the user accepts it.
 */
export default function LeaveAccrualPanel() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const period = useReportingPeriodOptional();
  const queryClient = useQueryClient();
  const yearEnd = period?.financialYearEnd ? format(period.financialYearEnd, 'yyyy-MM-dd') : '';
  const [asOf, setAsOf] = useState(yearEnd);
  useEffect(() => { if (yearEnd && !asOf) setAsOf(yearEnd); }, [yearEnd, asOf]);
  const [prepared, setPrepared] = useState<Accrual | null>(null);

  const prepare = useMutation({
    mutationFn: () => invokePayroll<Accrual>({ method: 'PREPARE_LEAVE_ACCRUAL', company_id: companyId, asOf }),
    onSuccess: setPrepared,
    onError: (e: Error) => showError(e.message),
  });
  const post = useMutation({
    mutationFn: () => invokePayroll<Accrual>({ method: 'POST_LEAVE_ACCRUAL', company_id: companyId, asOf, expectedAdjustment: prepared?.adjustment }),
    onSuccess: (r) => {
      setPrepared(r);
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      showSuccess(r.posted ? `Leave pay accrual posted${r.journalNumber ? ` (${r.journalNumber})` : ''}.` : 'The accrual already agrees with the ledger; nothing to post.');
    },
    onError: (e: Error) => showError(e.message),
  });

  const accountsMissing = prepared && (!prepared.accounts.expense || !prepared.accounts.liability);
  const up = (prepared?.adjustment ?? 0) > 0;

  return (
    <Card data-testid="leave-accrual">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookCheck className="h-5 w-5" /> Leave pay accrual</CardTitle>
        <CardDescription>
          At the year end the company owes its employees for annual leave earned and not yet taken. This values it (days owing × daily rate)
          and, when you accept, posts the journal that brings the accrued leave pay account to that amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="accrual-date">As at</Label>
            <Input id="accrual-date" type="date" value={asOf} onChange={(e) => { setAsOf(e.target.value); setPrepared(null); }} className="w-44" />
          </div>
          <Button onClick={() => prepare.mutate()} disabled={!asOf || prepare.isPending} data-testid="prepare-leave-accrual">
            <Calculator className="mr-1 h-4 w-4" />{prepare.isPending ? 'Working it out…' : 'Work out the accrual'}
          </Button>
        </div>
        {prepared && !prepared.annualLeaveTracked && (
          <Alert><AlertDescription>Annual leave is not tracked yet, so there is nothing owing to value.</AlertDescription></Alert>
        )}
        {prepared && prepared.unvalued.length > 0 && (
          <Alert><AlertDescription>No pay rate to value leave for: {prepared.unvalued.join(', ')}.</AlertDescription></Alert>
        )}
        {prepared && (
          <>
            <div className="overflow-x-auto">
              <Table data-testid="leave-accrual-lines">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Days owing</TableHead>
                    <TableHead className="text-right">Daily rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prepared.lines.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No annual leave owing on {prepared.asOf}.</TableCell></TableRow>
                  )}
                  {prepared.lines.map((l) => (
                    <TableRow key={l.employeeId}>
                      <TableCell>{l.name}<div className="text-xs text-muted-foreground">{l.employeeNumber}</div></TableCell>
                      <TableCell className="text-right font-mono">{l.days}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(l.dailyRate)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow><TableCell colSpan={3}>Leave pay owing</TableCell><TableCell className="text-right font-mono" data-testid="leave-accrual-total">{formatCurrency(prepared.total)}</TableCell></TableRow>
                </TableFooter>
              </Table>
            </div>
            <div className="space-y-1 text-sm" data-testid="leave-accrual-journal">
              <p>{prepared.accounts.liability?.name ?? 'Accrued leave pay'} holds {formatCurrency(prepared.ledgerBalance)} on {prepared.asOf}.</p>
              {Math.abs(prepared.adjustment) < 0.01 ? (
                <p className="text-muted-foreground">The ledger already agrees: nothing to post.</p>
              ) : accountsMissing ? (
                <Alert><AlertDescription>
                  Choose the leave pay and accrued leave pay accounts under <Link to="/settings" className="underline">Settings → Payroll → Payroll accounts</Link> ("Set up payroll accounts" adds them).
                </AlertDescription></Alert>
              ) : (
                <>
                  <p>
                    Journal on {prepared.asOf}: {up ? 'debit' : 'credit'} {prepared.accounts.expense?.name}, {up ? 'credit' : 'debit'} {prepared.accounts.liability?.name},{' '}
                    <strong>{formatCurrency(Math.abs(prepared.adjustment))}</strong>{up ? '' : ' (the accrual is released)'}.
                  </p>
                  <Button onClick={() => post.mutate()} disabled={post.isPending} data-testid="post-leave-accrual">
                    {post.isPending ? 'Posting…' : 'Accept and post the journal'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
