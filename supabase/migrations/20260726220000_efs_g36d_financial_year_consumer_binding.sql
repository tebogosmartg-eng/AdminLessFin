-- =============================================================================
-- G3.6D — Financial Statements Consumer Enforcement
-- Bind EFS reporting periods to Enterprise Financial Calendar years.
-- ONE financial_year → ONE efs_reporting_period (per reporting entity).
-- Financial Statements consumes Financial Years; it does not own them.
-- =============================================================================

ALTER TABLE public.efs_reporting_periods
  ADD COLUMN IF NOT EXISTS financial_year_id uuid
    REFERENCES public.financial_years(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_efs_reporting_periods_financial_year
  ON public.efs_reporting_periods (company_id, financial_year_id);

-- Unique: one reporting period (hence one engagement, via workspace unique on
-- reporting_period_id) per Enterprise Financial Calendar year per entity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_reporting_periods_financial_year
  ON public.efs_reporting_periods (company_id, reporting_entity_id, financial_year_id)
  WHERE financial_year_id IS NOT NULL;

COMMENT ON COLUMN public.efs_reporting_periods.financial_year_id IS
  'G3.6D — Enterprise Financial Calendar year this EFS period consumes. Null only for legacy rows created before calendar binding.';
