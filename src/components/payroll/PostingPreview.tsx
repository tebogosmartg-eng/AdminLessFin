import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../ui/table';
import { formatCurrency } from '../../lib/utils';
import { invokePayroll } from '../../lib/payrollOperations';
import type { PayrollAccountsView } from './PayrollAccountsCard';

type Preview = {
  lines: Array<{ accountId: string; account: string; code: string | null; description: string; role: string | null; debit: number; credit: number }>;
  granular: boolean;
  total_gross: number;
  total_net: number;
};

export type PostingChoice = { wageAccountId: string; bankAccountId: string; liabilityAccountId: string };

/**
 * The finalise step's accounts and the exact journal the run will post — the
 * preview comes from the same database function that posts it. The company's
 * payroll accounts (Settings → Payroll) fill the choices in.
 */
export default function PostingPreview({
  runId, value, onChange, onReady,
}: { runId: string; value: PostingChoice; onChange: (v: PostingChoice) => void; onReady: (ready: boolean) => void }) {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const accounts = useQuery({
    queryKey: ['payroll-accounts', companyId],
    queryFn: () => invokePayroll<PayrollAccountsView>({ method: 'GET_PAYROLL_ACCOUNTS', company_id: companyId }),
    enabled: !!companyId,
  });
  const mapped = (role: string) => accounts.data?.roles.find((r) => r.role === role)?.account?.id ?? '';

  // Start from the company's payroll accounts.
  useEffect(() => {
    if (!accounts.data) return;
    onChange({
      wageAccountId: value.wageAccountId || mapped('salary_expense'),
      bankAccountId: value.bankAccountId || mapped('bank'),
      liabilityAccountId: value.liabilityAccountId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.data]);

  const preview = useQuery({
    queryKey: ['payroll-posting-preview', companyId, runId, value],
    queryFn: () => invokePayroll<Preview>({ method: 'PREVIEW_RUN_POSTING', company_id: companyId, runId, ...value }),
    enabled: !!companyId && !!accounts.data,
    retry: false,
  });
  useEffect(() => { onReady(!!preview.data && !preview.isFetching); }, [preview.data, preview.isFetching, onReady]);

  if (accounts.isLoading || !accounts.data) return <Skeleton className="h-40 w-full" />;
  const list = accounts.data.accounts;
  const picker = (label: string, type: string, key: keyof PostingChoice, placeholder: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value[key] || undefined} onValueChange={(v) => onChange({ ...value, [key]: v })}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{list.filter((a) => a.type === type).map((a) => <SelectItem key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const unmappedDeductions = !accounts.data.roles.filter((r) => /_control$|employee_deductions/.test(r.role)).every((r) => r.account) && !accounts.data.legacyLiability;
  const debit = (preview.data?.lines ?? []).reduce((s, l) => s + l.debit, 0);
  const credit = (preview.data?.lines ?? []).reduce((s, l) => s + l.credit, 0);

  return (
    <div className="space-y-4" data-testid="posting-preview">
      {!accounts.data.configured && (
        <p className="text-sm text-muted-foreground">
          Tip: set the payroll accounts once under <Link to="/settings" className="underline">Settings → Payroll → Payroll accounts</Link> and
          every run posts PAYE, UIF and SDL to their own accounts without choosing here.
        </p>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        {picker('Salaries and wages', 'Expense', 'wageAccountId', 'Wages / salary expense…')}
        {picker('Bank', 'Asset', 'bankAccountId', 'Bank / cash account…')}
        {unmappedDeductions && picker('Deductions without their own account', 'Liability', 'liabilityAccountId', 'Payroll liability account…')}
      </div>
      {preview.error ? (
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Not ready to post</AlertTitle><AlertDescription>{(preview.error as Error).message}</AlertDescription></Alert>
      ) : preview.isLoading || !preview.data ? <Skeleton className="h-32 w-full" /> : (
        <div className="overflow-x-auto">
          <p className="mb-2 text-sm font-medium">Journal this run will post</p>
          <Table data-testid="posting-preview-lines">
            <TableHeader>
              <TableRow><TableHead>Account</TableHead><TableHead>For</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {preview.data.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{l.code ? `${l.code} ` : ''}{l.account}</TableCell>
                  <TableCell className="text-muted-foreground">{l.description}</TableCell>
                  <TableCell className="text-right font-mono">{l.debit ? formatCurrency(l.debit) : ''}</TableCell>
                  <TableCell className="text-right font-mono">{l.credit ? formatCurrency(l.credit) : ''}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(debit)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(credit)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  );
}
