-- Simple time pay (ADR-0007, amended): daily-paid = days × daily rate, hourly-paid =
-- hours × hourly rate; no automatic overtime, Sunday or public holiday premiums.
--
-- payroll_attendance: a daily-paid employee's day is ticked as worked in full (1) or half
-- (0.5) in `days`; an hourly-paid employee's day keeps its `hours`. Existing rows keep
-- their hours (a day recorded in hours for a daily-paid employee counts as a full day).
-- company_payroll_policies keeps its multiplier columns (no longer used) so nothing is lost.

ALTER TABLE public.payroll_attendance ADD COLUMN IF NOT EXISTS days numeric(2,1);
ALTER TABLE public.payroll_attendance ALTER COLUMN hours DROP NOT NULL;

ALTER TABLE public.payroll_attendance DROP CONSTRAINT IF EXISTS payroll_attendance_days_valid;
ALTER TABLE public.payroll_attendance ADD CONSTRAINT payroll_attendance_days_valid
  CHECK (days IS NULL OR days IN (0.5, 1));
ALTER TABLE public.payroll_attendance DROP CONSTRAINT IF EXISTS payroll_attendance_hours_or_days;
ALTER TABLE public.payroll_attendance ADD CONSTRAINT payroll_attendance_hours_or_days
  CHECK (hours IS NOT NULL OR days IS NOT NULL);

COMMENT ON COLUMN public.payroll_attendance.days IS
  'Daily-paid employees: the day worked in full (1) or half (0.5). Hourly-paid employees use hours.';
COMMENT ON TABLE public.company_payroll_policies IS
  'Company payroll rules. Only allow_negative_leave is used; the time multipliers and minimum shift are kept for history and no longer applied.';
