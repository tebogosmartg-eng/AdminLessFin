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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { showError, showSuccess } from '../utils/toast';
import { Employee } from '../pages/Employees';

const employeeSchema = z.object({
  first_name: z.string().min(1, 'First name is required.'),
  last_name: z.string().min(1, 'Last name is required.'),
  email: z.string().email('Invalid email address.').optional().or(z.literal('')),
  phone: z.string().optional(),
  id_number: z.string().optional(),
  tax_number: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  employment_type: z.enum(['permanent', 'contract', 'intern', 'casual']),
  department: z.string().optional(),
  position: z.string().optional(),
  start_date: z.string().min(1, 'Start date is required.'),
  end_date: z.string().optional(),
  salary_amount: z.coerce.number().min(0, 'Salary must be a positive number.').optional().nullable(),
  salary_period: z.enum(['monthly', 'weekly', 'fortnightly']).optional().nullable(),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

interface EmployeeFormProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  employee?: Employee;
}

const EmployeeForm = ({ isOpen, setIsOpen, employee }: EmployeeFormProps) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
  });

  useEffect(() => {
    if (employee) {
      form.reset({
        ...employee,
        email: employee.email || '',
        phone: employee.phone || '',
        id_number: employee.id_number || '',
        tax_number: employee.tax_number || '',
        bank_name: employee.bank_name || '',
        bank_account_number: employee.bank_account_number || '',
        department: employee.department || '',
        position: employee.position || '',
        end_date: employee.end_date || '',
        salary_amount: employee.salary_amount || undefined,
        salary_period: employee.salary_period || undefined,
      });
    } else {
      form.reset({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        id_number: '',
        tax_number: '',
        bank_name: '',
        bank_account_number: '',
        employment_type: 'permanent',
        department: '',
        position: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        salary_amount: undefined,
        salary_period: undefined,
      });
    }
  }, [employee, form, isOpen]);

  const mutation = useMutation({
    mutationFn: async (values: EmployeeFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const employeeData = {
        ...values,
        end_date: values.end_date || null,
        salary_amount: values.salary_amount || null,
        salary_period: values.salary_period || null,
      };

      const method = employee ? 'PUT' : 'POST';
      const body = {
        method,
        company_id: activeCompany.id,
        employeeData,
        ...(employee && { employeeId: employee.id }),
      };

      const { error } = await supabase.functions.invoke('employees', { body });

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees', activeCompany?.id] });
      showSuccess(`Employee ${employee ? 'updated' : 'added'} successfully.`);
      setIsOpen(false);
    },
    onError: (error) => {
      showError(`Error: ${error.message}`);
    },
  });

  const onSubmit = (values: EmployeeFormValues) => {
    mutation.mutate(values);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{employee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
          <DialogDescription>Enter the employee's details below.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto pr-6 flex-1">
            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1">Personal Information</legend>
              <FormField control={form.control} name="first_name" render={({ field }) => (
                <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="last_name" render={({ field }) => (
                <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="id_number" render={({ field }) => (
                <FormItem><FormLabel>ID Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="tax_number" render={({ field }) => (
                <FormItem><FormLabel>Tax Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>

            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1">Employment Details</legend>
              <FormField control={form.control} name="employment_type" render={({ field }) => (
                <FormItem><FormLabel>Employment Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="permanent">Permanent</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="intern">Intern</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="position" render={({ field }) => (
                <FormItem><FormLabel>Position</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="department" render={({ field }) => (
                <FormItem><FormLabel>Department</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div />
              <FormField control={form.control} name="start_date" render={({ field }) => (
                <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="end_date" render={({ field }) => (
                <FormItem><FormLabel>End Date (Optional)</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>

            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1">Salary Information</legend>
              <FormField control={form.control} name="salary_amount" render={({ field }) => (
                  <FormItem><FormLabel>Salary Amount</FormLabel><FormControl><Input type="number" step="0.01" placeholder="e.g., 50000" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="salary_period" render={({ field }) => (
                  <FormItem><FormLabel>Salary Period</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select a period" /></SelectTrigger></FormControl>
                          <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="fortnightly">Fortnightly</SelectItem>
                          </SelectContent>
                      </Select><FormMessage />
                  </FormItem>
              )} />
            </fieldset>

            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1">Bank Details</legend>
              <FormField control={form.control} name="bank_name" render={({ field }) => (
                <FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="bank_account_number" render={({ field }) => (
                <FormItem><FormLabel>Account Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </fieldset>
          </form>
        </Form>
        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button type="submit" onClick={form.handleSubmit(onSubmit)} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save Employee'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeForm;