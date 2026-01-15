import { useQuery } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { formatCurrency, cn } from '../lib/utils';
import { format } from 'date-fns';

const ComparativeBalanceSheet = () => {
  const { activeCompany } = useAuth();

  const { data: report, isLoading } = useQuery({
    queryKey: ['comparative_bs', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('reports', {
        body: {
          method: 'GET_COMPARATIVE_BS',
          company_id: activeCompany.id,
          end_date: format(new Date(), 'yyyy-MM-dd'),
        },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  const assetAccounts = report?.accounts.filter((a: any) => a.type === 'Asset') || [];
  const liabilityAccounts = report?.accounts.filter((a: any) => a.type === 'Liability') || [];
  const equityAccounts = report?.accounts.filter((a: any) => a.type === 'Equity') || [];

  const calculateTotal = (accounts: any[], key: 'current' | 'prior') => {
    return accounts.reduce((sum, acc) => sum + (acc[key] || 0), 0);
  };

  const renderSection = (title: string, accounts: any[]) => {
      const currentTotal = calculateTotal(accounts, 'current');
      const priorTotal = calculateTotal(accounts, 'prior');
      
      return (
        <>
            <TableRow className="bg-muted/50 font-semibold"><TableCell colSpan={4}>{title}</TableCell></TableRow>
            {accounts.map(acc => (
                <TableRow key={acc.name}>
                    <TableCell className="pl-8">{acc.name}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(acc.current)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(acc.prior)}</TableCell>
                    <TableCell className={cn("text-right font-mono text-xs", acc.current > acc.prior ? "text-green-600" : (acc.current < acc.prior ? "text-red-600" : "text-muted-foreground"))}>
                        {acc.current !== acc.prior ? (acc.current > acc.prior ? '↑' : '↓') : '-'} {formatCurrency(Math.abs(acc.current - acc.prior))}
                    </TableCell>
                </TableRow>
            ))}
            <TableRow className="font-bold border-t">
                <TableCell>Total {title}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(currentTotal)}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(priorTotal)}</TableCell>
                <TableCell></TableCell>
            </TableRow>
        </>
      )
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Comparative Balance Sheet</h1>
      <Card>
        <CardHeader>
          <CardTitle>Year-over-Year Comparison</CardTitle>
          <CardDescription>
            Comparing {report?.dates.current ? format(new Date(report.dates.current), 'PP') : ''} vs {report?.dates.prior ? format(new Date(report.dates.prior), 'PP') : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-96 w-full" /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Prior Year</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderSection('Assets', assetAccounts)}
                <TableRow className="h-4"><TableCell colSpan={4}></TableCell></TableRow>
                {renderSection('Liabilities', liabilityAccounts)}
                <TableRow className="h-4"><TableCell colSpan={4}></TableCell></TableRow>
                {renderSection('Equity', equityAccounts)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ComparativeBalanceSheet;