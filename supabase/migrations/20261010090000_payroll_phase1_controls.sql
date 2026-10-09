-- Payroll Phase 1: SARS employee details, separation of duties on approval, and
-- payroll tables that can only be changed through the payroll function.
--
-- 1. employees: residential and postal address, bank account type, nature of person
--    and passport details, as SARS needs them on the IRP5. All optional, validated.
-- 2. payroll_runs.prepared_by: everyone who generated or edited the payslips or
--    changed the run's inputs. Such a person cannot approve the run unless the owner
--    has allowed self-approval (company_payroll_controls), for a one-person payroll.
--    Enforced here as well as in the payroll function.
-- 3. payroll_runs, payslips and payslip_items: owners and admins may read them;
--    nobody changes them directly any more. The payroll function (service role) and
--    the payroll SECURITY DEFINER functions are the only writers. Until now any
--    company member could edit a payslip or approve a run straight through the API.
-- 4. employees: any member may still read, only owners and admins may change.
-- 5. Two legacy functions are withdrawn: generate_payslips_for_run (no company check,
--    callable by any signed-in user) and get_payroll_summary_report (fails on an
--    enum value that no longer exists; its endpoint is removed).

-- ── 1. SARS employee details ────────────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS residential_unit_number text,
  ADD COLUMN IF NOT EXISTS residential_complex text,
  ADD COLUMN IF NOT EXISTS residential_street_number text,
  ADD COLUMN IF NOT EXISTS residential_street_name text,
  ADD COLUMN IF NOT EXISTS residential_suburb text,
  ADD COLUMN IF NOT EXISTS residential_city text,
  ADD COLUMN IF NOT EXISTS residential_postal_code text,
  ADD COLUMN IF NOT EXISTS postal_same_as_residential boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS postal_address_line1 text,
  ADD COLUMN IF NOT EXISTS postal_address_line2 text,
  ADD COLUMN IF NOT EXISTS postal_address_line3 text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS bank_account_type text,
  ADD COLUMN IF NOT EXISTS nature_of_person text,
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS passport_country text;

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_residential_postal_code_format;
ALTER TABLE public.employees ADD CONSTRAINT employees_residential_postal_code_format
  CHECK (residential_postal_code IS NULL OR residential_postal_code ~ '^[0-9]{4}$');

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_postal_code_format;
ALTER TABLE public.employees ADD CONSTRAINT employees_postal_code_format
  CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{4}$');

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_bank_account_type_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_bank_account_type_valid
  CHECK (bank_account_type IS NULL OR bank_account_type IN (
    'current', 'savings', 'transmission', 'bond', 'credit_card', 'subscription_share', 'foreign'
  ));

-- A: individual with an ID or passport number; B: individual without either;
-- C: director of a private company or member of a close corporation.
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_nature_of_person_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_nature_of_person_valid
  CHECK (nature_of_person IS NULL OR nature_of_person IN ('A', 'B', 'C'));

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_passport_country_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_passport_country_valid
  CHECK (passport_country IS NULL OR passport_country ~ '^[A-Z]{2}$');

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_passport_needs_country;
ALTER TABLE public.employees ADD CONSTRAINT employees_passport_needs_country
  CHECK (passport_number IS NULL OR btrim(passport_number) = '' OR passport_country IS NOT NULL);

COMMENT ON COLUMN public.employees.bank_account_type IS
  'SARS IRP5 account type: current, savings, transmission, bond, credit_card, subscription_share, foreign.';
COMMENT ON COLUMN public.employees.nature_of_person IS
  'SARS IRP5 code 3020: A (ID or passport), B (neither), C (director / CC member). NULL = worked out from the record.';
COMMENT ON COLUMN public.employees.passport_country IS 'ISO 3166-1 alpha-2 country that issued the passport.';

-- ── 2. Separation of duties ─────────────────────────────────────────────────
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS prepared_by uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.payroll_runs.prepared_by IS
  'Users who generated or edited the payslips or changed the run inputs. They cannot approve the run unless company_payroll_controls.allow_self_approval.';

-- Draft runs already generated: whoever generated them prepared them.
UPDATE public.payroll_runs r
SET prepared_by = sub.users
FROM (
  SELECT e.payroll_run_id, array_agg(DISTINCT e.created_by) AS users
  FROM public.payroll_audit_events e
  WHERE e.event_type IN ('payslips_generated', 'payslip_updated') AND e.created_by IS NOT NULL
  GROUP BY e.payroll_run_id
) sub
WHERE r.id = sub.payroll_run_id AND r.status = 'draft' AND r.prepared_by = '{}';

CREATE TABLE IF NOT EXISTS public.company_payroll_controls (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  allow_self_approval boolean NOT NULL DEFAULT false,
  self_approval_reason text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT allow_self_approval OR length(btrim(coalesce(self_approval_reason, ''))) >= 10)
);

COMMENT ON TABLE public.company_payroll_controls IS
  'Payroll approval controls. Changed by the company owner through the payroll function only.';

ALTER TABLE public.company_payroll_controls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_payroll_controls_read ON public.company_payroll_controls;
CREATE POLICY company_payroll_controls_read ON public.company_payroll_controls
  FOR SELECT USING (public.is_admin_of(company_id));
REVOKE ALL ON TABLE public.company_payroll_controls FROM anon, public, authenticated;
GRANT SELECT ON TABLE public.company_payroll_controls TO authenticated;
GRANT ALL ON TABLE public.company_payroll_controls TO service_role;

DROP TRIGGER IF EXISTS audit_company_payroll_controls ON public.company_payroll_controls;
CREATE TRIGGER audit_company_payroll_controls
  AFTER INSERT OR UPDATE OR DELETE ON public.company_payroll_controls
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- Adds a preparer to a run (payroll function only).
CREATE OR REPLACE FUNCTION public.payroll_run_add_preparer(p_run_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.payroll_runs
  SET prepared_by = array_append(prepared_by, p_user_id)
  WHERE id = p_run_id AND p_user_id IS NOT NULL AND NOT (p_user_id = ANY (prepared_by));
$$;

REVOKE ALL ON FUNCTION public.payroll_run_add_preparer(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_run_add_preparer(uuid, uuid) TO service_role;

-- Run inputs are entered in the browser: whoever changes them prepares the run.
-- A delete cascading from the run itself is skipped (trigger depth > 1).
CREATE OR REPLACE FUNCTION public.payroll_period_inputs_record_preparer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;
BEGIN
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 1 THEN
    UPDATE public.payroll_runs
    SET prepared_by = array_append(prepared_by, auth.uid())
    WHERE id = v_run_id AND NOT (auth.uid() = ANY (prepared_by));
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_period_inputs_record_preparer() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS payroll_period_inputs_preparer ON public.payroll_period_inputs;
CREATE TRIGGER payroll_period_inputs_preparer
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_period_inputs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_period_inputs_record_preparer();

-- The approval rule, enforced whatever path writes the approval.
CREATE OR REPLACE FUNCTION public.payroll_runs_enforce_approval_separation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL
     AND (OLD.approved_by IS DISTINCT FROM NEW.approved_by OR OLD.approved_at IS DISTINCT FROM NEW.approved_at)
     AND NEW.approved_by = ANY (NEW.prepared_by)
     AND NOT EXISTS (
       SELECT 1 FROM public.company_payroll_controls c
       WHERE c.company_id = NEW.company_id AND c.allow_self_approval
     ) THEN
    RAISE EXCEPTION 'SELF_APPROVAL_BLOCKED: the person who prepared payroll run % cannot approve it', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_runs_approval_separation ON public.payroll_runs;
CREATE TRIGGER payroll_runs_approval_separation
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.payroll_runs_enforce_approval_separation();

-- ── 3. Payroll tables: read by owners and admins, written by the payroll function ──
DROP POLICY IF EXISTS "Company members can manage data" ON public.payroll_runs;
DROP POLICY IF EXISTS payroll_runs_admin_read ON public.payroll_runs;
CREATE POLICY payroll_runs_admin_read ON public.payroll_runs
  FOR SELECT USING (public.is_admin_of(company_id));

DROP POLICY IF EXISTS "Company members can manage data" ON public.payslips;
DROP POLICY IF EXISTS payslips_admin_read ON public.payslips;
CREATE POLICY payslips_admin_read ON public.payslips
  FOR SELECT USING (public.is_admin_of(company_id));

DROP POLICY IF EXISTS "Company members can manage data" ON public.payslip_items;
DROP POLICY IF EXISTS payslip_items_admin_read ON public.payslip_items;
CREATE POLICY payslip_items_admin_read ON public.payslip_items
  FOR SELECT USING (
    public.is_admin_of((SELECT p.company_id FROM public.payslips p WHERE p.id = payslip_items.payslip_id))
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.payroll_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.payslips FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.payslip_items FROM anon, authenticated;

-- ── 4. Employees: members read, owners and admins change ────────────────────
DROP POLICY IF EXISTS "Company members can manage data" ON public.employees;
DROP POLICY IF EXISTS employees_member_read ON public.employees;
DROP POLICY IF EXISTS employees_admin_write ON public.employees;
CREATE POLICY employees_member_read ON public.employees
  FOR SELECT USING (public.is_company_member(company_id));
CREATE POLICY employees_admin_write ON public.employees
  FOR ALL USING (public.is_admin_of(company_id))
  WITH CHECK (public.is_admin_of(company_id));

-- ── 5. Legacy functions withdrawn ───────────────────────────────────────────
REVOKE ALL ON FUNCTION public.generate_payslips_for_run(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_payroll_summary_report(date, date) FROM public, anon, authenticated;
