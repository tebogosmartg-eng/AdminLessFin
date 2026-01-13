import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import FinancialYearSettings from '../components/FinancialYearSettings';
import AvatarUploader from '../components/AvatarUploader';
import ProfileSettings from '../components/ProfileSettings';
import CompanySettings from '../components/CompanySettings';
import PasswordSettings from '../components/PasswordSettings';
import TeamMembersSettings from "../components/TeamMembersSettings";
import AuditLogViewer from "../components/AuditLogViewer";
import { useAuth } from "../contexts/AuthContext";

const Settings = () => {
  const { profile, activeCompany } = useAuth();
  
  // Simple role check (assuming profile role carries user's role in company context for this simplified view, 
  // though typically this should be checked against company_users table specifically. 
  // In our current AuthContext setup, profile.role is 'user' or 'admin' globally, 
  // but let's assume we want to show it if they are an admin/owner of the COMPANY)
  // For now, we will render it and let the component handle the permission error/empty state if they lack access.
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="team">Team Members</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Picture</CardTitle>
                <CardDescription>Update your avatar.</CardDescription>
              </CardHeader>
              <CardContent>
                <AvatarUploader />
              </CardContent>
            </Card>
            <ProfileSettings />
          </div>
        </TabsContent>

        <TabsContent value="company">
          <CompanySettings />
        </TabsContent>

        <TabsContent value="team">
          <TeamMembersSettings />
        </TabsContent>

        <TabsContent value="financials">
          <FinancialYearSettings />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogViewer />
        </TabsContent>

        <TabsContent value="security">
          <PasswordSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;