import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import {
  accountsQuery, bankAccountsQuery, bankTransactionsQuery, bankStatementLinesQuery, bankTransfersQuery,
} from '../lib/queries';
import { Account } from './ChartOfAccounts';
import { BankStatementLine, BANK_TRANSACTION_LABELS } from '../lib/banking/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { EmptyState } from '../components/EmptyState';
import { Progress } from '../components/ui/progress';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import {
  ArrowLeft, Landmark, Plus, ArrowLeftRight, Upload, CheckCircle2, History,
  ReceiptText, BookText, Star,
} from 'lucide-react';
import { showSuccess, showError } from '../utils/toast';
import BankAccountForm from '../components/BankAccountForm';
import BankTransactionForm from '../components/BankTransactionForm';
import BankTransferForm from '../components/BankTransferForm';
import StatementImportDialog from '../components/StatementImportDialog';
import StatementLineMatchDialog from '../components/StatementLineMatchDialog';
import BankingJournalDrilldown from '../components/BankingJournalDrilldown';

const statusVariant = (status: string) => (status === 'active' ? 'success' : status === 'inactive' ? 'warning' : 'destructive') as 'success' | 'warning' | 'destructive';

const BankAccountDetail = () => {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Bank Account');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('overview');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTxnOpen, setIsTxnOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [matchLine, setMatchLine] = useState<BankStatementLine | null>(null);
  const [drilldownJournalId, setDrilldownJournalId] = useState<string | null>(null);

  const { data: bankAccounts, isLoading: loadingAccounts } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: glAccounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: transactions, isLoading: loadingTxns } = useQuery({ ...bankTransactionsQuery(activeCompany!.id, id), enabled: !!activeCompany && !!id });
  const { data: statementLines, isLoading: loadingLines } = useQuery({ ...bankStatementLinesQuery(activeCompany!.id, id), enabled: !!activeCompany && !!id });
  const { data: transfers } = useQuery({ ...bankTransfersQuery(activeCompany!.id), enabled: !!activeCompany });

  const account = (bankAccounts ?? []).find((a) => a.id === id);
  const glAccount = (glAccounts ?? []).find((a) => a.id === account?.chart_of_account_id);
  const balance = glAccount?.balance ?? 0;

  const accountTransfers = (transfers ?? []).filter((t) => t.from_bank_account_id === id || t.to_bank_account_id === id);

  const matchedCount = (statementLines ?? []).filter((l) => l.match_status !== 'unmatched').length;
  const totalLines = (statementLines ?? []).length;
  const reconciliationProgress = totalLines > 0 ? Math.round((matchedCount / totalLines) * 100) : 100;

  const setDefaultMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany || !id) throw new Error('Missing context');
      const { error } = await supabase.functions.invoke('banking', {
        body: { method: 'SET_DEFAULT_BANK_ACCOUNT', company_id: activeCompany.id, bankAccountId: id },
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bank_accounts', activeCompany?.id] }); showSuccess('Set as default account.'); },
    onError: (error: Error) => showError(error.message),
  });

  if (loadingAccounts) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (!account) {
    return <EmptyState icon={Landmark} title="Bank account not found" action={<Button asChild variant="outline"><Link to="/banking/accounts"><ArrowLeft className="mr-2 h-4 w-4" />Back to Bank Accounts</Link></Button>} />;
  }

  const TransactionRows = ({ rows, emptyLabel }: { rows: typeof transactions; emptyLabel: string }) => (
    (rows ?? []).length === 0 ? (
      <EmptyState icon={ReceiptText} title={emptyLabel} />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead className="w-[110px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).map((t) => (
            <TableRow key={t.id}>
              <TableCell>{format(new Date(t.transaction_date), 'dd MMM yyyy')}</TableCell>
              <TableCell><Badge variant="outline">{BANK_TRANSACTION_LABELS[t.transaction_type] ?? t.transaction_type}</Badge></TableCell>
              <TableCell className="max-w-[220px] truncate">{t.description || '—'}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(t.amount)}</TableCell>
              <TableCell className="text-xs text-muted-foreground font-mono">{t.created_by ? t.created_by.slice(0, 8) : 'system'}</TableCell>
              <TableCell>
                {t.journal_entry_id && (
                  <Button size="sm" variant="ghost" onClick={() => setDrilldownJournalId(t.journal_entry_id)}><BookText className="mr-1.5 h-3.5 w-3.5" />Journal</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  );

  return (
    <div className="section-stack">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2"><Link to="/banking/accounts"><ArrowLeft className="mr-2 h-4 w-4" />Bank Accounts</Link></Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{account.name}</h1>
            <Badge variant={statusVariant(account.status)} className="capitalize">{account.status}</Badge>
            {account.is_default && <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Default</Badge>}
          </div>
          <p className="text-muted-foreground capitalize">{account.account_type.replace('_', ' ')} · {account.currency}{account.bank_name ? ` · ${account.bank_name}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!account.is_default && <Button variant="outline" onClick={() => setDefaultMutation.mutate()}><Star className="mr-2 h-4 w-4" />Set as Default</Button>}
          <Button variant="outline" onClick={() => setIsTransferOpen(true)}><ArrowLeftRight className="mr-2 h-4 w-4" />Transfer</Button>
          <Button variant="outline" onClick={() => setIsImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Import Statement</Button>
          <Button onClick={() => setIsTxnOpen(true)}><Plus className="mr-2 h-4 w-4" />Record Transaction</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">Current Balance</div>
          <div className="text-4xl font-semibold tracking-tight tabular-nums">{formatCurrency(balance)}</div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="statement-lines">Statement Lines</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="audit-trail">Audit Trail</TabsTrigger>
          <TabsTrigger value="posting-requests">Posting Requests</TabsTrigger>
          <TabsTrigger value="journals">Linked Journals</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Account Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              <div><div className="text-muted-foreground">GL Account</div><div className="font-medium">{glAccount ? `${glAccount.account_number} — ${glAccount.name}` : '—'}</div></div>
              <div><div className="text-muted-foreground">Bank</div><div className="font-medium">{account.bank_name || '—'}</div></div>
              <div><div className="text-muted-foreground">Branch Code</div><div className="font-medium">{account.branch_code || '—'}</div></div>
              <div><div className="text-muted-foreground">Account Number</div><div className="font-medium">{account.account_number || '—'}</div></div>
              <div><div className="text-muted-foreground">Currency</div><div className="font-medium">{account.currency}</div></div>
              <div><div className="text-muted-foreground">Opening Balance</div><div className="font-medium">{formatCurrency(account.opening_balance)} {account.opening_balance_posted ? '(posted)' : '(not posted)'}</div></div>
              <div><div className="text-muted-foreground">Created</div><div className="font-medium">{format(new Date(account.created_at), 'dd MMM yyyy')}</div></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Recent Transactions</CardTitle></CardHeader>
            <CardContent>{loadingTxns ? <Skeleton className="h-32 w-full" /> : <TransactionRows rows={(transactions ?? []).slice(0, 5)} emptyLabel="No transactions yet." />}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card><CardContent className="pt-6">{loadingTxns ? <Skeleton className="h-64 w-full" /> : <TransactionRows rows={transactions} emptyLabel="No transactions recorded for this account." />}</CardContent></Card>
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardContent className="pt-6">
              {accountTransfers.length === 0 ? <EmptyState icon={ArrowLeftRight} title="No transfers involving this account" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-[110px]" /></TableRow></TableHeader>
                  <TableBody>
                    {accountTransfers.map((t) => (
                      <TableRow key={t.transfer_id}>
                        <TableCell>{format(new Date(t.transfer_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell>{t.from_bank_account_name}</TableCell>
                        <TableCell>{t.to_bank_account_name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(t.amount)}</TableCell>
                        <TableCell>{t.journal_entry_id && <Button size="sm" variant="ghost" onClick={() => setDrilldownJournalId(t.journal_entry_id)}><BookText className="mr-1.5 h-3.5 w-3.5" />Journal</Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statement-lines">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Statement Lines</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Import Statement</Button>
            </CardHeader>
            <CardContent>
              {loadingLines ? <Skeleton className="h-64 w-full" /> : (statementLines ?? []).length === 0 ? (
                <EmptyState icon={Upload} title="No statement lines imported yet" description="Import a bank statement to begin reconciling this account." action={<Button onClick={() => setIsImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Import Statement</Button>} />
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="w-[110px]" /></TableRow></TableHeader>
                  <TableBody>
                    {(statementLines ?? []).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{format(new Date(l.line_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="max-w-[240px] truncate">{l.description || '—'}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(l.amount)}</TableCell>
                        <TableCell><Badge variant={l.match_status === 'unmatched' ? 'warning' : 'success'} className="capitalize">{l.match_status.replace('_', ' ')}</Badge></TableCell>
                        <TableCell>
                          {l.match_status === 'unmatched' && account && (
                            <Button size="sm" variant="outline" onClick={() => setMatchLine(l)}>Match</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Reconciliation Progress</CardTitle><CardDescription>{matchedCount} of {totalLines} imported statement lines reconciled.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <Progress value={reconciliationProgress} />
              {(statementLines ?? []).filter((l) => l.match_status === 'unmatched').length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">All imported statement lines for this account are reconciled.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Outstanding items</p>
                  {(statementLines ?? []).filter((l) => l.match_status === 'unmatched').map((l) => (
                    <div key={l.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span>{format(new Date(l.line_date), 'dd MMM yyyy')} — {l.description || 'No description'}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{formatCurrency(l.amount)}</span>
                        <Button size="sm" variant="outline" onClick={() => setMatchLine(l)}>Resolve</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit-trail">
          <Card><CardHeader><CardTitle>Audit Trail</CardTitle><CardDescription>Every posting against this account, with the actor who created it.</CardDescription></CardHeader>
            <CardContent>{loadingTxns ? <Skeleton className="h-64 w-full" /> : <TransactionRows rows={transactions} emptyLabel="No activity recorded." />}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posting-requests">
          <Card><CardHeader><CardTitle>Posting Requests</CardTitle><CardDescription>Every transaction on this account is backed by exactly one Posting Engine request.</CardDescription></CardHeader>
            <CardContent>
              {loadingTxns ? <Skeleton className="h-64 w-full" /> : (transactions ?? []).length === 0 ? <EmptyState icon={ReceiptText} title="No posting requests yet" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Posting Request</TableHead><TableHead className="w-[110px]" /></TableRow></TableHeader>
                  <TableBody>
                    {(transactions ?? []).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{format(new Date(t.transaction_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell><Badge variant="outline">{BANK_TRANSACTION_LABELS[t.transaction_type] ?? t.transaction_type}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{t.posting_request_id ?? '—'}</TableCell>
                        <TableCell>{t.journal_entry_id && <Button size="sm" variant="ghost" onClick={() => setDrilldownJournalId(t.journal_entry_id)}>View</Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journals">
          <Card><CardHeader><CardTitle>Linked Journals</CardTitle></CardHeader>
            <CardContent>
              {loadingTxns ? <Skeleton className="h-64 w-full" /> : (transactions ?? []).length === 0 ? <EmptyState icon={BookText} title="No journals linked yet" /> : (
                <div className="space-y-2">
                  {Array.from(new Map((transactions ?? []).filter((t) => t.journal_entry_id).map((t) => [t.journal_entry_id, t])).values()).map((t) => (
                    <button key={t.journal_entry_id} type="button" onClick={() => setDrilldownJournalId(t.journal_entry_id)} className="flex w-full items-center justify-between rounded-md border p-3 text-sm text-left hover:bg-muted/50 transition-colors">
                      <span>{format(new Date(t.transaction_date), 'dd MMM yyyy')} — {t.description || BANK_TRANSACTION_LABELS[t.transaction_type]}</span>
                      <span className="font-mono">{formatCurrency(t.amount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BankAccountForm isOpen={isEditOpen} setIsOpen={setIsEditOpen} account={account} />
      <BankTransactionForm isOpen={isTxnOpen} setIsOpen={setIsTxnOpen} defaultBankAccountId={id} />
      <BankTransferForm isOpen={isTransferOpen} setIsOpen={setIsTransferOpen} defaultFromBankAccountId={id} />
      <StatementImportDialog isOpen={isImportOpen} setIsOpen={setIsImportOpen} bankAccountId={id!} />
      <StatementLineMatchDialog isOpen={!!matchLine} setIsOpen={() => setMatchLine(null)} line={matchLine} chartOfAccountId={account.chart_of_account_id} />
      <BankingJournalDrilldown journalEntryId={drilldownJournalId} isOpen={!!drilldownJournalId} setIsOpen={() => setDrilldownJournalId(null)} />
    </div>
  );
};

export default BankAccountDetail;
