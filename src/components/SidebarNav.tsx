import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Book, BookOpen, LayoutDashboard, BookText, Library, Target, Repeat, Building2, Users, TrendingUp, Receipt, Banknote, HandCoins, ChevronRight, Package, Scale, Upload, FileSignature, Briefcase, Landmark, MessageSquare, Clock, ShoppingBag, Calendar, TicketMinus, PieChart, Coins, FileText, HelpCircle, Quote, ReceiptText, CalendarClock, Store, ArrowLeftRight, Percent, Tags, Wallet, FileCheck2, ShieldCheck, Layers, Timer, Wrench, FileBarChart, Gauge, HeartPulse, BarChart3, ClipboardList, Warehouse, Truck, ClipboardCheck, Calculator, PiggyBank, AlertTriangle, Shield, CalendarRange, Activity, ClipboardCheck as CloseCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
// Phase P1.1 — named imports instead of `import * as queries`: SidebarNav is
// part of the always-eager shell (Layout), so a namespace import was pulling
// the entire lib/queries.ts module graph — all 58 exports, not just the 37
// this file prefetches — into the initial bundle regardless of tree-shaking.
// `queries.X(...)` call sites below are unchanged; only the import shape is.
import {
  accountsQuery, assetCategoriesQuery, bankAccountsQuery, bankTransactionsQuery, bankTransfersQuery,
  billsQuery, budgetsQuery, creditNotesQuery, customerBalancesQuery, customersQuery, employeesQuery,
  expenseClaimsQuery, fixedAssetsQuery, inventoryAnalyticsQuery, inventoryCycleCountsQuery,
  inventoryGoodsReceiptsQuery, inventoryMovementsQuery, inventoryRegisterQuery, inventoryTransfersQuery,
  inventoryValuationEdgeQuery, inventoryWarehousesQuery, invoicesQuery, loansQuery, payrollRunsQuery,
  payrollWorkspaceQuery, productsQuery, projectsQuery, purchaseOrdersQuery, purchasesWorkspaceQuery,
  quotesQuery, recurringBillsQuery, recurringEntriesQuery, recurringInvoicesQuery, revenueWorkspaceQuery,
  taxRatesQuery, vendorBalancesQuery, vendorCreditsQuery, vendorsQuery,
} from '../lib/queries';
import { shouldShowFinancialStatementsNav } from '../lib/financialStatements/flags';
import { isBetaAnalyticsAdmin } from '../lib/analytics/betaAllowlist';
import { shouldShowFinancialCloseNav } from '../lib/financialClose/flags';

const queries = {
  accountsQuery, assetCategoriesQuery, bankAccountsQuery, bankTransactionsQuery, bankTransfersQuery,
  billsQuery, budgetsQuery, creditNotesQuery, customerBalancesQuery, customersQuery, employeesQuery,
  expenseClaimsQuery, fixedAssetsQuery, inventoryAnalyticsQuery, inventoryCycleCountsQuery,
  inventoryGoodsReceiptsQuery, inventoryMovementsQuery, inventoryRegisterQuery, inventoryTransfersQuery,
  inventoryValuationEdgeQuery, inventoryWarehousesQuery, invoicesQuery, loansQuery, payrollRunsQuery,
  payrollWorkspaceQuery, productsQuery, projectsQuery, purchaseOrdersQuery, purchasesWorkspaceQuery,
  quotesQuery, recurringBillsQuery, recurringEntriesQuery, recurringInvoicesQuery, revenueWorkspaceQuery,
  taxRatesQuery, vendorBalancesQuery, vendorCreditsQuery, vendorsQuery,
};

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    "relative flex items-center px-3 py-2 text-sm rounded-md text-sidebar-foreground transition-colors duration-fast hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    isActive && [
      "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
      // emerald left-marker for the active destination
      "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-1 before:rounded-full before:bg-sidebar-primary",
    ]
  );

const NavGroup = ({ title, icon: Icon, links, defaultOpen, onNavigate }: { title: string, icon: React.ElementType, links: { to: string, label: string, icon: React.ElementType, prefetch: () => void }[], defaultOpen: boolean, onNavigate?: () => void }) => {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-3 group text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <div className="flex items-center">
            <Icon className="mr-3 h-5 w-5" />
            <span>{title}</span>
          </div>
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 space-y-1 py-1">
        {links.map(link => (
          <NavLink key={link.label} to={link.to} className={navLinkClasses} onMouseEnter={link.prefetch} onFocus={link.prefetch} onClick={onNavigate}>
            <link.icon className="mr-3 h-4 w-4" />
            {link.label}
          </NavLink>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

type SidebarNavProps = {
  className?: string;
  onNavigate?: () => void;
};

export const SidebarNav = ({ className, onNavigate }: SidebarNavProps) => {
  const location = useLocation();
  const pathname = location.pathname;
  const queryClient = useQueryClient();
  const { activeCompany, role, session, profile, user } = useAuth();
  const isAdmin = role === 'owner' || role === 'admin';
  const showFinancialStatementsNav = shouldShowFinancialStatementsNav({
    role,
    userEmail: session?.user?.email,
    userId: session?.user?.id || profile?.id,
  });
  const showFinancialCloseNav = shouldShowFinancialCloseNav({
    role,
    userEmail: session?.user?.email,
    userId: session?.user?.id || profile?.id,
  });

  const prefetch = (
    query: (companyId: string) => { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> },
    options?: { adminOnly?: boolean }
  ) => {
    if (!activeCompany) return;
    if (options?.adminOnly && !isAdmin) return;
    queryClient.prefetchQuery(query(activeCompany.id)).catch(() => {
      // Prefetch is best-effort; avoid noisy console errors on hover.
    });
  };

  const salesLinks = [
    { to: '/sales', label: 'Revenue', icon: TrendingUp, prefetch: () => prefetch(queries.revenueWorkspaceQuery) },
    { to: '/quotes', label: 'Quotes', icon: Quote, prefetch: () => prefetch(queries.quotesQuery) },
    { to: '/invoices', label: 'Invoices', icon: FileSignature, prefetch: () => prefetch(queries.invoicesQuery) },
    { to: '/credit-notes', label: 'Credit Notes', icon: ReceiptText, prefetch: () => prefetch(queries.creditNotesQuery) },
    { to: '/recurring-invoices', label: 'Recurring Invoices', icon: Repeat, prefetch: () => prefetch(queries.recurringInvoicesQuery) },
    { to: '/receive-payments', label: 'Receive Payments', icon: HandCoins, prefetch: () => prefetch(queries.customerBalancesQuery) },
    { to: '/customers', label: 'Customers', icon: Users, prefetch: () => prefetch(queries.customersQuery) },
    { to: '/products', label: 'Products & Services', icon: Package, prefetch: () => prefetch(queries.productsQuery) },
  ];

  const purchasesLinks = [
    { to: '/purchases', label: 'Spend', icon: Wallet, prefetch: () => prefetch(queries.purchasesWorkspaceQuery) },
    { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingBag, prefetch: () => prefetch(queries.purchaseOrdersQuery) },
    { to: '/bills', label: 'Bills', icon: Receipt, prefetch: () => prefetch(queries.billsQuery) },
    { to: '/vendor-credits', label: 'Vendor Credits', icon: TicketMinus, prefetch: () => prefetch(queries.vendorCreditsQuery) },
    { to: '/recurring-bills', label: 'Recurring Bills', icon: Repeat, prefetch: () => prefetch(queries.recurringBillsQuery) },
    { to: '/pay-bills', label: 'Pay Bills', icon: Banknote, prefetch: () => prefetch(queries.vendorBalancesQuery) },
    { to: '/vendors', label: 'Suppliers', icon: Store, prefetch: () => prefetch(queries.vendorsQuery) },
  ];

  const payrollLinks = [
    { to: '/payroll', label: 'Command Centre', icon: Briefcase, prefetch: () => prefetch(queries.payrollWorkspaceQuery, { adminOnly: true }) },
    { to: '/employees', label: 'Employees', icon: Users, prefetch: () => prefetch(queries.employeesQuery, { adminOnly: true }) },
    { to: '/expense-claims', label: 'Expense Claims', icon: Coins, prefetch: () => prefetch(queries.expenseClaimsQuery, { adminOnly: true }) },
    { to: '/payroll-runs', label: 'Payroll Runs', icon: CalendarClock, prefetch: () => prefetch(queries.payrollRunsQuery, { adminOnly: true }) },
    { to: '/payroll-reports', label: 'Payroll Reports', icon: FileText, prefetch: () => {} },
    { to: '/statutory-returns', label: 'Statutory Returns', icon: FileCheck2, prefetch: () => {} },
    // Navigation alias only — same route/component as Reports → Audit & Compliance Reports (V3.6.8)
    { to: '/audit-compliance-reports', label: 'Enterprise VIP Report', icon: ShieldCheck, prefetch: () => {} },
  ];

  const accountingLinks = [
    { to: '/accounting/dashboard', label: 'Accounting Dashboard', icon: LayoutDashboard, prefetch: () => {} },
    { to: '/accounting/health', label: 'Financial Health', icon: HeartPulse, prefetch: () => {} },
    { to: '/accounting/timeline', label: 'Accounting Timeline', icon: Activity, prefetch: () => {} },
    { to: '/trial-balance', label: 'Trial Balance', icon: Scale, prefetch: () => {} },
    { to: '/general-ledger', label: 'Account Activity', icon: Library, prefetch: () => prefetch(queries.accountsQuery) },
    { to: '/journal-entries', label: 'Journal Entries', icon: BookText, prefetch: () => {} },
    { to: '/chart-of-accounts', label: 'Chart of Accounts', icon: Book, prefetch: () => prefetch(queries.accountsQuery) },
    { to: '/accounting/posting-requests', label: 'Posting Requests', icon: ClipboardList, prefetch: () => {} },
    { to: '/accounting/period-close', label: 'Period Close Readiness', icon: CloseCheck, prefetch: () => {} },
    { to: '/accounting/periods', label: 'Financial Periods', icon: CalendarRange, prefetch: () => {} },
    { to: '/accounting/years', label: 'Financial Years', icon: Landmark, prefetch: () => {} },
    { to: '/accounting/reconciliation', label: 'Reconciliation Centre', icon: FileCheck2, prefetch: () => prefetch(queries.accountsQuery) },
    { to: '/accounting/exceptions', label: 'Suspense & Exceptions', icon: AlertTriangle, prefetch: () => {} },
    { to: '/accounting/audit-trail', label: 'Audit Trail', icon: Shield, prefetch: () => {} },
    { to: '/recurring-entries', label: 'Recurring Entries', icon: Repeat, prefetch: () => prefetch(queries.recurringEntriesQuery) },
    { to: '/reconciliation', label: 'Reconcile', icon: ArrowLeftRight, prefetch: () => prefetch(queries.accountsQuery) },
    { to: '/tax-rates', label: 'Tax Rates', icon: Percent, prefetch: () => prefetch(queries.taxRatesQuery) },
  ];

  const assetsLinks = [
    { to: '/fixed-assets', label: 'Asset Register', icon: Building2, prefetch: () => prefetch(queries.fixedAssetsQuery) },
    { to: '/asset-categories', label: 'Asset Categories', icon: Tags, prefetch: () => prefetch(queries.assetCategoriesQuery) },
    { to: '/assets/acquisitions', label: 'Acquisition Workbench', icon: ShoppingBag, prefetch: () => prefetch(queries.fixedAssetsQuery) },
    { to: '/assets/cockpit', label: 'Financial Cockpit', icon: Gauge, prefetch: () => prefetch(queries.fixedAssetsQuery) },
    { to: '/assets/health', label: 'Asset Health', icon: HeartPulse, prefetch: () => prefetch(queries.fixedAssetsQuery) },
    { to: '/assets/analytics', label: 'Analytics', icon: BarChart3, prefetch: () => prefetch(queries.fixedAssetsQuery) },
    { to: '/assets/verification', label: 'Asset Verification', icon: FileCheck2, prefetch: () => prefetch(queries.fixedAssetsQuery) },
    { to: '/assets/maintenance', label: 'Maintenance', icon: Wrench, prefetch: () => prefetch(queries.fixedAssetsQuery) },
    { to: '/assets/reports', label: 'Reports', icon: FileBarChart, prefetch: () => prefetch(queries.fixedAssetsQuery) },
  ];

  const treasuryLinks = [
    { to: '/loans', label: 'Loans', icon: Landmark, prefetch: () => prefetch(queries.loansQuery) },
  ];

  const bankingLinks = [
    { to: '/banking', label: 'Command Centre', icon: Landmark, prefetch: () => prefetch(queries.bankAccountsQuery) },
    { to: '/banking/accounts', label: 'Bank Accounts', icon: Wallet, prefetch: () => prefetch(queries.bankAccountsQuery) },
    { to: '/banking/transactions', label: 'Transactions', icon: ArrowLeftRight, prefetch: () => prefetch(queries.bankTransactionsQuery) },
    { to: '/banking/transfers', label: 'Transfers', icon: Repeat, prefetch: () => prefetch(queries.bankTransfersQuery) },
    { to: '/banking/petty-cash', label: 'Petty Cash', icon: PiggyBank, prefetch: () => {} },
    { to: '/banking/reconciliation', label: 'Reconciliation', icon: FileCheck2, prefetch: () => {} },
  ];

  /** EFCP V6.8.0 — Financial Close bridge between Accounting and Financial Statements. */
  const financialCloseLinks = [
    {
      to: '/financial-close',
      label: 'Financial Close',
      icon: CalendarClock,
      prefetch: () => {},
    },
  ];

  /** G3.7 / V6.10.0 — Statutory AFS workspace (not operational live reports). */
  const financialStatementsLinks = [
    {
      to: '/financial-statements-workspace',
      label: 'Annual Financial Statements',
      icon: FileSignature,
      prefetch: () => {},
    },
  ];

  const inventoryLinks = [
    { to: '/inventory', label: 'Command Centre', icon: Package, prefetch: () => prefetch(queries.inventoryAnalyticsQuery) },
    { to: '/inventory/register', label: 'Inventory Register', icon: ClipboardList, prefetch: () => prefetch(queries.inventoryRegisterQuery) },
    { to: '/inventory/warehouses', label: 'Warehouses', icon: Warehouse, prefetch: () => prefetch(queries.inventoryWarehousesQuery) },
    { to: '/inventory/movements', label: 'Movements', icon: ArrowLeftRight, prefetch: () => prefetch(queries.inventoryMovementsQuery) },
    { to: '/inventory/receipts', label: 'Goods Receipts', icon: Truck, prefetch: () => prefetch(queries.inventoryGoodsReceiptsQuery) },
    { to: '/inventory/transfers', label: 'Transfers', icon: Layers, prefetch: () => prefetch(queries.inventoryTransfersQuery) },
    { to: '/inventory/counts', label: 'Cycle Counts', icon: ClipboardCheck, prefetch: () => prefetch(queries.inventoryCycleCountsQuery) },
    { to: '/inventory/costing', label: 'Costing', icon: Calculator, prefetch: () => prefetch(queries.inventoryValuationEdgeQuery) },
    { to: '/inventory/analytics', label: 'Analytics', icon: BarChart3, prefetch: () => prefetch(queries.inventoryAnalyticsQuery) },
  ];

  const reportsLinks = [
    { to: '/reports', label: 'Operational Reports', icon: FileText, prefetch: () => {} },
    { to: '/reports/live-financial-statements', label: 'Financial Statements', icon: FileSignature, prefetch: () => {} },
    { to: '/comparative-pl', label: 'Comparative P&L', icon: TrendingUp, prefetch: () => {} },
    { to: '/comparative-bs', label: 'Comparative B/S', icon: Scale, prefetch: () => {} },
    { to: '/inventory-valuation', label: 'Inventory Valuation', icon: Package, prefetch: () => {} },
    { to: '/project-profitability', label: 'Project Profitability', icon: PieChart, prefetch: () => {} },
    { to: '/tax-report', label: 'Sales Tax Report', icon: Percent, prefetch: () => {} },
    { to: '/budgets', label: 'Budgets', icon: Target, prefetch: () => prefetch(queries.budgetsQuery) },
  ];

  const adminReportsLinks = isAdmin ? [
    { to: '/payroll-reports', label: 'Payroll Reports', icon: FileText, prefetch: () => {} },
    { to: '/audit-compliance-reports', label: 'Audit & Compliance Reports', icon: ShieldCheck, prefetch: () => {} },
  ] : [];

  const workManagementLinks = [
    { to: '/work', label: 'Executive Dashboard', icon: LayoutDashboard, prefetch: () => {} },
    { to: '/work/projects', label: 'Projects', icon: Layers, prefetch: () => {} },
    { to: '/projects', label: 'Engagements', icon: Briefcase, prefetch: () => prefetch(queries.projectsQuery) },
    { to: '/work/time', label: 'Time', icon: Timer, prefetch: () => {} },
    { to: '/work/clocking', label: 'Clocking', icon: Clock, prefetch: () => {} },
    { to: '/work/resources', label: 'Resources', icon: Wrench, prefetch: () => {} },
  ];

  return (
    <nav className={cn("flex flex-col space-y-1 flex-grow", className)} aria-label="Primary navigation">
      <NavLink to="/" end className={navLinkClasses} onClick={onNavigate}>
        <LayoutDashboard className="mr-3 h-5 w-5" />
        Dashboard
      </NavLink>
      
      <NavLink to="/calendar" className={navLinkClasses} onClick={onNavigate} title="Operations Calendar">
        <Calendar className="mr-3 h-5 w-5" />
        Operations
      </NavLink>

      <NavLink to="/chat" className={navLinkClasses} onClick={onNavigate} title="Collaboration Hub">
        <MessageSquare className="mr-3 h-5 w-5" />
        Collaborate
      </NavLink>

      <NavGroup 
        title="Sales" 
        icon={TrendingUp} 
        links={salesLinks} 
        defaultOpen={salesLinks.some(l => pathname.startsWith(l.to))}
        onNavigate={onNavigate}
      />
      <NavGroup 
        title="Purchases" 
        icon={Receipt} 
        links={purchasesLinks} 
        defaultOpen={purchasesLinks.some(l => pathname.startsWith(l.to))}
        onNavigate={onNavigate}
      />
      
      {isAdmin && (
        <NavGroup 
            title="Payroll" 
            icon={Briefcase} 
            links={payrollLinks} 
            defaultOpen={payrollLinks.some(l => pathname.startsWith(l.to))}
            onNavigate={onNavigate}
        />
      )}

      <NavGroup
        title="Work Management"
        icon={Layers}
        links={workManagementLinks}
        defaultOpen={
          pathname.startsWith('/work') ||
          pathname.startsWith('/projects') ||
          pathname.startsWith('/time-tracking')
        }
        onNavigate={onNavigate}
      />

      <NavGroup 
        title="Accounting" 
        icon={Book} 
        links={accountingLinks} 
        defaultOpen={
          accountingLinks.some(l => pathname.startsWith(l.to)) ||
          pathname.startsWith('/accounting') ||
          pathname.startsWith('/trial-balance') ||
          pathname.startsWith('/general-ledger') ||
          pathname.startsWith('/chart-of-accounts') ||
          pathname.startsWith('/journal-entries')
        }
        onNavigate={onNavigate}
      />

      {showFinancialCloseNav && (
        <NavGroup
          title="Financial Close"
          icon={CalendarClock}
          links={financialCloseLinks}
          defaultOpen={pathname.startsWith('/financial-close')}
          onNavigate={onNavigate}
        />
      )}

      {showFinancialStatementsNav && (
        <NavGroup
          title="Financial Statements"
          icon={FileSignature}
          links={financialStatementsLinks}
          defaultOpen={pathname.startsWith('/financial-statements-workspace')}
          onNavigate={onNavigate}
        />
      )}

      {isAdmin && (
        <NavGroup
          title="Assets"
          icon={Building2}
          links={assetsLinks}
          defaultOpen={
            pathname.startsWith('/fixed-assets') ||
            pathname.startsWith('/asset-categories') ||
            pathname.startsWith('/assets')
          }
          onNavigate={onNavigate}
        />
      )}

      {isAdmin && (
        <NavGroup
          title="Treasury & Financing"
          icon={Landmark}
          links={treasuryLinks}
          defaultOpen={pathname.startsWith('/loans')}
          onNavigate={onNavigate}
        />
      )}

      {isAdmin && (
        <NavGroup
          title="Banking"
          icon={Landmark}
          links={bankingLinks}
          defaultOpen={pathname.startsWith('/banking')}
          onNavigate={onNavigate}
        />
      )}

      <NavGroup 
        title="Reports" 
        icon={FileText} 
        links={[...reportsLinks, ...adminReportsLinks]} 
        defaultOpen={reportsLinks.some(l => pathname.startsWith(l.to)) || adminReportsLinks.some(l => pathname.startsWith(l.to))}
        onNavigate={onNavigate}
      />

      <NavGroup
        title="Inventory"
        icon={Package}
        links={inventoryLinks}
        defaultOpen={pathname.startsWith('/inventory')}
        onNavigate={onNavigate}
      />
      
      <NavLink to="/import" className={navLinkClasses} onClick={onNavigate}>
        <Upload className="mr-3 h-5 w-5" />
        Import Data
      </NavLink>
      
      <div className="pt-4 mt-auto space-y-1">
        {isBetaAnalyticsAdmin(user?.email) && (
          <NavLink to="/admin/beta-analytics" className={navLinkClasses} onClick={onNavigate}>
            <BarChart3 className="mr-3 h-5 w-5" />
            Beta Analytics
          </NavLink>
        )}
        <NavLink to="/onboarding-guide" className={navLinkClasses} onClick={onNavigate}>
          <BookOpen className="mr-3 h-5 w-5" />
          Onboarding Guide
        </NavLink>
        <NavLink to="/manual" className={navLinkClasses} onClick={onNavigate}>
          <HelpCircle className="mr-3 h-5 w-5" />
          User Guide
        </NavLink>
      </div>
    </nav>
  );
};