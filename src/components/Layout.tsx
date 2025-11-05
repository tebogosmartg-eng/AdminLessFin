import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Book, LayoutDashboard, LogOut, BookText, FileText, Settings, Library, Target, Repeat, User as UserIcon, Building2, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';

const Layout = () => {
  const { signOut, profile } = useAuth();

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center px-3 py-2 text-gray-700 rounded-md hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700",
      isActive && "bg-gray-300 font-semibold dark:bg-gray-600"
    );

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  return (
    <div className="flex min-h-screen w-full bg-gray-100 dark:bg-gray-900">
      <aside className="w-64 flex-shrink-0 border-r bg-white dark:bg-gray-800 p-4 flex flex-col">
        <h1 className="text-2xl font-bold mb-8 text-gray-900 dark:text-white">SmaAcc</h1>
        <nav className="flex flex-col space-y-2 flex-grow">
          <NavLink to="/" end className={navLinkClasses}>
            <LayoutDashboard className="mr-3 h-5 w-5" />
            Dashboard
          </NavLink>
          <NavLink to="/chart-of-accounts" className={navLinkClasses}>
            <Book className="mr-3 h-5 w-5" />
            Chart of Accounts
          </NavLink>
          <NavLink to="/journal-entries" className={navLinkClasses}>
            <BookText className="mr-3 h-5 w-5" />
            Journal Entries
          </NavLink>
          <NavLink to="/recurring-entries" className={navLinkClasses}>
            <Repeat className="mr-3 h-5 w-5" />
            Recurring Entries
          </NavLink>
          <NavLink to="/general-ledger" className={navLinkClasses}>
            <Library className="mr-3 h-5 w-5" />
            General Ledger
          </NavLink>
           <NavLink to="/budgets" className={navLinkClasses}>
            <Target className="mr-3 h-5 w-5" />
            Budgets
          </NavLink>
          <NavLink to="/vendors" className={navLinkClasses}>
            <Building2 className="mr-3 h-5 w-5" />
            Vendors
          </NavLink>
          <NavLink to="/customers" className={navLinkClasses}>
            <Users className="mr-3 h-5 w-5" />
            Customers
          </NavLink>
          <NavLink to="/reports" className={navLinkClasses}>
            <FileText className="mr-3 h-5 w-5" />
            Reports
          </NavLink>
        </nav>
        <div className="mt-auto">
           <NavLink to="/settings" className={navLinkClasses}>
             <Settings className="mr-3 h-5 w-5" />
             Settings
           </NavLink>
           <Button onClick={signOut} variant="ghost" className="w-full justify-start mt-2 text-gray-700 dark:text-gray-300">
             <LogOut className="mr-3 h-5 w-5" />
             Sign Out
           </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="flex h-16 items-center justify-end gap-4 border-b bg-white dark:bg-gray-800 px-6">
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
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;