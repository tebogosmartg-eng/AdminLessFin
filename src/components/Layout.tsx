import { NavLink, Outlet } from 'react-router-dom';
import { Home, Book, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const Layout = () => {
  const { signOut } = useAuth();

  const navItems = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Chart of Accounts', href: '/accounts', icon: Book },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-gray-100 border-r p-4 flex flex-col">
        <h1 className="text-2xl font-bold mb-8">SmaAcc</h1>
        <nav className="flex-grow">
          <ul>
            {navItems.map((item) => (
              <li key={item.name}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) =>
                    `flex items-center p-2 rounded-md text-gray-700 hover:bg-gray-200 ${
                      isActive ? 'bg-gray-300 font-semibold' : ''
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <Button onClick={signOut} variant="ghost" className="w-full justify-start">
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;