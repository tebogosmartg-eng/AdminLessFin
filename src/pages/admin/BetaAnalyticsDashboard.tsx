import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  BarChart3,
  Building2,
  Users,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Clock,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type BetaDashboard = {
  period_days: number;
  generated_at: string;
  summary: {
    total_events: number;
    active_beta_companies_7d: number;
    total_companies: number;
    accounting_ready_count: number;
    not_accounting_ready_count: number;
    dau_today: number;
    failed_onboarding_attempts: number;
  };
  dau_by_day: Record<string, number>;
  onboarding_funnel: Record<string, number>;
  first_usage: Record<string, number>;
  not_ready_companies: { id: string; name: string; status: string; created_at: string }[];
  beta_companies: {
    id: string;
    name: string;
    accounting_ready: boolean;
    status: string;
    active_last_7d: boolean;
    created_at: string;
  }[];
  most_common_errors: { event_name: string; count: number }[];
  errors_by_module: { module: string; count: number }[];
  most_common_validation_failures: { message: string; count: number }[];
  dropoff_by_step: { step: string; count: number }[];
  step_completion_avg_ms: Record<string, number>;
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const BetaAnalyticsDashboard = () => {
  useDocumentTitle('Beta Analytics');

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['beta-analytics-dashboard'],
    queryFn: async () => {
      const { data: payload, error: fnError } = await supabase.functions.invoke('product-analytics', {
        body: { method: 'GET_BETA_DASHBOARD', days: 30 },
      });
      if (fnError) throw new Error(fnError.message);
      return payload as BetaDashboard;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load beta analytics</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : 'Unknown error'}</AlertDescription>
      </Alert>
    );
  }

  const { summary } = data;

  const kpiCards = [
    {
      label: 'Active companies (7d)',
      value: summary.active_beta_companies_7d,
      icon: Building2,
    },
    {
      label: 'Accounting Ready',
      value: summary.accounting_ready_count,
      icon: CheckCircle2,
    },
    {
      label: 'Not ready',
      value: summary.not_accounting_ready_count,
      icon: AlertTriangle,
    },
    { label: 'DAU today', value: summary.dau_today, icon: Users },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <BarChart3 className="h-8 w-8" />
            Private Beta Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Internal dashboard · last {data.period_days} days · updated{' '}
            {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—'}
          </p>
        </div>
        <Badge variant="outline">{summary.total_events.toLocaleString()} events</Badge>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Onboarding funnel
            </CardTitle>
            <CardDescription>Setup events in period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.onboarding_funnel).map(([step, count]) => (
              <div key={step} className="flex items-center justify-between text-sm">
                <span className="capitalize">{step.replaceAll('_', ' ')}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Failed validation attempts: {summary.failed_onboarding_attempts}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5" />
              First usage milestones
            </CardTitle>
            <CardDescription>First-time events per company</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.first_usage).map(([key, count]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="capitalize">{key.replaceAll('_', ' ')}</span>
                <Badge variant="outline">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Most common errors</CardTitle>
          </CardHeader>
          <CardContent>
            {data.most_common_errors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No errors recorded in period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.most_common_errors.map((row) => (
                    <TableRow key={row.event_name}>
                      <TableCell className="font-mono text-xs">{row.event_name}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validation failures (support signals)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.most_common_validation_failures.length === 0 ? (
              <p className="text-sm text-muted-foreground">No validation failures recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.most_common_validation_failures.map((row) => (
                  <li key={row.message} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{row.message}</span>
                    <Badge variant="destructive">{row.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Avg step completion time
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(data.step_completion_avg_ms).length === 0 ? (
              <p className="text-sm text-muted-foreground">No step timing data yet.</p>
            ) : (
              Object.entries(data.step_completion_avg_ms).map(([step, ms]) => (
                <div key={step} className="flex justify-between text-sm">
                  <span className="capitalize">{step.replaceAll('_', ' ')}</span>
                  <span className="font-mono">{formatMs(ms)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Drop-off by step</CardTitle>
          </CardHeader>
          <CardContent>
            {data.dropoff_by_step.length === 0 ? (
              <p className="text-sm text-muted-foreground">No drop-off events recorded.</p>
            ) : (
              data.dropoff_by_step.map((row) => (
                <div key={row.step} className="flex justify-between py-1 text-sm">
                  <span>{row.step || 'unknown'}</span>
                  <Badge variant="secondary">{row.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Beta companies</CardTitle>
          <CardDescription>{data.beta_companies.length} companies total</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ready</TableHead>
                <TableHead>Active 7d</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.beta_companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="capitalize text-xs">{c.status.replaceAll('_', ' ').toLowerCase()}</TableCell>
                  <TableCell>
                    {c.accounting_ready ? (
                      <Badge variant="outline" className="text-emerald-600">Yes</Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>{c.active_last_7d ? 'Yes' : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default BetaAnalyticsDashboard;
