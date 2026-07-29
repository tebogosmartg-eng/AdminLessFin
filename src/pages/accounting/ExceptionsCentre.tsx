import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { accountingExceptionsQuery } from '../../lib/accountingQueries';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { useState } from 'react';
import TraceabilityDrawer from '../../components/accounting/TraceabilityDrawer';

const ExceptionsCentre = () => {
  useDocumentTitle('Suspense & Exceptions');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const [trace, setTrace] = useState<{ posting_request_id?: string; journal_entry_id?: string; account_id?: string } | null>(null);

  const { data, isLoading } = useQuery({
    ...accountingExceptionsQuery(activeCompany!.id),
    enabled: !!activeCompany,
    refetchInterval: 45_000,
  });

  const issues = (data as any)?.issues || [];
  const counts = (data as any)?.counts || {};

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-7 w-7" /> Suspense & Exceptions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Unbalanced journals, failed postings, mapping gaps, suspense balances — every issue is clickable.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['total', 'Total Issues'],
          ['unbalanced_journal', 'Unbalanced Journals'],
          ['failed_posting_request', 'Failed Postings'],
          ['suspense_item', 'Suspense Items'],
          ['missing_coa_mapping', 'Missing COA Mapping'],
          ['duplicate_posting_request', 'Duplicates'],
          ['closed_period_posting', 'Closed Period Attempts'],
          ['unmapped_category', 'Unmapped Categories'],
        ].map(([key, label]) => (
          <Card key={key}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-2xl font-semibold">{counts[key] || 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exception Queue</CardTitle>
          <CardDescription>Issues identified from Posting Engine outputs and ledger integrity checks</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No exceptions detected.</p>
          ) : (
            <ul className="space-y-2">
              {issues.map((issue: any, idx: number) => (
                <li key={`${issue.type}-${idx}`}>
                  <button
                    type="button"
                    className="w-full text-left rounded-md border p-3 hover:bg-accent/50 transition-colors"
                    onClick={() => {
                      if (issue.posting_request_id || issue.journal_entry_id) {
                        setTrace({
                          posting_request_id: issue.posting_request_id,
                          journal_entry_id: issue.journal_entry_id,
                          account_id: issue.account_id,
                        });
                      } else if (issue.route) {
                        navigate(issue.route);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {issue.title}
                          <Badge variant={issue.severity === 'critical' ? 'destructive' : 'secondary'} className="capitalize">{issue.severity}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">{issue.detail}</div>
                        <div className="text-xs text-muted-foreground mt-1 capitalize">{issue.type.replace(/_/g, ' ')}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 mt-1 text-muted-foreground" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              <Link to="/accounting/posting-requests">Open Posting Requests</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <TraceabilityDrawer
        open={!!trace}
        onOpenChange={(o) => !o && setTrace(null)}
        postingRequestId={trace?.posting_request_id}
        journalEntryId={trace?.journal_entry_id}
        accountId={trace?.account_id}
      />
    </div>
  );
};

export default ExceptionsCentre;
