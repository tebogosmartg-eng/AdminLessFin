-- Payroll Phase 4: hourly, daily-paid and casual workers, overtime and time data.
--
-- 1. employees: pay basis (salaried, hourly, daily) with the rate per hour or day, whether
--    the employee ordinarily works on Sundays (BCEA s16: 1.5× instead of 2×), and the
--    employees' tax method: the SARS tables, or non-standard employment (casual, irregular
--    work) at a flat 25%. A deemed-standard declaration date records a casual's written
--    declaration that keeps them on the tables.
-- 2. payroll_timesheets: per run and employee, the ordinary hours or days worked, overtime,
--    Sunday and public holiday hours, and public holidays paid but not worked. Typed in,
--    or imported from the approved hours in Work Management. Draft runs only; written only
--    by the payroll function.
-- 3. ewm_payroll_input_facts.payroll_run_id: the run that paid an approved time entry, so
--    hours are paid once; released when the run is reversed.

-- ── 1. Employee pay basis and tax method ────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pay_basis text NOT NULL DEFAULT 'salaried',
  ADD COLUMN IF NOT EXISTS pay_rate numeric(12,4),
  ADD COLUMN IF NOT EXISTS works_sundays boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_method text NOT NULL DEFAULT 'tables',
  ADD COLUMN IF NOT EXISTS deemed_standard_declaration_on date;

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_pay_basis_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_pay_basis_valid
  CHECK (pay_basis IN ('salaried', 'hourly', 'daily'));

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_pay_rate_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_pay_rate_valid
  CHECK (pay_rate IS NULL OR (pay_rate > 0 AND pay_rate < 100000));

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_tax_method_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_tax_method_valid
  CHECK (tax_method IN ('tables', 'non_standard'));

COMMENT ON COLUMN public.employees.pay_basis IS
  'salaried: salary_amount per salary_period; hourly / daily: pay_rate per hour / day for the time on the run timesheet. salary_period is the pay frequency.';
COMMENT ON COLUMN public.employees.tax_method IS
  'tables: SARS tax tables (standard employment); non_standard: casual or irregular work taxed at a flat 25% (SARS Guide for Employers iro Employees'' Tax).';

-- ── 2. Timesheets ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  ordinary_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK (ordinary_hours >= 0 AND ordinary_hours <= 744),
  days_worked numeric(5,2) NOT NULL DEFAULT 0 CHECK (days_worked >= 0 AND days_worked <= 31),
  overtime_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0 AND overtime_hours <= 744),
  sunday_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK (sunday_hours >= 0 AND sunday_hours <= 120),
  public_holiday_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK (public_holiday_hours >= 0 AND public_holiday_hours <= 120),
  public_holiday_days_paid numeric(4,1) NOT NULL DEFAULT 0 CHECK (public_holiday_days_paid >= 0 AND public_holiday_days_paid <= 10),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'work_module')),
  work_fact_ids uuid[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_timesheets_one_per_employee UNIQUE (payroll_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_timesheets_company_employee
  ON public.payroll_timesheets (company_id, employee_id);

-- A timesheet changes only while its run is a draft, and belongs to the run's company.
CREATE OR REPLACE FUNCTION public.payroll_timesheets_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_run_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
  v_status text;
  v_company uuid;
BEGIN
  SELECT status::text, company_id INTO v_status, v_company FROM public.payroll_runs WHERE id = v_run_id;
  -- A delete cascading from the run itself goes through.
  IF TG_OP = 'DELETE' AND v_status IS NULL THEN
    RETURN OLD;
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'TIMESHEET_LOCKED: timesheets can only change while the payroll run is a draft';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'TIMESHEET_COMPANY_MISMATCH: the timesheet and the payroll run belong to different companies';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS payroll_timesheets_guard ON public.payroll_timesheets;
CREATE TRIGGER payroll_timesheets_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_timesheets
  FOR EACH ROW EXECUTE FUNCTION public.payroll_timesheets_guard();

ALTER TABLE public.payroll_timesheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_timesheets_select ON public.payroll_timesheets;
CREATE POLICY payroll_timesheets_select ON public.payroll_timesheets
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );
REVOKE ALL ON TABLE public.payroll_timesheets FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payroll_timesheets FROM authenticated;
GRANT SELECT ON TABLE public.payroll_timesheets TO authenticated;
GRANT ALL ON TABLE public.payroll_timesheets TO service_role;

DROP TRIGGER IF EXISTS audit_payroll_timesheets ON public.payroll_timesheets;
CREATE TRIGGER audit_payroll_timesheets
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_timesheets
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- ── 3. Approved hours from Work Management are paid once ───────────────────
ALTER TABLE public.ewm_payroll_input_facts
  ADD COLUMN IF NOT EXISTS payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ewm_payroll_input_facts_run
  ON public.ewm_payroll_input_facts (payroll_run_id) WHERE payroll_run_id IS NOT NULL;

-- Payroll now pays these hours, so they are written only by the work function (service role):
-- until now any company member could insert or change them through the API.
DROP POLICY IF EXISTS ewm_payroll_input_facts_mutate ON public.ewm_payroll_input_facts;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.ewm_payroll_input_facts FROM anon, authenticated;
GRANT ALL ON TABLE public.ewm_payroll_input_facts TO service_role;
