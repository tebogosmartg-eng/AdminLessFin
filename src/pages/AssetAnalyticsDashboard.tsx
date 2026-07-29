import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { BarChart3, Download, FileText } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { fixedAssetsQuery, FixedAssetRow } from '../lib/queries';
import { formatCurrency } from '../lib/utils';
import {
  downloadTextFile,
  openPrintableReport,
  rowsToCsv,
} from '../lib/assets/lifecycleTypes';
import { supabase } from '../integrations/supabase/client';
import { showSuccess } from '../utils/toast';

function countBy(values: (string | null | undefined)[]) {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = (v && v.trim()) || 'Unassigned';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

const AssetAnalyticsDashboard = () => {
  useDocumentTitle('Asset Analytics');
  const { activeCompany } = useAuth();

  const { data: assets } = useQuery({
    ...fixedAssetsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const { data: maintDash } = useQuery({
    queryKey: ['maint_analytics', activeCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fixed-assets', {
        body: { method: 'LIST_MAINTENANCE_DASHBOARD', company_id: activeCompany!.id },
      });
      if (error) throw error;
      return data as {
        recent?: { cost?: number; downtime_hours?: number; service_date?: string }[];
      };
    },
    enabled: !!activeCompany,
  });

  const rows = (assets as FixedAssetRow[]) || [];

  const lifecycle = useMemo(() => countBy(rows.map((a) => a.status)), [rows]);
  const stages = useMemo(
    () =>
      countBy(
        rows.map((a) => (a as { lifecycle_stage?: string }).lifecycle_stage || 'in_service')
      ),
    [rows]
  );

  const nearEol = useMemo(() => {
    const now = new Date();
    return rows.filter((a) => {
      if (a.status !== 'active') return false;
      const life = (a as { useful_life_years?: number | null }).useful_life_years || 0;
      if (!life) return false;
      const age =
        (now.getTime() - new Date(a.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000);
      return age / life >= 0.85;
    });
  }, [rows]);

  const maintTrends = useMemo(() => {
    const map = new Map<string, { cost: number; downtime: number; count: number }>();
    const recent = maintDash?.recent || [];
    if (recent.length > 0) {
      for (const r of recent) {
        if (!r.service_date) continue;
        const key = format(new Date(r.service_date), 'yyyy-MM');
        const cur = map.get(key) || { cost: 0, downtime: 0, count: 0 };
        cur.cost += Number(r.cost || 0);
        cur.downtime += Number(r.downtime_hours || 0);
        cur.count += 1;
        map.set(key, cur);
      }
    } else {
      // Placeholder months from register activity when maintenance API empty
      for (const a of rows) {
        if (!a.purchase_date) continue;
        const key = format(new Date(a.purchase_date), 'yyyy-MM');
        const cur = map.get(key) || { cost: 0, downtime: 0, count: 0 };
        cur.count += 1;
        map.set(key, cur);
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [maintDash?.recent, rows]);

  const verification = useMemo(() => countBy(rows.map((a) => a.verification_status || 'unverified')), [rows]);
  const categories = useMemo(() => countBy(rows.map((a) => a.asset_categories?.name)), [rows]);
  const departments = useMemo(
    () => countBy(rows.map((a) => a.department || (a as { employees?: { department?: string } }).employees?.department)),
    [rows]
  );
  const custodians = useMemo(
    () =>
      countBy(
        rows.map(
          (a) =>
            a.custodian_name ||
            [
              (a as { employees?: { first_name?: string; last_name?: string } }).employees?.first_name,
              (a as { employees?: { first_name?: string; last_name?: string } }).employees?.last_name,
            ]
              .filter(Boolean)
              .join(' ')
        )
      ),
    [rows]
  );
  const locations = useMemo(() => countBy(rows.map((a) => a.location)), [rows]);

  const exportSection = (
    title: string,
    headers: string[],
    dataRows: (string | number)[][]
  ) => {
    downloadTextFile(
      `${title.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      rowsToCsv(headers, dataRows)
    );
    showSuccess(`${title} CSV downloaded.`);
  };

  const printSection = (title: string, headers: string[], dataRows: (string | number)[][]) => {
    const body = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${dataRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    openPrintableReport(title, body);
  };

  const Section = ({
    title,
    description,
    headers,
    dataRows,
  }: {
    title: string;
    description: string;
    headers: string[];
    dataRows: (string | number)[][];
  }) => (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportSection(title, headers, dataRows)}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => printSection(title, headers, dataRows)}
          >
            <FileText className="mr-1 h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={headers.length} className="text-muted-foreground text-sm">
                  No data
                </TableCell>
              </TableRow>
            ) : (
              dataRows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((c, j) => (
                    <TableCell key={j} className={j > 0 ? 'tabular-nums' : undefined}>
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const exportAll = () => {
    const blocks = [
      ['Lifecycle Analysis', ['Status', 'Count'], lifecycle],
      ['Category Analysis', ['Category', 'Count'], categories],
      ['Department Utilisation', ['Department', 'Count'], departments],
      ['Custodian Summary', ['Custodian', 'Count'], custodians],
      ['Asset Movement (locations)', ['Location', 'Count'], locations],
      ['Verification Compliance', ['Status', 'Count'], verification],
    ] as const;
    const parts = blocks.map(
      ([title, headers, data]) =>
        `# ${title}\n${rowsToCsv(headers as unknown as string[], data as unknown as (string | number)[][])}`
    );
    downloadTextFile(
      `asset-analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      parts.join('\n\n')
    );
    showSuccess('Full analytics CSV downloaded.');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Asset Analytics
          </h1>
          <p className="text-sm text-muted-foreground">
            Lifecycle, replacement, maintenance, verification, and utilisation insights.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportAll}>
            <Download className="mr-2 h-4 w-4" />
            Export all CSV
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              openPrintableReport(
                'Asset Analytics Summary',
                `<p>Assets: ${rows.length}</p><p>Near EOL: ${nearEol.length}</p>`
              )
            }
          >
            <FileText className="mr-2 h-4 w-4" />
            Print summary
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Lifecycle Analysis"
          description="Counts by register status"
          headers={['Status', 'Count']}
          dataRows={lifecycle}
        />
        <Section
          title="Lifecycle Stages"
          description="Counts by lifecycle_stage when present"
          headers={['Stage', 'Count']}
          dataRows={stages}
        />
        <Section
          title="Replacement Forecast"
          description="Active assets at ≥85% of useful life"
          headers={['Code', 'Description', 'Cost', 'NBV']}
          dataRows={nearEol.map((a) => [
            a.asset_code,
            a.description,
            formatCurrency(a.purchase_cost),
            formatCurrency(a.net_book_value),
          ])}
        />
        <Section
          title="Maintenance Cost Trends"
          description={
            (maintDash?.recent?.length || 0) > 0
              ? 'By month from maintenance records'
              : 'Placeholder from purchase-date distribution (no maintenance rows)'
          }
          headers={['Month', 'Events', 'Cost', 'Downtime h']}
          dataRows={maintTrends.map(([m, v]) => [
            m,
            v.count,
            formatCurrency(v.cost),
            v.downtime,
          ])}
        />
        <Section
          title="Verification Compliance"
          description="Distribution of verification_status"
          headers={['Status', 'Count']}
          dataRows={verification}
        />
        <Section
          title="Category Analysis"
          description="Assets by category"
          headers={['Category', 'Count']}
          dataRows={categories}
        />
        <Section
          title="Department Utilisation"
          description="Assets by department"
          headers={['Department', 'Count']}
          dataRows={departments}
        />
        <Section
          title="Custodian Summary"
          description="Assets by custodian"
          headers={['Custodian', 'Count']}
          dataRows={custodians}
        />
        <Section
          title="Asset Movement"
          description="Location distribution (proxy when full transfer timeline unavailable)"
          headers={['Location', 'Count']}
          dataRows={locations}
        />
      </div>
    </div>
  );
};

export default AssetAnalyticsDashboard;
