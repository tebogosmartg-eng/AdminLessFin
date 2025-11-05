import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { PlusCircle, MoreHorizontal, FileText } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Badge } from '../components/ui/badge';
import LoanForm from '../components/LoanForm';
import { formatCurrency } from '../lib/utils';

type Loan = {
  id: string;
  principal_amount: number;
  interest_rate: number;
  status: string;
  vendors: { name: string }[] | null;
  loan_agreement_url: string | null;
};

const Loans = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | undefined>(undefined);

  const { data: loans, isLoading } = useQuery<Loan[]>({
    queryKey: ['loans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('id, principal_amount, interest_rate, status, loan_agreement_url, vendors ( name )')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const handleAddNew = () => {
    setSelectedLoanId(undefined);
    setIsFormOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Loan Management</CardTitle>
              <CardDescription>Track and manage all your business loans.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
              <PlusCircle className="mr-2 h-4 w-4" />
              New Loan
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lender</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Interest Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center">Loading loans...</TableCell></TableRow>
              ) : loans && loans.length > 0 ? (
                loans.map((loan) => (
                  <TableRow key={loan.id}>
                    <TableCell className="font-medium">{loan.vendors?.[0]?.name || 'N/A'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(loan.principal_amount)}</TableCell>
                    <TableCell className="text-right font-mono">{loan.interest_rate}%</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{loan.status}</Badge></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem disabled>Edit</DropdownMenuItem>
                          {loan.loan_agreement_url && (
                            <DropdownMenuItem asChild>
                              <a href={loan.loan_agreement_url} target="_blank" rel="noopener noreferrer">
                                <FileText className="mr-2 h-4 w-4" /> View Agreement
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem disabled className="text-red-600">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="text-center">No loans found. Add one to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <LoanForm 
        isOpen={isFormOpen} 
        setIsOpen={setIsFormOpen} 
        loanId={selectedLoanId}
      />
    </>
  );
};

export default Loans;