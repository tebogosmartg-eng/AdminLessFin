import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { LogOut, Menu, Settings, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { SidebarNav } from './SidebarNav';
import { ThemeToggle } from './ThemeToggle';
import CompanySwitcher from './CompanySwitcher';
import NotificationBell from './NotificationBell';
import { CommandMenu } from './CommandMenu';
import { AppSidebarLogo } from './brand';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './ui/sheet';
import RouteLoadingFallback from './RouteLoadingFallback';

const Layout = () => {
  const { signOut, profile } = useAuth();

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
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6 print:hidden" role="banner">
          <div className="flex items-center gap-4 flex-1">
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
            <CompanySwitcher />
            <CommandMenu />
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
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
        </header>
        <main className="flex-1 p-4 sm:p-6 print:p-0" role="main">
          <Suspense fallback={<RouteLoadingFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default Layout;