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
import { showError, showSuccess } from '../utils/toast';

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required.'),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

interface AssetCategoryFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  category?: { id: string; name: string };
}

const AssetCategoryForm = ({ isOpen, setIsOpen, category }: AssetCategoryFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
  });

  useEffect(() => {
    if (category) {
      form.reset({ name: category.name });
    } else {
      form.reset({ name: '' });
    }
  }, [category, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');
      
      const method = category ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        categoryData: values,
        ...(category && { categoryId: category.id }),
      };

      const { error } = await supabase.functions.invoke('asset-categories', { body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset_categories', activeCompany?.id] });
      showSuccess(`Category ${category ? 'updated' : 'created'}.`);
      setIsOpen(false);
    },
    onError: (error: any) => showError(error.message),
  });

  const onSubmit = (values: CategoryFormValues) => mutation.mutate(values);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit' : 'New'} Asset Category</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Office Equipment" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : 'Save Category'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AssetCategoryForm;