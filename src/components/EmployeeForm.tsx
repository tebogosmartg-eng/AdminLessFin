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
import { isValidIncomeTaxNumber } from '../lib/sars/sarsNumbers';
import { Checkbox } from './ui/checkbox';
import { ETI_SPECIAL_ECONOMIC_ZONES } from '../lib/sars/sic7Codes';

/** Optional number input: blank → null; otherwise a number in range. */
const optionalNumber = (min: number, max: number, message: string) => z
  .string()
  .optional()
  .refine((value) => !value?.trim() || (Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max), message);

const SA_POSTAL_CODE = /^\d{4}$/;
const optionalPostalCode = z
  .string()
  .optional()
  .refine((value) => !value || SA_POSTAL_CODE.test(value.trim()), 'A South African postal code is 4 digits.');

/** SARS fields saved as null when left blank (the database checks their format). */
const SARS_TEXT_FIELDS = [
  'residential_unit_number', 'residential_complex', 'residential_street_number', 'residential_street_name',
  'residential_suburb', 'residential_city', 'residential_postal_code',
  'postal_address_line1', 'postal_address_line2', 'postal_address_line3', 'postal_code',
  'passport_number', 'passport_country',
] as const;

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
  tax_number: z
    .string()
    .optional()
    .refine((value) => !value?.trim() || isValidIncomeTaxNumber(value), 'Not a valid SARS income tax number (10 digits starting with 0, 1, 2, 3 or 9, and the check digit must match).'),
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
  residential_unit_number: z.string().optional(),
  residential_complex: z.string().optional(),
  residential_street_number: z.string().optional(),
  residential_street_name: z.string().optional(),
  residential_suburb: z.string().optional(),
  residential_city: z.string().optional(),
  residential_postal_code: optionalPostalCode,
  postal_same_as_residential: z.boolean().default(true),
  postal_address_line1: z.string().optional(),
  postal_address_line2: z.string().optional(),
  postal_address_line3: z.string().optional(),
  postal_code: optionalPostalCode,
  bank_account_type: z.enum(['', 'current', 'savings', 'transmission', 'bond', 'credit_card', 'subscription_share', 'foreign']).optional(),
  nature_of_person: z.enum(['auto', 'A', 'B', 'C']).default('auto'),
  passport_number: z.string().optional(),
  ordinary_hours_per_week: optionalNumber(0.01, 168, 'Ordinary hours per week must be between 0 and 168.'),
  eti_employment_date: z.string().optional(),
  eti_sez_code: z.enum(['none', 'COE', 'DTP', 'EAL', 'MAP', 'SLB', 'RIB']).default('none'),
  eti_domestic_worker: z.boolean().default(false),
  eti_connected_person: z.boolean().default(false),
  eti_prior_qualifying_months: optionalNumber(0, 24, 'Between 0 and 24 months.'),
  wage_regulating_minimum_hourly: optionalNumber(0, 10_000, 'Enter an hourly rate.'),
  passport_country: z
    .string()
    .optional()
    .refine((value) => !value || /^[A-Za-z]{2}$/.test(value.trim()), 'Use the 2-letter country code, e.g. ZW, MZ, GB.'),
}).refine(
  (values) => !values.passport_number?.trim() || !!values.passport_country?.trim(),
  { path: ['passport_country'], message: 'Which country issued the passport?' }
);

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
        ...Object.fromEntries(SARS_TEXT_FIELDS.map((key) => [key, employee[key] || ''])),
        postal_same_as_residential: employee.postal_same_as_residential !== false,
        bank_account_type: (employee.bank_account_type ?? '') as EmployeeFormValues['bank_account_type'],
        nature_of_person: employee.nature_of_person ?? 'auto',
        ordinary_hours_per_week: employee.ordinary_hours_per_week != null ? String(employee.ordinary_hours_per_week) : '',
        eti_employment_date: employee.eti_employment_date || '',
        eti_sez_code: (employee.eti_sez_code ?? 'none') as EmployeeFormValues['eti_sez_code'],
        eti_domestic_worker: employee.eti_domestic_worker === true,
        eti_connected_person: employee.eti_connected_person === true,
        eti_prior_qualifying_months: employee.eti_prior_qualifying_months ? String(employee.eti_prior_qualifying_months) : '',
        wage_regulating_minimum_hourly: employee.wage_regulating_minimum_hourly != null ? String(employee.wage_regulating_minimum_hourly) : '',
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
        ...Object.fromEntries(SARS_TEXT_FIELDS.map((key) => [key, ''])),
        postal_same_as_residential: true,
        bank_account_type: '',
        nature_of_person: 'auto',
        ordinary_hours_per_week: '',
        eti_employment_date: '',
        eti_sez_code: 'none',
        eti_domestic_worker: false,
        eti_connected_person: false,
        eti_prior_qualifying_months: '',
        wage_regulating_minimum_hourly: '',
      });
    }
  });

  const postalSameAsResidential = form.watch('postal_same_as_residential');

  const mutation = useMutation({
    mutationFn: async (values: EmployeeFormValues) => {
      if (!activeCompany) throw new Error('No active company selected');

      const employeeData = {
        ...values,
        end_date: values.end_date || null,
        date_of_birth: values.date_of_birth || null,
        salary_amount: values.salary_amount || null,
        salary_period: values.salary_period || null,
        ...Object.fromEntries(SARS_TEXT_FIELDS.map((key) => [key, values[key]?.trim() || null])),
        passport_country: values.passport_country?.trim().toUpperCase() || null,
        bank_account_type: values.bank_account_type || null,
        nature_of_person: values.nature_of_person === 'auto' ? null : values.nature_of_person,
        ordinary_hours_per_week: values.ordinary_hours_per_week?.trim() ? Number(values.ordinary_hours_per_week) : null,
        eti_employment_date: values.eti_employment_date || null,
        eti_sez_code: values.eti_sez_code === 'none' ? null : values.eti_sez_code,
        eti_domestic_worker: values.eti_domestic_worker,
        eti_connected_person: values.eti_connected_person,
        eti_prior_qualifying_months: values.eti_prior_qualifying_months?.trim() ? Number(values.eti_prior_qualifying_months) : 0,
        wage_regulating_minimum_hourly: values.wage_regulating_minimum_hourly?.trim() ? Number(values.wage_regulating_minimum_hourly) : null,
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
      // Payroll run warnings are worked out from employee records: refresh open runs.
      queryClient.invalidateQueries({ queryKey: ['payroll_run_detail'] });
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

            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md" data-testid="employee-sars-details">
              <legend className="text-sm font-medium px-1">SARS Details (IRP5)</legend>
              <p className="md:col-span-2 text-xs text-muted-foreground">
                SARS needs these on the employee's tax certificate. Payroll runs list employees whose details are missing.
              </p>
              <FormField control={form.control} name="nature_of_person" render={({ field }) => (
                <FormItem><FormLabel>Nature of Person</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger aria-label="Nature of person"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="auto">Work it out from the ID or passport</SelectItem>
                      <SelectItem value="A">A – Individual with an ID or passport number</SelectItem>
                      <SelectItem value="B">B – Individual without an ID or passport number</SelectItem>
                      <SelectItem value="C">C – Director of a private company / member of a CC</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
              )} />
              <div />
              <FormField control={form.control} name="passport_number" render={({ field }) => (
                <FormItem><FormLabel>Passport Number</FormLabel><FormControl><Input {...field} /></FormControl>
                  <FormDescription>For employees without a South African ID.</FormDescription><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="passport_country" render={({ field }) => (
                <FormItem><FormLabel>Passport Country</FormLabel>
                  <FormControl><Input {...field} maxLength={2} placeholder="e.g. ZW" className="uppercase" /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="md:col-span-2 text-sm font-medium pt-2">Residential Address</div>
              <FormField control={form.control} name="residential_unit_number" render={({ field }) => (
                <FormItem><FormLabel>Unit Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="residential_complex" render={({ field }) => (
                <FormItem><FormLabel>Complex</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="residential_street_number" render={({ field }) => (
                <FormItem><FormLabel>Street Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="residential_street_name" render={({ field }) => (
                <FormItem><FormLabel>Street or Farm Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="residential_suburb" render={({ field }) => (
                <FormItem><FormLabel>Suburb or District</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="residential_city" render={({ field }) => (
                <FormItem><FormLabel>City or Town</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="residential_postal_code" render={({ field }) => (
                <FormItem><FormLabel>Postal Code</FormLabel><FormControl><Input {...field} inputMode="numeric" maxLength={4} /></FormControl><FormMessage /></FormItem>
              )} />
              <div />
              <FormField control={form.control} name="postal_same_as_residential" render={({ field }) => (
                <FormItem className="md:col-span-2 flex items-center gap-2 space-y-0">
                  <FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl>
                  <FormLabel className="font-normal">Postal address is the same as the residential address</FormLabel>
                </FormItem>
              )} />
              {!postalSameAsResidential && (
                <>
                  <FormField control={form.control} name="postal_address_line1" render={({ field }) => (
                    <FormItem><FormLabel>Postal Address Line 1</FormLabel><FormControl><Input {...field} placeholder="e.g. PO Box 123" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="postal_address_line2" render={({ field }) => (
                    <FormItem><FormLabel>Postal Address Line 2</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="postal_address_line3" render={({ field }) => (
                    <FormItem><FormLabel>Postal Address Line 3</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="postal_code" render={({ field }) => (
                    <FormItem><FormLabel>Postal Address Code</FormLabel><FormControl><Input {...field} inputMode="numeric" maxLength={4} /></FormControl><FormMessage /></FormItem>
                  )} />
                </>
              )}
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

            <fieldset className="grid grid-cols-1 md:grid-cols-2 gap-4 border p-4 rounded-md" data-testid="employee-eti-details">
              <legend className="text-sm font-medium px-1">Hours and Employment Tax Incentive</legend>
              <FormField control={form.control} name="ordinary_hours_per_week" render={({ field }) => (
                <FormItem><FormLabel>Ordinary Hours per Week</FormLabel>
                  <FormControl><Input {...field} type="number" step="0.5" min="0" placeholder="e.g. 40" /></FormControl>
                  <FormDescription>Used for ETI hours and the minimum-wage check.</FormDescription><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="eti_employment_date" render={({ field }) => (
                <FormItem><FormLabel>First Employed On</FormLabel>
                  <FormControl><Input {...field} type="date" /></FormControl>
                  <FormDescription>Only if different from the start date (e.g. re-employed).</FormDescription><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="eti_sez_code" render={({ field }) => (
                <FormItem><FormLabel>Special Economic Zone</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger aria-label="Special economic zone"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="none">Not in a special economic zone</SelectItem>
                      {ETI_SPECIAL_ECONOMIC_ZONES.map(([code, name]) => <SelectItem key={code} value={code}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormDescription>Mainly works in an SEZ where the employer trades: no ETI age limit.</FormDescription><FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="eti_prior_qualifying_months" render={({ field }) => (
                <FormItem><FormLabel>ETI Months Already Claimed</FormLabel>
                  <FormControl><Input {...field} type="number" min="0" max="24" placeholder="0" /></FormControl>
                  <FormDescription>Months claimed before this system (e.g. a previous payroll).</FormDescription><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="wage_regulating_minimum_hourly" render={({ field }) => (
                <FormItem><FormLabel>Sectoral Minimum Wage per Hour</FormLabel>
                  <FormControl><Input {...field} type="number" step="0.01" min="0" placeholder="Only if above the national minimum" /></FormControl>
                  <FormMessage /></FormItem>
              )} />
              <div className="space-y-2">
                <FormField control={form.control} name="eti_domestic_worker" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl>
                    <FormLabel className="font-normal">Domestic worker (no ETI)</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="eti_connected_person" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} /></FormControl>
                    <FormLabel className="font-normal">Connected person to the employer (no ETI)</FormLabel>
                  </FormItem>
                )} />
              </div>
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
              <FormField control={form.control} name="bank_account_type" render={({ field }) => (
                <FormItem><FormLabel>Account Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl><SelectTrigger aria-label="Account type"><SelectValue placeholder="Select an account type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="current">Current / Cheque</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value="transmission">Transmission</SelectItem>
                      <SelectItem value="bond">Bond</SelectItem>
                      <SelectItem value="credit_card">Credit card</SelectItem>
                      <SelectItem value="subscription_share">Subscription share</SelectItem>
                      <SelectItem value="foreign">Foreign bank account</SelectItem>
                    </SelectContent>
                  </Select><FormMessage />
                </FormItem>
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