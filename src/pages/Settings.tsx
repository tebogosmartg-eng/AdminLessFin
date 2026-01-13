import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "../contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../integrations/supabase/client";
import { showError, showSuccess } from "../utils/toast";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import AuditLogViewer from "../components/AuditLogViewer";

const Settings = () => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  
  const form = useForm({
    defaultValues: {
      name: '',
      address: '',
      email: '',
      phone: '',
      tax_id: '',
      currency: 'USD',
    }
  });

  const { data: companyData, isLoading } = useQuery({
    queryKey: ['company_settings', activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany) return null;
      const { data, error } = await supabase.functions.invoke('settings', {
        body: { method: 'GET', company_id: activeCompany.id },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompany,
  });

  useEffect(() => {
    if (companyData) {
      form.reset({
        name: companyData.name,
        address: companyData.address || '',
        email: companyData.email || '',
        phone: companyData.phone || '',
        tax_id: companyData.tax_id || '',
        currency: companyData.currency || 'USD',
      });
    }
  }, [companyData, form]);

  const mutation = useMutation({
    mutationFn: async (values: any) => {
      if (!activeCompany) throw new Error("No active company");
      const { error } = await supabase.functions.invoke('settings', {
        body: { method: 'UPDATE', company_id: activeCompany.id, settings: values },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_settings'] });
      showSuccess("Company settings updated successfully.");
    },
    onError: (err) => showError(err.message),
  });

  const onSubmit = (values: any) => mutation.mutate(values);

  if (isLoading) return <div>Loading settings...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      <Tabs defaultValue="general" className="w-full">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="users">Users & Roles</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Company Details</CardTitle>
              <CardDescription>Manage your company information.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Company Name</Label>
                    <Input id="name" {...form.register('name')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax_id">Tax ID / EIN</Label>
                    <Input id="tax_id" {...form.register('tax_id')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" {...form.register('email')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" {...form.register('phone')} />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" {...form.register('address')} />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="currency">Currency Code</Label>
                     <Input id="currency" {...form.register('currency')} maxLength={3} />
                  </div>
                </div>
                <div className="pt-4">
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Users & Roles</CardTitle>
              <CardDescription>Manage access to your company.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">User management functionality coming soon.</p>
              {/* Future User Management UI */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>System Preferences</CardTitle>
              <CardDescription>Customize your workflow.</CardDescription>
            </CardHeader>
            <CardContent>
               <p className="text-muted-foreground">Preferences coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
            <AuditLogViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;