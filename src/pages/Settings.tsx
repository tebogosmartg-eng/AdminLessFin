import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { useEffect } from 'react';
import AvatarUploader from '../components/AvatarUploader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { AlertCircle } from 'lucide-react';

const profileSchema = z.object({
  full_name: z.string().min(1, 'Full name is required.'),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

const companySchema = z.object({
  company_name: z.string().optional(),
  company_address: z.string().optional(),
});
type CompanyFormValues = z.infer<typeof companySchema>;

const passwordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
type PasswordFormValues = z.infer<typeof passwordSchema>;

const financialYearSchema = z.object({
    financial_year_end_month: z.coerce.number().min(1).max(12),
    financial_year_end_day: z.coerce.number().min(1).max(31),
});
type FinancialYearFormValues = z.infer<typeof financialYearSchema>;

const Settings = () => {
  const { user, profile, refreshProfile } = useAuth();

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '' },
  });

  const companyForm = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { company_name: '', company_address: '' },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const financialYearForm = useForm<FinancialYearFormValues>({
    resolver: zodResolver(financialYearSchema),
    defaultValues: { financial_year_end_month: 12, financial_year_end_day: 31 },
  });

  useEffect(() => {
    if (profile) {
      profileForm.reset({ full_name: profile.full_name || '' });
      companyForm.reset({
        company_name: profile.company_name || '',
        company_address: profile.company_address || '',
      });
      financialYearForm.reset({
        financial_year_end_month: profile.financial_year_end_month || 12,
        financial_year_end_day: profile.financial_year_end_day || 31,
      });
    }
  }, [profile, profileForm, companyForm, financialYearForm]);

  const profileMutation = useMutation({
    mutationFn: async (values: ProfileFormValues) => {
      if (!user) throw new Error('User not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: values.full_name })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      showSuccess('Profile updated successfully.');
    },
    onError: (error: any) => {
      showError(`Error updating profile: ${error.message}`);
    },
  });

  const companyMutation = useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      if (!user) throw new Error('User not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ company_name: values.company_name, company_address: values.company_address })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      showSuccess('Company information updated successfully.');
    },
    onError: (error: any) => {
      showError(`Error updating company information: ${error.message}`);
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (values: PasswordFormValues) => {
      const { error } = await supabase.auth.updateUser({ password: values.password });
      if (error) throw error;
    },
    onSuccess: () => {
      passwordForm.reset();
      showSuccess('Password updated successfully.');
    },
    onError: (error: any) => {
      showError(`Error updating password: ${error.message}`);
    },
  });

  const financialYearMutation = useMutation({
    mutationFn: async (values: FinancialYearFormValues) => {
        if (!user) throw new Error('User not authenticated');
        const { error } = await supabase.from('profiles').update(values).eq('id', user.id);
        if (error) throw error;
    },
    onSuccess: async () => {
        await refreshProfile();
        showSuccess('Financial year settings updated.');
    },
    onError: (error: any) => showError(`Error: ${error.message}`),
  });

  const yearEndCloseMutation = useMutation({
      mutationFn: async () => {
          const { error } = await supabase.functions.invoke('year-end-close');
          if (error) throw new Error(`Function Error: ${error.message}`);
      },
      onSuccess: async () => {
          await refreshProfile();
          showSuccess('Financial year closed successfully! Your new financial year has started.');
      },
      onError: (error: any) => showError(`Error closing year: ${error.message}`),
  });

  const onProfileSubmit = (values: ProfileFormValues) => profileMutation.mutate(values);
  const onCompanySubmit = (values: CompanyFormValues) => companyMutation.mutate(values);
  const onPasswordSubmit = (values: PasswordFormValues) => passwordMutation.mutate(values);
  const onFinancialYearSubmit = (values: FinancialYearFormValues) => financialYearMutation.mutate(values);
  const handleCloseYear = () => {
      if (window.confirm('Are you sure you want to close the financial year? This will post a closing journal entry and move you to the next financial year. This action cannot be undone.')) {
          yearEndCloseMutation.mutate();
      }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>Update your avatar.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarUploader />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your name.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4 max-w-md">
              <FormField
                control={profileForm.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your full name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>This will appear on your invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...companyForm}>
            <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-4 max-w-md">
              <FormField
                control={companyForm.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Company Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={companyForm.control}
                name="company_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="123 Main St, Anytown, USA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={companyMutation.isPending}>
                {companyMutation.isPending ? 'Saving...' : 'Save Company Info'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financial Year</CardTitle>
          <CardDescription>Set your company's financial year end and close your books.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...financialYearForm}>
            <form onSubmit={financialYearForm.handleSubmit(onFinancialYearSubmit)} className="space-y-4 max-w-md">
              <div className="flex items-end gap-4">
                <FormField control={financialYearForm.control} name="financial_year_end_month" render={({ field }) => (
                  <FormItem><FormLabel>Year End Month</FormLabel>
                    <Select onValueChange={field.onChange} value={String(field.value)}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>{Array.from({ length: 12 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</SelectItem>)}</SelectContent>
                    </Select>
                  <FormMessage /></FormItem>
                )} />
                <FormField control={financialYearForm.control} name="financial_year_end_day" render={({ field }) => (
                  <FormItem><FormLabel>Year End Day</FormLabel><FormControl><Input type="number" min="1" max="31" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Button type="submit" disabled={financialYearMutation.isPending}>{financialYearMutation.isPending ? 'Saving...' : 'Save Settings'}</Button>
            </form>
          </Form>
          <div className="border-t pt-6">
            <h4 className="font-semibold">Close Financial Year</h4>
            <p className="text-sm text-muted-foreground mt-1">Current financial year started on: {profile?.current_financial_year_start ? new Date(profile.current_financial_year_start).toLocaleDateString() : 'N/A'}</p>
            <Alert variant="destructive" className="my-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                This is an irreversible action. It will post a closing journal entry and advance your company to the next financial year. Ensure all transactions for the current year are recorded and reconciled before proceeding.
              </AlertDescription>
            </Alert>
            <Button variant="destructive" onClick={handleCloseYear} disabled={yearEndCloseMutation.isPending}>
              {yearEndCloseMutation.isPending ? 'Closing...' : 'Close Financial Year'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 max-w-md">
              <FormField
                control={passwordForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={passwordMutation.isPending}>
                {passwordMutation.isPending ? 'Saving...' : 'Update Password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;