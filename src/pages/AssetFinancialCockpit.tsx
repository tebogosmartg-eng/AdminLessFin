import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { fixedAssetsQuery, FixedAssetRow } from '../lib/queries';
import { formatCurrency } from '../lib/utils';
import { computeFinancialCockpitKpis } from '../lib/assets/lifecycleTypes';
import { supabase } from '../integrations/supabase/client';

type CockpitAsset = FixedAssetRow & {
  useful_life_years?: number | null;
  last_depreciation_date?: string | null;
  id: string;
};

type DrillKey =
  | 'gross'
  | 'nbv'
  | 'accum'
  | 'depMonth'
  | 'depYear'
  | 'nearEol'
  | 'fullyDep'
  | 'highMaint'
  | 'awaiting'
  | 'impaired'
  | null;

const AssetFinancialCockpit = () => {
  useDocumentTitle('Financial Cockpit');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();
  const [drill, setDrill] = useState<DrillKey>(null);

  const { data: cockpit, isLoading: cockpitLoading } = useQuery({
    queryKey: ['financial_cockpit', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: { method: 'FINANCIAL_COCKPIT', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data as {
        assets: CockpitAsset[];
        maintenance: { asset_id: string; cost?: number; downtime_hours?: number; service_date?: string }[];
      };
    },
    enabled: !!activeCompany,
  });

  const { data: registerFallback, isLoading: regLoading } = useQuery({
    ...fixedAssetsQuery(activeCompany!.id),
    enabled: !!activeCompany && !cockpit && !cockpitLoading,
  });

  const assets = (cockpit?.assets || (registerFallback as CockpitAsset[]) || []) as CockpitAsset[];
  const isLoading = cockpitLoading || (!cockpit && regLoading);

  const maintenanceCostByAsset = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of cockpit?.maintenance || []) {
      map[m.asset_id] = (map[m.asset_id] || 0) + Number(m.cost || 0);
    }
    return map;
  }, [cockpit?.maintenance]);

  const kpis = useMemo(
    () => computeFinancialCockpitKpis(assets, maintenanceCostByAsset),
    [assets, maintenanceCostByAsset]
  );

  const nearEolIds = useMemo(() => {
    const now = new Date();
    return new Set(
      assets
        .filter((a) => {
          if (a.status !== 'active') return false;
          const life = a.useful_life_years || 0;
          if (!life) return false;
          const age =
            (now.getTime() - new Date(a.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000);
          return age / life >= 0.85;
        })
        .map((a) => a.id)
    );
  }, [assets]);

  const highMaintIds = useMemo(() => {
    return new Set(
      Object.entries(maintenanceCostByAsset)
        .filter(([id, cost]) => {
          const asset = assets.find((x) => x.id === id);
          return asset && cost > Number(asset.purchase_cost || 0) * 0.15;
        })
        .map(([id]) => id)
    );
  }, [maintenanceCostByAsset, assets]);

  const drilled = useMemo(() => {
    const active = assets.filter((a) => a.status !== 'disposed');
    switch (drill) {
      case 'gross':
      case 'nbv':
      case 'accum':
      case 'depYear':
        return active;
      case 'depMonth': {
        const now = new Date();
        return active.filter((a) => {
          if (!a.last_depreciation_date) return false;
          const d = new Date(a.last_depreciation_date);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
      }
      case 'nearEol':
        return assets.filter((a) => nearEolIds.has(a.id));
      case 'fullyDep':
        return assets.filter((a) => a.status === 'fully-depreciated');
      case 'highMaint':
        return assets.filter((a) => highMaintIds.has(a.id));
      case 'awaiting':
        return active.filter(
          (a) =>
            !a.verification_status ||
            a.verification_status === 'unverified' ||
            a.verification_status === 'overdue' ||
            a.verification_status === 'in_progress'
        );
      case 'impaired':
        return active.filter((a) => Number(a.impairment_amount || 0) > 0);
      default:
        return [];
    }
  }, [drill, assets, nearEolIds, highMaintIds]);

  const cards: { key: DrillKey; label: string; value: string }[] = [
    { key: 'gross', label: 'Gross Asset Value', value: formatCurrency(kpis.grossAssetValue) },
    { key: 'nbv', label: 'NBV', value: formatCurrency(kpis.netBookValue) },
    { key: 'accum', label: 'Accum Depr', value: formatCurrency(kpis.accumulatedDepreciation) },
    { key: 'depMonth', label: 'Dep This Month', value: formatCurrency(kpis.depreciationThisMonth) },
    { key: 'depYear', label: 'Dep This Year', value: formatCurrency(kpis.depreciationThisYear) },
    { key: 'nearEol', label: 'Near EOL', value: String(kpis.nearEndOfLife) },
    { key: 'fullyDep', label: 'Fully Depreciated', value: String(kpis.fullyDepreciated) },
    { key: 'highMaint', label: 'High Maintenance', value: String(kpis.highMaintenance) },
    { key: 'awaiting', label: 'Awaiting Verification', value: String(kpis.awaitingVerification) },
    { key: 'impaired', label: 'Impaired', value: String(kpis.impaired) },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Gauge className="h-6 w-6" />
          Financial Cockpit
        </h1>
        <p className="text-sm text-muted-foreground">
          Click a KPI to drill into matching assets. Rows open the asset workspace.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-20 mt-2" />
                </CardHeader>
              </Card>
            ))
          : cards.map((c) => (
              <Card
                key={c.label}
                className={`cursor-pointer transition-colors ${drill === c.key ? 'border-primary ring-1 ring-primary/30' : 'hover:bg-muted/40'}`}
                onClick={() => setDrill((prev) => (prev === c.key ? null : c.key))}
              >
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardDescription>{c.label}</CardDescription>
                  <CardTitle className="text-xl tabular-nums">{c.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
      </div>

      {drill && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base capitalize">
              Drill-down · {cards.find((c) => c.key === drill)?.label}
            </CardTitle>
            <CardDescription>{drilled.length} asset(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">NBV</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drilled.map((a) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/fixed-assets/${a.id}`)}
                  >
                    <TableCell className="font-mono text-sm">{a.asset_code}</TableCell>
                    <TableCell className="font-medium">{a.description}</TableCell>
                    <TableCell>{a.asset_categories?.name || '—'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(a.purchase_cost)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(
                        Number(
                          a.net_book_value ??
                            Number(a.purchase_cost || 0) - Number(a.accumulated_depreciation || 0)
                        )
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{a.status}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.verification_status || 'unverified'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AssetFinancialCockpit;
