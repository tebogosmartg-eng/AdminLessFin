import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { showSuccess, showError } from '@/utils/toast';

const accountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']),
  code: z.string().optional(),
  description: z.string().optional(),
});

type AccountFormData = z.infer<typeof accountSchema>;
type Account = AccountFormData & { id: string };

const ChartOfAccounts = () => {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      type: 'Asset',
      code: '',
      description: '',
    },
  });

  const fetchAccounts = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('type')
      .order('name');

    if (error) {
      showError('Failed to fetch accounts.');
      console.error(error);
    } else {
      setAccounts(data as Account[]);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [user]);

  const onSubmit = async (formData: AccountFormData) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('accounts')
      .insert([{ ...formData, user_id: user.id }])
      .select();

    if (error) {
      showError('Failed to create account.');
      console.error(error);
    } else {
      showSuccess('Account created successfully!');
      setAccounts([...accounts, ...(data as Account[])]);
      reset();
      setIsDialogOpen(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Chart of Accounts</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add New Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create a New Account</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="name">Account Name</Label>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => <Input id="name" {...field} />}
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <Label htmlFor="type">Account Type</Label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                      <SelectContent>
                        {['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label htmlFor="code">Account Code (Optional)</Label>
                <Controller
                  name="code"
                  control={control}
                  render={({ field }) => <Input id="code" {...field} />}
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => <Input id="description" {...field} />}
                />
              </div>
              <Button type="submit">Create Account</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell>{account.name}</TableCell>
              <TableCell>{account.type}</TableCell>
              <TableCell>{account.code}</TableCell>
              <TableCell>{account.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ChartOfAccounts;