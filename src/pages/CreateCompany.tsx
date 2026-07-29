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
import { Progress } from '../components/ui/progress';
import { showError, showSuccess } from '../utils/toast';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';
import { AnalyticsEvents } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/productAnalytics';

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
      const data = await companyService.createCompany(values.name);
      return data.id;
    },
    onSuccess: async (newCompanyId) => {
      await switchCompany(newCompanyId);
      trackEvent({
        eventName: AnalyticsEvents.COMPANY_CREATED,
        companyId: newCompanyId,
        properties: { company_name: form.getValues('name') },
      });
      showSuccess('Company created — next, set up your accounting foundation.');
      navigate('/accounting-setup');
    },
    onError: (error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
  });

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Step 2 of 5 · Company setup
          </p>
          <Progress value={40} className="h-1.5" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Create your company
            </CardTitle>
            <CardDescription>
              This creates your private workspace. You will configure your chart of accounts,
              tax rates, and financial calendar in the next step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., ACME Inc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? (
                    'Creating…'
                  ) : (
                    <>
                      Create company & continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              What happens next: Accounting Setup wizard — financial year, chart of accounts, and tax.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateCompany;
