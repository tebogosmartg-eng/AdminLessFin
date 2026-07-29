-- AdminLess Fin — ERP Blueprint V1.0, Phase 1: Financial Year Architecture
-- Introduces a first-class Financial Year entity to replace the implicit
-- date range previously derived from profiles.current_financial_year_start.
-- Additive + backfilled: existing closed_financial_years rows and the
-- absence of any financial_years row are both handled without data loss.

CREATE TABLE IF NOT EXISTS public.financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year_code text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'closed', 'locked', 'reopened')),
  previous_financial_year_id uuid REFERENCES public.financial_years(id) ON DELETE SET NULL,
  retained_earnings_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  closing_journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  opening_journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  closed_at timestamptz,
  closed_by uuid,
  reopened_at timestamptz,
  reopened_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date > start_date),
  UNIQUE (company_id, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_financial_years_company_status ON public.financial_years(company_id, status);
CREATE INDEX IF NOT EXISTS idx_financial_years_company_dates ON public.financial_years(company_id, start_date, end_date);

ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_years_select ON public.financial_years;
DROP POLICY IF EXISTS financial_years_all ON public.financial_years;
CREATE POLICY financial_years_select ON public.financial_years FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY financial_years_all ON public.financial_years FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

COMMENT ON TABLE public.financial_years IS
  'ERP V1.0 Phase 1: first-class Financial Year entity. Action-level permissions (who may close/reopen) are Year-End Engine scope (Phase 5), not enforced here — RLS currently allows any company member to write, matching the existing platform-wide RLS pattern for this phase.';

-- ── Backfill: preserve every existing signal about "what year is this" ──────
DO $$
DECLARE
  r record;
  v_start date;
  v_end date;
  v_year_code text;
BEGIN
  -- 1) One closed financial_years row per existing closed_financial_years row.
  INSERT INTO public.financial_years (company_id, year_code, start_date, end_date, status, closing_journal_entry_id, closed_at)
  SELECT
    cfy.company_id,
    'FY' || EXTRACT(YEAR FROM cfy.end_date)::int::text,
    cfy.start_date,
    cfy.end_date,
    'closed',
    cfy.closing_journal_entry_id,
    COALESCE(cfy.created_at, now())
  FROM public.closed_financial_years cfy
  WHERE NOT EXISTS (
    SELECT 1 FROM public.financial_years fy
    WHERE fy.company_id = cfy.company_id AND fy.start_date = cfy.start_date AND fy.end_date = cfy.end_date
  );

  -- 2) One open financial_years row for every company that doesn't have an
  --    open/draft year yet, so every company has exactly one current year.
  FOR r IN
    SELECT c.id AS company_id
    FROM public.companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.financial_years fy WHERE fy.company_id = c.id AND fy.status IN ('open', 'draft')
    )
  LOOP
    -- Prefer the day after this company's most recently closed year.
    SELECT MAX(end_date) INTO v_start FROM public.financial_years WHERE company_id = r.company_id AND status = 'closed';

    IF v_start IS NOT NULL THEN
      v_start := (v_start + INTERVAL '1 day')::date;
    ELSE
      -- Fall back to any member's fiscal-year-start setting (financial year
      -- settings currently live on profiles, not companies — a known gap
      -- this migration works around rather than resolves; see ERP Context §2).
      SELECT p.current_financial_year_start::date INTO v_start
      FROM public.company_users cu
      JOIN public.profiles p ON p.id = cu.user_id
      WHERE cu.company_id = r.company_id AND p.current_financial_year_start IS NOT NULL
      ORDER BY cu.user_id
      LIMIT 1;

      IF v_start IS NULL THEN
        v_start := date_trunc('year', CURRENT_DATE)::date;
      END IF;
    END IF;

    v_end := (v_start + INTERVAL '1 year' - INTERVAL '1 day')::date;
    v_year_code := 'FY' || EXTRACT(YEAR FROM v_end)::int::text;

    INSERT INTO public.financial_years (company_id, year_code, start_date, end_date, status)
    VALUES (r.company_id, v_year_code, v_start, v_end, 'open')
    ON CONFLICT (company_id, start_date, end_date) DO NOTHING;
  END LOOP;

  -- 3) Chain previous_financial_year_id across adjacent date ranges per company.
  UPDATE public.financial_years fy
  SET previous_financial_year_id = prev.id
  FROM public.financial_years prev
  WHERE prev.company_id = fy.company_id
    AND prev.end_date = fy.start_date - INTERVAL '1 day'
    AND fy.previous_financial_year_id IS NULL;
END $$;
