import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { showSuccess, showError } from '@/utils/toast';

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(['Asset', 'Liability', 'Equity', 'Income', 'Expense'], {
    required_error: "Account type is required.",
  }),
  description: z.string().optional(),
});

type AccountFormData = z.infer<typeof accountSchema>;

const addAccount = async ({ user, accountData }: { user: any, accountData: AccountFormData }) => {
  if (!user) throw new Error("User not authenticated");
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .insert([{ ...accountData, user_id: user.id }])
    .select();

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

export function AddAccountDialog() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { control, handleSubmit, formState: { errors }, register, reset } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
  });

  const mutation = useMutation({
    mutationFn: (accountData: AccountFormData) => addAccount({ user, accountData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showSuccess('Account created successfully!');
      reset();
      setOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (data: AccountFormData) => {
    mutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add New Account</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Account</DialogTitle>
          <DialogDescription>
            Create a new account for your chart of accounts.
          </DialogDescription>
        </DialogHeader>
        <form id="add-account-form" onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register('name')} />
              {errors.name && <p className="text-red-500 text-sm">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asset">Asset</SelectItem>
                      <SelectItem value="Liability">Liability</SelectItem>
                      <SelectItem value="Equity">Equity</SelectItem>
                      <SelectItem value="Income">Income</SelectItem>
                      <SelectItem value="Expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.type && <p className="text-red-500 text-sm">{errors.type.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" {...register('description')} />
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="submit" form="add-account-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save Account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}