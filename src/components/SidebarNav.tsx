import { NavLink, useLocation } from 'react-router-dom';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Book, LayoutDashboard, BookText, FileText, Library, Target, Repeat, Building2, Users, TrendingUp, Receipt, Banknote, HandCoins, ChevronRight, Package, Scale, Upload, FileSignature, Briefcase } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center px-3 py-2 text-sm text-gray-600 rounded-md hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700",
    isActive && "bg-gray-200 font-semibold text-gray-900 dark:bg-gray-700 dark:text-white"
  );

const NavGroup = ({ title, icon: Icon, links, defaultOpen }: { title: string, icon: React.ElementType, links: { to: string, label: string, icon: React.ElementType }[], defaultOpen: boolean }) => {
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
          <NavLink key={link.to} to={link.to} className={navLinkClasses}>
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

  const salesLinks = [
    { to: '/sales', label: 'Sales', icon: TrendingUp },
    { to: '/invoices', label: 'Invoices', icon: FileSignature },
    { to: '/receive-payments', label: 'Receive Payments', icon: HandCoins },
    { to: '/customers', label: 'Customers', icon: Users },
  ];

  const expensesLinks = [
    { to: '/bills', label: 'Bills', icon: Receipt },
    { to: '/pay-bills', label: 'Pay Bills', icon: Banknote },
    { to: '/vendors', label: 'Vendors', icon: Building2 },
  ];

  const payrollLinks = [
    { to: '/employees', label: 'Employees', icon: Users },
  ];

  const accountingLinks = [
    { to: '/chart-of-accounts', label: 'Chart of Accounts', icon: Book },
    { to: '/products', label: 'Products & Services', icon: Package },
    { to: '/journal-entries', label: 'Journal Entries', icon: BookText },
    { to: '/recurring-entries', label: 'Recurring Entries', icon: Repeat },
    { to: '/general-ledger', label: 'General Ledger', icon: Library },
    { to: '/reconciliation', label: 'Reconcile', icon: Scale },
    { to: '/import', label: 'Import Data', icon: Upload },
  ];

  const planningLinks = [
    { to: '/budgets', label: 'Budgets', icon: Target },
    { to: '/reports', label: 'Reports', icon: FileText },
  ];

  return (
    <nav className="flex flex-col space-y-1 flex-grow">
      <NavLink to="/" end className={navLinkClasses}>
        <LayoutDashboard className="mr-3 h-5 w-5" />
        Dashboard
      </NavLink>

      <NavGroup 
        title="Sales" 
        icon={TrendingUp} 
        links={salesLinks} 
        defaultOpen={salesLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Expenses" 
        icon={Receipt} 
        links={expensesLinks} 
        defaultOpen={expensesLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Payroll" 
        icon={Briefcase} 
        links={payrollLinks} 
        defaultOpen={payrollLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Accounting" 
        icon={Book} 
        links={accountingLinks} 
        defaultOpen={accountingLinks.some(l => pathname.startsWith(l.to))}
      />
      <NavGroup 
        title="Planning & Reports" 
        icon={FileText} 
        links={planningLinks} 
        defaultOpen={planningLinks.some(l => pathname.startsWith(l.to))}
      />
    </nav>
  );
};