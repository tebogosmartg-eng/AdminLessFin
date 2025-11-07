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

  const mutation = useMutation({
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

  const onSubmit = (values: CompanyFormValues) => mutation.mutate(values);

  return (
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
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : 'Save Company Info'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default CompanySettings;