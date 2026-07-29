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
import { Badge } from '../ui/badge';

type Props = {
  accountId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function EnterpriseAccountCard({ accountId, open, onOpenChange }: Props) {
  const { activeCompany } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['account-card', activeCompany?.id, accountId],
    queryFn: () => accountingApi.accountCard(activeCompany!.id, accountId!),
    enabled: open && !!activeCompany && !!accountId,
  });

  const d = data as any;
  const account = d?.account;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Account Card</DialogTitle>
          <DialogDescription>
            {account ? `${account.account_number} — ${account.name}` : 'Enterprise account card'}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : !d ? (
          <p className="text-sm text-muted-foreground">Account not found.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Metric label="Current Balance" value={formatCurrency(d.current_balance)} />
              <Metric label="Available" value={d.available_balance != null ? formatCurrency(d.available_balance) : '—'} />
              <Metric label="Opening" value={formatCurrency(d.opening_balance)} />
              <Metric label="Period Activity" value={formatCurrency(d.period_activity)} />
              <Metric label="YTD Activity" value={formatCurrency(d.ytd_activity)} />
              <Metric label="Type" value={account?.type || '—'} />
            </div>
            <Separator />
            <LinkedList title="Linked Bank Accounts" items={(d.linked_bank_accounts || []).map((b: any) => b.name || b.id)} />
            <LinkedList title="Linked Tax Rates" items={d.linked_tax_rates || []} />
            <LinkedList title="Linked Control Accounts" items={(d.linked_control_accounts || []).map((a: any) => a.name || a)} />
            <LinkedList title="Linked Categories" items={d.linked_categories || []} />
            <LinkedList title="Linked Projects" items={(d.linked_projects || []).map((p: string) => p.slice(0, 8))} />
            <div>
              <div className="text-sm font-medium mb-2">Recent Journals</div>
              <div className="space-y-1 max-h-36 overflow-y-auto text-sm">
                {(d.recent_journals || []).map((j: any, i: number) => (
                  <div key={i} className="flex justify-between border-b py-1 gap-2">
                    <span>{j.journal_number || '—'} · {j.entry_date}</span>
                    <span className="font-mono text-xs">{j.debit ? `Dr ${formatCurrency(j.debit)}` : `Cr ${formatCurrency(j.credit)}`}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Recent Source Documents</div>
              <div className="flex flex-wrap gap-2">
                {(d.recent_source_documents || []).length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                {(d.recent_source_documents || []).map((doc: any, i: number) => (
                  doc.route ? (
                    <Button key={i} asChild size="sm" variant="outline"><Link to={doc.route}>{doc.document_type || doc.module}</Link></Button>
                  ) : <Badge key={i} variant="outline">{doc.document_type || doc.module}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Recent Attachments</div>
              <div className="space-y-1 text-sm">
                {(d.recent_attachments || []).length === 0 && <span className="text-xs text-muted-foreground">None</span>}
                {(d.recent_attachments || []).map((a: any, i: number) => (
                  <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-primary underline block">{a.journal_number || 'Attachment'}</a>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link to={`/general-ledger?account_id=${accountId}`}>Open Activity</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/trial-balance">Trial Balance</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/accounting/posting-requests">Postings</Link></Button>
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
      <div className="text-base font-semibold font-mono mt-1">{value}</div>
    </div>
  );
}

function LinkedList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-sm font-medium mb-1">{title}</div>
      {(!items || items.length === 0) ? (
        <div className="text-xs text-muted-foreground">None linked</div>
      ) : (
        <div className="flex flex-wrap gap-1">{items.map((item, i) => <Badge key={i} variant="secondary">{String(item)}</Badge>)}</div>
      )}
    </div>
  );
}
