import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { accountsQuery, bankAccountsQuery, bankTransactionsQuery } from '../lib/queries';
import { Account } from './ChartOfAccounts';
import { BANK_TRANSACTION_LABELS } from '../lib/banking/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { Coins, Plus, ArrowUpCircle, ArrowDownCircle, ClipboardCheck, TrendingDown, TrendingUp } from 'lucide-react';
import BankAccountForm from '../components/BankAccountForm';
import BankTransactionForm from '../components/BankTransactionForm';

const PettyCash = () => {
  useDocumentTitle('Petty Cash');
  const { activeCompany } = useAuth();
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<{ type: string; label: string } | null>(null);
  const [selectedFloatId, setSelectedFloatId] = useState<string>('');

  const { data: bankAccounts, isLoading: loadingAccounts } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: glAccounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: transactions, isLoading: loadingTxns } = useQuery({ ...bankTransactionsQuery(activeCompany!.id), enabled: !!activeCompany });

  const pettyCashAccounts = (bankAccounts ?? []).filter((a) => a.account_type === 'petty_cash');
  const glBalanceByCoaId = useMemo(() => {
    const map = new Map<string, number>();
    (glAccounts ?? []).forEach((a) => map.set(a.id, a.balance));
    return map;
  }, [glAccounts]);

  const activeFloatId = selectedFloatId || pettyCashAccounts[0]?.id || '';
  const activeFloat = pettyCashAccounts.find((a) => a.id === activeFloatId);
  const currentFloat = activeFloat ? glBalanceByCoaId.get(activeFloat.chart_of_account_id) ?? 0 : 0;

  const pettyCashTxns = (transactions ?? []).filter((t) => t.bank_account_id === activeFloatId);
  const variance = pettyCashTxns.reduce((sum, t) => {
    if (t.transaction_type === 'cash_overage') return sum + t.amount;
    if (t.transaction_type === 'cash_shortage') return sum - t.amount;
    return sum;
  }, 0);

  const isLoading = loadingAccounts || loadingTxns;

  const actions = [
    { type: 'cash_topup', label: 'Top-up Float', icon: ArrowUpCircle },
    { type: 'cash_reimbursement', label: 'Reimbursement', icon: ArrowDownCircle },
    { type: 'cash_count_adjustment', label: 'Cash Count', icon: ClipboardCheck },
    { type: 'cash_shortage', label: 'Record Shortage', icon: TrendingDown },
    { type: 'cash_overage', label: 'Record Overage', icon: TrendingUp },
  ];

  if (!loadingAccounts && pettyCashAccounts.length === 0) {
    return (
      <>
        <EmptyState
          icon={Coins}
          title="No petty cash floats yet"
          description="Create a petty cash account to start tracking float top-ups, reimbursements, and cash counts."
          action={<Button onClick={() => setIsNewAccountOpen(true)}><Plus className="mr-2 h-4 w-4" />New Petty Cash Account</Button>}
        />
        <BankAccountForm isOpen={isNewAccountOpen} setIsOpen={setIsNewAccountOpen} />
      </>
    );
  }

  return (
    <div className="section-stack">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Petty Cash</h1>
          <p className="text-muted-foreground">Float management, top-ups, reimbursements, and cash counts.</p>
        </div>
        <div className="flex items-center gap-2">
          {pettyCashAccounts.length > 1 && (
            <Select value={activeFloatId} onValueChange={setSelectedFloatId}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>{pettyCashAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={() => setIsNewAccountOpen(true)}><Plus className="mr-2 h-4 w-4" />New Float</Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Current Float</CardDescription></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-9 w-2/3" /> : <div className="text-3xl font-semibold tabular-nums">{formatCurrency(currentFloat)}</div>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Variance (Overages − Shortages)</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-9 w-2/3" /> : (
              <div className={`text-3xl font-semibold tabular-nums ${variance < 0 ? 'text-destructive' : variance > 0 ? 'text-success' : ''}`}>{formatCurrency(variance)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map((a) => (
          <Button key={a.type} variant="outline" className="h-auto flex-col gap-2 py-4" onClick={() => setActiveAction(a)}>
            <a.icon className="h-5 w-5 text-primary" />
            <span className="text-xs">{a.label}</span>
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Float History</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : pettyCashTxns.length === 0 ? (
            <EmptyState icon={Coins} title="No movements yet" description="Top up this float to get started." />
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {pettyCashTxns.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{format(new Date(t.transaction_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell><Badge variant="outline">{BANK_TRANSACTION_LABELS[t.transaction_type] ?? t.transaction_type}</Badge></TableCell>
                    <TableCell className="max-w-[260px] truncate">{t.description || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(t.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BankAccountForm isOpen={isNewAccountOpen} setIsOpen={setIsNewAccountOpen} />
      {activeAction && (
        <BankTransactionForm
          isOpen={!!activeAction}
          setIsOpen={() => setActiveAction(null)}
          defaultBankAccountId={activeFloatId}
          restrictToAccountType="petty_cash"
          restrictToTypes={[activeAction.type]}
          title={activeAction.label}
        />
      )}
    </div>
  );
};

export default PettyCash;
