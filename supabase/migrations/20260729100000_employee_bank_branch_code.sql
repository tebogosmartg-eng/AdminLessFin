-- Employee bank branch code for EFT / payslip payment details (distinct from office branch).
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS bank_branch_code text;

COMMENT ON COLUMN public.employees.bank_branch_code IS 'Universal branch code for employee EFT payments (SA banking).';
