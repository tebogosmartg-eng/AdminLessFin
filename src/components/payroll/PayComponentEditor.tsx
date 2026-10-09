import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../integrations/supabase/client';
import type { Json } from '../../integrations/supabase/database.types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { showError, showSuccess } from '../../utils/toast';
import { formatCurrency } from '../../lib/utils';
import {
  PAY_COMPONENT_CATALOG,
  assemblePayComponents,
  isComponentEffective,
  type PayComponentCode,
} from '../../lib/payrollRulesEngine/payComponents';
import { previewEmployeePay } from '../../lib/payrollRulesEngine/previewPayComponents';
import { periodsPerYearFor, salaryForPayPeriod } from '../../lib/payrollRulesEngine/paye';
import { resolveRuleSetForDate } from '../../lib/statutoryPayrollEngine/registry';

type ComponentRow = {
  id: string;
  employee_id: string;
  component_code: string;
  config: Record<string, unknown>;
};

type EmployeeOption = {
  id: string;
  first_name: string;
  last_name: string;
  salary_amount: number | null;
  salary_period: 'monthly' | 'weekly' | 'fortnightly' | null;
};

type PayComponentEditorProps = {
  companyId: string;
  mode: 'package' | 'period';
  employeeId?: string;
  payrollRunId?: string;
  payDate?: string;
  /** Frequency of the run (period mode): only its employees are listed, and the preview is per pay period. */
  payFrequency?: 'monthly' | 'fortnightly' | 'weekly';
};

const EMPTY = {
  code: 'travel_allowance' as PayComponentCode,
  amount: '',
  days: '',
  method: 'deemed_80',
  taxable: 'yes',
  label: '',
  dailyRate: '',
  onceOff: '',
  incidentalOnly: 'no',
  determinedValue: '',
  maintenancePlan: 'no',
  mainlyBusinessUse: 'no',
  monthlyPremium: '',
  loanBalance: '',
  actualRate: '',
  monthlyRental: '',
  furnished: 'no',
  monthlyValue: '',
};

function configFromForm(form: typeof EMPTY, mode: 'package' | 'period'): Record<string, unknown> {
  const amount = Number(form.amount);
  switch (form.code) {
    case 'travel_allowance':
      return { monthlyAllowance: amount, method: form.method };
    case 'subsistence':
      return { days: Number(form.days), amountPaid: amount, domestic: true, incidentalOnly: form.incidentalOnly === 'yes' };
    case 'bonus':
      return { amount };
    case 'leave_payout':
      return form.amount
        ? { amount }
        : { days: Number(form.days), dailyRate: Number(form.dailyRate) };
    case 'other_cash': {
      const onceOff = form.onceOff ? form.onceOff === 'yes' : mode === 'period';
      return { amount, taxable: form.taxable === 'yes', label: form.label, onceOff };
    }
    case 'fringe_company_car':
      return {
        determinedValue: Number(form.determinedValue),
        maintenancePlan: form.maintenancePlan === 'yes',
        mainlyBusinessUse: form.mainlyBusinessUse === 'yes',
      };
    case 'fringe_employer_insurance':
      return { monthlyPremium: Number(form.monthlyPremium) };
    case 'fringe_low_interest_loan':
      return { loanBalance: Number(form.loanBalance), actualInterestRateAnnual: Number(form.actualRate) };
    case 'fringe_accommodation':
      return { monthlyRentalValue: Number(form.monthlyRental), furnished: form.furnished === 'yes' };
    case 'fringe_asset':
      return { monthlyValueOfUse: Number(form.monthlyValue) };
    case 'fringe_other':
      return { monthlyValue: Number(form.monthlyValue), label: form.label };
    default:
      return { amount };
  }
}

/**
 * Checks an entry with the same rules payslip generation uses, so a value that
 * would be refused or silently dropped at generation is refused here instead.
 */
function validationError(code: PayComponentCode, config: Record<string, unknown>, mode: 'package' | 'period', payDate?: string): string | null {
  try {
    const ruleSet = resolveRuleSetForDate(payDate ?? new Date().toISOString().slice(0, 10));
    const assembly = assemblePayComponents([{ componentCode: code, config, source: mode }], ruleSet);
    if (!assembly.lines.length) return 'Enter an amount greater than zero.';
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'This entry cannot be calculated.';
  }
}

function describeConfig(code: string, config: Record<string, unknown>): string {
  const amount = config.amount ?? config.monthlyAllowance ?? config.amountPaid ?? config.determinedValue ?? config.monthlyPremium ?? config.monthlyValue ?? config.monthlyRentalValue ?? config.monthlyValueOfUse ?? config.loanBalance;
  if (code === 'subsistence') return `${config.days ?? 0} days, ${formatCurrency(Number(config.amountPaid ?? 0))}`;
  if (amount == null || Number.isNaN(Number(amount))) return code;
  return formatCurrency(Number(amount));
}

export function PayComponentEditor({
  companyId,
  mode,
  employeeId,
  payrollRunId,
  payDate,
  payFrequency = 'monthly',
}: PayComponentEditorProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeId ?? '');
  const queryKey = ['pay_components', mode, companyId, employeeId, payrollRunId];

  const { data: rows = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      if (mode === 'package') {
        const { data, error } = await supabase
          .from('employee_pay_components')
          .select('id, employee_id, component_code, config')
          .eq('company_id', companyId)
          .eq('employee_id', employeeId!);
        if (error) throw error;
        return (data ?? []) as ComponentRow[];
      }
      const { data, error } = await supabase
        .from('payroll_period_inputs')
        .select('id, employee_id, component_code, config')
        .eq('company_id', companyId)
        .eq('payroll_run_id', payrollRunId!);
      if (error) throw error;
      return (data ?? []) as ComponentRow[];
    },
    enabled: !!companyId && (mode === 'period' ? !!payrollRunId : !!employeeId),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['pay_component_employees', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, salary_amount, salary_period')
        .eq('company_id', companyId)
        .order('last_name');
      if (error) throw error;
      return (data ?? []) as EmployeeOption[];
    },
    enabled: mode === 'period' && !!companyId,
    // A run pays only the employees on its frequency.
    select: (rows: EmployeeOption[]) => rows.filter((e) => (e.salary_period ?? 'monthly') === payFrequency),
  });

  const save = useMutation({
    mutationFn: async () => {
      const targetEmployee = mode === 'package' ? employeeId : selectedEmployeeId;
      if (!targetEmployee) throw new Error('Choose an employee.');
      const plain = configFromForm(form, mode);
      const invalid = validationError(form.code, plain, mode, payDate);
      if (invalid) throw new Error(invalid);
      const config = plain as Json;
      if (mode === 'package') {
        const { error } = await supabase.from('employee_pay_components').upsert({
          company_id: companyId,
          employee_id: targetEmployee,
          component_code: form.code,
          config,
          active: true,
        }, { onConflict: 'employee_id,component_code' });
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('payroll_period_inputs').upsert({
        company_id: companyId,
        payroll_run_id: payrollRunId!,
        employee_id: targetEmployee,
        component_code: form.code,
        config,
      }, { onConflict: 'payroll_run_id,employee_id,component_code' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      showSuccess(mode === 'package' ? 'Pay package saved.' : 'Period input saved. Regenerate payslips to apply it.');
    },
    onError: (error: Error) => showError(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const query = mode === 'package'
        ? supabase.from('employee_pay_components').delete().eq('id', id).eq('company_id', companyId)
        : supabase.from('payroll_period_inputs').delete().eq('id', id).eq('company_id', companyId);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      showSuccess('Removed.');
    },
    onError: (error: Error) => showError(error.message),
  });

  // The run preview includes the employee's standing package, exactly as generation does.
  const { data: packageRows = [] } = useQuery({
    queryKey: ['pay_components', 'package-for-preview', companyId, selectedEmployeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_pay_components')
        .select('id, employee_id, component_code, config, active, effective_from, effective_to')
        .eq('company_id', companyId)
        .eq('employee_id', selectedEmployeeId)
        .eq('active', true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: mode === 'period' && !!companyId && !!selectedEmployeeId,
  });

  const previewEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const preview = useMemo(() => {
    if (mode !== 'period' || !previewEmployee?.salary_amount || !payDate) return null;
    const mine = rows.filter((row) => row.employee_id === previewEmployee.id);
    try {
      return previewEmployeePay({
        monthlyBasic: salaryForPayPeriod(previewEmployee.salary_amount, previewEmployee.salary_period ?? 'monthly', periodsPerYearFor(payFrequency)),
        periodsPerYear: periodsPerYearFor(payFrequency),
        packageComponents: packageRows
          .filter((row) => isComponentEffective(row, payDate))
          .map((row) => ({ componentCode: row.component_code, config: (row.config ?? {}) as Record<string, unknown> })),
        periodInputs: mine.map((row) => ({ componentCode: row.component_code, config: row.config ?? {} })),
        payDate,
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Preview failed' };
    }
  }, [mode, previewEmployee, payDate, rows, packageRows, payFrequency]);

  const set = (patch: Partial<typeof EMPTY>) => setForm((current) => ({ ...current, ...patch }));

  return (
    <div className="space-y-4">
      {mode === 'period' && (
        <div className="space-y-1">
          <Label>Employee</Label>
          <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.first_name} {employee.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Component</Label>
          <Select value={form.code} onValueChange={(code) => set({ code: code as PayComponentCode })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAY_COMPONENT_CATALOG
                // Leave paid out is once-off: run inputs only.
                .filter((item) => mode === 'period' || item.code !== 'leave_payout')
                .map((item) => (
                  <SelectItem key={item.code} value={item.code}>{item.payslipLabel}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {form.code === 'leave_payout' && (
          <>
            <div className="space-y-1">
              <Label>Leave days paid out</Label>
              <Input type="number" step="0.5" min="0" value={form.days} onChange={(event) => set({ days: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Daily rate</Label>
              <Input type="number" step="0.01" min="0" value={form.dailyRate} onChange={(event) => set({ dailyRate: event.target.value })} />
            </div>
            <p className="md:col-span-2 text-xs text-muted-foreground">
              Or enter the total below instead of days × rate. Leave paid out is taxed once as an annual payment (IRP5 3605).
            </p>
          </>
        )}
        {(form.code === 'travel_allowance' || form.code === 'bonus' || form.code === 'other_cash' || form.code === 'subsistence' || form.code === 'leave_payout') && (
          <div className="space-y-1">
            <Label>{form.code === 'subsistence' ? 'Amount paid' : 'Amount'}</Label>
            <Input type="number" step="0.01" value={form.amount} onChange={(event) => set({ amount: event.target.value })} />
          </div>
        )}
        {form.code === 'subsistence' && (
          <div className="space-y-1">
            <Label>Days away (overnight)</Label>
            <Input type="number" step="1" min="1" max="31" value={form.days} onChange={(event) => set({ days: event.target.value })} />
          </div>
        )}
        {form.code === 'subsistence' && (
          <div className="space-y-1">
            <Label>Meals and lodging</Label>
            <Select value={form.incidentalOnly} onValueChange={(incidentalOnly) => set({ incidentalOnly })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Employee pays (meals and incidentals rate)</SelectItem>
                <SelectItem value="yes">Employer provides (incidentals-only rate)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {form.code === 'travel_allowance' && (
          <div className="space-y-1">
            <Label>Tax method</Label>
            <Select value={form.method} onValueChange={(method) => set({ method })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deemed_80">80% taxable (no logbook)</SelectItem>
                <SelectItem value="deemed_20">20% taxable (80%+ business use)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {form.code === 'other_cash' && (
          <>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input value={form.label} onChange={(event) => set({ label: event.target.value })} placeholder="Housing, cell, uniform" />
            </div>
            <div className="space-y-1">
              <Label>Taxable</Label>
              <Select value={form.taxable} onValueChange={(taxable) => set({ taxable })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Paid</Label>
              <Select
                value={form.onceOff || (mode === 'period' ? 'yes' : 'no')}
                onValueChange={(onceOff) => set({ onceOff })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Every month</SelectItem>
                  <SelectItem value="yes">Once-off (taxed as an annual payment)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {form.code === 'fringe_company_car' && (
          <>
            <div className="space-y-1">
              <Label>Determined value</Label>
              <Input type="number" step="0.01" value={form.determinedValue} onChange={(event) => set({ determinedValue: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Maintenance plan at purchase</Label>
              <Select value={form.maintenancePlan} onValueChange={(maintenancePlan) => set({ maintenancePlan })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No (3.5% of determined value)</SelectItem>
                  <SelectItem value="yes">Yes (3.25% of determined value)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Business use</Label>
              <Select value={form.mainlyBusinessUse} onValueChange={(mainlyBusinessUse) => set({ mainlyBusinessUse })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Under 80% (80% of the benefit is taxed monthly)</SelectItem>
                  <SelectItem value="yes">80% or more (20% of the benefit is taxed monthly)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {form.code === 'fringe_employer_insurance' && (
          <div className="space-y-1">
            <Label>Monthly premium</Label>
            <Input type="number" step="0.01" value={form.monthlyPremium} onChange={(event) => set({ monthlyPremium: event.target.value })} />
          </div>
        )}
        {form.code === 'fringe_low_interest_loan' && (
          <>
            <div className="space-y-1">
              <Label>Loan balance</Label>
              <Input type="number" step="0.01" value={form.loanBalance} onChange={(event) => set({ loanBalance: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Actual annual interest rate</Label>
              <Input type="number" step="0.001" value={form.actualRate} onChange={(event) => set({ actualRate: event.target.value })} placeholder="0.05" />
            </div>
          </>
        )}
        {form.code === 'fringe_accommodation' && (
          <>
            <div className="space-y-1">
              <Label>Monthly rental value</Label>
              <Input type="number" step="0.01" value={form.monthlyRental} onChange={(event) => set({ monthlyRental: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Furnished</Label>
              <Select value={form.furnished} onValueChange={(furnished) => set({ furnished })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {(form.code === 'fringe_asset' || form.code === 'fringe_other') && (
          <div className="space-y-1">
            <Label>Monthly value</Label>
            <Input type="number" step="0.01" value={form.monthlyValue} onChange={(event) => set({ monthlyValue: event.target.value })} />
          </div>
        )}
        {form.code === 'fringe_other' && (
          <div className="space-y-1">
            <Label>Label</Label>
            <Input value={form.label} onChange={(event) => set({ label: event.target.value })} />
          </div>
        )}
      </div>

      <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Saving...' : mode === 'package' ? 'Save on package' : 'Save for this run'}
      </Button>

      <ul className="space-y-2 text-sm">
        {rows.map((row) => {
          const definition = PAY_COMPONENT_CATALOG.find((item) => item.code === row.component_code);
          const who = mode === 'period'
            ? employees.find((employee) => employee.id === row.employee_id)
            : null;
          return (
            <li key={row.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
              <span>
                {who ? `${who.first_name} ${who.last_name} — ` : ''}
                {definition?.payslipLabel ?? row.component_code}: {describeConfig(row.component_code, row.config ?? {})}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove.mutate(row.id)}>Remove</Button>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-muted-foreground">None saved yet.</li>}
      </ul>

      {preview && 'result' in preview && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-1">
          <p>Cash gross: <span className="font-mono">{formatCurrency(preview.cashGross)}</span></p>
          <p>Taxable earnings: <span className="font-mono">{formatCurrency(preview.result.taxableEarnings)}</span></p>
          <p>Net pay: <span className="font-mono">{formatCurrency(preview.result.netPay)}</span></p>
        </div>
      )}
      {preview && 'error' in preview && <p className="text-sm text-destructive">{preview.error}</p>}
    </div>
  );
}
