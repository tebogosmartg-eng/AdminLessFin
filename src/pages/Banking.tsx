import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useReportingPeriod } from '../contexts/ReportingPeriodContext';
import { accountsQuery, bankAccountsQuery, bankTransactionsQuery, bankOutstandingLinesQuery, bankTransfersQuery } from '../lib/queries';
import { Account } from './ChartOfAccounts';
import { BANK_TRANSACTION_LABELS } from '../lib/banking/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ReportingPeriodPicker from '../components/ReportingPeriodPicker';
import { formatCurrency } from '../lib/utils';
import { format, isWithinInterval } from 'date-fns';
import { supabase } from '../integrations/supabase/client';
import {
  Wallet, Landmark, Coins, ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine,
  FileCheck2, History, Plus, TrendingUp,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import BankAccountForm from '../components/BankAccountForm';
import BankTransactionForm from '../components/BankTransactionForm';
import BankTransferForm from '../components/BankTransferForm';
import BankingJournalDrilldown from '../components/BankingJournalDrilldown';

const Banking = () => {
  useDocumentTitle('Banking');
  const { activeCompany, role } = useAuth();
  const { currentReportingPeriod, dateFrom, dateTo, isReady } = useReportingPeriod();
  const navigate = useNavigate();
  const isAdmin = role === 'owner' || role === 'admin';

  const [isAccountFormOpen, setIsAccountFormOpen] = useState(false);
  const [isTxnFormOpen, setIsTxnFormOpen] = useState(false);
  const [isTransferFormOpen, setIsTransferFormOpen] = useState(false);
  const [drilldownJournalId, setDrilldownJournalId] = useState<string | null>(null);

  const { data: bankAccounts, isLoading: loadingAccounts } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany });
  // GL balances as-of reporting period end — same engine date as Dashboard Cash Balance.
  const { data: glAccounts, isLoading: loadingGl } = useQuery<Account[]>({
    ...accountsQuery(activeCompany!.id, dateTo ?? undefined),
    enabled: !!activeCompany && isReady,
  });
  const { data: transactions, isLoading: loadingTxns } = useQuery({ ...bankTransactionsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: outstanding, isLoading: loadingOutstanding } = useQuery({ ...bankOutstandingLinesQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: transfers, isLoading: loadingTransfers } = useQuery({ ...bankTransfersQuery(activeCompany!.id), enabled: !!activeCompany });

  const { data: cfaPayload, isLoading: loadingCfa } = useQuery({
    queryKey: ['banking_cfa_cash', activeCompany?.id, dateFrom, dateTo],
    queryFn: async () => {
      if (!activeCompany || !dateTo) return null;
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          company_id: activeCompany.id,
          start_date: dateFrom ?? dateTo,
          end_date: dateTo,
        },
      });
      if (error) throw new Error(error.message);
      return data?.canonicalAggregation || data?.statementTotals || null;
    },
    enabled: !!activeCompany && isReady && !!dateTo,
  });

  const isLoading = loadingAccounts || loadingGl || loadingTxns || loadingOutstanding || loadingTransfers || loadingCfa;

  const glBalanceByCoaId = useMemo(() => {
    const map = new Map<string, number>();
    (glAccounts ?? []).forEach((a) => map.set(a.id, a.balance));
    return map;
  }, [glAccounts]);

  const accountsWithBalance = useMemo(
    () => (bankAccounts ?? []).map((a) => ({ ...a, balance: glBalanceByCoaId.get(a.chart_of_account_id) ?? 0 })),
    [bankAccounts, glBalanceByCoaId]
  );

  const cfa = cfaPayload || {};
  const cfaCash = Number(cfa.cash ?? 0);
  const totalCash = cfaCash;
  const totalBankBalance = totalCash;
  const totalCashOnHand = 0;
  const totalPettyCash = 0;

  const periodStart = currentReportingPeriod?.from;
  const periodEnd = currentReportingPeriod?.to;
  // Period cash movement KPIs from CFA cash-flow sections — not bank-txn reduces.
  const depositsThisPeriod = Number(cfa?.cashOperating > 0 ? cfa.cashOperating : 0);
  const withdrawalsThisPeriod = Number(
    (Number(cfa?.cashInvesting || 0) < 0 ? Math.abs(Number(cfa.cashInvesting)) : 0) +
      (Number(cfa?.cashFinancing || 0) < 0 ? Math.abs(Number(cfa.cashFinancing)) : 0),
  );
  const transfersThisPeriod = (transfers ?? []).filter((t) =>
    isReady && periodStart && periodEnd && isWithinInterval(new Date(t.transfer_date), { start: periodStart, end: periodEnd }),
  );

  const unmatchedCount = (outstanding ?? []).length;

  const recentActivity = (transactions ?? [])
    .slice()
    .sort((a, b) => (a.transaction_date < b.transaction_date ? 1 : -1))
    .slice(0, 8);

  const cashPositionSeries = useMemo(() => {
    // Presentation series from CFA net cash flow only — no bank-txn running sum.
    const net = Number(cfa?.netCashFlow ?? 0);
    if (!periodEnd) return [];
    return [{ date: format(periodEnd, 'dd MMM'), net }];
  }, [cfa, periodEnd]);

  const kpis = [
    { title: 'Total Cash Position', value: totalCash, icon: TrendingUp, link: '/banking/accounts' },
    { title: 'Total Bank Balance', value: totalBankBalance, icon: Landmark, link: '/banking/accounts' },
    { title: 'Petty Cash Balance', value: totalPettyCash, icon: Coins, link: '/banking/petty-cash' },
    { title: 'Bank Accounts', value: accountsWithBalance.length, icon: Wallet, link: '/banking/accounts', isCount: true },
  ];

  if (!isAdmin) {
    return (
      <EmptyState icon={Landmark} title="Banking is restricted" description="Ask a company owner or admin for access to Banking." />
    );
  }

  return (
    <div className="section-stack">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Banking Command Centre</h1>
          <p className="text-muted-foreground">Cash position, bank accounts, and reconciliation status at a glance.</p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <ReportingPeriodPicker />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setIsTransferFormOpen(true)}><ArrowLeftRight className="mr-2 h-4 w-4" />Transfer</Button>
            <Button variant="outline" onClick={() => setIsTxnFormOpen(true)}><Plus className="mr-2 h-4 w-4" />Record Transaction</Button>
            <Button onClick={() => setIsAccountFormOpen(true)}><Plus className="mr-2 h-4 w-4" />New Bank Account</Button>
          </div>
        </div>
      </header>

      <section className="space-y-3" aria-label="Cash position KPIs">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {kpis.map((card) => (
            <Card key={card.title} className="cursor-pointer transition-all duration-base ease-smooth hover:shadow-md hover:-translate-y-0.5" onClick={() => navigate(card.link)}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <card.icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? <Skeleton className="h-9 w-3/4" /> : (
                  <div className="text-3xl font-semibold tracking-tight tabular-nums">
                    {card.isCount ? card.value : formatCurrency(card.value as number)}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/banking/transactions')}>
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><ArrowDownToLine className="h-3.5 w-3.5" />Deposits in period</CardDescription></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-7 w-2/3" /> : <div className="text-xl font-semibold tabular-nums">{formatCurrency(depositsThisPeriod)}</div>}</CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/banking/transactions')}>
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><ArrowUpFromLine className="h-3.5 w-3.5" />Withdrawals in period</CardDescription></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-7 w-2/3" /> : <div className="text-xl font-semibold tabular-nums">{formatCurrency(withdrawalsThisPeriod)}</div>}</CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/banking/transfers')}>
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" />Transfers in period</CardDescription></CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-7 w-2/3" /> : <div className="text-xl font-semibold tabular-nums">{transfersThisPeriod.length}</div>}</CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/banking/reconciliation')}>
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1.5"><FileCheck2 className="h-3.5 w-3.5" />Unmatched statement lines</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-7 w-2/3" /> : (
              <div className="flex items-center gap-2">
                <span className="text-xl font-semibold tabular-nums">{unmatchedCount}</span>
                {unmatchedCount > 0 && <Badge variant="warning">Needs review</Badge>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Cash Flow Snapshot</CardTitle><CardDescription>Net daily movement across all bank &amp; cash accounts in the reporting period.</CardDescription></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[260px] w-full" /> : cashPositionSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">No banking activity recorded yet in this reporting period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={cashPositionSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `R${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), 'Net movement']} />
                  <Area type="monotone" dataKey="net" stroke="#10b981" fillOpacity={1} fill="url(#colorNet)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Recent Banking Activity</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64 w-full" /> : recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No transactions yet.</p>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded-md p-1.5 -m-1.5" onClick={() => t.journal_entry_id && setDrilldownJournalId(t.journal_entry_id)}>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{BANK_TRANSACTION_LABELS[t.transaction_type] ?? t.transaction_type}</p>
                      <p className="text-xs text-muted-foreground truncate">{t.bank_accounts?.name} · {format(new Date(t.transaction_date), 'dd MMM yyyy')}</p>
                    </div>
                    <span className="font-mono flex-shrink-0">{formatCurrency(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3" aria-label="Bank accounts">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Bank Accounts</h2>
            <p className="text-sm text-muted-foreground">
              GL balances as of reporting period end — same Cash engine as Dashboard.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/banking/accounts')}>View all</Button>
        </div>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : accountsWithBalance.length === 0 ? (
          <EmptyState icon={Landmark} title="No bank accounts yet" description="Create your first bank, cash, or petty cash account to start tracking balances." action={<Button onClick={() => setIsAccountFormOpen(true)}><Plus className="mr-2 h-4 w-4" />New Bank Account</Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accountsWithBalance.slice(0, 6).map((a) => (
              <Card key={a.id} className="cursor-pointer hover:shadow-md transition-all" onClick={() => navigate(`/banking/accounts/${a.id}`)}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base truncate">{a.name}</CardTitle>
                    {a.is_default && <Badge variant="secondary">Default</Badge>}
                  </div>
                  <CardDescription className="capitalize">{a.account_type.replace('_', ' ')} · {a.currency}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tabular-nums">{formatCurrency(a.balance)}</div>
                  <Badge variant={a.status === 'active' ? 'success' : a.status === 'inactive' ? 'warning' : 'destructive'} className="mt-2 capitalize">{a.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <BankAccountForm isOpen={isAccountFormOpen} setIsOpen={setIsAccountFormOpen} />
      <BankTransactionForm isOpen={isTxnFormOpen} setIsOpen={setIsTxnFormOpen} />
      <BankTransferForm isOpen={isTransferFormOpen} setIsOpen={setIsTransferFormOpen} />
      <BankingJournalDrilldown journalEntryId={drilldownJournalId} isOpen={!!drilldownJournalId} setIsOpen={() => setDrilldownJournalId(null)} />
    </div>
  );
};

export default Banking;
