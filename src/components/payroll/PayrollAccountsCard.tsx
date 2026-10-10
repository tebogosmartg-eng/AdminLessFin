import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, Wand2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription } from '../ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { invokePayroll } from '../../lib/payrollOperations';
import { showError, showSuccess } from '../../utils/toast';

export type PayrollAccountsView = {
  roles: Array<{
    role: string;
    label: string;
    help: string;
    required: boolean;
    expects: { type: string; category: string; subcategory: string };
    account: { id: string; name: string; code: string | null; category: string | null; subcategory: string | null } | null;
    suggested: { id: string; name: string; code: string | null } | null;
    advice: string | null;
    canReclassify: boolean;
  }>;
  /** Accounts payroll journals posted to that the statements would present elsewhere. */
  posted: Array<{
    accountId: string; name: string; code: string | null; usedFor: string[]; role: string;
    category: string | null; subcategory: string | null; target: { category: string; subcategory: string };
    advice: string; canReclassify: boolean;
  }>;
  legacyLiability: string | null;
  configured: boolean;
  accounts: Array<{ id: string; name: string; code: string | null; type: string; category: string | null; subcategory: string | null }>;
};

const NONE = '__none__';

/**
 * The ledger accounts payroll posts to, chosen once. "Set up payroll accounts"
 * uses the standard chart's accounts where the company has them and adds the
 * rest, classified the way the financial statements need them.
 */
export default function PayrollAccountsCard() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;
  const queryClient = useQueryClient();
  const key = ['payroll-accounts', companyId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => invokePayroll<PayrollAccountsView>({ method: 'GET_PAYROLL_ACCOUNTS', company_id: companyId }),
    enabled: !!companyId,
  });
  const [choice, setChoice] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setChoice(Object.fromEntries(data.roles.map((r) => [r.role, r.account?.id ?? ''])));
  }, [data]);
  const changed = (data?.roles ?? []).filter((r) => (choice[r.role] ?? '') !== (r.account?.id ?? ''));

  const done = (view: PayrollAccountsView) => {
    queryClient.setQueryData(key, view);
    queryClient.invalidateQueries({ queryKey: ['payroll-posting-preview'] });
  };
  const save = useMutation({
    mutationFn: () => invokePayroll<PayrollAccountsView>({
      method: 'SAVE_PAYROLL_ACCOUNTS', company_id: companyId,
      accounts: Object.fromEntries(changed.map((r) => [r.role, choice[r.role] || null])),
    }),
    onSuccess: (view) => { done(view); showSuccess('Payroll accounts saved.'); },
    onError: (e: Error) => showError(e.message),
  });
  const setUp = useMutation({
    mutationFn: () => invokePayroll<PayrollAccountsView & { created: string[]; mapped: string[] }>({ method: 'SET_UP_PAYROLL_ACCOUNTS', company_id: companyId }),
    onSuccess: (view) => {
      done(view);
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      showSuccess(view.created.length ? `Payroll accounts set up; added ${view.created.join(', ')}.` : 'Payroll accounts set up from your chart of accounts.');
    },
    onError: (e: Error) => showError(e.message),
  });

  const reclassify = useMutation({
    mutationFn: (v: { accountId: string; role: string }) => invokePayroll<PayrollAccountsView>({ method: 'RECLASSIFY_PAYROLL_ACCOUNT', company_id: companyId, ...v }),
    onSuccess: (view) => {
      done(view);
      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      showSuccess('Account classified. Update the financial statements from accounting to show it.');
    },
    onError: (e: Error) => showError(e.message),
  });
  const fixButton = (accountId: string, role: string, target: string, testId: string) => (
    <Button size="sm" variant="outline" className="mt-1" disabled={reclassify.isPending} data-testid={testId}
      onClick={() => reclassify.mutate({ accountId, role })}>
      Classify as {target}
    </Button>
  );

  if (error) return <Alert variant="destructive"><AlertDescription>Payroll accounts could not be loaded: {(error as Error).message}</AlertDescription></Alert>;
  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;
  const missing = data.roles.filter((r) => !r.account);

  return (
    <Card data-testid="payroll-accounts">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpenCheck className="h-5 w-5" /> Payroll accounts</CardTitle>
        <CardDescription>
          Where each payroll run posts. PAYE, UIF and SDL go to their own accounts, so the financial statements show employee
          costs and the amounts owed to SARS correctly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setUp.mutate()} disabled={setUp.isPending} data-testid="set-up-payroll-accounts">
              <Wand2 className="mr-1 h-4 w-4" />{setUp.isPending ? 'Setting up…' : 'Set up payroll accounts'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Uses your chart's PAYE, UIF and SDL accounts where you have them and adds the rest. Choose the bank yourself.
            </p>
          </div>
        )}
        {data.legacyLiability && (
          <p className="text-xs text-muted-foreground">Anything without its own account still posts to {data.legacyLiability}.</p>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Posts</TableHead><TableHead>Account</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {data.roles.map((r) => {
                const options = data.accounts.filter((a) => a.type === r.expects.type);
                return (
                  <TableRow key={r.role} data-testid={`payroll-account-${r.role}`}>
                    <TableCell className="min-w-56">
                      <div className="font-medium">{r.label}{r.required && <Badge variant="outline" className="ml-1">Required</Badge>}</div>
                      <div className="text-xs text-muted-foreground">{r.help}</div>
                    </TableCell>
                    <TableCell className="min-w-72">
                      <Select value={choice[r.role] || NONE} onValueChange={(v) => setChoice((p) => ({ ...p, [r.role]: v === NONE ? '' : v }))}>
                        <SelectTrigger aria-label={r.label}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{r.required ? 'Choose at each run' : 'Not set (posts with the liability account)'}</SelectItem>
                          {options.map((a) => <SelectItem key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!r.account && r.suggested && <div className="mt-1 text-xs text-muted-foreground">Suggested: {r.suggested.name}</div>}
                      {r.advice && <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">{r.advice}</div>}
                      {r.account && r.canReclassify && fixButton(r.account.id, r.role, `${r.expects.category} › ${r.expects.subcategory}`, `reclassify-${r.role}`)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {data.posted.length > 0 && (
          <div className="space-y-2 rounded-md border p-3" data-testid="payroll-posted-accounts">
            <p className="text-sm font-medium">Accounts earlier payroll runs posted to</p>
            <p className="text-xs text-muted-foreground">
              The financial statements present these elsewhere than payroll belongs. Classifying one changes how it is presented, not its amounts;
              statements already finalised keep their figures until updated from accounting.
            </p>
            {data.posted.map((a) => (
              <div key={a.accountId} className="border-t pt-2 text-sm" data-testid={`posted-account-${a.accountId}`}>
                <div className="font-medium">{a.code ? `${a.code} ` : ''}{a.name}</div>
                <div className="text-xs text-amber-600 dark:text-amber-400">{a.advice}</div>
                {a.canReclassify && fixButton(a.accountId, a.role, `${a.target.category} › ${a.target.subcategory}`, `reclassify-posted-${a.accountId}`)}
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending || changed.length === 0} data-testid="save-payroll-accounts">
          {save.isPending ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
        </Button>
      </CardContent>
    </Card>
  );
}
