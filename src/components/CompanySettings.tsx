import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { useEffect } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { AlertCircle } from 'lucide-react';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required.'),
  address: z.string().optional(),
});
type CompanyFormValues = z.infer<typeof companySchema>;

const CompanySettings = () => {
  const { user, activeCompany, refreshProfile } = useAuth();

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: '', address: '' },
  });

  useEffect(() => {
    if (activeCompany) {
      form.reset({
        name: activeCompany.name || '',
        address: activeCompany.address || '',
      });
    }
  }, [activeCompany, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');
      const { error } = await supabase.functions.invoke('settings', {
        body: {
          method: 'UPDATE_COMPANY',
          company_id: activeCompany.id,
          companyData: { name: values.name, address: values.address || null },
        },
      });
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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No active company');
      const { error } = await supabase.functions.invoke('company-management', {
        body: {
          method: 'DELETE',
          company_id: activeCompany.id,
        },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      showSuccess('Company deleted successfully.');
    },
    onError: (error: any) => {
      showError(`Error deleting company: ${error.message}`);
    },
  });

  const onSubmit = (values: CompanyFormValues) => updateMutation.mutate(values);
  const isOwner = user?.id === activeCompany?.owner_id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>This will appear on your invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-md">
              <FormField
                control={form.control}
                name="name"
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
                control={form.control}
                name="address"
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
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save Company Info'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>This is a permanent action. Be absolutely sure before proceeding.</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete This Company</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center">
                    <AlertCircle className="mr-2 h-5 w-5" />
                    Are you absolutely sure?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the company
                    <strong> "{activeCompany?.name}"</strong> and all of its associated data, including accounts, transactions, invoices, and bills.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete Company'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CompanySettings;