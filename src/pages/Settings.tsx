import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, Building, Users, ShieldAlert, Lock, Activity, Wallet, Database, Shield } from "lucide-react";
import CompanySettings from "../components/CompanySettings";
import TeamMembersSettings from "../components/TeamMembersSettings";
import ProfileSettings from "../components/ProfileSettings";
import AvatarUploader from "../components/AvatarUploader";
import PasswordSettings from "../components/PasswordSettings";
import AuditLogViewer from "../components/AuditLogViewer";
import FinancialYearSettings from "../components/FinancialYearSettings";
import PayrollSettings from "../components/PayrollSettings";
import EmployeeNumberSettings from "../components/EmployeeNumberSettings";
import MasterDataSettings from "../components/settings/MasterDataSettings";
import PlatformGovernanceSettings from "../components/settings/PlatformGovernanceSettings";

// Phase G3.7 — Master Data Consolidation. Settings is now the Enterprise
// Administration Centre: the single place company/governance/financial-calendar
// master data is maintained. The active tab (and, for Master Data, the module)
// are URL-controlled so other surfaces — notably the Financial Statements
// Information Workspace — can deep-link straight to the right editor
// (e.g. /settings?tab=master-data&module=directors).
// Platform Governance hosts Accounting Engine diagnostics (health, policies,
// rules, business events) relocated from the Operations Command Centre.
const VALID_TABS = ['company', 'master-data', 'team', 'accounting', 'platform-governance', 'payroll', 'profile', 'security'] as const;
type SettingsTab = typeof VALID_TABS[number];

const Settings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: SettingsTab = (VALID_TABS as readonly string[]).includes(requestedTab || '')
    ? (requestedTab as SettingsTab)
    : 'company';

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    // Leaving the Master Data tab clears any deep-linked module.
    if (value !== 'master-data') next.delete('module');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enterprise Administration Centre — the single source for company, master data, financial
          calendar, policy configuration, and Accounting Engine governance.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 h-auto">
          <TabsTrigger value="company" className="py-2"><Building className="mr-2 h-4 w-4" /> Company</TabsTrigger>
          <TabsTrigger value="master-data" className="py-2"><Database className="mr-2 h-4 w-4" /> Master Data</TabsTrigger>
          <TabsTrigger value="team" className="py-2"><Users className="mr-2 h-4 w-4" /> Team</TabsTrigger>
          <TabsTrigger value="accounting" className="py-2"><Activity className="mr-2 h-4 w-4" /> Financials</TabsTrigger>
          <TabsTrigger value="platform-governance" className="py-2"><Shield className="mr-2 h-4 w-4" /> Platform Governance</TabsTrigger>
          <TabsTrigger value="payroll" className="py-2"><Wallet className="mr-2 h-4 w-4" /> Payroll</TabsTrigger>
          <TabsTrigger value="profile" className="py-2"><User className="mr-2 h-4 w-4" /> My Profile</TabsTrigger>
          <TabsTrigger value="security" className="py-2"><Lock className="mr-2 h-4 w-4" /> Security</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <CompanySettings />
        </TabsContent>

        <TabsContent value="master-data" className="space-y-6">
          <MasterDataSettings />
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <TeamMembersSettings />
        </TabsContent>

        <TabsContent value="accounting" className="space-y-6">
          <FinancialYearSettings />
        </TabsContent>

        <TabsContent value="platform-governance" className="space-y-6">
          <PlatformGovernanceSettings />
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6">
          <EmployeeNumberSettings />
          <PayrollSettings />
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
