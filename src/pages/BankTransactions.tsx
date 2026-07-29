import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { bankAccountsQuery, bankTransactionsQuery } from '../lib/queries';
import { BANK_TRANSACTION_LABELS, BANK_TRANSACTION_TYPES } from '../lib/banking/types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../components/ui/table';
import { SortableHeader } from '../components/SortableHeader';
import { useSortableData } from '../hooks/useSortableData';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '../components/ui/pagination';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { Search, ReceiptText, Download, BookText, Plus } from 'lucide-react';
import BankTransactionForm from '../components/BankTransactionForm';
import BankingJournalDrilldown from '../components/BankingJournalDrilldown';

const PAGE_SIZE = 20;

const BankTransactions = () => {
  useDocumentTitle('Bank Transactions');
  const { activeCompany } = useAuth();

  const [isTxnOpen, setIsTxnOpen] = useState(false);
  const [drilldownJournalId, setDrilldownJournalId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(1);

  const { data: bankAccounts } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: transactions, isLoading } = useQuery({ ...bankTransactionsQuery(activeCompany!.id), enabled: !!activeCompany });

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (transactions ?? []).filter((t) => {
      const matchesSearch = (t.description ?? '').toLowerCase().includes(term) || (t.reference ?? '').toLowerCase().includes(term);
      const matchesAccount = filterAccount === 'all' || t.bank_account_id === filterAccount;
      const matchesType = filterType === 'all' || t.transaction_type === filterType;
      return matchesSearch && matchesAccount && matchesType;
    });
  }, [transactions, searchTerm, filterAccount, filterType]);

  const { items: sorted, sort, requestSort } = useSortableData(filtered, (item, key) => {
    if (key === 'account') return item.bank_accounts?.name ?? '';
    return (item as unknown as Record<string, string | number>)[key];
  }, { key: 'transaction_date', direction: 'desc' });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleExport = () => {
    const header = ['Date', 'Account', 'Type', 'Description', 'Reference', 'Amount'];
    const rows = sorted.map((t) => [
      t.transaction_date, t.bank_accounts?.name ?? '', BANK_TRANSACTION_LABELS[t.transaction_type] ?? t.transaction_type,
      (t.description ?? '').replace(/,/g, ';'), t.reference ?? '', t.amount.toFixed(2),
    ]);
    const csv = [header, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bank-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bank Transactions</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={sorted.length === 0}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            <Button onClick={() => setIsTxnOpen(true)}><Plus className="mr-2 h-4 w-4" />Record Transaction</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search description or reference…" className="pl-8" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} />
            </div>
            <Select value={filterAccount} onValueChange={(v) => { setFilterAccount(v); setPage(1); }}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {(bankAccounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {BANK_TRANSACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{BANK_TRANSACTION_LABELS[t]}</SelectItem>)}
                <SelectItem value="transfer_in">Transfer In</SelectItem>
                <SelectItem value="transfer_out">Transfer Out</SelectItem>
                <SelectItem value="opening_balance">Opening Balance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-10 w-full animate-pulse rounded-md bg-muted" />)}</div>
          ) : sorted.length === 0 ? (
            <EmptyState icon={ReceiptText} title="No transactions found" description="Try adjusting your search or filters." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader sortKey="transaction_date" sort={sort} onSort={requestSort}>Date</SortableHeader>
                    <SortableHeader sortKey="account" sort={sort} onSort={requestSort}>Account</SortableHeader>
                    <SortableHeader sortKey="transaction_type" sort={sort} onSort={requestSort}>Type</SortableHeader>
                    <TableCell>Description</TableCell>
                    <SortableHeader sortKey="amount" sort={sort} onSort={requestSort} align="right">Amount</SortableHeader>
                    <TableCell className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{format(new Date(t.transaction_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>{t.bank_accounts?.name ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{BANK_TRANSACTION_LABELS[t.transaction_type] ?? t.transaction_type}</Badge></TableCell>
                      <TableCell className="max-w-[260px] truncate">{t.description || '—'}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(t.amount)}</TableCell>
                      <TableCell>{t.journal_entry_id && <Button size="sm" variant="ghost" onClick={() => setDrilldownJournalId(t.journal_entry_id)}><BookText className="mr-1.5 h-3.5 w-3.5" />Journal</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <Pagination className="mt-4 justify-between">
                  <p className="text-xs text-muted-foreground">Page {page} of {totalPages} ({sorted.length} transactions)</p>
                  <PaginationContent>
                    <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }} /></PaginationItem>
                    <PaginationItem><PaginationLink href="#" isActive>{page}</PaginationLink></PaginationItem>
                    <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }} /></PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <BankTransactionForm isOpen={isTxnOpen} setIsOpen={setIsTxnOpen} />
      <BankingJournalDrilldown journalEntryId={drilldownJournalId} isOpen={!!drilldownJournalId} setIsOpen={() => setDrilldownJournalId(null)} />
    </>
  );
};

export default BankTransactions;
