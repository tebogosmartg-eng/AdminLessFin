import { Outlet, NavLink } from 'react-router-dom';
import { Home, Book } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from './ui/button';

const Layout = () => {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r p-4 flex flex-col">
        <h1 className="text-2xl font-bold mb-8 text-gray-900">SmaAcc</h1>
        <nav className="flex flex-col space-y-2 flex-grow">
          <NavLink 
            to="/" 
            className={({ isActive }) => `flex items-center p-2 rounded-md text-gray-700 hover:bg-gray-100 ${isActive ? 'bg-gray-200 font-semibold' : ''}`}
          >
            <Home className="mr-3 h-5 w-5" />
            Dashboard
          </NavLink>
          <NavLink 
            to="/accounts" 
            className={({ isActive }) => `flex items-center p-2 rounded-md text-gray-700 hover:bg-gray-100 ${isActive ? 'bg-gray-200 font-semibold' : ''}`}
          >
            <Book className="mr-3 h-5 w-5" />
            Chart of Accounts
          </NavLink>
        </nav>
        <Button onClick={signOut} variant="outline">Sign Out</Button>
      </aside>
      <main className="flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;