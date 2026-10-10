-- Payroll: daily attendance register and company pay rules.
--
-- 1. company_payroll_policies: the company's own pay rules for time: overtime, Sunday and
--    public holiday multipliers (BCEA rates by default), the minimum paid shift (BCEA s9A,
--    4 hours by default, 0 = off), and whether leave may be taken beyond the balance.
--    Rules below the BCEA are allowed (shown as advice), never refused.
-- 2. payroll_attendance: hours worked per employee per day, recorded any time. A run's
--    timesheet is filled from it; once a run that used it is finalised the day is locked
--    (payroll_run_id) and released again if the run is reversed or reopened.
-- 3. payroll_timesheets.source gains 'attendance'.
-- Writes go through the payroll function only; owners and admins read.

-- ── 1. Pay rules ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_payroll_policies (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  overtime_multiplier numeric(4,2) NOT NULL DEFAULT 1.5 CHECK (overtime_multiplier BETWEEN 1 AND 5),
  sunday_multiplier numeric(4,2) NOT NULL DEFAULT 2 CHECK (sunday_multiplier BETWEEN 1 AND 5),
  sunday_multiplier_regular numeric(4,2) NOT NULL DEFAULT 1.5 CHECK (sunday_multiplier_regular BETWEEN 1 AND 5),
  public_holiday_multiplier numeric(4,2) NOT NULL DEFAULT 2 CHECK (public_holiday_multiplier BETWEEN 1 AND 5),
  minimum_shift_hours numeric(4,2) NOT NULL DEFAULT 4 CHECK (minimum_shift_hours BETWEEN 0 AND 12),
  allow_negative_leave boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Attendance register ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  note text CHECK (note IS NULL OR length(note) <= 200),
  payroll_run_id uuid REFERENCES public.payroll_runs(id) ON DELETE SET NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_attendance_one_per_day UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_payroll_attendance_company_date
  ON public.payroll_attendance (company_id, work_date);
CREATE INDEX IF NOT EXISTS idx_payroll_attendance_run
  ON public.payroll_attendance (payroll_run_id) WHERE payroll_run_id IS NOT NULL;

-- A day paid by a finalised run is locked; only the run link itself may change.
CREATE OR REPLACE FUNCTION public.payroll_attendance_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.payroll_run_id IS NOT NULL THEN
      RAISE EXCEPTION 'ATTENDANCE_PAID: this day was paid by a finalised payroll run; reverse or reopen the run first';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.payroll_run_id IS NOT NULL
     AND (to_jsonb(NEW) - 'payroll_run_id' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'payroll_run_id' - 'updated_at') THEN
    RAISE EXCEPTION 'ATTENDANCE_PAID: this day was paid by a finalised payroll run; reverse or reopen the run first';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_attendance_guard ON public.payroll_attendance;
CREATE TRIGGER payroll_attendance_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_attendance
  FOR EACH ROW EXECUTE FUNCTION public.payroll_attendance_guard();

-- ── 3. Timesheets filled from the register ──────────────────────────────────
ALTER TABLE public.payroll_timesheets DROP CONSTRAINT IF EXISTS payroll_timesheets_source_check;
ALTER TABLE public.payroll_timesheets ADD CONSTRAINT payroll_timesheets_source_check
  CHECK (source IN ('manual', 'work_module', 'attendance'));

-- ── Access ──────────────────────────────────────────────────────────────────
ALTER TABLE public.company_payroll_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_payroll_policies_select ON public.company_payroll_policies;
CREATE POLICY company_payroll_policies_select ON public.company_payroll_policies
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS payroll_attendance_select ON public.payroll_attendance;
CREATE POLICY payroll_attendance_select ON public.payroll_attendance
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

REVOKE ALL ON TABLE public.company_payroll_policies FROM anon;
REVOKE ALL ON TABLE public.payroll_attendance FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.company_payroll_policies FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payroll_attendance FROM authenticated;
GRANT SELECT ON TABLE public.company_payroll_policies TO authenticated;
GRANT SELECT ON TABLE public.payroll_attendance TO authenticated;
GRANT ALL ON TABLE public.company_payroll_policies TO service_role;
GRANT ALL ON TABLE public.payroll_attendance TO service_role;

DROP TRIGGER IF EXISTS audit_company_payroll_policies ON public.company_payroll_policies;
CREATE TRIGGER audit_company_payroll_policies
  AFTER INSERT OR UPDATE OR DELETE ON public.company_payroll_policies
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_payroll_attendance ON public.payroll_attendance;
CREATE TRIGGER audit_payroll_attendance
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_attendance
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
