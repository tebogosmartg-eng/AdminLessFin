-- AdminLess Fin — ERP Blueprint V4.0, Phase 4C: Enterprise Accounting Intelligence
-- Additive, read-only layer over the certified Posting Engine / journal
-- architecture. Nothing here writes to journal_entries, journal_entry_items,
-- posting_requests, or any posting/banking table — it only aggregates them.
--
-- Four generic, parameterized aggregation RPCs replace what would otherwise
-- be N duplicated per-feature calculations (violates "no duplicated
-- accounting calculations"): one grouped-by-account movement function, one
-- grouped-by-dimension contribution function, one time-series function, and
-- one largest-journal lookup — reused across Variance, Drivers, Insights,
-- Comparison, and Dashboard Intelligence in the edge function layer.
--
-- All four are SECURITY DEFINER with an explicit company_users membership
-- check (matching every other RPC added since Phase 3A), not SECURITY
-- INVOKER relying on assumed RLS on journal_entries/journal_entry_items —
-- this session's own RLS-testing history (Phase 3D) showed relying on
-- unverified RLS assumptions is exactly the kind of thing to avoid.

-- ── 1. All-accounts movement for a period (dashboard diffs, comparisons) ──
CREATE OR REPLACE FUNCTION public.get_account_movement_grouped(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  account_id uuid,
  debit_total numeric,
  credit_total numeric,
  net_movement numeric,
  txn_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = p_company_id AND cu.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of company %', p_company_id;
  END IF;

  RETURN QUERY
  SELECT
    jei.account_id,
    COALESCE(SUM(jei.amount) FILTER (WHERE jei.type = 'debit'), 0)::numeric,
    COALESCE(SUM(jei.amount) FILTER (WHERE jei.type = 'credit'), 0)::numeric,
    (COALESCE(SUM(jei.amount) FILTER (WHERE jei.type = 'debit'), 0)
      - COALESCE(SUM(jei.amount) FILTER (WHERE jei.type = 'credit'), 0))::numeric,
    COUNT(*)::bigint
  FROM public.journal_entry_items jei
  JOIN public.journal_entries je ON je.id = jei.journal_entry_id
  WHERE je.company_id = p_company_id
    AND je.entry_date BETWEEN p_start_date AND p_end_date
  GROUP BY jei.account_id;
END;
$$;

COMMENT ON FUNCTION public.get_account_movement_grouped IS
  'ERP V4.0 Phase 4C: server-side GROUP BY replacement for the chunked-JS-loop
   account-movement pattern used by Trial Balance / Balance Explainer / Analytics.
   Read-only, additive. Returns one row per account with postings in range.';

GRANT EXECUTE ON FUNCTION public.get_account_movement_grouped(uuid, date, date) TO authenticated, service_role;

-- ── 2. One account, contribution broken down by a chosen dimension ────────
CREATE OR REPLACE FUNCTION public.get_account_movement_by_dimension(
  p_company_id uuid,
  p_account_id uuid,
  p_start_date date,
  p_end_date date,
  p_dimension text
)
RETURNS TABLE (
  bucket_key text,
  bucket_label text,
  amount numeric,
  txn_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = p_company_id AND cu.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of company %', p_company_id;
  END IF;

  IF p_dimension NOT IN ('module', 'vendor', 'customer', 'project', 'document_type') THEN
    RAISE EXCEPTION 'Unsupported dimension: %', p_dimension;
  END IF;

  RETURN QUERY
  SELECT
    CASE p_dimension
      WHEN 'module' THEN COALESCE(pr.module, 'manual_journal')
      WHEN 'vendor' THEN COALESCE(je.vendor_id::text, 'unassigned')
      WHEN 'customer' THEN COALESCE(je.customer_id::text, 'unassigned')
      WHEN 'project' THEN COALESCE(jei.project_id::text, 'unassigned')
      WHEN 'document_type' THEN COALESCE(pr.document_type, 'manual')
    END AS bucket_key,
    CASE p_dimension
      WHEN 'module' THEN COALESCE(pr.module, 'manual_journal')
      WHEN 'vendor' THEN COALESCE(v.name, 'Unassigned')
      WHEN 'customer' THEN COALESCE(c.name, 'Unassigned')
      WHEN 'project' THEN COALESCE(proj.name, 'Unassigned')
      WHEN 'document_type' THEN COALESCE(pr.document_type, 'Manual Journal')
    END AS bucket_label,
    SUM(jei.amount)::numeric AS amount,
    COUNT(*)::bigint AS txn_count
  FROM public.journal_entry_items jei
  JOIN public.journal_entries je ON je.id = jei.journal_entry_id
  LEFT JOIN public.posting_requests pr ON pr.journal_entry_id = je.id
  LEFT JOIN public.vendors v ON v.id = je.vendor_id
  LEFT JOIN public.customers c ON c.id = je.customer_id
  LEFT JOIN public.projects proj ON proj.id = jei.project_id
  WHERE je.company_id = p_company_id
    AND jei.account_id = p_account_id
    AND je.entry_date BETWEEN p_start_date AND p_end_date
  GROUP BY 1, 2
  ORDER BY amount DESC;
END;
$$;

COMMENT ON FUNCTION public.get_account_movement_by_dimension IS
  'ERP V4.0 Phase 4C: generic server-side contribution breakdown for one
   account by module/vendor/customer/project/document_type. Backs Source
   Contribution and Balance Drivers. One function, five dimensions — avoids
   duplicating this join/aggregate per dimension.';

GRANT EXECUTE ON FUNCTION public.get_account_movement_by_dimension(uuid, uuid, date, date, text) TO authenticated, service_role;

-- ── 3. One account, time series (day or month granularity) ────────────────
CREATE OR REPLACE FUNCTION public.get_account_movement_series(
  p_company_id uuid,
  p_account_id uuid,
  p_start_date date,
  p_end_date date,
  p_granularity text DEFAULT 'month'
)
RETURNS TABLE (
  bucket_date date,
  debit_total numeric,
  credit_total numeric,
  net_movement numeric,
  txn_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = p_company_id AND cu.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of company %', p_company_id;
  END IF;

  IF p_granularity NOT IN ('day', 'month') THEN
    RAISE EXCEPTION 'Unsupported granularity: %', p_granularity;
  END IF;

  RETURN QUERY
  SELECT
    date_trunc(p_granularity, je.entry_date)::date AS bucket_date,
    COALESCE(SUM(jei.amount) FILTER (WHERE jei.type = 'debit'), 0)::numeric,
    COALESCE(SUM(jei.amount) FILTER (WHERE jei.type = 'credit'), 0)::numeric,
    (COALESCE(SUM(jei.amount) FILTER (WHERE jei.type = 'debit'), 0)
      - COALESCE(SUM(jei.amount) FILTER (WHERE jei.type = 'credit'), 0))::numeric,
    COUNT(*)::bigint
  FROM public.journal_entry_items jei
  JOIN public.journal_entries je ON je.id = jei.journal_entry_id
  WHERE je.company_id = p_company_id
    AND jei.account_id = p_account_id
    AND je.entry_date BETWEEN p_start_date AND p_end_date
  GROUP BY 1
  ORDER BY 1;
END;
$$;

COMMENT ON FUNCTION public.get_account_movement_series IS
  'ERP V4.0 Phase 4C: server-side time series for one account. Granularity
   day backs "highest posting day"; granularity month backs monthly
   movement, most-active-month, MoM/YoY variance, and 5-way comparison.';

GRANT EXECUTE ON FUNCTION public.get_account_movement_series(uuid, uuid, date, date, text) TO authenticated, service_role;

-- ── 4. One account, single largest journal in a range ──────────────────────
CREATE OR REPLACE FUNCTION public.get_account_largest_journal(
  p_company_id uuid,
  p_account_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  journal_entry_id uuid,
  journal_number text,
  entry_date date,
  description text,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = p_company_id AND cu.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of company %', p_company_id;
  END IF;

  RETURN QUERY
  SELECT je.id, je.journal_number, je.entry_date, je.description, SUM(jei.amount)::numeric AS total_amount
  FROM public.journal_entry_items jei
  JOIN public.journal_entries je ON je.id = jei.journal_entry_id
  WHERE je.company_id = p_company_id
    AND jei.account_id = p_account_id
    AND je.entry_date BETWEEN p_start_date AND p_end_date
  GROUP BY je.id, je.journal_number, je.entry_date, je.description
  ORDER BY total_amount DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_account_largest_journal IS
  'ERP V4.0 Phase 4C: server-side lookup of the single largest journal
   touching one account in a date range. Backs Account Insights "largest journal".';

GRANT EXECUTE ON FUNCTION public.get_account_largest_journal(uuid, uuid, date, date) TO authenticated, service_role;

-- ── 5. Materiality thresholds (configurable, per company) ─────────────────
CREATE TABLE IF NOT EXISTS public.company_materiality_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  percentage_threshold numeric NOT NULL DEFAULT 5 CHECK (percentage_threshold >= 0),
  absolute_threshold numeric NOT NULL DEFAULT 1000 CHECK (absolute_threshold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.company_materiality_settings IS
  'ERP V4.0 Phase 4C: configurable materiality thresholds so small
   fluctuations do not dominate the Accounting Intelligence workspace.
   One row per company, created lazily on first read via edge-function
   default fallback — this migration does not backfill rows.';

ALTER TABLE public.company_materiality_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_materiality_settings_select ON public.company_materiality_settings;
DROP POLICY IF EXISTS company_materiality_settings_write ON public.company_materiality_settings;

CREATE POLICY company_materiality_settings_select ON public.company_materiality_settings FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY company_materiality_settings_write ON public.company_materiality_settings FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')));

-- ── 6. Indexes to support Phase 4C aggregation at 500k+ rows ───────────────
-- Self-labeled per the Phase 4A/4B convention: READ PERFORMANCE ONLY. Does
-- not alter Posting Engine, Banking, or Quick Capture.
CREATE INDEX IF NOT EXISTS idx_jei_dimensions_gin ON public.journal_entry_items USING gin (dimensions);
CREATE INDEX IF NOT EXISTS idx_jei_journal_account_covering ON public.journal_entry_items (journal_entry_id, account_id) INCLUDE (type, amount, project_id);
