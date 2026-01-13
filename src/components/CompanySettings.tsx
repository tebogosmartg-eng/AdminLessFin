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
import { useEffect, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './ui/alert-dialog';
import { AlertCircle, Upload, X } from 'lucide-react';

const companySchema = z.object({
  name: z.string().min(1, 'Company name is required.'),
  address: z.string().optional(),
  tax_id: z.string().optional(),
  default_invoice_notes: z.string().optional(),
});
type CompanyFormValues = z.infer<typeof companySchema>;

const CompanySettings = () => {
  const { user, activeCompany, refreshProfile } = useAuth();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: '', address: '', tax_id: '', default_invoice_notes: '' },
  });

  useEffect(() => {
    if (activeCompany) {
      form.reset({
        name: activeCompany.name || '',
        address: activeCompany.address || '',
        tax_id: activeCompany.tax_id || '',
        default_invoice_notes: activeCompany.default_invoice_notes || '',
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
    mutationFn: async (values: CompanyFormValues) => {
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

      const { error } = await supabase.functions.invoke('settings', {
        body: {
          method: 'UPDATE_COMPANY',
          company_id: activeCompany.id,
          companyData: { 
            name: values.name, 
            address: values.address || null,
            tax_id: values.tax_id || null,
            default_invoice_notes: values.default_invoice_notes || null,
            logo_url: logoUrl 
          },
        },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      showSuccess('Company information updated successfully.');
      setLogoFile(null);
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
          <CardDescription>This information and logo will appear on your invoices.</CardDescription>
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
              <FormField
                control={form.control}
                name="tax_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax ID / VAT Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., VAT123456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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