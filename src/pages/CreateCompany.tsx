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
import { showError, showSuccess } from '../utils/toast';
import { useNavigate } from 'react-router-dom';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required.'),
});
type CompanyFormValues = z.infer<typeof companySchema>;

const CreateCompany = () => {
  const { user, switchCompany } = useAuth();
  const navigate = useNavigate();
  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
  });

  const mutation = useMutation({
    mutationFn: async (values: CompanyFormValues) => {
      if (!user) throw new Error('User not authenticated');

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({ name: values.name, owner_id: user.id })
        .select('id')
        .single();
      if (companyError) throw companyError;

      const { error: linkError } = await supabase
        .from('company_users')
        .insert({ company_id: company.id, user_id: user.id, role: 'owner' });
      if (linkError) throw linkError;

      return company.id;
    },
    onSuccess: async (newCompanyId) => {
      await switchCompany(newCompanyId);
      showSuccess('Company created successfully!');
      navigate('/');
    },
    onError: (error: any) => showError(error.message),
  });

  return (
    <div className="flex items-center justify-center min-h-full">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create a New Company</CardTitle>
          <CardDescription>Set up a new workspace for your business.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., ACME Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? 'Creating...' : 'Create Company'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateCompany;