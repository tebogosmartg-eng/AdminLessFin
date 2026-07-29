import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../integrations/supabase/client';
import { useAuth } from '../contexts/AuthContext';
import { useEnterpriseIdentity } from '../hooks/useEnterpriseIdentity';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { showError, showSuccess } from '../utils/toast';

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  role: z.enum(['admin', 'member']),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

interface InviteMemberDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const InviteMemberDialog = ({ isOpen, setIsOpen }: InviteMemberDialogProps) => {
  const { activeCompany } = useAuth();
  const { identity } = useEnterpriseIdentity(activeCompany?.id);
  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' },
  });

  const mutation = useMutation({
    mutationFn: async (values: InviteFormValues) => {
      if (!activeCompany) throw new Error('No active company');
      
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: values.email,
          role: values.role,
          company_id: activeCompany.id,
        },
      });

      if (error) throw error;
      
      // The edge function might return its own error in the body
      if (data.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      showSuccess('Invitation sent successfully!');
      setIsOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      const errorMessage = error.context?.error?.message || error.message;
      showError(`Error sending invitation: ${errorMessage}`);
    },
  });

  const onSubmit = (values: InviteFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            Enter the email address of the person you want to invite to '{identity?.name || 'Your Company'}'.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Sending...' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteMemberDialog;