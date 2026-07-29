import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { periodCloseReadinessQuery } from '../../lib/accountingQueries';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { Progress } from '../../components/ui/progress';

const PeriodCloseReadiness = () => {
  useDocumentTitle('Period Close Readiness');
  const { activeCompany } = useAuth();
  const { data, isLoading } = useQuery({
    ...periodCloseReadinessQuery(activeCompany!.id),
    enabled: !!activeCompany,
    refetchInterval: 45_000,
  });

  const d = data as any;

  if (isLoading || !d) {
    return <div className="space-y-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7" /> Period Close Readiness
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Checklist over existing books data — each item drills into outstanding work. Does not close periods.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Readiness {d.readiness_pct}%</CardTitle>
          <CardDescription>{d.ready_count} of {d.total_count} checks ready</CardDescription>
          <Progress value={d.readiness_pct} className="h-2 mt-2" />
        </CardHeader>
        <CardContent>
          {(d.open_periods || []).length > 0 && (
            <div className="mb-4 text-sm">
              Open periods:{' '}
              {(d.open_periods || []).map((p: any) => (
                <Badge key={p.id} variant="outline" className="mr-1">P{p.period_number}</Badge>
              ))}
            </div>
          )}
          <ul className="space-y-2">
            {(d.checklist || []).map((item: any) => (
              <li key={item.id}>
                <Link
                  to={item.route}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {item.status === 'ready'
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                      : <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />}
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-sm text-muted-foreground">{item.detail}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={item.status === 'ready' ? 'outline' : 'secondary'} className="capitalize">{item.status}</Badge>
                    {item.outstanding > 0 && <Badge variant="destructive">{item.outstanding}</Badge>}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button asChild variant="outline" size="sm"><Link to="/accounting/exceptions">Exceptions</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/accounting/health">Financial Health</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/trial-balance">Trial Balance</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PeriodCloseReadiness;
