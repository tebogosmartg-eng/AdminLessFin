import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Wrench } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { EmptyState } from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatCurrency } from '../lib/utils';

type ScheduleRow = {
  id: string;
  title: string;
  next_service_date?: string | null;
  last_service_date?: string | null;
  status?: string;
  frequency_months?: number;
  fixed_assets?: { id: string; asset_code: string; description: string; status?: string } | null;
};

type RecordRow = {
  id: string;
  record_type: string;
  service_date: string;
  description: string;
  cost: number;
  downtime_hours: number;
  fixed_assets?: { id: string; asset_code: string; description: string } | null;
};

type MaintenanceDashboard = {
  schedules: ScheduleRow[];
  recent: RecordRow[];
};

const AssetMaintenanceDashboard = () => {
  useDocumentTitle('Asset Maintenance');
  const navigate = useNavigate();
  const { activeCompany } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['asset_maintenance_dashboard', activeCompany?.id],
    queryFn: async (): Promise<MaintenanceDashboard> => {
      if (!activeCompany) return { schedules: [], recent: [] };
      const { data: payload, error } = await supabase.functions.invoke('fixed-assets', {
        body: {
          method: 'LIST_MAINTENANCE_DASHBOARD',
          company_id: activeCompany.id,
        },
      });
      if (error) throw error;
      return (payload as MaintenanceDashboard) || { schedules: [], recent: [] };
    },
    enabled: !!activeCompany,
  });

  const kpis = useMemo(() => {
    const schedules = data?.schedules ?? [];
    const recent = data?.recent ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = schedules.filter((s) => {
      if (!s.next_service_date || s.status !== 'active') return false;
      const due = new Date(s.next_service_date);
      const in30 = new Date(today);
      in30.setDate(in30.getDate() + 30);
      return due >= today && due <= in30;
    }).length;
    const recentRepairs = recent.filter((r) => r.record_type === 'repair').length;
    const totalCost = recent.reduce((s, r) => s + Number(r.cost || 0), 0);
    const downtime = recent.reduce((s, r) => s + Number(r.downtime_hours || 0), 0);
    return { upcoming, recentRepairs, totalCost, downtime };
  }, [data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asset Maintenance</h1>
        <p className="text-sm text-muted-foreground">
          Schedules and service history across the asset register.
        </p>
      </div>

      <Alert>
        <Wrench className="h-4 w-4" />
        <AlertTitle>Operational only</AlertTitle>
        <AlertDescription>
          Maintenance does <strong>not</strong> post accounting journals. Costs here are for
          operational tracking; capitalise or expense via the normal accounting workflows when
          required.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Upcoming service (30d)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.upcoming}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Recent repairs</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.recentRepairs}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Total maintenance cost</CardDescription>
            <CardTitle className="text-xl font-mono">{formatCurrency(kpis.totalCost)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardDescription>Downtime (hours)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{kpis.downtime.toFixed(1)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming schedules</CardTitle>
            <CardDescription>Ordered by next service date.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Next service</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={`sk-s-${i}`}>
                      <TableCell colSpan={4}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (data?.schedules ?? []).length > 0 ? (
                  (data?.schedules ?? []).map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() =>
                        s.fixed_assets?.id && navigate(`/fixed-assets/${s.fixed_assets.id}`)
                      }
                    >
                      <TableCell className="font-mono text-sm">
                        {s.fixed_assets?.asset_code || '—'}
                      </TableCell>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell>
                        {s.next_service_date
                          ? format(new Date(s.next_service_date), 'PP')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="p-0">
                      <EmptyState
                        icon={Wrench}
                        title="No schedules"
                        description="Add maintenance schedules from an asset workspace."
                      />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent maintenance</CardTitle>
            <CardDescription>Latest service and repair records.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Downtime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={`sk-r-${i}`}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (data?.recent ?? []).length > 0 ? (
                  (data?.recent ?? []).map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() =>
                        r.fixed_assets?.id && navigate(`/fixed-assets/${r.fixed_assets.id}`)
                      }
                    >
                      <TableCell>
                        {r.service_date ? format(new Date(r.service_date), 'PP') : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.fixed_assets?.asset_code || '—'}
                      </TableCell>
                      <TableCell className="capitalize">{r.record_type}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(r.cost || 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r.downtime_hours || 0)}h
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground text-center py-8">
                      No maintenance records yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AssetMaintenanceDashboard;
