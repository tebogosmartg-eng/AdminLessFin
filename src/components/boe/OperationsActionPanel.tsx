import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { BUSINESS_LIFECYCLES, type LifecycleId } from '../../lib/businessLifecycles';
import {
  TrendingUp,
  Wallet,
  Briefcase,
  Coins,
  FileText,
  Receipt,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

type DashboardActions = {
  pendingClaims: number;
  draftPayrollRuns?: number;
  draftInvoices: number;
  openBills: number;
  expiringQuotes: number;
};

type ActionItem = {
  id: string;
  lifecycleId: LifecycleId;
  label: string;
  count: number;
  route: string;
  icon: LucideIcon;
  variant: 'destructive' | 'secondary';
};

type Props = {
  actions: DashboardActions;
  isLoading?: boolean;
  isAdmin?: boolean;
};

const LIFECYCLE_ICONS: Partial<Record<LifecycleId, LucideIcon>> = {
  revenue: TrendingUp,
  procurement: Wallet,
  payroll: Briefcase,
  projects: Coins,
};

function buildActionItems(actions: DashboardActions, isAdmin: boolean): ActionItem[] {
  const items: ActionItem[] = [];

  if (actions.draftInvoices > 0) {
    items.push({
      id: 'draft-invoices',
      lifecycleId: 'revenue',
      label: 'Draft Invoices',
      count: actions.draftInvoices,
      route: '/invoices?status=draft',
      icon: FileText,
      variant: 'secondary',
    });
  }
  if (actions.expiringQuotes > 0) {
    items.push({
      id: 'expiring-quotes',
      lifecycleId: 'revenue',
      label: 'Expiring Quotes',
      count: actions.expiringQuotes,
      route: '/quotes',
      icon: MessageSquare,
      variant: 'destructive',
    });
  }
  if (actions.openBills > 0) {
    items.push({
      id: 'open-bills',
      lifecycleId: 'procurement',
      label: 'Unpaid Bills',
      count: actions.openBills,
      route: '/bills',
      icon: Receipt,
      variant: 'secondary',
    });
  }
  if (isAdmin && (actions.draftPayrollRuns ?? 0) > 0) {
    items.push({
      id: 'draft-payroll',
      lifecycleId: 'payroll',
      label: 'Draft Payroll Runs',
      count: actions.draftPayrollRuns!,
      route: '/payroll',
      icon: Briefcase,
      variant: 'secondary',
    });
  }
  if (actions.pendingClaims > 0) {
    items.push({
      id: 'expense-claims',
      lifecycleId: 'projects',
      label: 'Expense Claims',
      count: actions.pendingClaims,
      route: '/expense-claims',
      icon: Coins,
      variant: 'destructive',
    });
  }

  return items;
}

const OperationsActionPanel = ({ actions, isLoading, isAdmin = false }: Props) => {
  const navigate = useNavigate();
  const actionItems = buildActionItems(actions, isAdmin);

  const grouped = actionItems.reduce<Record<LifecycleId, ActionItem[]>>((acc, item) => {
    if (!acc[item.lifecycleId]) acc[item.lifecycleId] = [];
    acc[item.lifecycleId].push(item);
    return acc;
  }, {} as Record<LifecycleId, ActionItem[]>);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (actionItems.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No pending actions. You&apos;re all caught up!</p>;
  }

  return (
    <div className="space-y-4">
      {(Object.entries(grouped) as [LifecycleId, ActionItem[]][]).map(([lifecycleId, items]) => {
        const LifecycleIcon = LIFECYCLE_ICONS[lifecycleId] ?? FileText;
        const lifecycleLabel = BUSINESS_LIFECYCLES[lifecycleId].label;

        return (
          <div key={lifecycleId}>
            <div className="flex items-center gap-2 mb-2">
              <LifecycleIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {lifecycleLabel}
              </span>
            </div>
            <div className="grid gap-2">
              {items.map((item) => (
                <Button
                  key={item.id}
                  variant="outline"
                  className="justify-between h-auto py-2"
                  onClick={() => navigate(item.route)}
                >
                  <span className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  <Badge variant={item.variant}>{item.count}</Badge>
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OperationsActionPanel;
