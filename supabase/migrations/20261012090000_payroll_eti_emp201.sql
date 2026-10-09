-- Payroll Phase 2b/2c: Employment Tax Incentive and the filed EMP201.
--
-- 1. employees: what the ETI Act needs per employee — ordinary hours per week, the
--    date first employed (BRS 3190), special economic zone (BRS Appendix E), domestic
--    worker and connected-person exclusions, qualifying months already claimed under a
--    previous payroll, and a wage-regulating minimum wage when higher than the national one.
-- 2. company_payroll_employer_profile.claim_eti: ETI is claimed only when switched on.
-- 3. statutory_returns becomes the filed record: one active return per type and period,
--    written only by the payroll function (it was writable by admins from the browser
--    and unused), never deleted once filed. Replacing a filed return marks the old one
--    superseded, with a reason.

-- ── 1. Employee ETI details ─────────────────────────────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS ordinary_hours_per_week numeric(6,2),
  ADD COLUMN IF NOT EXISTS eti_employment_date date,
  ADD COLUMN IF NOT EXISTS eti_sez_code text,
  ADD COLUMN IF NOT EXISTS eti_domestic_worker boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eti_connected_person boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS eti_prior_qualifying_months smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wage_regulating_minimum_hourly numeric(10,2);

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_ordinary_hours_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_ordinary_hours_valid
  CHECK (ordinary_hours_per_week IS NULL OR (ordinary_hours_per_week > 0 AND ordinary_hours_per_week <= 168));

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_eti_sez_code_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_eti_sez_code_valid
  CHECK (eti_sez_code IS NULL OR eti_sez_code IN ('COE', 'DTP', 'EAL', 'MAP', 'SLB', 'RIB'));

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_eti_prior_months_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_eti_prior_months_valid
  CHECK (eti_prior_qualifying_months BETWEEN 0 AND 24);

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_wage_regulating_minimum_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_wage_regulating_minimum_valid
  CHECK (wage_regulating_minimum_hourly IS NULL OR wage_regulating_minimum_hourly >= 0);

COMMENT ON COLUMN public.employees.ordinary_hours_per_week IS
  'BCEA ordinary hours per week; ETI hours per payslip = this × 52 / pay periods per year × the partial-period factor.';
COMMENT ON COLUMN public.employees.eti_employment_date IS
  'Date first employed by this employer (SARS BRS code 3190). NULL = start_date.';
COMMENT ON COLUMN public.employees.eti_prior_qualifying_months IS
  'ETI qualifying months already claimed before this system (e.g. a previous payroll).';

-- ── 2. Employer opts in to ETI ──────────────────────────────────────────────
ALTER TABLE public.company_payroll_employer_profile
  ADD COLUMN IF NOT EXISTS claim_eti boolean NOT NULL DEFAULT false;

-- ── 3. Filed statutory returns ──────────────────────────────────────────────
ALTER TABLE public.statutory_returns
  ADD COLUMN IF NOT EXISTS period text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS filed_by uuid,
  ADD COLUMN IF NOT EXISTS filed_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_reason text,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS posting_idempotency_key text;

ALTER TABLE public.statutory_returns DROP CONSTRAINT IF EXISTS statutory_returns_period_format;
ALTER TABLE public.statutory_returns ADD CONSTRAINT statutory_returns_period_format
  CHECK (period IS NULL OR period ~ '^[0-9]{6}$');

DROP INDEX IF EXISTS public.statutory_returns_one_active_per_period;
CREATE UNIQUE INDEX statutory_returns_one_active_per_period
  ON public.statutory_returns (company_id, return_type, period)
  WHERE period IS NOT NULL AND status <> 'superseded';

-- Only the payroll function writes returns.
DROP POLICY IF EXISTS statutory_returns_insert ON public.statutory_returns;
DROP POLICY IF EXISTS statutory_returns_update ON public.statutory_returns;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.statutory_returns FROM anon, authenticated;
GRANT ALL ON TABLE public.statutory_returns TO service_role;

-- A filed return is evidence of what was declared: it is never deleted.
CREATE OR REPLACE FUNCTION public.statutory_returns_prevent_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'draft' OR OLD.immutable THEN
    RAISE EXCEPTION 'STATUTORY_RETURN_IMMUTABLE: filed statutory returns cannot be deleted; file a replacement instead';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS statutory_returns_prevent_delete ON public.statutory_returns;
CREATE TRIGGER statutory_returns_prevent_delete
  BEFORE DELETE ON public.statutory_returns
  FOR EACH ROW EXECUTE FUNCTION public.statutory_returns_prevent_delete();

DROP TRIGGER IF EXISTS audit_statutory_returns ON public.statutory_returns;
CREATE TRIGGER audit_statutory_returns
  AFTER INSERT OR UPDATE OR DELETE ON public.statutory_returns
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
