import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const Dashboard = () => {
  const { user, profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">SmaAcc Dashboard</h1>
          <Button onClick={signOut} variant="outline">Sign Out</Button>
        </header>
        <main>
          <Card>
            <CardHeader>
              <CardTitle>Welcome!</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg">Hello, <span className="font-semibold">{profile?.full_name || user?.email}</span>!</p>
              <p className="text-md text-gray-600">Your role is: <span className="capitalize font-medium text-primary">{profile?.role}</span></p>
              <p className="mt-4">This is your dashboard. More features coming soon!</p>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;