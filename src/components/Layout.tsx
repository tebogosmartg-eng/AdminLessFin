import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Book, LayoutDashboard, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const Layout = () => {
  const { signOut, profile } = useAuth();

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center px-3 py-2 text-gray-700 rounded-md hover:bg-gray-200",
      isActive && "bg-gray-300 font-semibold"
    );

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
        </nav>
        <div className="mt-auto">
           <Button onClick={signOut} variant="ghost" className="w-full justify-start">
             <LogOut className="mr-3 h-5 w-5" />
             Sign Out
           </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col">
        <header className="flex h-16 items-center justify-end gap-4 border-b bg-white dark:bg-gray-800 px-6">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Welcome, {profile?.full_name || 'User'}
          </p>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;