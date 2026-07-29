import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ElementType } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { invokeWork } from '../../lib/work/api';
import { buildAttentionQueue } from '../../lib/work/analytics';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { formatCurrency, cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, TrendingUp, AlertTriangle, Clock, Users, Wallet, Target, CircleDollarSign,
} from 'lucide-react';

type Dash = {
  businessOverview: {
    totalActiveWork: number;
    pipelineValue: number;
    awardedContractValue: number;
    costsIncurred: number;
    expectedGrossProfit: number;
    payrollDueApprovals: number;
    resourceUtilisationPct: number;
    capacityRemainingHours: number;
    operationalBurnRate: number;
  };
  projectsRequiringAttention: Array<{ id: string; name: string; burnPct: number }>;
  upcomingDeadlines: Array<{ id: string; name: string; dueDate: string; daysRemaining: number }>;
  budgetRisks: Array<{ id: string; name: string; burnPct: number }>;
  scheduleRisks: Array<{ id: string; name: string; dueDate: string; daysRemaining: number }>;
  executiveAlerts: Array<{ id: string; severity: string; message: string; ewm_project_id?: string }>;
  intelligence: {
    pendingApprovals: number;
    idleResources: Array<{ id: string; name: string }>;
    overallocations: Array<{ id: string; name: string; utilisationPct: number }>;
    unbilledCompleted: Array<{ id: string; name: string; amount: number }>;
    outstandingSupplierInvoices: Array<{ id: string; name: string; amount: number }>;
    cashFlowRisks: Array<{ id: string; name: string; outstanding: number }>;
  };
  projects: Array<{ id: string; name: string; status: string; contract_value: number }>;
};

const Kpi = ({ label, value, icon: Icon, tone }: { label: string; value: string; icon: ElementType; tone?: string }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{label}</CardTitle>
      <Icon className={cn('h-4 w-4 text-muted-foreground', tone)} />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

export default function WorkExecutiveDashboard() {
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['ewm_executive_dashboard', activeCompany?.id],
    queryFn: () => invokeWork<Dash>(activeCompany!.id, 'GET_EXECUTIVE_DASHBOARD'),
    enabled: !!activeCompany,
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const ws = await invokeWork<any>(activeCompany!.id, 'UPSERT_WORKSPACE', {
        workspace: { name: 'Primary Workspace', workspace_type: 'general', status: 'active' },
      });
      const pf = await invokeWork<any>(activeCompany!.id, 'UPSERT_PORTFOLIO', {
        portfolio: { workspace_id: ws.id, name: 'Delivery Portfolio', status: 'active' },
      });
      await invokeWork(activeCompany!.id, 'UPSERT_EWM_PROJECT', {
        project: {
          portfolio_id: pf.id,
          name: 'Sample Operational Project',
          status: 'active',
          contract_value: 250000,
          operational_budget: 180000,
          start_date: new Date().toISOString().slice(0, 10),
          expected_completion: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
          overall_progress: 10,
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ewm_executive_dashboard'] }),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-80" />
        <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      </div>
    );
  }

  const o = data.businessOverview;
  const attention = buildAttentionQueue({
    budgetRisks: data.budgetRisks || [],
    deadlineRisks: data.scheduleRisks || [],
    idleResources: data.intelligence?.idleResources || [],
    overallocations: data.intelligence?.overallocations || [],
    pendingApprovals: data.intelligence?.pendingApprovals || 0,
    outstandingSupplierInvoices: data.intelligence?.outstandingSupplierInvoices || [],
    unbilledCompleted: data.intelligence?.unbilledCompleted || [],
    cashFlowRisks: data.intelligence?.cashFlowRisks || [],
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executive Operations Dashboard</h1>
          <p className="text-muted-foreground">Enterprise Work Management — what work exists, who is working, cost, revenue, and intervention signals.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/work/resources')}>Resources</Button>
          <Button variant="outline" onClick={() => navigate('/work/clocking')}>Clocking</Button>
          <Button onClick={() => navigate('/work/projects')}>Projects</Button>
        </div>
      </div>

      {(data.projects || []).length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>No EWM projects yet. Seed a workspace/portfolio/sample project, or create one from Projects.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? 'Seeding…' : 'Seed sample workspace'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total Active Work" value={String(o.totalActiveWork)} icon={Briefcase} />
        <Kpi label="Pipeline Value" value={formatCurrency(o.pipelineValue)} icon={Target} />
        <Kpi label="Awarded Contract Value" value={formatCurrency(o.awardedContractValue)} icon={CircleDollarSign} />
        <Kpi label="Costs Incurred" value={formatCurrency(o.costsIncurred)} icon={Wallet} />
        <Kpi label="Expected Gross Profit" value={formatCurrency(o.expectedGrossProfit)} icon={TrendingUp} tone="text-emerald-600" />
        <Kpi label="Operational Burn" value={formatCurrency(o.operationalBurnRate)} icon={AlertTriangle} />
        <Kpi label="Resource Utilisation" value={`${o.resourceUtilisationPct}%`} icon={Users} />
        <Kpi label="Capacity Remaining" value={`${o.capacityRemainingHours}h`} icon={Clock} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projects Requiring Attention</CardTitle>
            <CardDescription>Budget and schedule risk requiring intervention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {attention.length === 0 && <p className="text-sm text-muted-foreground">No attention items.</p>}
            {attention.slice(0, 12).map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex w-full items-start justify-between rounded-md border p-3 text-left hover:bg-muted/50"
                onClick={() => item.ewmProjectId && navigate(`/work/projects/${item.ewmProjectId}`)}
              >
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">{item.detail}</div>
                </div>
                <Badge variant={item.severity === 'critical' ? 'destructive' : 'secondary'}>{item.severity}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
            <CardDescription>Milestones due within 14 days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data.upcomingDeadlines || []).length === 0 && <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>}
            {(data.upcomingDeadlines || []).map((d) => (
              <div key={`${d.id}-${d.name}`} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-sm text-muted-foreground">{d.dueDate}</div>
                </div>
                <Badge variant={d.daysRemaining < 0 ? 'destructive' : 'outline'}>
                  {d.daysRemaining < 0 ? `${Math.abs(d.daysRemaining)}d overdue` : `${d.daysRemaining}d`}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll Due / Time Approvals</CardTitle>
          <CardDescription>Approved hours become payroll input facts; Payroll remains calculation authority.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="text-2xl font-bold">{o.payrollDueApprovals} pending</div>
          <Button variant="outline" onClick={() => navigate('/work/time')}>Review time entries</Button>
        </CardContent>
      </Card>
    </div>
  );
}
