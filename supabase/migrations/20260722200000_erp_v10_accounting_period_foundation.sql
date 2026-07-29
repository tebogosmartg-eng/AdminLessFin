-- AdminLess Fin — ERP Blueprint V1.0, Phase 1: Accounting Period Architecture
-- Financial Years contain Accounting Periods. Periods are generated
-- automatically for every financial year (existing and future). Posting
-- enforcement extends the existing assert_period_open() guard (V17.1) rather
-- than replacing it — every current caller (post_sales_invoice_atomic,
-- receive_stock_atomic, issue_stock_atomic, the journal_entries/
-- inventory_transactions triggers) keeps working unchanged.

CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year_id uuid NOT NULL REFERENCES public.financial_years(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'future'
    CHECK (status IN ('future', 'open', 'soft_closed', 'hard_closed', 'locked', 'reopened')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (financial_year_id, period_number),
  -- >= rather than > : a financial year that starts on the last day of a
  -- calendar month legitimately produces a one-day first period.
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_company_dates ON public.accounting_periods(company_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_fy ON public.accounting_periods(financial_year_id);

ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounting_periods_select ON public.accounting_periods;
DROP POLICY IF EXISTS accounting_periods_all ON public.accounting_periods;
CREATE POLICY accounting_periods_select ON public.accounting_periods FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY accounting_periods_all ON public.accounting_periods FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

-- ── Period generation (idempotent — safe to call more than once) ────────────

CREATE OR REPLACE FUNCTION public.generate_accounting_periods(p_financial_year_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy record;
  v_period_start date;
  v_period_end date;
  v_period_number integer := 1;
  v_status text;
BEGIN
  SELECT * INTO v_fy FROM financial_years WHERE id = p_financial_year_id;
  IF v_fy.id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM accounting_periods WHERE financial_year_id = p_financial_year_id) THEN
    RETURN;
  END IF;

  v_period_start := v_fy.start_date;
  WHILE v_period_start <= v_fy.end_date LOOP
    -- Anchor to the 1st of v_period_start's month before adding a month —
    -- adding '1 month' directly to a day-29/30/31 date overflows into the
    -- following month in Postgres (e.g. Jan 31 + 1 month = Mar 3), which
    -- would silently corrupt period boundaries for FYs starting late in a
    -- month. Anchoring to day 1 first is always overflow-safe.
    v_period_end := LEAST(
      (date_trunc('month', v_period_start) + INTERVAL '1 month' - INTERVAL '1 day')::date,
      v_fy.end_date
    );

    v_status := CASE
      WHEN v_fy.status IN ('closed', 'locked') THEN 'locked'
      WHEN CURRENT_DATE > v_period_end THEN 'open'
      WHEN CURRENT_DATE BETWEEN v_period_start AND v_period_end THEN 'open'
      ELSE 'future'
    END;

    INSERT INTO accounting_periods (financial_year_id, company_id, period_number, start_date, end_date, status)
    VALUES (p_financial_year_id, v_fy.company_id, v_period_number, v_period_start, v_period_end, v_status);

    v_period_start := (v_period_end + INTERVAL '1 day')::date;
    v_period_number := v_period_number + 1;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_accounting_periods IS
  'ERP V1.0 Phase 1: generates one monthly accounting_periods row per calendar month within a financial year. Idempotent — a second call for the same year is a no-op.';

GRANT EXECUTE ON FUNCTION public.generate_accounting_periods(uuid) TO authenticated, service_role;

-- Backfill periods for every financial_years row created by the prior migration.
DO $$
DECLARE
  fy record;
BEGIN
  FOR fy IN SELECT id FROM public.financial_years LOOP
    PERFORM public.generate_accounting_periods(fy.id);
  END LOOP;
END $$;

-- Auto-generate periods for every financial year created from here on.
CREATE OR REPLACE FUNCTION public.trg_generate_periods_for_new_financial_year()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.generate_accounting_periods(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS erp_v10_auto_generate_periods ON public.financial_years;
CREATE TRIGGER erp_v10_auto_generate_periods
  AFTER INSERT ON public.financial_years
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_generate_periods_for_new_financial_year();

-- ── Posting-rule enforcement: extend assert_period_open (additive) ──────────
-- Only hard_closed/locked periods block posting. future/open/soft_closed/
-- reopened all permit it — "soft close" is defined as warn-not-block, and
-- blocking future-dated postings is deferred to the Year-End Engine (Phase 5)
-- rather than risking today's legitimate forward-dated flows (e.g. recurring
-- invoices scheduled slightly ahead).
CREATE OR REPLACE FUNCTION public.assert_period_open(p_company_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed record;
  v_period record;
BEGIN
  IF p_company_id IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;

  SELECT start_date, end_date INTO v_closed
  FROM closed_financial_years
  WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot post to %: this date falls within a closed financial year (% to %). Reopen the financial year or choose a different date.',
      p_date, v_closed.start_date, v_closed.end_date
      USING ERRCODE = '2200G';
  END IF;

  SELECT ap.status, ap.start_date, ap.end_date INTO v_period
  FROM accounting_periods ap
  WHERE ap.company_id = p_company_id AND p_date BETWEEN ap.start_date AND ap.end_date
  LIMIT 1;

  IF FOUND AND v_period.status IN ('hard_closed', 'locked') THEN
    RAISE EXCEPTION 'Cannot post to %: the accounting period (% to %) is % and does not accept postings.',
      p_date, v_period.start_date, v_period.end_date, v_period.status
      USING ERRCODE = '2200G';
  END IF;
END;
$$;

-- ── journal_entries gains financial_year_id / accounting_period_id ─────────
-- Nullable, auto-stamped, never client-supplied. A date outside every
-- generated range (e.g. very old historical data) simply leaves both NULL —
-- insert still succeeds, matching the additive/backward-compatible standard.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accounting_period_id uuid REFERENCES public.accounting_periods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_journal_entries_financial_year ON public.journal_entries(financial_year_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_accounting_period ON public.journal_entries(accounting_period_id);

CREATE OR REPLACE FUNCTION public.trg_assert_journal_entry_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy_id uuid;
  v_ap_id uuid;
BEGIN
  PERFORM public.assert_period_open(NEW.company_id, NEW.entry_date);

  IF NEW.financial_year_id IS NULL THEN
    SELECT id INTO v_fy_id FROM financial_years
      WHERE company_id = NEW.company_id AND NEW.entry_date BETWEEN start_date AND end_date
      LIMIT 1;
    NEW.financial_year_id := v_fy_id;
  END IF;

  IF NEW.accounting_period_id IS NULL THEN
    SELECT id INTO v_ap_id FROM accounting_periods
      WHERE company_id = NEW.company_id AND NEW.entry_date BETWEEN start_date AND end_date
      LIMIT 1;
    NEW.accounting_period_id := v_ap_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill existing journal_entries rows (idempotent — only touches NULLs).
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
