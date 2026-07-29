import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HeartPulse } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { fixedAssetsQuery, FixedAssetRow } from '../lib/queries';
import { calculateAssetHealth, AssetHealthRisk } from '../lib/assets/assetHealth';
import { supabase } from '../integrations/supabase/client';

const riskVariant = (
  r: AssetHealthRisk
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' => {
  switch (r) {
    case 'low':
      return 'success';
    case 'medium':
      return 'warning';
    case 'high':
      return 'destructive';
    case 'critical':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const AssetHealthDashboard = () => {
  useDocumentTitle('Asset Health');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();

  const { data: assets, isLoading: assetsLoading } = useQuery({
    ...fixedAssetsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: maintDash } = useQuery({
    queryKey: ['maint_for_health', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: { method: 'LIST_MAINTENANCE_DASHBOARD', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data as {
        recent?: {
          asset_id?: string;
          fixed_assets?: { id?: string };
          cost?: number;
          downtime_hours?: number;
          service_date?: string;
        }[];
      };
    },
    enabled: !!activeCompany,
  });

  const maintByAsset = useMemo(() => {
    const cutoff = Date.now() - 365.25 * 24 * 3600 * 1000;
    const map: Record<string, { events: number; cost: number; downtime: number }> = {};
    for (const r of maintDash?.recent || []) {
      const id = r.asset_id || r.fixed_assets?.id;
      if (!id || !r.service_date) continue;
      if (new Date(r.service_date).getTime() < cutoff) continue;
      if (!map[id]) map[id] = { events: 0, cost: 0, downtime: 0 };
      map[id].events += 1;
      map[id].cost += Number(r.cost || 0);
      map[id].downtime += Number(r.downtime_hours || 0);
    }
    return map;
  }, [maintDash?.recent]);

  const scored = useMemo(() => {
    const rows = (assets as FixedAssetRow[]) || [];
    return rows
      .map((a) => {
        const m = maintByAsset[a.id] || { events: 0, cost: 0, downtime: 0 };
        const health = calculateAssetHealth({
          assetId: a.id,
          purchaseDate: a.purchase_date,
          usefulLifeYears: (a as { useful_life_years?: number | null }).useful_life_years ?? null,
          purchaseCost: Number(a.purchase_cost || 0),
          netBookValue: Number(
            a.net_book_value ?? Number(a.purchase_cost || 0) - Number(a.accumulated_depreciation || 0)
          ),
          impairmentAmount: Number(a.impairment_amount || 0),
          verificationStatus: a.verification_status,
          nextVerificationDue: a.next_verification_due,
          maintenanceEventsLast12m: m.events,
          repairCostLast12m: m.cost,
          downtimeHoursLast12m: m.downtime,
          status: a.status,
        });
        return { asset: a, health };
      })
      .sort((a, b) => a.health.healthPercent - b.health.healthPercent);
  }, [assets, maintByAsset]);

  const distribution = useMemo(() => {
    const d = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const s of scored) d[s.health.riskRating] += 1;
    return d;
  }, [scored]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <HeartPulse className="h-6 w-6" />
          Asset Health
        </h1>
        <p className="text-sm text-muted-foreground">
          Deterministic health scoring from register + maintenance (last 12 months).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['Low risk', distribution.low],
            ['Medium', distribution.medium],
            ['High', distribution.high],
            ['Critical', distribution.critical],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Health register</CardTitle>
          <CardDescription>Sorted worst → best. Click a row to open workspace.</CardDescription>
        </CardHeader>
        <div className="px-4 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Health %</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Recommended Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                scored.map(({ asset, health }) => (
                  <TableRow
                    key={asset.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/fixed-assets/${asset.id}`)}
                  >
                    <TableCell className="font-mono text-sm">{asset.asset_code}</TableCell>
                    <TableCell className="font-medium">{asset.description}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {health.healthPercent}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={riskVariant(health.riskRating)} className="capitalize">
                        {health.riskRating}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {health.recommendedAction}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default AssetHealthDashboard;
