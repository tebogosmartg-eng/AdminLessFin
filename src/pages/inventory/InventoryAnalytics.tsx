import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Printer } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useEnterpriseIdentity } from '../../hooks/useEnterpriseIdentity';
import { inventoryAnalyticsQuery } from '../../lib/queries';
import { formatCurrency, downloadCSV } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  classifyMovementAgeDays,
  stockTurnover,
  valuationAmount,
} from '../../lib/inventory/costing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';

const InventoryAnalytics = () => {
  useDocumentTitle('Inventory Analytics');
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);

  const { data, isLoading } = useQuery({
    ...inventoryAnalyticsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const analytics = useMemo(() => {
    const products = data?.products || [];
    const balances = data?.balances || [];
    const movements = data?.movements || [];
    const warehouses = data?.warehouses || [];

    const productLastIssue = new Map<string, string>();
    for (const m of movements) {
      if (Number(m.quantity_change) >= 0) continue;
      const pid = String(m.product_id);
      if (!productLastIssue.has(pid)) {
        productLastIssue.set(pid, String(m.transaction_date));
      }
    }

    const today = new Date();
    const ageingRows: { name: string; sku: string; days: number; bucket: string; qty: number; value: number }[] = [];
    let slow = 0;
    let dead = 0;

    for (const p of products) {
      if (p.type !== 'inventory' && p.item_class === 'service') continue;
      const pid = String(p.id);
      const last = productLastIssue.get(pid);
      const days = last ? differenceInDays(today, new Date(last)) : 999;
      const bucket = classifyMovementAgeDays(days);
      if (bucket === 'slow') slow += 1;
      if (bucket === 'dead') dead += 1;
      const bal = balances.filter((b) => String(b.product_id) === pid);
      const qty = bal.reduce((s, b) => s + Number(b.qty_on_hand), 0);
      const value = bal.reduce(
        (s, b) => s + valuationAmount(Number(b.qty_on_hand), Number(b.avg_unit_cost)),
        0,
      );
      if (qty <= 0) continue;
      ageingRows.push({
        name: String(p.name),
        sku: String(p.sku || ''),
        days,
        bucket,
        qty,
        value,
      });
    }

    ageingRows.sort((a, b) => b.days - a.days);

    let totalValue = 0;
    let totalQty = 0;
    const whUtil = warehouses.map((w) => {
      const whBalances = balances.filter((b) => String(b.warehouse_id) === String(w.id));
      const qty = whBalances.reduce((s, b) => s + Number(b.qty_on_hand), 0);
      const value = whBalances.reduce(
        (s, b) => s + valuationAmount(Number(b.qty_on_hand), Number(b.avg_unit_cost)),
        0,
      );
      totalQty += qty;
      totalValue += value;
      return { code: String(w.code), name: String(w.name), qty, value };
    });

    const cogsEstimate = movements
      .filter((m) => Number(m.quantity_change) < 0)
      .reduce((s, m) => s + Math.abs(Number(m.total_cost) || 0), 0);
    const turns = stockTurnover(cogsEstimate, totalValue || 1);

    return { ageingRows, slow, dead, whUtil, totalValue, turns, cogsEstimate };
  }, [data]);

  const exportCsv = () => {
    const rows = analytics.ageingRows.map((r) => ({
      Item: r.name,
      SKU: r.sku,
      'Days since issue': r.days,
      Classification: r.bucket,
      Quantity: r.qty,
      Value: r.value.toFixed(2),
    }));
    downloadCSV(rows, 'inventory-analytics-ageing.csv');
  };

  const printPdf = () => {
    const html = `
      <!DOCTYPE html><html><head><title>Inventory Analytics</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ccc;padding:8px;text-align:left} h1{font-size:20px}</style>
      </head><body>
      <h1>Inventory Analytics — ${identity?.name || ''}</h1>
      <p>Total valuation: ${formatCurrency(analytics.totalValue)} · Est. turns: ${analytics.turns.toFixed(2)} · Slow: ${analytics.slow} · Dead: ${analytics.dead}</p>
      <table><thead><tr><th>Item</th><th>Days</th><th>Class</th><th>Qty</th><th>Value</th></tr></thead><tbody>
      ${analytics.ageingRows
        .slice(0, 100)
        .map(
          (r) =>
            `<tr><td>${r.name}</td><td>${r.days}</td><td>${r.bucket}</td><td>${r.qty}</td><td>${formatCurrency(r.value)}</td></tr>`
        )
        .join('')}
      </tbody></table></body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.print();
    }
  };

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            Inventory Analytics
          </h1>
          <p className="text-muted-foreground mt-1">Ageing, slow/dead stock, turns, and warehouse utilisation.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={printPdf}>
            <Printer className="mr-2 h-4 w-4" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total valuation', value: formatCurrency(analytics.totalValue) },
          { label: 'Est. stock turns', value: analytics.turns.toFixed(2) },
          { label: 'Slow-moving SKUs', value: String(analytics.slow) },
          { label: 'Dead stock SKUs', value: String(analytics.dead) },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-xl font-semibold tabular-nums">{kpi.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Warehouse utilisation</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.whUtil.map((w) => (
                <TableRow key={w.code}>
                  <TableCell>
                    {w.code} — {w.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{w.qty}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(w.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">Stock ageing (by last issue)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.ageingRows.slice(0, 50).map((r) => (
                <TableRow key={`${r.name}-${r.sku}`}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.sku || '—'}</TableCell>
                  <TableCell className="text-right">{r.days}</TableCell>
                  <TableCell>{r.bucket}</TableCell>
                  <TableCell className="text-right">{r.qty}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(r.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default InventoryAnalytics;
