-- The year-end leave pay accrual (ADR-0009): payroll maps a leave pay expense
-- account (Employee Costs) alongside the accrued leave pay liability
-- (leave_provision, already a role). The accrual is posted only when the user
-- accepts it, through the posting engine (module payroll).
ALTER TABLE public.payroll_account_mappings DROP CONSTRAINT IF EXISTS payroll_account_mappings_account_role_check;
ALTER TABLE public.payroll_account_mappings ADD CONSTRAINT payroll_account_mappings_account_role_check
  CHECK (account_role IN (
    'salary_expense', 'employer_expense', 'uif_employer_expense', 'sdl_expense',
    'bank', 'payroll_liability',
    'paye_control', 'uif_control', 'sdl_control', 'medical_aid_control', 'retirement_fund_control',
    'leave_provision', 'leave_pay_expense', 'bonus_provision', 'commission_provision',
    'employer_contributions', 'employee_deductions'
  ));
