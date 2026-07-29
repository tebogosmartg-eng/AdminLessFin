import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow, startOfMonth, endOfMonth } from 'date-fns';
import {
  Briefcase,
  Users,
  Coins,
  CalendarClock,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseCalendar } from '../hooks/useEnterpriseCalendar';
import { Badge } from '../components/ui/badge';
import { payrollWorkspaceQuery, employeesQuery, expenseClaimsQuery, revenueWorkspaceQuery, purchasesWorkspaceQuery, fixedAssetsQuery } from '../lib/queries';
import { EmployeeIdentity } from '../components/hr/EmployeeIdentity';
import { formatCurrency } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import PayrollReadinessScore from '../components/payroll/PayrollReadinessScore';
import PayrollTimeline from '../components/payroll/PayrollTimeline';
import PayrollCashImpact from '../components/payroll/PayrollCashImpact';
import PayrollAlerts from '../components/payroll/PayrollAlerts';
import PayrollAiInsights from '../components/payroll/PayrollAiInsights';
import PayrollCalendarStrip from '../components/payroll/PayrollCalendarStrip';
import EmployeePreviewDialog from '../components/payroll/EmployeePreviewDialog';
import {
  computeReadinessScore,
  buildPayrollTimeline,
  computeCashImpact,
  buildOperationalAlerts,
  buildPayrollInsights,
  buildPayrollCalendarEvents,
} from '../lib/payrollIntelligence';
import type { Employee } from './Employees';

const PayrollWorkspace = () => {
  useDocumentTitle('Payroll');
  const { activeCompany } = useAuth();
  const { yearCode } = useEnterpriseCalendar(activeCompany?.id);
  const navigate = useNavigate();
  const [previewEmployeeId, setPreviewEmployeeId] = useState<string | null>(null);

  const dateFrom = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const dateTo = format(endOfMonth(new Date()), 'yyyy-MM-dd');

  const { data: workspace, isLoading: wsLoading } = useQuery({
    ...payrollWorkspaceQuery(activeCompany?.id ?? ''),
    enabled: !!activeCompany?.id,
  });
  const { data: employees = [], isLoading: empLoading } = useQuery<Employee[]>({
    ...employeesQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });
  const { data: claims = [] } = useQuery({
    ...expenseClaimsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });
  const { data: dashboard } = useQuery({
    ...revenueWorkspaceQuery(activeCompany!.id, dateFrom, dateTo),
    enabled: !!activeCompany,
  });
  const { data: purchases } = useQuery({
    ...purchasesWorkspaceQuery(activeCompany!.id, dateFrom, dateTo),
    enabled: !!activeCompany,
  });
  const { data: assets = [] } = useQuery({
    ...fixedAssetsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const previewAssets = useMemo(
    () =>
      (assets ?? []).map((a) => ({
        id: a.id,
        name: a.name ?? a.description ?? a.asset_code,
        status: a.status,
        assigned_to_employee_id: a.assigned_to_employee_id,
      })),
    [assets]
  );

  const isLoading = wsLoading || empLoading;
  const metrics = workspace?.metrics;
  const recentPayrollRuns = workspace?.recentPayrollRuns || [];
  const pendingClaimsList = workspace?.pendingClaimsList || [];

  const intelligence = useMemo(() => {
    const openBillsTotal = (purchases?.openBillsList || [])
      .filter((b: { due_date?: string }) => {
        if (!b.due_date || !metrics?.upcomingPayDate) return true;
        return b.due_date <= metrics.upcomingPayDate;
      })
      .reduce((sum: number, b: { total: number }) => sum + (b.total || 0), 0);

    return {
      readiness: computeReadinessScore(employees, workspace),
      timeline: buildPayrollTimeline(workspace, claims),
      cash: computeCashImpact(dashboard?.accounts || [], workspace, openBillsTotal),
      alerts: buildOperationalAlerts(employees, workspace, claims),
      insights: buildPayrollInsights(employees, workspace, claims),
      calendarEvents: buildPayrollCalendarEvents(workspace, claims),
    };
  }, [employees, workspace, claims, dashboard, purchases, metrics?.upcomingPayDate]);

  const previewEmployee = employees.find((e) => e.id === previewEmployeeId) || null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-12">
          <Skeleton className="h-40 lg:col-span-4" />
          <Skeleton className="h-40 lg:col-span-4" />
          <Skeleton className="h-40 lg:col-span-4" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — compact */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-7 w-7 text-primary" />
            Payroll Command Centre
          </h1>
          <p className="text-sm text-muted-foreground">
            Operational intelligence for people, payroll and compliance.
            {yearCode && (
              <> · Calendar <Badge variant="outline" className="ml-1 align-middle">{yearCode}</Badge></>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate('/payroll-runs')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Run
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/employees')}>
            <Users className="mr-2 h-4 w-4" />
            Employees
          </Button>
        </div>
      </div>

      {/* Payroll KPI strip */}
      {metrics && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          <Card><CardHeader className="p-3 pb-1"><CardDescription className="text-xs">Run Status</CardDescription><CardTitle className="text-sm capitalize">{metrics.upcomingPayrollRunStatus ?? (metrics.draftPayrollRuns ? 'draft' : '—')}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3 pb-1"><CardDescription className="text-xs">Gross Pay</CardDescription><CardTitle className="text-sm font-mono">{formatCurrency(metrics.lastProcessedGross ?? 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3 pb-1"><CardDescription className="text-xs">Net Pay</CardDescription><CardTitle className="text-sm font-mono">{formatCurrency(metrics.lastProcessedNetPay ?? 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3 pb-1"><CardDescription className="text-xs">PAYE</CardDescription><CardTitle className="text-sm font-mono">{formatCurrency(metrics.lastProcessedPaye ?? 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3 pb-1"><CardDescription className="text-xs">UIF</CardDescription><CardTitle className="text-sm font-mono">{formatCurrency(metrics.lastProcessedUif ?? 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3 pb-1"><CardDescription className="text-xs">SDL</CardDescription><CardTitle className="text-sm font-mono">{formatCurrency(metrics.lastProcessedSdl ?? 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3 pb-1"><CardDescription className="text-xs">Bank Batch</CardDescription><CardTitle className="text-sm capitalize">{(metrics.bankBatchStatus ?? 'none').replace(/_/g, ' ')}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="p-3 pb-1"><CardDescription className="text-xs">Payslips</CardDescription><CardTitle className="text-sm">{metrics.payslipGenerationStatus ?? '—'}</CardTitle></CardHeader></Card>
        </div>
      )}

      {/* ABOVE THE FOLD — Command centre grid */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <PayrollReadinessScore
            readiness={intelligence.readiness}
            onEmployeeClick={setPreviewEmployeeId}
          />
        </div>
        <div className="lg:col-span-4">
          <PayrollCashImpact cash={intelligence.cash} />
        </div>
        <div className="lg:col-span-4 grid grid-cols-2 gap-3">
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => navigate('/employees')}>
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs">Employees</CardDescription>
              <CardTitle className="text-xl">{metrics?.employeeCount || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="cursor-pointer hover:bg-muted/50" onClick={() => navigate('/expense-claims')}>
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs">Pending Claims</CardDescription>
              <CardTitle className="text-xl flex items-center gap-1">
                {metrics?.pendingClaims || 0}
                {(metrics?.pendingClaims || 0) > 0 && <Badge variant="secondary" className="text-[10px]">!</Badge>}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs">Est. Payroll</CardDescription>
              <CardTitle className="text-lg font-mono">{formatCurrency(metrics?.estimatedMonthlyPayroll || 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                Next Pay
              </CardDescription>
              <CardTitle className="text-lg">
                {metrics?.upcomingPayDate ? format(new Date(metrics.upcomingPayDate), 'dd MMM') : '—'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className={(metrics?.payrollVariance || 0) !== 0 ? 'border-warning/40 col-span-2' : 'col-span-2'}>
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs flex items-center gap-1">
                Variance
                {(metrics?.payrollVariance || 0) > 0 ? <TrendingUp className="h-3 w-3 text-warning" /> : (metrics?.payrollVariance || 0) < 0 ? <TrendingDown className="h-3 w-3 text-success" /> : null}
              </CardDescription>
              <CardTitle className="text-lg font-mono">
                {metrics?.lastProcessedNetPay ? formatCurrency(Math.abs(metrics.payrollVariance || 0)) : '—'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>

      {/* Timeline — full width, horizontal */}
      <PayrollTimeline events={intelligence.timeline} />

      {/* Alerts + AI + Calendar row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <PayrollAlerts alerts={intelligence.alerts} />
        <PayrollAiInsights insights={intelligence.insights} />
        <PayrollCalendarStrip events={intelligence.calendarEvents} />
      </div>

      {/* Recent activity — compact */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Payroll Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayrollRuns.length > 0 ? (
              <ul className="space-y-2">
                {recentPayrollRuns.slice(0, 4).map((run: { id: string; pay_period_start: string; pay_period_end: string; pay_date: string; status: string }) => (
                  <li key={run.id}>
                    <Link to={`/payroll-runs/${run.id}`} className="flex items-center justify-between text-sm hover:bg-muted/50 rounded p-2 -mx-2">
                      <span>
                        {format(new Date(run.pay_period_start), 'dd MMM')} – {format(new Date(run.pay_period_end), 'dd MMM')}
                        <span className="text-muted-foreground ml-2">{formatDistanceToNow(new Date(run.pay_date), { addSuffix: true })}</span>
                      </span>
                      <Badge variant="outline" className="capitalize text-xs">{run.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No payroll runs yet.</p>
            )}
            <Button variant="link" size="sm" className="px-0 mt-1" onClick={() => navigate('/payroll-runs')}>
              All runs <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Pending Claims
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingClaimsList.length > 0 ? (
              <ul className="space-y-2">
                {pendingClaimsList.slice(0, 4).map((claim: { id: string; claim_number: string; total_amount: number; status: string; employees?: { employee_number: string; first_name: string; last_name: string; department?: string | null } }) => (
                  <li key={claim.id}>
                    <Link to="/expense-claims" className="flex justify-between items-center gap-2 text-sm hover:bg-muted/50 rounded p-2 -mx-2">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{claim.claim_number}</p>
                        {claim.employees ? <EmployeeIdentity employee={claim.employees} layout="stacked" showDepartment={false} /> : null}
                      </div>
                      <span className="font-mono">{formatCurrency(claim.total_amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No pending claims.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <EmployeePreviewDialog
        employee={previewEmployee}
        isOpen={!!previewEmployeeId}
        onClose={() => setPreviewEmployeeId(null)}
        claims={claims}
        assets={previewAssets}
        onEdit={() => navigate('/employees')}
      />
    </div>
  );
};

export default PayrollWorkspace;
