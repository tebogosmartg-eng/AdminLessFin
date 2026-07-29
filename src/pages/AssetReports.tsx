import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ClipboardCheck, Download, FileBarChart, Wrench, Gauge, BarChart3 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../contexts/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { fixedAssetsQuery, FixedAssetRow } from '../lib/queries';
import { showError, showSuccess } from '../utils/toast';
import { supabase } from '../integrations/supabase/client';

function exportRegisterCsv(rows: FixedAssetRow[]) {
  const headers = [
    'Code',
    'Description',
    'Category',
    'Purchase Date',
    'Cost',
    'Accumulated Depreciation',
    'NBV',
    'Status',
    'Verification',
    'Location',
    'Department',
  ];
  const lines = rows.map((a) =>
    [
      a.asset_code,
      a.description,
      a.asset_categories?.name ?? '',
      a.purchase_date,
      a.purchase_cost,
      a.accumulated_depreciation,
      a.net_book_value,
      a.status,
      a.verification_status ?? 'unverified',
      a.location ?? '',
      a.department ?? '',
    ]
      .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `asset-register-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const AssetReports = () => {
  useDocumentTitle('Asset Reports');
  const { activeCompany } = useAuth();

  const { data: assets, isFetching } = useQuery({
    ...fixedAssetsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const handleExportRegister = () => {
    exportRegisterCsv((assets as FixedAssetRow[]) ?? []);
    showSuccess('Asset register CSV downloaded.');
  };

  const handleVerificationSummary = async () => {
    if (!activeCompany) return;
    const { data, error } = await supabase.functions.invoke('fixed-assets', {
      body: { method: 'LIST_VERIFICATION_DASHBOARD', company_id: activeCompany.id },
    });
    if (error) {
      showError(error.message || 'Unable to load verification summary.');
      return;
    }
    const rows = (data as { verification_status?: string }[]) || [];
    const verified = rows.filter((r) => r.verification_status === 'verified').length;
    const overdue = rows.filter((r) => r.verification_status === 'overdue').length;
    const unverified = rows.length - verified;
    const headers = ['Metric', 'Count'];
    const lines = [
      ['Total', rows.length],
      ['Verified', verified],
      ['Unverified / other', unverified],
      ['Overdue', overdue],
    ].map((r) => r.join(','));
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Verification summary exported.');
  };

  const handleMaintenanceSummary = async () => {
    if (!activeCompany) return;
    const { data, error } = await supabase.functions.invoke('fixed-assets', {
      body: { method: 'LIST_MAINTENANCE_DASHBOARD', company_id: activeCompany.id },
    });
    if (error) {
      showError(error.message || 'Unable to load maintenance summary.');
      return;
    }
    const payload = data as {
      schedules?: unknown[];
      recent?: { cost?: number; downtime_hours?: number }[];
    };
    const recent = payload.recent || [];
    const cost = recent.reduce((s, r) => s + Number(r.cost || 0), 0);
    const downtime = recent.reduce((s, r) => s + Number(r.downtime_hours || 0), 0);
    const headers = ['Metric', 'Value'];
    const lines = [
      ['Schedules', String(payload.schedules?.length ?? 0)],
      ['Recent records', String(recent.length)],
      ['Total maintenance cost', String(cost)],
      ['Total downtime hours', String(downtime)],
    ].map((r) => r.join(','));
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maintenance-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('Maintenance summary exported. (Operational — no journals.)');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asset Reports</h1>
        <p className="text-sm text-muted-foreground">
          Export hubs for register, verification, and maintenance summaries.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <FileBarChart className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-base">Asset Register export</CardTitle>
            <CardDescription>CSV of all fixed assets from the register query.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={handleExportRegister} disabled={isFetching}>
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
            <Button variant="outline" asChild>
              <Link to="/fixed-assets">Open register</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Gauge className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-base">Financial Cockpit</CardTitle>
            <CardDescription>KPI drill-down for NBV, depreciation, verification, and impairments.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link to="/assets/cockpit">Open cockpit</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <BarChart3 className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-base">Asset Analytics</CardTitle>
            <CardDescription>Lifecycle, replacement forecast, and utilisation exports.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link to="/assets/analytics">Open analytics</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <ClipboardCheck className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-base">Verification summary</CardTitle>
            <CardDescription>Counts of verified, unverified, and overdue assets.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={handleVerificationSummary}>
              <Download className="mr-2 h-4 w-4" />
              Export summary
            </Button>
            <Button variant="outline" asChild>
              <Link to="/assets/verification">Open verification</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Wrench className="h-8 w-8 text-muted-foreground mb-2" />
            <CardTitle className="text-base">Maintenance summary</CardTitle>
            <CardDescription>
              Schedule and cost totals. Does not post accounting journals.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={handleMaintenanceSummary}>
              <Download className="mr-2 h-4 w-4" />
              Export summary
            </Button>
            <Button variant="outline" asChild>
              <Link to="/assets/maintenance">Open maintenance</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AssetReports;
