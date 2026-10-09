import { useRef } from 'react';
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
import { FormDialog } from './ui/form-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
import { useDialogFormReset } from '../hooks/useDialogFormReset';
import { PayComponentEditor } from './payroll/PayComponentEditor';
import { birthDateFromSaId } from '../lib/payrollRulesEngine/periodEmployment';

const employeeSchema = z.object({
  first_name: z.string().min(1, 'First name is required.'),
  last_name: z.string().min(1, 'Last name is required.'),
  email: z.string().email('Invalid email address.').optional().or(z.literal('')),
  phone: z.string().optional(),
  id_number: z
    .string()
    .optional()
    .refine(
      (value) => {
        const digits = (value ?? '').replace(/\s/g, '');
        // 13 digits means an SA ID, which must pass its check digit; other values (passports) are kept as entered.
        return !/^\d{13}$/.test(digits) || !!birthDateFromSaId(digits, new Date().toISOString().slice(0, 10));
      },
      'This is not a valid South African ID number (check digit or birth date is wrong).'
    ),
  date_of_birth: z.string().optional(),
  tax_number: z.string().optional(),
  bank_name: z.string().optional(),
  bank_branch_code: z.string().optional(),
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

  useDialogFormReset(isOpen, employee?.id ?? 'new', () => {
    if (employee) {
      form.reset({
        ...employee,
        email: employee.email || '',
        phone: employee.phone || '',
        id_number: employee.id_number || '',
        date_of_birth: employee.date_of_birth || '',
        tax_number: employee.tax_number || '',
        bank_name: employee.bank_name || '',
        bank_branch_code: employee.bank_branch_code || '',
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
        date_of_birth: '',
        tax_number: '',
        bank_name: '',
        bank_branch_code: '',
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
  });

  const mutation = useMutation({
    mutationFn: async (values: EmployeeFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const employeeData = {
        ...values,
        end_date: values.end_date || null,
        date_of_birth: values.date_of_birth || null,
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

  const submitLock = useRef(false);
  // Two rapid clicks can both pass async validation before isPending
  // re-renders; the ref closes that window so one save creates one record.
  const onSubmit = (values: EmployeeFormValues) => {
    if (submitLock.current) return;
    submitLock.current = true;
    mutation.mutate(values, { onSettled: () => { submitLock.current = false; } });
  };

  return (
    <FormDialog open={isOpen} onOpenChange={setIsOpen} dirty={form.formState.isDirty || mutation.isPending}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{employee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
          <DialogDescription>
            {employee
              ? `Employee number ${employee.employee_number} is permanent and cannot be changed.`
              : 'Enter the employee\'s details below. An employee number will be assigned automatically.'}
          </DialogDescription>
        </DialogHeader>
        {employee && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Employee Number: </span>
            <span className="font-mono font-medium">{employee.employee_number}</span>
          </div>
        )}
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
              <FormField control={form.control} name="date_of_birth" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Birth</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormDescription>Needed when there is no SA ID number (e.g. a passport). Used for the age 65 and 75 tax rebates.</FormDescription>
                  <FormMessage />
                </FormItem>
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

            {employee && activeCompany && (
              <fieldset className="border p-4 rounded-md space-y-3">
                <legend className="text-sm font-medium px-1">Pay package</legend>
                <p className="text-sm text-muted-foreground">
                  Standing travel, subsistence, bonus, other allowances, and taxable benefits. They are included the next time payslips are generated.
                </p>
                <PayComponentEditor companyId={activeCompany.id} mode="package" employeeId={employee.id} />
              </fieldset>
            )}

            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md">
              <legend className="text-sm font-medium px-1">Bank Details</legend>
              <FormField control={form.control} name="bank_name" render={({ field }) => (
                <FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="bank_branch_code" render={({ field }) => (
                <FormItem><FormLabel>Branch Code</FormLabel><FormControl><Input {...field} placeholder="e.g. 250655" /></FormControl><FormMessage /></FormItem>
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
    </FormDialog>
  );
};

export default EmployeeForm;