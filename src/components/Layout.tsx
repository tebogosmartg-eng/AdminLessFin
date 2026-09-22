import { Suspense, useRef, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Loader2, LogOut, Menu, Settings, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { SidebarNav } from './SidebarNav';
import { ThemeToggle } from './ThemeToggle';
import CompanySwitcher from './CompanySwitcher';
import FinancialContextSwitcher from './FinancialContextSwitcher';
import ContextNotice from './ContextNotice';
import NotificationBell from './NotificationBell';
import { CommandMenu } from './CommandMenu';
import { AppSidebarLogo } from './brand';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './ui/sheet';
import RouteLoadingFallback from './RouteLoadingFallback';
import { listPathAfterSwitch } from '../lib/companyContext/switching';
import { useIsMobile } from '../hooks/use-mobile';

/**
 * When the company changes under a page that shows one record (another tab
 * switched, say), go to that record's list instead of asking the new company
 * for the old company's record. The switcher in this tab navigates first, so
 * here it only catches switches that started elsewhere.
 */
function CompanyScope({ companyId, children }: { companyId: string | null; children: ReactNode }) {
  const location = useLocation();
  const entered = useRef({ companyId, pathname: location.pathname });
  if (entered.current.pathname !== location.pathname) {
    entered.current = { companyId, pathname: location.pathname };
  } else if (entered.current.companyId !== companyId) {
    const listPath = listPathAfterSwitch(location.pathname);
    if (listPath) return <Navigate to={listPath} replace />;
    entered.current = { companyId, pathname: location.pathname };
  }
  return <>{children}</>;
}

function SwitchingCompany({ name }: { name: string }) {
  return (
    <div role="status" aria-live="polite" data-testid="switching-company" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium">Switching to {name}…</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Loading its books. Nothing from the previous company is kept on screen.
      </p>
    </div>
  );
}

const Layout = () => {
  const { signOut, profile, activeCompany, switchingTo } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center px-3 py-2 rounded-md text-sm text-sidebar-foreground transition-colors duration-fast hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      isActive && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
    );

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  return (
    <div className="flex min-h-screen w-full bg-background print:bg-white">
      <aside className="hidden w-64 flex-shrink-0 border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex md:flex-col print:hidden">
        <AppSidebarLogo />
        <SidebarNav className="overflow-y-auto pr-1" />
        <div className="mt-auto">
           <NavLink to="/settings" className={navLinkClasses}>
             <Settings className="mr-3 h-5 w-5" />
             Settings
           </NavLink>
           <Button onClick={signOut} variant="ghost" className="w-full justify-start mt-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
             <LogOut className="mr-3 h-5 w-5" />
             Sign Out
           </Button>
        </div>
      </aside>
      {/* min-w-0: a wide table must not stretch the column (and the header
          with it) past the screen. The company and year switchers have to stay
          on screen on a phone. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-card print:hidden" role="banner">
          <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden" aria-label="Open navigation menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-xs bg-sidebar p-3">
                <SheetTitle className="sr-only">Main navigation</SheetTitle>
                <div className="flex h-full flex-col">
                  <AppSidebarLogo />
                  <SidebarNav className="overflow-y-auto pr-1" />
                </div>
              </SheetContent>
            </Sheet>
            {/* Company and financial year are the global context: always in
                view, never inferred by a page. */}
            <CompanySwitcher className="min-w-0 flex-1 md:flex-none" />
            {!isMobile && <FinancialContextSwitcher className="w-[21rem] shrink-0 lg:w-[24rem]" />}
            <div className="flex shrink-0 md:min-w-0 md:flex-1">
              <CommandMenu />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <span className="hidden sm:inline-flex"><ThemeToggle /></span>
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full" aria-label="Open user menu">
                  <Avatar>
                    <AvatarImage src={profile?.avatar_url || undefined} alt="User avatar" />
                    <AvatarFallback>
                      {profile?.full_name ? getInitials(profile.full_name) : <UserIcon className="h-5 w-5" />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{profile?.full_name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {profile?.role}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/settings" className="w-full">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          </div>
          {isMobile && (
            <div className="border-t border-border px-3 py-2">
              <FinancialContextSwitcher className="w-full" />
            </div>
          )}
        </header>
        <ContextNotice />
        <main className="min-w-0 flex-1 p-4 sm:p-6 print:p-0" role="main">
          {/* Route-level boundary: a crashing page (or a failed lazy chunk)
              degrades to a recoverable content-area fallback while the sidebar
              and header shell stay live. Keyed on pathname so it auto-clears
              when the user navigates away from the broken route. */}
          {/* Keyed by company: switching remounts the page, so no component
              state, effect or in-flight fetch from the previous company can
              survive into the next one. While the switch runs the page is not
              shown at all. */}
          <CompanyScope companyId={activeCompany?.id ?? null}>
            {switchingTo ? (
              <SwitchingCompany name={switchingTo.name} />
            ) : (
              <ErrorBoundary key={activeCompany?.id ?? 'no-company'} level="route" resetKeys={[location.pathname]}>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Outlet />
                </Suspense>
              </ErrorBoundary>
            )}
          </CompanyScope>
        </main>
      </div>
    </div>
  );
};

export default Layout;