import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { AlertCircle, Upload, X, Database } from 'lucide-react';
import { companyService } from '@/governance/domains/company/service';

/**
 * G3.6C — Company tab no longer edits enterprise identity (name/address/tax).
 * Those live exclusively in Settings → Master Data. This surface keeps only
 * operational branding (logo) and invoice notes.
 */
const companyOpsSchema = z.object({
  default_invoice_notes: z.string().optional(),
  default_quote_terms: z.string().optional(),
});
type CompanyOpsValues = z.infer<typeof companyOpsSchema>;

const CompanySettings = () => {
  const { user, activeCompany, refreshProfile } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const form = useForm<CompanyOpsValues>({
    resolver: zodResolver(companyOpsSchema),
    defaultValues: { default_invoice_notes: '', default_quote_terms: '' },
  });

  useEffect(() => {
    if (activeCompany) {
      form.reset({
        default_invoice_notes: activeCompany.default_invoice_notes || '',
        default_quote_terms: (activeCompany as { default_quote_terms?: string }).default_quote_terms || '',
      });
      setPreviewUrl(activeCompany.logo_url || null);
    }
  }, [activeCompany, form]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (values: CompanyOpsValues) => {
      if (!user || !activeCompany) throw new Error('User not authenticated or no active company');

      let logoUrl = activeCompany.logo_url;

      if (logoFile) {
        const fileExt = logoFile.name.split('.').pop();
        const fileName = `logo-${Date.now()}.${fileExt}`;
        const filePath = `${activeCompany.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(filePath, logoFile, { upsert: true });

        if (uploadError) throw new Error(`Logo Upload Error: ${uploadError.message}`);

        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        logoUrl = urlData.publicUrl;
      }

      // Identity fields are NOT written here — Enterprise Master Data owns them.
      const result = await companyService.updateCompanyProfile(activeCompany.id, {
        defaultInvoiceNotes: values.default_invoice_notes || null,
        defaultQuoteTerms: values.default_quote_terms || null,
        logoUrl,
      });
      if (!result.success) throw new Error(result.error || 'Failed to update company information.');
    },
    onSuccess: async () => {
      await refreshProfile();
      showSuccess('Company branding updated successfully.');
      setLogoFile(null);
    },
    onError: (error: any) => {
      showError(`Error updating company information: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompany) throw new Error('No active company');
      const result = await companyService.deleteCompany(activeCompany.id);
      if (!result.success) throw new Error(result.error || 'Failed to delete company.');
    },
    onSuccess: async () => {
      await refreshProfile();
      showSuccess('Company deleted successfully.');
    },
    onError: (error: any) => {
      showError(`Error deleting company: ${error.message}`);
    },
  });

  const onSubmit = (values: CompanyOpsValues) => updateMutation.mutate(values);
  const isOwner = user?.id === activeCompany?.owner_id;
  const displayName = identity?.name || 'Company';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Enterprise Identity</CardTitle>
          <CardDescription>
            Legal name, addresses, and tax registrations are maintained once in Master Data and
            consumed across invoices, quotes, financial statements, emails, and reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Registered name</dt>
              <dd className="font-medium">{identity?.name || 'Not configured'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="font-medium whitespace-pre-wrap">{identity?.address || 'Not configured'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tax ID</dt>
              <dd className="font-medium">{identity?.taxId || 'Not configured'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Registration number</dt>
              <dd className="font-medium">{identity?.registrationNumber || 'Not configured'}</dd>
            </div>
          </dl>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings?tab=master-data&module=company_profile">
              <Database className="mr-2 h-4 w-4" />
              Manage in Master Data
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding &amp; Invoice Defaults</CardTitle>
          <CardDescription>Logo and default invoice notes (operational, not legal identity).</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <FormLabel>Company Logo</FormLabel>
                <div className="flex items-center gap-4">
                  {previewUrl ? (
                    <div className="relative border rounded-md p-1 h-20 w-20 flex items-center justify-center bg-gray-50">
                      <img src={previewUrl} alt="Logo Preview" className="max-h-full max-w-full object-contain" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={() => { setLogoFile(null); setPreviewUrl(null); }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="h-20 w-20 border-2 border-dashed rounded-md flex items-center justify-center text-muted-foreground bg-gray-50">
                      <Upload className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Recommended size: 200x200px (PNG or JPG)</p>
                  </div>
                </div>
              </div>

              <FormField
                control={form.control}
                name="default_invoice_notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Invoice Notes / Terms</FormLabel>
                    <FormControl>
                      <Textarea placeholder="e.g. Bank Account: 123456. Payment due within 30 days." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_quote_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Quotation Terms &amp; Conditions</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder="e.g. Quotation valid for 30 days. 50% deposit on acceptance. E&amp;OE."
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Prefilled into every new quotation. Editing this never changes a quotation
                      that has already been issued.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save Branding'}
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
                    <strong> "{displayName}"</strong> and all of its associated data, including accounts, transactions, invoices, and bills.
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
