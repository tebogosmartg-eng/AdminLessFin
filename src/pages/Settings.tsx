import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import FinancialYearSettings from '../components/FinancialYearSettings';
import AvatarUploader from '../components/AvatarUploader';
import ProfileSettings from '../components/ProfileSettings';
import CompanySettings from '../components/CompanySettings';
import PasswordSettings from '../components/PasswordSettings';
import TeamMembersSettings from "../components/TeamMembersSettings";

const Settings = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="team">Team Members</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
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

        <TabsContent value="security">
          <PasswordSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;