import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { accountsQuery, bankAccountsQuery, bankTransactionsQuery } from '../lib/queries';
import { Account } from './ChartOfAccounts';
import { BankAccount } from '../lib/banking/types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../components/ui/table';
import { SortableHeader } from '../components/SortableHeader';
import { useSortableData } from '../hooks/useSortableData';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../components/ui/dropdown-menu';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';
import { format } from 'date-fns';
import { Search, PlusCircle, MoreHorizontal, Landmark, Star, Eye } from 'lucide-react';
import { showSuccess, showError } from '../utils/toast';
import BankAccountForm from '../components/BankAccountForm';

const BankAccountsWorkspace = () => {
  useDocumentTitle('Bank Accounts');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const { data: bankAccounts, isLoading } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: glAccounts } = useQuery<Account[]>({ ...accountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const { data: transactions } = useQuery({ ...bankTransactionsQuery(activeCompany!.id), enabled: !!activeCompany });

  const glBalanceByCoaId = useMemo(() => {
    const map = new Map<string, number>();
    (glAccounts ?? []).forEach((a) => map.set(a.id, a.balance));
    return map;
  }, [glAccounts]);

  const lastActivityByAccount = useMemo(() => {
    const map = new Map<string, string>();
    (transactions ?? []).forEach((t) => {
      const current = map.get(t.bank_account_id);
      if (!current || t.transaction_date > current) map.set(t.bank_account_id, t.transaction_date);
    });
    return map;
  }, [transactions]);

  const enriched = useMemo(
    () => (bankAccounts ?? []).map((a) => ({
      ...a,
      balance: glBalanceByCoaId.get(a.chart_of_account_id) ?? 0,
      lastActivity: lastActivityByAccount.get(a.id) ?? null,
    })),
    [bankAccounts, glBalanceByCoaId, lastActivityByAccount]
  );

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return enriched.filter((a) => {
      const matchesSearch = a.name.toLowerCase().includes(term) || (a.bank_name ?? '').toLowerCase().includes(term) || (a.account_number ?? '').includes(term);
      const matchesType = filterType === 'all' || a.account_type === filterType;
      const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [enriched, searchTerm, filterType, filterStatus]);

  const { items: sorted, sort, requestSort } = useSortableData(filtered, (item, key) => {
    if (key === 'balance') return item.balance;
    if (key === 'lastActivity') return item.lastActivity ?? '';
    return (item as unknown as Record<string, string | number | boolean>)[key];
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'inactive' | 'closed' }) => {
      const { error } = await supabase.from('bank_accounts').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['bank_accounts', activeCompany?.id] });
      showSuccess(vars.status === 'closed' ? 'Account closed.' : vars.status === 'inactive' ? 'Account archived.' : 'Account reactivated.');
    },
    onError: (error: Error) => showError(error.message),
  });

  const handleEdit = (account: BankAccount) => { setSelectedAccount(account); setIsFormOpen(true); };
  const handleAddNew = () => { setSelectedAccount(undefined); setIsFormOpen(true); };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Bank Accounts</CardTitle>
          <Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" />New Bank Account</Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by name, bank, or account number…" className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="petty_cash">Petty Cash</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 w-full animate-pulse rounded-md bg-muted" />)}</div>
          ) : sorted.length === 0 ? (
            <EmptyState icon={Landmark} title="No bank accounts found" description="Create your first bank, cash, or petty cash account." action={<Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" />New Bank Account</Button>} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader sortKey="name" sort={sort} onSort={requestSort}>Name</SortableHeader>
                  <SortableHeader sortKey="account_type" sort={sort} onSort={requestSort}>Type</SortableHeader>
                  <SortableHeader sortKey="currency" sort={sort} onSort={requestSort}>Currency</SortableHeader>
                  <SortableHeader sortKey="balance" sort={sort} onSort={requestSort} align="right">Balance</SortableHeader>
                  <SortableHeader sortKey="status" sort={sort} onSort={requestSort}>Status</SortableHeader>
                  <SortableHeader sortKey="lastActivity" sort={sort} onSort={requestSort}>Last Activity</SortableHeader>
                  <TableCell className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/banking/accounts/${a.id}`)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {a.name}
                        {a.is_default && <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Default</Badge>}
                      </div>
                      {a.bank_name && <div className="text-xs text-muted-foreground">{a.bank_name}{a.account_number ? ` · ${a.account_number}` : ''}</div>}
                    </TableCell>
                    <TableCell className="capitalize">{a.account_type.replace('_', ' ')}</TableCell>
                    <TableCell>{a.currency}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(a.balance)}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === 'active' ? 'success' : a.status === 'inactive' ? 'warning' : 'destructive'} className="capitalize">{a.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.lastActivity ? format(new Date(a.lastActivity), 'dd MMM yyyy') : 'No activity'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Open menu</span><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/banking/accounts/${a.id}`)}><Eye className="mr-2 h-4 w-4" />View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(a)}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {a.status !== 'inactive' && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: a.id, status: 'inactive' })}>Archive</DropdownMenuItem>
                          )}
                          {a.status !== 'active' && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: a.id, status: 'active' })}>Reactivate</DropdownMenuItem>
                          )}
                          {a.status !== 'closed' && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => { if (window.confirm(`Close ${a.name}? Closed accounts can no longer be posted to.`)) statusMutation.mutate({ id: a.id, status: 'closed' }); }}
                            >
                              Close Account
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <BankAccountForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} account={selectedAccount} />
    </>
  );
};

export default BankAccountsWorkspace;
