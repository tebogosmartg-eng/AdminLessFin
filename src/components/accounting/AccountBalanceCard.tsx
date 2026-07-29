import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { accountingApi } from '../../lib/accountingWorkspace';
import { formatCurrency } from '../../lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Separator } from '../ui/separator';

type Props = {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function AccountBalanceCard({ accountId, open, onOpenChange }: Props) {
  const { activeCompany } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['account-inquiry', activeCompany?.id, accountId],
    queryFn: () => accountingApi.accountInquiry(activeCompany!.id, accountId!),
    enabled: open && !!activeCompany && !!accountId,
  });

  const d = data as any;
  const account = d?.account;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Account Balance</DialogTitle>
          <DialogDescription>
            {account ? `${account.account_number} — ${account.name}` : 'Account inquiry'}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : !d ? (
          <p className="text-sm text-muted-foreground">Account not found.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Current Balance" value={formatCurrency(d.current_balance)} />
              <Metric label="Opening Balance" value={formatCurrency(d.opening_balance)} />
              <Metric label="Period Movement" value={formatCurrency(d.period_movement)} />
              <Metric label="YTD Movement" value={formatCurrency(d.ytd_movement)} />
            </div>
            <Separator />
            <div>
              <div className="text-sm font-medium mb-2">Recent Journals</div>
              <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
                {(d.recent_journals || []).map((j: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-b py-1">
                    <span>{j.journal_number || '—'} · {j.entry_date}</span>
                    <span className="font-mono text-xs">
                      {j.debit ? `Dr ${formatCurrency(j.debit)}` : `Cr ${formatCurrency(j.credit)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to={`/general-ledger?account_id=${accountId}`}>Open Ledger</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={`/journal-entries`}>Open Journals</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={`/trial-balance`}>Trial Balance Position</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to={`/accounting/posting-requests`}>Posting History</Link>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Control account: {account?.control_account ? 'Yes' : 'No'}</div>
              <div>Normal balance: {account?.normal_balance || '—'}</div>
              <div>Manual posting: {account?.allow_manual_posting === false ? 'Blocked' : 'Allowed'}</div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}
