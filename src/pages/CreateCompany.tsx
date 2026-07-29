import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { companyService } from '@/governance/domains/company/service';
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
    // Phase G3.5 — company CREATE resolves through Governance Company Service.
    // Underlying company-management CREATE call is unchanged.
    mutationFn: async (values: CompanyFormValues) => {
      if (!user) throw new Error('User not authenticated');
      const data = await companyService.createCompany(values.name);
      return data.id;
    },
    onSuccess: async (newCompanyId) => {
      await switchCompany(newCompanyId);
      showSuccess('Company created successfully!');
      navigate('/accounting-setup');
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
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
