-- Fix: pay_component_company_matches() referenced NEW.payroll_run_id while running for
-- employee_pay_components, which has no such column, so every pay-package save failed with
-- 'record "new" has no field "payroll_run_id"'. PL/pgSQL resolves the field even when the
-- table-name test in the same expression is false. Each table now gets its own check.

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
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.payroll_period_input_company_matches()
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

  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_runs r
    WHERE r.id = NEW.payroll_run_id AND r.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Period input run does not belong to the company';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_period_inputs_company_match ON public.payroll_period_inputs;
CREATE TRIGGER payroll_period_inputs_company_match
  BEFORE INSERT OR UPDATE ON public.payroll_period_inputs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_period_input_company_matches();
