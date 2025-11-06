import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, Search } from 'lucide-react';
import { showError, showSuccess } from '../utils/toast';
import AccountForm from '../components/AccountForm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu"
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

export type Account = {
  id: string;
  account_number: number;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  description: string | null;
  balance: number;
};

const ChartOfAccounts = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const fetchAccounts = async () => {
    if (!activeCompany) return [];
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('company_id', activeCompany.id)
      .order('account_number', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  };

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: fetchAccounts,
    enabled: !!activeCompany,
  });

  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    return accounts.filter(account => {
      const lowerCaseSearch = searchTerm.toLowerCase();
      const matchesSearch = 
        account.name.toLowerCase().includes(lowerCaseSearch) ||
        String(account.account_number).includes(lowerCaseSearch);
      const matchesType = filterType === 'all' || account.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [accounts, searchTerm, filterType]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', activeCompany?.id] });
      showSuccess('Account deleted successfully.');
    },
    onError: (error) => {
      showError(`Error deleting account: ${error.message}`);
    },
  });

  const handleEdit = (account: Account) => {
    setSelectedAccount(account);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedAccount(undefined);
    setIsFormOpen(true);
  };
  
  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this account?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Chart of Accounts</CardTitle>
          <Button onClick={handleAddNew}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add New Account
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by name or number..."
                className="pl-8 w-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Asset">Asset</SelectItem>
                <SelectItem value="Liability">Liability</SelectItem>
                <SelectItem value="Equity">Equity</SelectItem>
                <SelectItem value="Income">Income</SelectItem>
                <SelectItem value="Expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Loading accounts...</TableCell>
                </TableRow>
              ) : filteredAccounts.length > 0 ? (
                filteredAccounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>{account.account_number}</TableCell>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>{account.type}</TableCell>
                    <TableCell>{account.description}</TableCell>
                    <TableCell className="text-right">{formatCurrency(account.balance)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(account)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(account.id)} className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No accounts found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <AccountForm
        isOpen={isFormOpen}
        setIsOpen={setIsFormOpen}
        account={selectedAccount}
      />
    </>
  );
};

export default ChartOfAccounts;