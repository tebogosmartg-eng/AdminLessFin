-- Recurring pay package and per-run inputs for allowances, subsistence, bonuses, and fringe benefits.
-- Payslip lines keep the component code and IRP5 source code so reports do not depend on wording.
--
-- Controls:
--   * owner/admin only (is_admin_of), employee and run must belong to the same company;
--   * every change is written to the audit log (process_audit_log), like employees and payroll_runs;
--   * run inputs can only change while the run is a draft, so a finalised run's inputs stay as calculated.

ALTER TYPE public.payslip_item_type ADD VALUE IF NOT EXISTS 'taxable_benefit';

ALTER TABLE public.payslip_items
  ADD COLUMN IF NOT EXISTS component_code text,
  ADD COLUMN IF NOT EXISTS irp5_code text;

CREATE TABLE IF NOT EXISTS public.employee_pay_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  component_code text NOT NULL CHECK (component_code IN (
    'travel_allowance',
    'subsistence',
    'bonus',
    'other_cash',
    'fringe_company_car',
    'fringe_employer_insurance',
    'fringe_low_interest_loan',
    'fringe_accommodation',
    'fringe_asset',
    'fringe_other'
  )),
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  effective_from date,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, component_code),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_employee_pay_components_company
  ON public.employee_pay_components(company_id);

CREATE TABLE IF NOT EXISTS public.payroll_period_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  component_code text NOT NULL CHECK (component_code IN (
    'travel_allowance',
    'subsistence',
    'bonus',
    'other_cash',
    'fringe_company_car',
    'fringe_employer_insurance',
    'fringe_low_interest_loan',
    'fringe_accommodation',
    'fringe_asset',
    'fringe_other'
  )),
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, employee_id, component_code)
);

CREATE INDEX IF NOT EXISTS idx_payroll_period_inputs_company
  ON public.payroll_period_inputs(company_id);

CREATE INDEX IF NOT EXISTS idx_payroll_period_inputs_run
  ON public.payroll_period_inputs(payroll_run_id);

-- Employee (and run) must belong to the row's company.
CREATE OR REPLACE FUNCTION public.pay_component_company_matches()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = NEW.employee_id AND e.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Pay component employee does not belong to the company';
  END IF;

  IF TG_TABLE_NAME = 'payroll_period_inputs' AND NOT EXISTS (
    SELECT 1 FROM public.payroll_runs r
    WHERE r.id = NEW.payroll_run_id AND r.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Period input run does not belong to the company';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_pay_components_company_match ON public.employee_pay_components;
CREATE TRIGGER employee_pay_components_company_match
  BEFORE INSERT OR UPDATE ON public.employee_pay_components
  FOR EACH ROW EXECUTE FUNCTION public.pay_component_company_matches();

DROP TRIGGER IF EXISTS payroll_period_inputs_company_match ON public.payroll_period_inputs;
CREATE TRIGGER payroll_period_inputs_company_match
  BEFORE INSERT OR UPDATE ON public.payroll_period_inputs
  FOR EACH ROW EXECUTE FUNCTION public.pay_component_company_matches();

-- Run inputs are part of the calculation: frozen once the run leaves draft.
-- A cascade from deleting the run itself is allowed (trigger depth > 1).
CREATE OR REPLACE FUNCTION public.payroll_period_inputs_draft_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_run_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  SELECT r.status::text INTO v_status FROM public.payroll_runs r WHERE r.id = v_run_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Period inputs can only change while the payroll run is a draft (run is %).', coalesce(v_status, 'missing');
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.payroll_run_id IS DISTINCT FROM NEW.payroll_run_id THEN
    SELECT r.status::text INTO v_status FROM public.payroll_runs r WHERE r.id = OLD.payroll_run_id;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Period inputs can only change while the payroll run is a draft.';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS payroll_period_inputs_draft_only ON public.payroll_period_inputs;
CREATE TRIGGER payroll_period_inputs_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_period_inputs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_period_inputs_draft_only();

CREATE OR REPLACE FUNCTION public.pay_components_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_pay_components_touch ON public.employee_pay_components;
CREATE TRIGGER employee_pay_components_touch
  BEFORE UPDATE ON public.employee_pay_components
  FOR EACH ROW EXECUTE FUNCTION public.pay_components_touch_updated_at();

DROP TRIGGER IF EXISTS payroll_period_inputs_touch ON public.payroll_period_inputs;
CREATE TRIGGER payroll_period_inputs_touch
  BEFORE UPDATE ON public.payroll_period_inputs
  FOR EACH ROW EXECUTE FUNCTION public.pay_components_touch_updated_at();

-- Audit trail, the same mechanism as employees and payroll_runs.
DROP TRIGGER IF EXISTS audit_employee_pay_components ON public.employee_pay_components;
CREATE TRIGGER audit_employee_pay_components
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_pay_components
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_payroll_period_inputs ON public.payroll_period_inputs;
CREATE TRIGGER audit_payroll_period_inputs
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_period_inputs
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

ALTER TABLE public.employee_pay_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_period_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_pay_components_select ON public.employee_pay_components;
DROP POLICY IF EXISTS employee_pay_components_mutate ON public.employee_pay_components;
CREATE POLICY employee_pay_components_admin ON public.employee_pay_components
  FOR ALL USING (public.is_admin_of(company_id))
  WITH CHECK (public.is_admin_of(company_id));

DROP POLICY IF EXISTS payroll_period_inputs_select ON public.payroll_period_inputs;
DROP POLICY IF EXISTS payroll_period_inputs_mutate ON public.payroll_period_inputs;
CREATE POLICY payroll_period_inputs_admin ON public.payroll_period_inputs
  FOR ALL USING (public.is_admin_of(company_id))
  WITH CHECK (public.is_admin_of(company_id));

REVOKE ALL ON TABLE public.employee_pay_components FROM anon, public;
REVOKE ALL ON TABLE public.payroll_period_inputs FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.employee_pay_components TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.payroll_period_inputs TO authenticated;
