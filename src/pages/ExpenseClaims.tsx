import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, CheckCircle, DollarSign, Paperclip, Coins } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Skeleton } from '../components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { showError, showSuccess } from '../utils/toast';
import ExpenseClaimForm from '../components/ExpenseClaimForm';
import ReimburseClaimDialog from '../components/ReimburseClaimDialog';
import { EmployeeIdentity } from '../components/hr/EmployeeIdentity';
import { formatCurrency } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Account } from './ChartOfAccounts';
import { expenseClaimsQuery } from '../lib/queries';

const ExpenseClaims = () => {
  useDocumentTitle('Expense Claims');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string | undefined>(undefined);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [liabilityAccountId, setLiabilityAccountId] = useState('');
  const [isReimburseOpen, setIsReimburseOpen] = useState(false);
  const [claimToReimburse, setClaimToReimburse] = useState<any>(null);
  
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: claims, isLoading } = useQuery({
    ...expenseClaimsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounts', activeCompany?.id],
    queryFn: async () => {
        if(!activeCompany) return [];
        const { data } = await supabase.functions.invoke('chart-of-accounts', { body: { method: 'GET', company_id: activeCompany.id } });
        return data;
    },
    enabled: !!activeCompany
  });
  
  const liabilityAccounts = accounts?.filter(a => a.type === 'Liability');

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.functions.invoke('expense-claims', {
        body: { method: 'DELETE', company_id: activeCompany!.id, claimId: id },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_claims'] });
      showSuccess('Claim deleted.');
    },
    onError: (e: any) => showError(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClaimId || !liabilityAccountId) throw new Error("Please select a liability account.");
      const { error } = await supabase.functions.invoke('expense-claims', {
        body: { method: 'APPROVE', company_id: activeCompany!.id, claimId: selectedClaimId, liabilityAccountId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense_claims'] });
      showSuccess('Claim approved.');
      setIsApproveOpen(false);
      setSelectedClaimId(undefined);
    },
    onError: (e: any) => showError(e.message),
  });

  const handleEdit = (id: string) => {
    setSelectedClaimId(id);
    setIsFormOpen(true);
  };

  const handleAddNew = () => {
    setSelectedClaimId(undefined);
    setIsFormOpen(true);
  };

  const handleApproveClick = (id: string) => {
    setSelectedClaimId(id);
    setIsApproveOpen(true);
  };

  const handleReimburseClick = (claim: any) => {
    setClaimToReimburse(claim);
    setIsReimburseOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return 'default';
      case 'paid': return 'secondary';
      case 'draft': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Expense Claims</CardTitle>
              <CardDescription>Manage employee reimbursements.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Claim
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : claims && claims.length > 0 ? (
                claims.map((claim: any) => (
                  <TableRow key={claim.id}>
                    <TableCell className="font-medium">{claim.claim_number}</TableCell>
                    <TableCell>{format(new Date(claim.submission_date), 'PPP')}</TableCell>
                    <TableCell>
                      {claim.employees ? (
                        <EmployeeIdentity employee={claim.employees} layout="stacked" showDepartment />
                      ) : '—'}
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                        {claim.description}
                        {claim.attachment_url && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(claim.total_amount)}</TableCell>
                    <TableCell><Badge variant={getStatusBadge(claim.status)} className="capitalize">{claim.status}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(claim.id)} disabled={claim.status !== 'draft'}>Edit</DropdownMenuItem>
                          {claim.attachment_url && (
                             <DropdownMenuItem asChild>
                                 <a href={claim.attachment_url} target="_blank" rel="noopener noreferrer">View Attachment</a>
                             </DropdownMenuItem>
                          )}
                          {claim.status === 'draft' && (
                             <DropdownMenuItem onClick={() => handleApproveClick(claim.id)}><CheckCircle className="mr-2 h-4 w-4 text-green-600" /> Approve</DropdownMenuItem>
                          )}
                          {claim.status === 'approved' && (
                             <DropdownMenuItem onClick={() => handleReimburseClick(claim)}><DollarSign className="mr-2 h-4 w-4 text-green-600" /> Reimburse</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => deleteMutation.mutate(claim.id)} className="text-red-600" disabled={claim.status !== 'draft'}>Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={Coins}
                      title="No expense claims yet"
                      description="Submit an expense claim to get reimbursed. Approved claims post to your books automatically."
                      action={<Button onClick={handleAddNew}><PlusCircle className="mr-2 h-4 w-4" /> New Claim</Button>}
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ExpenseClaimForm isOpen={isFormOpen} setIsOpen={setIsFormOpen} claimId={selectedClaimId} />

      <Dialog open={isApproveOpen} onOpenChange={setIsApproveOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Approve Expense Claim</DialogTitle>
                <DialogDescription>Select the liability account to record this obligation (e.g. Employee Reimbursements Payable).</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>Payable Account</Label>
                    <Select onValueChange={setLiabilityAccountId} value={liabilityAccountId}>
                        <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                        <SelectContent>{liabilityAccounts?.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsApproveOpen(false)}>Cancel</Button>
                <Button onClick={() => approveMutation.mutate()} disabled={!liabilityAccountId || approveMutation.isPending}>
                    {approveMutation.isPending ? 'Approving...' : 'Approve & Post'}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {claimToReimburse && (
        <ReimburseClaimDialog
          isOpen={isReimburseOpen}
          setIsOpen={setIsReimburseOpen}
          claim={claimToReimburse}
        />
      )}
    </>
  );
};

export default ExpenseClaims;