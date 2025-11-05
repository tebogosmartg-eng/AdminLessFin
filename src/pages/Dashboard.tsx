import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Dashboard = () => {
  const { user, profile } = useAuth();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      </header>
      <main>
        <Card>
          <CardHeader>
            <CardTitle>Welcome!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">Hello, <span className="font-semibold">{profile?.full_name || user?.email}</span>!</p>
            <p className="text-md text-gray-600">Your role is: <span className="capitalize font-medium text-primary">{profile?.role}</span></p>
            <p className="mt-4">This is your dashboard. You can manage your chart of accounts from the sidebar.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;