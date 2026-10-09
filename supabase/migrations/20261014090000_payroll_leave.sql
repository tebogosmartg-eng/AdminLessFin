-- Payroll Phase 3: leave management (BCEA sections 20–27).
--
-- 1. employees: days normally worked a week (BCEA accrual and the daily rate) and annual
--    leave days a cycle by contract (null = the BCEA minimum of 3 weeks).
-- 2. company_leave_types: the company's leave types. Annual, sick, family responsibility,
--    maternity, parental and unpaid leave are created for every company that uses leave.
-- 3. employee_leave_entries: the leave register. Leave taken, opening balances taken on
--    from a previous system, adjustments, leave paid out and leave forfeited. Balances are
--    worked out from it under the BCEA. An entry is never changed or deleted: it is
--    cancelled with a reason. Only the payroll function writes; owners and admins read.

-- ── 1. Employee working week and contractual leave ──────────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS work_days_per_week numeric(3,1),
  ADD COLUMN IF NOT EXISTS annual_leave_days_per_cycle numeric(5,2);

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_work_days_per_week_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_work_days_per_week_valid
  CHECK (work_days_per_week IS NULL OR (work_days_per_week >= 1 AND work_days_per_week <= 7));

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_annual_leave_days_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_annual_leave_days_valid
  CHECK (annual_leave_days_per_cycle IS NULL OR (annual_leave_days_per_cycle > 0 AND annual_leave_days_per_cycle <= 60));

COMMENT ON COLUMN public.employees.work_days_per_week IS
  'Days normally worked a week (BCEA). NULL = 5. Drives leave accrual, sick leave (6 weeks) and the daily rate.';
COMMENT ON COLUMN public.employees.annual_leave_days_per_cycle IS
  'Annual leave working days a 12-month cycle by contract. NULL = BCEA minimum (3 weeks of working days).';

-- ── 2. Leave types ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  category text NOT NULL CHECK (category IN ('annual', 'sick', 'family', 'maternity', 'parental', 'unpaid', 'other')),
  paid boolean NOT NULL,
  accrual text NOT NULL CHECK (accrual IN ('bcea_annual', 'bcea_sick', 'bcea_family', 'none')),
  system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_leave_types_code_unique UNIQUE (company_id, code),
  -- Leave with a BCEA balance is paid leave.
  CONSTRAINT company_leave_types_accrual_paid CHECK (accrual = 'none' OR paid)
);

-- ── 3. Leave register ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_leave_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  leave_type_id uuid NOT NULL REFERENCES public.company_leave_types(id),
  entry_type text NOT NULL CHECK (entry_type IN ('taken', 'opening_balance', 'adjustment', 'payout', 'forfeit')),
  start_date date,
  end_date date,
  effective_date date NOT NULL,
  days numeric(7,2) NOT NULL CHECK (days <> 0 AND days BETWEEN -366 AND 366),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'cancelled')),
  reason text,
  payroll_run_id uuid REFERENCES public.payroll_runs(id),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  CONSTRAINT employee_leave_entries_taken_dates CHECK (
    entry_type <> 'taken' OR (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date AND effective_date = start_date)
  ),
  CONSTRAINT employee_leave_entries_positive CHECK (entry_type = 'adjustment' OR days > 0),
  CONSTRAINT employee_leave_entries_reason CHECK (
    entry_type NOT IN ('adjustment', 'forfeit') OR length(btrim(coalesce(reason, ''))) >= 5
  ),
  CONSTRAINT employee_leave_entries_cancel_reason CHECK (
    status <> 'cancelled' OR (cancelled_at IS NOT NULL AND length(btrim(coalesce(cancel_reason, ''))) >= 5)
  )
);

CREATE INDEX IF NOT EXISTS idx_employee_leave_entries_employee
  ON public.employee_leave_entries (company_id, employee_id, leave_type_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_employee_leave_entries_dates
  ON public.employee_leave_entries (company_id, start_date, end_date) WHERE entry_type = 'taken';
CREATE INDEX IF NOT EXISTS idx_employee_leave_entries_run
  ON public.employee_leave_entries (payroll_run_id) WHERE payroll_run_id IS NOT NULL;

-- Leave paid out by a payroll run is recorded once per employee and run (a finalise that
-- is retried cannot draw the balance down twice).
CREATE UNIQUE INDEX IF NOT EXISTS employee_leave_entries_one_payout_per_run
  ON public.employee_leave_entries (payroll_run_id, employee_id, leave_type_id)
  WHERE entry_type = 'payout' AND status = 'approved';

-- The register is evidence: an entry is cancelled, never changed or deleted.
CREATE OR REPLACE FUNCTION public.employee_leave_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LEAVE_ENTRY_IMMUTABLE: leave entries cannot be deleted; cancel them with a reason';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancel_reason')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'cancelled_at' - 'cancelled_by' - 'cancel_reason') THEN
    RAISE EXCEPTION 'LEAVE_ENTRY_IMMUTABLE: a leave entry cannot change; cancel it and record it again';
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'LEAVE_ENTRY_IMMUTABLE: the entry is already cancelled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employee_leave_entries_guard ON public.employee_leave_entries;
CREATE TRIGGER employee_leave_entries_guard
  BEFORE UPDATE OR DELETE ON public.employee_leave_entries
  FOR EACH ROW EXECUTE FUNCTION public.employee_leave_entries_guard();

-- ── Access: owners and admins read; only the payroll function writes ───────
ALTER TABLE public.company_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_leave_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_leave_types_select ON public.company_leave_types;
CREATE POLICY company_leave_types_select ON public.company_leave_types
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS employee_leave_entries_select ON public.employee_leave_entries;
CREATE POLICY employee_leave_entries_select ON public.employee_leave_entries
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

REVOKE ALL ON TABLE public.company_leave_types FROM anon;
REVOKE ALL ON TABLE public.employee_leave_entries FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.company_leave_types FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.employee_leave_entries FROM authenticated;
GRANT SELECT ON TABLE public.company_leave_types TO authenticated;
GRANT SELECT ON TABLE public.employee_leave_entries TO authenticated;
GRANT ALL ON TABLE public.company_leave_types TO service_role;
GRANT ALL ON TABLE public.employee_leave_entries TO service_role;

DROP TRIGGER IF EXISTS audit_company_leave_types ON public.company_leave_types;
CREATE TRIGGER audit_company_leave_types
  AFTER INSERT OR UPDATE OR DELETE ON public.company_leave_types
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_employee_leave_entries ON public.employee_leave_entries;
CREATE TRIGGER audit_employee_leave_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.employee_leave_entries
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
