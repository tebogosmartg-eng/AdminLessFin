import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invokeFinancialStatements } from '../../../lib/financialStatements/api';
import { evidenceStatusLabel } from '../../../lib/financialStatements/presentation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../components/ui/accordion';
import { Skeleton } from '../../../components/ui/skeleton';
import { FileSpreadsheet } from 'lucide-react';

type DiscDash = {
  disclosures: Array<{
    id: string;
    disclosure_code: string;
    title: string;
    status: string;
    requirement_level: string;
    updated_at: string;
  }>;
  accounting_policy_sets: Array<{ id: string; title: string; status: string; version_no: number }>;
};

type Policy = {
  id: string;
  policy_code: string;
  title: string;
  body?: string;
  content?: string;
  status?: string;
  sort_order?: number;
};

const TOPIC_ORDER = [
  'Accounting Policies',
  'Revenue',
  'Cash',
  'Receivables',
  'Inventory',
  'Assets',
  'Borrowings',
  'Taxation',
  'Related Parties',
  'Fair Value',
  'Going Concern',
  'Employee Benefits',
  'Other',
];

function disclosureTopic(title: string, code?: string): string {
  const hay = `${title} ${code || ''}`.toLowerCase();
  if (/accounting.?polic|basis.?of.?prep/i.test(hay)) return 'Accounting Policies';
  if (/revenue|income/i.test(hay)) return 'Revenue';
  if (/cash|bank/i.test(hay)) return 'Cash';
  if (/receiv|debtor/i.test(hay)) return 'Receivables';
  if (/inventor|stock/i.test(hay)) return 'Inventory';
  if (/property|plant|equipment|ppe|fixed.?asset|asset/i.test(hay)) return 'Assets';
  if (/borrow|loan|debt/i.test(hay)) return 'Borrowings';
  if (/tax/i.test(hay)) return 'Taxation';
  if (/related.?part/i.test(hay)) return 'Related Parties';
  if (/employee|benefit|payroll/i.test(hay)) return 'Employee Benefits';
  if (/fair.?value/i.test(hay)) return 'Fair Value';
  if (/going.?concern/i.test(hay)) return 'Going Concern';
  return 'Other';
}

/**
 * V6.10.0 Notes & Disclosures — browse by accounting topic, not note number.
 * Printed AFS continues to number notes automatically at publication.
 */
export default function WorkspaceNotesDisclosures({
  companyId,
  workspaceId,
  frameworkPackId,
  onGenerateStatements,
}: {
  companyId: string;
  workspaceId: string;
  frameworkPackId?: string | null;
  onGenerateStatements?: () => void;
}) {
  const dashQuery = useQuery({
    queryKey: ['efs_disclosure_dash', companyId, workspaceId, frameworkPackId],
    queryFn: () =>
      invokeFinancialStatements<DiscDash>(companyId, 'GET_DISCLOSURE_DASHBOARD', {
        workspace_id: workspaceId,
        framework_pack_id: frameworkPackId || undefined,
      }),
  });

  const policiesQuery = useQuery({
    queryKey: ['efs_policies', companyId, dashQuery.data?.accounting_policy_sets?.[0]?.id],
    queryFn: async () => [] as Policy[],
    enabled: !!dashQuery.data,
  });

  const byTopic = useMemo(() => {
    const map = new Map<string, DiscDash['disclosures']>();
    for (const d of dashQuery.data?.disclosures || []) {
      const topic = disclosureTopic(d.title, d.disclosure_code);
      if (!map.has(topic)) map.set(topic, []);
      map.get(topic)!.push(d);
    }
    return map;
  }, [dashQuery.data]);

  if (dashQuery.isLoading) return <Skeleton className="h-48 w-full" />;

  const policySets = dashQuery.data?.accounting_policy_sets || [];
  const topicsWithContent = TOPIC_ORDER.filter(
    (t) => (byTopic.get(t) || []).length > 0 || (t === 'Accounting Policies' && policySets.length > 0),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes &amp; Disclosures</CardTitle>
          <CardDescription>
            Browse by accounting topic. Note numbers are assigned automatically when you publish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topicsWithContent.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Notes will appear here once Annual Financial Statements are generated.
              </p>
              {onGenerateStatements ? (
                <Button type="button" onClick={onGenerateStatements}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Go to Financial Statements
                </Button>
              ) : null}
            </div>
          ) : (
            <Accordion type="multiple" defaultValue={topicsWithContent.slice(0, 3)} className="w-full">
              {topicsWithContent.map((topic) => {
                const items = byTopic.get(topic) || [];
                return (
                  <AccordionItem key={topic} value={topic}>
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        {topic}
                        <Badge variant="secondary">
                          {topic === 'Accounting Policies'
                            ? policySets.length || items.length
                            : items.length}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-2">
                      {topic === 'Accounting Policies' &&
                        policySets.map((ps) => (
                          <div
                            key={ps.id}
                            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                          >
                            <span className="font-medium">{ps.title}</span>
                            <Badge variant="outline">{evidenceStatusLabel(ps.status)}</Badge>
                          </div>
                        ))}
                      {(policiesQuery.data || []).map((p) => (
                        <div key={p.id} className="rounded-md border px-3 py-2 text-sm">
                          <div className="font-medium">{p.title}</div>
                          {(p.body || p.content) && (
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                              {p.body || p.content}
                            </p>
                          )}
                        </div>
                      ))}
                      {items.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <div>
                            <div className="font-medium">{d.title}</div>
                            <p className="text-xs text-muted-foreground">
                              {d.requirement_level === 'required'
                                ? 'Required for the selected reporting framework'
                                : 'Included for the selected reporting framework'}
                            </p>
                          </div>
                          <Badge variant="outline">{evidenceStatusLabel(d.status)}</Badge>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
