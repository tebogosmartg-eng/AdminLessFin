import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { formatCurrency } from '../lib/utils';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';

type Account = {
  id: string;
  name: string;
  balance: number;
  type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
};

interface BankAccountsSummaryProps {
  accounts: Account[] | undefined;
  isLoading: boolean;
}

const BankAccountsSummary = ({ accounts, isLoading }: BankAccountsSummaryProps) => {
  const bankAccounts = accounts?.filter(acc => {
    const name = acc.name.toLowerCase();
    // Only show asset accounts that look like bank/cash accounts
    return acc.type === 'Asset' && (name.includes('bank') || name.includes('cash') || name.includes('checking') || name.includes('savings'));
  }) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Accounts</CardTitle>
        <CardDescription>A summary of your cash balances.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24 w-full" /> : (
          bankAccounts.length > 0 ? (
            <div className="space-y-3">
              {bankAccounts.map(account => (
                <div key={account.id} className="flex justify-between items-center text-sm">
                  <span className="font-medium truncate pr-4">{account.name}</span>
                  <span className="font-mono flex-shrink-0">{formatCurrency(account.balance)}</span>
                </div>
              ))}
              <Button asChild variant="link" className="px-0 mt-2 h-auto py-0">
                <Link to="/chart-of-accounts">View all accounts</Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No bank accounts found. <Link to="/chart-of-accounts" className="underline">Add one</Link> to see balances here.</p>
          )
        )}
      </CardContent>
    </Card>
  );
};

export default BankAccountsSummary;