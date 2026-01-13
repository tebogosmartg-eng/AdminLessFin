import { NavLink, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Book, LayoutDashboard, BookText, FileText, Library, Target, Repeat, Building2, Users, TrendingUp, Receipt, Banknote, HandCoins, ChevronRight, Package, Scale, Upload, FileSignature, Briefcase, Landmark, MessageSquare, MessageCircle, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';
import * as queries from '../lib/queries';

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center px-3 py-2 text-sm text-gray-600 rounded-md hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700",
    isActive && "bg-gray-200 font-semibold text-gray-900 dark:bg-gray-700 dark:text-white"
  );

const NavGroup = ({ title, icon: Icon, links, defaultOpen }: { title: string, icon: React.ElementType, links: { to: string, label: string, icon: React.ElementType, prefetch: () => void }[], defaultOpen: boolean }) => {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-3 group">
          <div className="flex items-center">
            <Icon className="mr-3 h-5 w-5" />
            <span>{title}</span>
          </div>
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 space-y-1 py-1">
        {links.map(link => (
          <NavLink key={link.to} to={link.to} className={navLinkClasses} onMouseEnter={link.prefetch} onFocus={link.prefetch}>
            <link.icon className="mr-3 h-4 w-4" />
            {link.label}
          </NavLink>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export const SidebarNav = () => {
  const location = useLocation();
  const pathname = location.pathname;
  const queryClient = useQueryClient();
  const { activeCompany } = useAuth();

  const prefetch = (query: (companyId: string) => any) => {
    if (activeCompany) {
      queryClient.prefetchQuery(query(activeCompany.id));
    }
  };

  const salesLinks = [
    { to: '/quotes', label: 'Quotes', icon: MessageCircle, prefetch: () => prefetch(queries.quotesQuery) },
    { to: '/invoices', label: 'Invoices', icon: FileSignature, prefetch: () => prefetch(queries.invoicesQuery) },
    { to: '/recurring-invoices', label: 'Recurring Invoices', icon: Repeat, prefetch: () => prefetch(queries.recurringInvoicesQuery) },
    { to: '/receive-payments', label: 'Receive Payments', icon: HandCoins, prefetch: () => prefetch(queries.customerBalancesQuery) },
    { to: '/customers', label: 'Customers', icon: Users, prefetch: () => prefetch(queries.customersQuery) },
  ];

  const purchasesLinks = [
    { to: '/bills', label: 'Bills', icon: Receipt, prefetch: () => prefetch(queries.billsQuery) },
    { to: '/pay-bills', label: 'Pay Bills', icon: Banknote, prefetch: () => prefetch(queries.vendorBalancesQuery) },
    { to: '/vendors', label: 'Vendors', icon: Building2, prefetch: () => prefetch(queries.vendorsQuery) },
  ];

  const payrollLinks = [
    { to: '/employees', label: 'Employees', icon: Users, prefetch: () => prefetch(queries.employeesQuery) },
    { to: '/payroll-runs', label: 'Payroll Runs', icon: Repeat, prefetch: () => prefetch(queries.payrollRunsQuery) },
  ];

  const accountingLinks = [
    { to: '/chart-of-accounts', label: 'Chart of Accounts', icon: Book, prefetch: () => prefetch(queries.accountsQuery) },
    { to: '/journal-entries', label: 'Journal Entries', icon: BookText, prefetch: () => {} }, // Complex filters, skip prefetch
    { to: '/recurring-entries', label: 'Recurring Entries', icon: Repeat, prefetch: () => prefetch(queries.recurringEntriesQuery) },
    { to: '/reconciliation', label: 'Reconcile', icon: Scale, prefetch: () => prefetch(queries.accountsQuery) },
    { to: '/tax-rates', label: 'Tax Rates', icon: Scale, prefetch: () => prefetch(queries.taxRatesQuery) },
  ];

  const assetsAndLoansLinks = [
    { to: '/fixed-assets', label: 'Fixed Assets', icon: Building2, prefetch: () => prefetch(queries.fixedAssetsQuery) },
    { to: '/asset-categories', label: 'Asset Categories', icon: Library, prefetch: () => prefetch(queries.assetCategoriesQuery) },
    { to: '/loans', label: 'Loans', icon: Landmark, prefetch: () => prefetch(queries.loansQuery) },
  ];

  const reportsLinks = [
    { to: '/reports', label: 'Operational Reports', icon: FileText, prefetch: () => {} }, // Complex filters, skip prefetch
    { to: '/financial-statements', label: 'Financial Statements', icon: FileSignature, prefetch: () => {} }, // Complex filters, skip prefetch
    { to: '/tax-report', label: 'Sales Tax Report', icon: Scale, prefetch: () => {} },
    { to: '/general-ledger', label: 'General Ledger', icon: Library, prefetch: () => prefetch(queries.accountsQuery) },
    { to: '/payroll-reports', label: 'Payroll Reports', icon: FileText, prefetch: () => {} }, // Complex filters, skip prefetch
    { to: '/budgets', label: 'Budgets', icon: Target, prefetch: () => prefetch(queries.budgetsQuery) },
  ];

  const timeTrackingLinks = [
    { to: '/projects', label: 'Projects', icon: Briefcase, prefetch: () => prefetch(queries.projectsQuery) },
    { to: '/time-tracking', label: 'Log Time', icon: Clock, prefetch: () => prefetch(queries.timesheetsQuery) },
  ];

  return (
    <nav className="flex flex-col space-y-1 flex-grow">
      <NavLink to="/" end className={navLinkClasses}>
        <LayoutDashboard className="mr-3 h-5 w-5" />
        Dashboard
      </NavLink>
      
      <NavLink to="/chat" className={navLinkClasses}>
        <MessageSquare className="mr-3 h-5 w-5" />
        Chat
      </NavLink>

      <NavGroup 
        title="Sales" 
        icon={TrendingUp} 
        links={salesLinks} 
        defaultOpen={salesLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Purchases" 
        icon={Receipt} 
        links={purchasesLinks} 
        defaultOpen={purchasesLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Payroll" 
        icon={Briefcase} 
        links={payrollLinks} 
        defaultOpen={payrollLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Time Tracking" 
        icon={Clock} 
        links={timeTrackingLinks} 
        defaultOpen={timeTrackingLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Accounting" 
        icon={Book} 
        links={accountingLinks} 
        defaultOpen={accountingLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Assets & Loans" 
        icon={Landmark} 
        links={assetsAndLoansLinks} 
        defaultOpen={assetsAndLoansLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Reports" 
        icon={FileText} 
        links={reportsLinks} 
        defaultOpen={reportsLinks.some(l => pathname.startsWith(l.to))}
      />
      
      <NavLink to="/products" className={navLinkClasses} onMouseEnter={() => prefetch(queries.productsQuery)} onFocus={() => prefetch(queries.productsQuery)}>
        <Package className="mr-3 h-5 w-5" />
        Products & Services
      </NavLink>
      <NavLink to="/import" className={navLinkClasses}>
        <Upload className="mr-3 h-5 w-5" />
        Import Data
      </NavLink>
    </nav>
  );
};