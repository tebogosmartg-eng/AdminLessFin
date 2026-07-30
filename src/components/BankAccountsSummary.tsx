import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Skeleton } from './ui/skeleton';
import { Badge } from './ui/badge';
import { formatCurrency } from '../lib/utils';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import { accountsQuery, bankAccountsQuery } from '../lib/queries';
import { Account } from '../pages/ChartOfAccounts';

type BankAccountsSummaryProps = {
  /** When provided (Operations Dashboard), balances are as-of the reporting period — same engine accounts as KPI cards. */
  asOfAccounts?: Account[];
};

/**
 * V3.0 Phase 3C: rewired from a Chart-of-Accounts name heuristic
 * ('bank'/'cash'/'checking'/'savings' substring match) to the real
 * bank_accounts Banking domain, joined to live GL balances.
 */
const BankAccountsSummary = ({ asOfAccounts }: BankAccountsSummaryProps) => {
  const { activeCompany } = useAuth();
  const { data: bankAccounts, isLoading: loadingBank } = useQuery({ ...bankAccountsQuery(activeCompany!.id), enabled: !!activeCompany });
  const useAsOf = Array.isArray(asOfAccounts);
  const { data: glAccounts, isLoading: loadingGl } = useQuery<Account[]>({
    ...accountsQuery(activeCompany!.id),
    enabled: !!activeCompany && !useAsOf,
  });
  const isLoading = loadingBank || (!useAsOf && loadingGl);

  const sourceAccounts = useAsOf ? asOfAccounts! : (glAccounts ?? []);
  const glBalanceByCoaId = new Map(sourceAccounts.map((a) => [a.id, a.balance]));
  const accounts = (bankAccounts ?? [])
    .filter((a) => a.status === 'active')
    .map((a) => ({ ...a, balance: glBalanceByCoaId.get(a.chart_of_account_id) ?? 0 }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Accounts</CardTitle>
        <CardDescription>
          {useAsOf ? 'Cash balances as of the selected period end.' : 'A summary of your cash balances.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-24 w-full" /> : (
          accounts.length > 0 ? (
            <div className="space-y-3">
              {accounts.map(account => (
                <div key={account.id} className="flex justify-between items-center text-sm">
                  <span className="font-medium truncate pr-4 flex items-center gap-2">
                    {account.name}
                    {account.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                  </span>
                  <span className="font-mono flex-shrink-0">{formatCurrency(account.balance)}</span>
                </div>
              ))}
              <Button asChild variant="link" className="px-0 mt-2 h-auto py-0">
                <Link to="/banking/accounts">View all bank accounts</Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No bank accounts found. <Link to="/banking/accounts" className="underline">Add one</Link> to see balances here.</p>
          )
        )}
      </CardContent>
    </Card>
  );
};

export default BankAccountsSummary;
