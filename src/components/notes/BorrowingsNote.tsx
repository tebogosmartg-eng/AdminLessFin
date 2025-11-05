import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';

type LoanSummary = {
  id: string;
  lender_name: string;
  principal_amount: number;
  interest_rate: number;
  closing_balance: number;
};

const BorrowingsNote = () => {
  const { data: summary, isLoading } = useQuery<LoanSummary[]>({
    queryKey: ['borrowings_note_summary'],
    queryFn: async () => {
      const { data: loans, error } = await supabase
        .from('loans')
        .select(`
          id,
          principal_amount,
          interest_rate,
          vendors ( name ),
          loan_amortization_schedule ( remaining_balance )
        `)
        .eq('status', 'active')
        .order('payment_number', { foreignTable: 'loan_amortization_schedule', ascending: false })
        .limit(1, { foreignTable: 'loan_amortization_schedule' });

      if (error) throw error;

      return loans.map(loan => ({
        id: loan.id,
        lender_name: (loan.vendors as any)?.name || 'N/A',
        principal_amount: loan.principal_amount,
        interest_rate: loan.interest_rate,
        closing_balance: loan.loan_amortization_schedule[0]?.remaining_balance ?? loan.principal_amount,
      }));
    },
  });

  const totalBalance = summary?.reduce((sum, loan) => sum + loan.closing_balance, 0) || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Note: Borrowings</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lender</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Interest Rate</TableHead>
                <TableHead className="text-right">Closing Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary?.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{item.lender_name}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.principal_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{item.interest_rate}%</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(item.closing_balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-bold text-lg">
                <TableCell colSpan={3}>Total Borrowings</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(totalBalance)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default BorrowingsNote;