import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from './ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { showError, showSuccess } from '../utils/toast';
import { Vendor } from '../pages/Vendors';

const vendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required.'),
  contact_name: z.string().optional(),
  email: z.string().email('Invalid email address.').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type VendorFormValues = z.infer<typeof vendorSchema>;

interface VendorFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  vendor?: Vendor;
}

const VendorForm = ({ isOpen, setIsOpen, vendor }: VendorFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: '',
      contact_name: '',
      email: '',
      phone: '',
      address: '',
    },
  });

  useEffect(() => {
    if (vendor) {
      form.reset({
        name: vendor.name,
        contact_name: vendor.contact_name || '',
        email: vendor.email || '',
        phone: vendor.phone || '',
        address: vendor.address || '',
      });
    } else {
      form.reset({
        name: '',
        contact_name: '',
        email: '',
        phone: '',
        address: '',
      });
    }
  }, [vendor, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (values: VendorFormValues) => {
      if (!user) throw new Error('User not authenticated');

      const vendorData = {
        ...values,
        user_id: user.id,
      };

      const { error } = vendor
        ? await supabase.from('vendors').update(vendorData).eq('id', vendor.id)
        : await supabase.from('vendors').insert(vendorData);

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      showSuccess(`Vendor ${vendor ? 'updated' : 'created'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: VendorFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{vendor ? 'Edit Vendor' : 'Add New Vendor'}</DialogTitle>
          <DialogDescription>Enter the details for the vendor below.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Vendor Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Office Supplies Co." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact Name (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Jane Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (Optional)</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="e.g., contact@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., (555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="e.g., 123 Main St, Anytown, USA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Vendor'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default VendorForm;