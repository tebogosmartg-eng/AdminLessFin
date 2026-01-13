import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, Building, Users, ShieldAlert, Lock, Activity } from "lucide-react";
import CompanySettings from "../components/CompanySettings";
import TeamMembersSettings from "../components/TeamMembersSettings";
import ProfileSettings from "../components/ProfileSettings";
import AvatarUploader from "../components/AvatarUploader";
import PasswordSettings from "../components/PasswordSettings";
import AuditLogViewer from "../components/AuditLogViewer";
import FinancialYearSettings from "../components/FinancialYearSettings";

const Settings = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      <Tabs defaultValue="company" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 h-auto">
          <TabsTrigger value="company" className="py-2"><Building className="mr-2 h-4 w-4" /> Company</TabsTrigger>
          <TabsTrigger value="team" className="py-2"><Users className="mr-2 h-4 w-4" /> Team</TabsTrigger>
          <TabsTrigger value="accounting" className="py-2"><Activity className="mr-2 h-4 w-4" /> Financials</TabsTrigger>
          <TabsTrigger value="profile" className="py-2"><User className="mr-2 h-4 w-4" /> My Profile</TabsTrigger>
          <TabsTrigger value="security" className="py-2"><Lock className="mr-2 h-4 w-4" /> Security</TabsTrigger>
        </TabsList>
        
        <TabsContent value="company" className="space-y-6">
          <CompanySettings />
        </TabsContent>
        
        <TabsContent value="team" className="space-y-6">
          <TeamMembersSettings />
        </TabsContent>

        <TabsContent value="accounting" className="space-y-6">
          <FinancialYearSettings />
        </TabsContent>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Picture</CardTitle>
              <CardDescription>Upload a picture to make your profile recognizable.</CardDescription>
            </CardHeader>
            <CardContent>
              <AvatarUploader />
            </CardContent>
          </Card>
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <PasswordSettings />
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <ShieldAlert className="mr-2 h-5 w-5" /> Audit Logs
            </h2>
            <AuditLogViewer />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;