-- Weekly and fortnightly payroll, and leave paid out.
--
-- payroll_runs.pay_frequency: a run pays the employees whose salary_period matches it,
-- and PAYE / UIF / fixed amounts are calculated per pay period of that frequency.
-- Existing runs are monthly (the only frequency the engine supported before).
--
-- leave_payout: leave paid out (e.g. on termination) as a run input. It is taxed once
-- as an annual payment, so it is not allowed on a standing pay package.

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS pay_frequency text NOT NULL DEFAULT 'monthly';

ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_pay_frequency_check;
ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_pay_frequency_check
  CHECK (pay_frequency IN ('monthly', 'fortnightly', 'weekly'));

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_frequency_period
  ON public.payroll_runs (company_id, pay_frequency, pay_period_start, pay_period_end);

COMMENT ON COLUMN public.payroll_runs.pay_frequency IS
  'monthly | fortnightly | weekly. The run pays employees with the matching salary_period.';

-- Period inputs may carry leave pay; the standing package may not.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.payroll_period_inputs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%component_code%'
  LOOP
    EXECUTE format('ALTER TABLE public.payroll_period_inputs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.payroll_period_inputs
  ADD CONSTRAINT payroll_period_inputs_component_code_check
  CHECK (component_code IN (
    'travel_allowance',
    'subsistence',
    'bonus',
    'other_cash',
    'leave_payout',
    'fringe_company_car',
    'fringe_employer_insurance',
    'fringe_low_interest_loan',
    'fringe_accommodation',
    'fringe_asset',
    'fringe_other'
  ));
