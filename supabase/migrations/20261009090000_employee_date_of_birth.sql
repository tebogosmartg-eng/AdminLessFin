-- Date of birth for employees without a South African ID (e.g. foreign nationals on a
-- passport). PAYE uses it for the age-based secondary (65+) and tertiary (75+) rebates,
-- taking the age on the last day of the tax year; employees with a valid SA ID number
-- do not need it. Optional, additive, no backfill.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_date_of_birth_plausible;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_date_of_birth_plausible
  CHECK (date_of_birth IS NULL OR date_of_birth >= DATE '1900-01-01');

COMMENT ON COLUMN public.employees.date_of_birth IS
  'Used for PAYE age rebates when id_number is not a valid SA ID. Age is taken at the end of the tax year.';
