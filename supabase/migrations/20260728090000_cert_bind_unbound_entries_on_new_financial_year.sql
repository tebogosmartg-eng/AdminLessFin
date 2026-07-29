-- Certification fix: bind previously-unbound journal entries when the financial
-- year that covers them is created.
--
-- erp_v10_accounting_period_foundation stamps journal_entries.financial_year_id
-- / accounting_period_id from a BEFORE INSERT/UPDATE trigger, and deliberately
-- leaves both NULL when the entry date falls outside every generated range. Its
-- backfill UPDATE runs once at migration time only, so an entry posted before
-- its financial year exists stays unbound permanently — invisible to period
-- locking and to year-scoped reporting even after the year is later created.
--
-- Certification evidence: 42 of 47 journal entries in the live tenant
-- (R626,425.79 of debits) were dated 2026 while only a 2025 year existed.
--
-- This makes the existing period-generation trigger additionally re-run the
-- same idempotent binding logic, scoped to the new year's company and date
-- range. It only ever fills NULLs, so it cannot move an entry already bound to
-- a year or reopen a closed one.

CREATE OR REPLACE FUNCTION public.trg_generate_periods_for_new_financial_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.generate_accounting_periods(NEW.id);

  UPDATE public.journal_entries je
  SET financial_year_id = NEW.id
  WHERE je.financial_year_id IS NULL
    AND je.company_id = NEW.company_id
    AND je.entry_date BETWEEN NEW.start_date AND NEW.end_date;

  UPDATE public.journal_entries je
  SET accounting_period_id = ap.id
  FROM public.accounting_periods ap
  WHERE je.accounting_period_id IS NULL
    AND ap.financial_year_id = NEW.id
    AND ap.company_id = je.company_id
    AND je.entry_date BETWEEN ap.start_date AND ap.end_date;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_generate_periods_for_new_financial_year IS
  'Generates the monthly accounting_periods for a new financial year and binds any journal entries in that range that were posted before the year existed. Fills NULLs only.';

-- One-time catch-up for entries already orphaned by the original backfill.
UPDATE public.journal_entries je
SET financial_year_id = fy.id
FROM public.financial_years fy
WHERE je.financial_year_id IS NULL
  AND fy.company_id = je.company_id
  AND je.entry_date BETWEEN fy.start_date AND fy.end_date;

UPDATE public.journal_entries je
SET accounting_period_id = ap.id
FROM public.accounting_periods ap
WHERE je.accounting_period_id IS NULL
  AND ap.company_id = je.company_id
  AND je.entry_date BETWEEN ap.start_date AND ap.end_date;
