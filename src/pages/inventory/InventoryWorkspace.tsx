import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  Warehouse,
  ClipboardList,
  ArrowLeftRight,
  Truck,
  BarChart3,
  Calculator,
  Layers,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { inventoryAnalyticsQuery } from '../../lib/queries';
import { formatCurrency } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { valuationAmount } from '../../lib/inventory/costing';

const InventoryWorkspace = () => {
  useDocumentTitle('Inventory');
  const { activeCompany } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    ...inventoryAnalyticsQuery(activeCompany!.id),
    enabled: !!activeCompany,
  });

  const kpis = useMemo(() => {
    const products = data?.products || [];
    const balances = data?.balances || [];
    const warehouses = data?.warehouses || [];
    const stockProducts = products.filter(
      (p) => p.type === 'inventory' && p.item_class !== 'service' && p.item_class !== 'non_stock'
    );
    let inventoryValue = 0;
    let onHandQty = 0;
    for (const b of balances) {
      const qty = Number(b.qty_on_hand) || 0;
      const cost = Number(b.avg_unit_cost) || 0;
      onHandQty += qty;
      inventoryValue += valuationAmount(qty, cost);
    }
    const lowStock = stockProducts.filter((p) => {
      const reorder = Number(p.reorder_level) || 0;
      const qty = Number(p.quantity_on_hand) || 0;
      return reorder > 0 && qty <= reorder;
    }).length;

    return {
      skuCount: stockProducts.length,
      inventoryValue,
      lowStock,
      warehouseCount: warehouses.length,
      onHandQty,
    };
  }, [data]);

  const workflowLinks = [
    { to: '/inventory/register', label: 'Inventory Register', icon: ClipboardList, description: 'Enterprise stock grid and balances' },
    { to: '/inventory/warehouses', label: 'Warehouses', icon: Warehouse, description: 'Sites, bins, and locations' },
    { to: '/inventory/movements', label: 'Movements', icon: ArrowLeftRight, description: 'Receipts, issues, and adjustments' },
    { to: '/inventory/receipts', label: 'Goods Receipts', icon: Truck, description: 'GRN drafts and posting' },
    { to: '/inventory/transfers', label: 'Transfers', icon: Layers, description: 'Inter-warehouse transfers' },
    { to: '/inventory/counts', label: 'Cycle Counts', icon: Package, description: 'Physical and cycle counts' },
    { to: '/inventory/costing', label: 'Costing', icon: Calculator, description: 'Valuation and cost adjustments' },
    { to: '/inventory/analytics', label: 'Analytics', icon: BarChart3, description: 'Ageing, turns, and utilisation' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-8 w-8 text-primary" />
            Inventory Command Centre
          </h1>
          <p className="text-muted-foreground mt-1">
            Enterprise inventory, costing, and warehouse operations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/inventory/receipts')}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Goods Receipt
          </Button>
          <Button variant="outline" onClick={() => navigate('/products')}>
            <Package className="mr-2 h-4 w-4" />
            Products &amp; Services
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Stock SKUs', value: String(kpis.skuCount) },
          { label: 'On-Hand Value', value: formatCurrency(kpis.inventoryValue) },
          {
            label: 'Low Stock Items',
            value: String(kpis.lowStock),
            alert: kpis.lowStock > 0,
          },
          { label: 'Warehouses', value: String(kpis.warehouseCount) },
        ].map((kpi) => (
          <Card key={kpi.label} className={kpi.alert ? 'border-destructive/50' : ''}>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardDescription className="flex items-center gap-1">
                {kpi.alert && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                {kpi.label}
              </CardDescription>
              <CardTitle className={`text-xl font-semibold tabular-nums ${kpi.alert ? 'text-destructive' : ''}`}>
                {kpi.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {workflowLinks.map((link) => (
          <Card key={link.to} className="hover:bg-muted/50 transition-colors">
            <Link to={link.to} className="block">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardDescription className="flex items-center gap-2">
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </CardDescription>
                <CardTitle className="text-sm font-normal text-muted-foreground mt-1">{link.description}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-4">
                <span className="text-sm text-primary inline-flex items-center gap-1">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default InventoryWorkspace;
