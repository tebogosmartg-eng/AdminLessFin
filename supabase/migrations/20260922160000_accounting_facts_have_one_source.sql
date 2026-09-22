-- ============================================================================
-- AdminLess Fin — the accounting facts get one source.
--
-- WHY
-- Financial Statements, Accounting Setup, Trial Balance and the dashboard could
-- report different states because each one re-derived the same facts its own
-- way. The MONEY was already single-sourced -- get_balances_as_of_date,
-- get_period_activity and get_cash_flow_statement feed one aggregation engine,
-- and a live comparison of 216 monetary facts across 12 companies found no
-- disagreement. The READINESS facts were not: they existed only in TypeScript,
-- in two copies, with no database authority at all.
--
-- Two things had no owner:
--
--   1. WHICH FINANCIAL YEAR IS CURRENT. `financial_years` has no is_active or
--      is_current column, so every screen inferred it, and two rules disagreed:
--        - the frontend took the open year containing today, else the newest
--          open by end_date;
--        - the edge took the first row in start_date DESC whose status is open
--          OR which contains today -- status alone wins, so the dates were
--          never actually checked.
--      Spaceman has three open years, TWO of which contain today, so the rules
--      only happen to agree because of row ordering.
--
--   2. THE READINESS FACTS. Whether an active year exists, whether the chart is
--      classified, which control roles are mapped, whether VAT is configured,
--      whether opening balances are done. All TypeScript, invisible to SQL.
--
-- WHAT THIS DOES
-- Adds the two authorities. Nothing consumes them yet, and no behaviour
-- changes in this migration -- it is additive so the switch-over can be made
-- one caller at a time and proved against these.
--
--   financial_year_current(company)  -- the single rule for "current year"
--   accounting_facts(company)        -- every readiness fact, derived live
--
-- accounting_facts() deliberately reports facts, not a verdict. Whether a
-- company is "ready" is a composition of these, and that composition stays in
-- one service so the wording and the step order live with the screens.
--
-- Control accounts are identified by account_role, classification and
-- subcategory -- NEVER by display name. A company with a perfectly good chart
-- must never be told an account is missing because it is not called what a
-- template expected. The stable template codes are kept only as a fallback for
-- legacy charts that predate roles.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The current financial year.
--
-- Order of preference, and the reason for each:
--   1. an open year that contains today   -- what "current" means
--   2. failing that, any open year        -- a calendar not yet caught up
--   3. the latest starting                -- deterministic when several qualify
--
-- Where two open years both contain today, the later-starting one wins. That is
-- the same year both previous rules happened to select, so this changes nothing
-- today; it just makes the choice explicit and identical everywhere.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_year_current(p_company_id uuid)
RETURNS public.financial_years
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.*
  FROM public.financial_years f
  WHERE f.company_id = p_company_id
  ORDER BY
    (f.status IN ('open', 'reopened') AND CURRENT_DATE BETWEEN f.start_date AND f.end_date) DESC,
    (f.status IN ('open', 'reopened')) DESC,
    f.start_date DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.financial_year_current(uuid) IS
  'The one rule for which financial year is current. Every screen and edge function must use this rather than inferring its own.';

-- ---------------------------------------------------------------------------
-- Every readiness fact, derived from master data, in one place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_facts(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year public.financial_years;
  v_bank_skipped boolean := false;
  v_ob_zero boolean := false;
  v_inventory boolean := false;
  v_fixed_assets boolean := false;
  v_payroll boolean := false;
  v_classifications constant jsonb := jsonb_build_object(
    'Asset',     jsonb_build_array('Current Assets', 'Non-Current Assets'),
    'Liability', jsonb_build_array('Current Liabilities', 'Non-Current Liabilities'),
    'Equity',    jsonb_build_array('Equity'),
    'Income',    jsonb_build_array('Revenue', 'Other Income'),
    'Expense',   jsonb_build_array('Cost of Sales', 'Operating Expenses', 'Finance Costs', 'Taxation', 'Other Expenses')
  );
  v_calendar jsonb;
  v_chart jsonb;
  v_control jsonb;
  v_tax jsonb;
  v_banking jsonb;
  v_ledger jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'accounting_facts: company is required' USING ERRCODE = '22023';
  END IF;

  v_year := public.financial_year_current(p_company_id);

  -- Intent flags are recorded by the setup wizard; they are source data, not
  -- derived, so they are reported alongside the facts they qualify.
  SELECT COALESCE(r.bank_accounts_skipped, false),
         COALESCE(r.opening_balances_zero_intentional, false),
         COALESCE(r.inventory_enabled, false),
         COALESCE(r.fixed_assets_enabled, false),
         COALESCE(r.payroll_enabled, false)
  INTO v_bank_skipped, v_ob_zero, v_inventory, v_fixed_assets, v_payroll
  FROM public.accounting_readiness r WHERE r.company_id = p_company_id;

  -- ---- calendar -----------------------------------------------------------
  SELECT jsonb_build_object(
    'has_year', v_year.id IS NOT NULL,
    'has_open_year', EXISTS (
      SELECT 1 FROM public.financial_years f
      WHERE f.company_id = p_company_id AND f.status IN ('open', 'draft', 'reopened')),
    'current_year', CASE WHEN v_year.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_year.id, 'year_code', v_year.year_code, 'status', v_year.status,
      'start_date', v_year.start_date, 'end_date', v_year.end_date,
      'contains_today', CURRENT_DATE BETWEEN v_year.start_date AND v_year.end_date) END,
    'year_count', (SELECT count(*) FROM public.financial_years f WHERE f.company_id = p_company_id),
    'open_year_count', (SELECT count(*) FROM public.financial_years f
      WHERE f.company_id = p_company_id AND f.status IN ('open', 'reopened')),
    -- More than one open year containing today means "current" is ambiguous in
    -- the data itself. Reported so a screen can say so rather than guess.
    'open_years_containing_today', (SELECT count(*) FROM public.financial_years f
      WHERE f.company_id = p_company_id AND f.status IN ('open', 'reopened')
        AND CURRENT_DATE BETWEEN f.start_date AND f.end_date),
    'period_count', (SELECT count(*) FROM public.accounting_periods p WHERE p.company_id = p_company_id),
    'open_period_count', (SELECT count(*) FROM public.accounting_periods p
      WHERE p.company_id = p_company_id AND p.status = 'open'),
    'current_period', (SELECT jsonb_build_object('id', p.id, 'status', p.status,
        'start_date', p.start_date, 'end_date', p.end_date)
      FROM public.accounting_periods p
      WHERE p.company_id = p_company_id AND CURRENT_DATE BETWEEN p.start_date AND p.end_date
      ORDER BY (p.status = 'open') DESC, p.start_date DESC LIMIT 1)
  ) INTO v_calendar;

  -- ---- chart of accounts --------------------------------------------------
  -- Classification is judged against the authoritative vocabulary per account
  -- type, never against a display name.
  SELECT jsonb_build_object(
    'account_count', count(*),
    'active_count', count(*) FILTER (WHERE COALESCE(a.is_active, true)),
    'missing_types', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM unnest(ARRAY['Asset','Liability','Equity','Income','Expense']) t
      WHERE NOT EXISTS (
        SELECT 1 FROM public.chart_of_accounts x
        WHERE x.company_id = p_company_id AND COALESCE(x.is_active, true) AND x.type::text = t)),
    'unclassified', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'type', x.type)
                                ORDER BY x.account_number), '[]'::jsonb)
      FROM public.chart_of_accounts x
      WHERE x.company_id = p_company_id AND COALESCE(x.is_active, true)
        AND (x.category IS NULL OR btrim(x.category) = ''
             OR NOT (v_classifications -> x.type::text ? btrim(x.category)))),
    'duplicate_codes', (
      SELECT COALESCE(jsonb_agg(code), '[]'::jsonb) FROM (
        SELECT x.account_code AS code FROM public.chart_of_accounts x
        WHERE x.company_id = p_company_id AND x.account_code IS NOT NULL
        GROUP BY x.account_code HAVING count(*) > 1) d),
    'duplicate_numbers', (
      SELECT COALESCE(jsonb_agg(num), '[]'::jsonb) FROM (
        SELECT x.account_number AS num FROM public.chart_of_accounts x
        WHERE x.company_id = p_company_id AND x.account_number IS NOT NULL
        GROUP BY x.account_number HAVING count(*) > 1) d),
    -- A contra account legitimately carries the opposite balance, so it is not
    -- an error.
    'normal_balance_errors', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', x.name, 'type', x.type,
               'expected', CASE WHEN x.type::text IN ('Asset','Expense') THEN 'debit' ELSE 'credit' END)), '[]'::jsonb)
      FROM public.chart_of_accounts x
      WHERE x.company_id = p_company_id
        AND x.normal_balance IS NOT NULL
        AND x.type::text IN ('Asset','Liability','Equity','Income','Expense')
        AND x.normal_balance <> CASE WHEN x.type::text IN ('Asset','Expense') THEN 'debit' ELSE 'credit' END
        AND NOT COALESCE(x.system_account, false)
        AND COALESCE(x.account_role, '') <> 'accumulated_depreciation')
  ) INTO v_chart
  FROM public.chart_of_accounts a WHERE a.company_id = p_company_id;

  -- ---- control accounts ---------------------------------------------------
  -- Matched on role / classification / subcategory. Template codes are a
  -- fallback for charts that predate account_role. Never a display name.
  WITH active AS (
    SELECT * FROM public.chart_of_accounts a
    WHERE a.company_id = p_company_id AND COALESCE(a.is_active, true)
  )
  SELECT jsonb_build_object(
    'trade_debtors', EXISTS (SELECT 1 FROM active a
       WHERE a.account_role = 'trade_receivable' OR a.account_code = '1220'),
    'trade_creditors', EXISTS (SELECT 1 FROM active a
       WHERE a.account_role = 'trade_payable' OR a.account_code = '2110'),
    'vat_control', EXISTS (SELECT 1 FROM active a
       WHERE a.account_role IN ('vat_control','output_vat','input_vat')
          OR a.tax_treatment IN ('vat_control','vat_output','vat_input')),
    'bank', EXISTS (SELECT 1 FROM active a
       WHERE a.account_role IN ('bank','cash') OR a.subcategory = 'Cash and Cash Equivalents'),
    -- Corrected: previously ANY system account satisfied retained earnings,
    -- so a system-flagged VAT account counted as equity.
    'retained_earnings', EXISTS (SELECT 1 FROM active a
       WHERE a.account_role = 'retained_earnings' OR a.account_code = '3020'),
    'profit_loss', EXISTS (SELECT 1 FROM active a WHERE a.type::text = 'Income')
       AND EXISTS (SELECT 1 FROM active a WHERE a.type::text = 'Expense'),
    'inventory', EXISTS (SELECT 1 FROM active a
       WHERE a.account_role = 'inventory_asset' OR a.subcategory = 'Inventory' OR a.account_code = '1210'),
    'fixed_assets', EXISTS (SELECT 1 FROM active a
       WHERE a.account_role = 'fixed_asset' OR a.subcategory = 'Property, Plant and Equipment'),
    'payroll_clearing', EXISTS (SELECT 1 FROM active a
       WHERE a.account_role = 'payroll_clearing' OR a.tax_treatment IN ('paye','uif','sdl'))
  ) INTO v_control;

  -- ---- tax ----------------------------------------------------------------
  SELECT jsonb_build_object(
    'rate_count', (SELECT count(*) FROM public.tax_rates t WHERE t.company_id = p_company_id),
    'vat_account_count', (SELECT count(*) FROM public.chart_of_accounts a
      WHERE a.company_id = p_company_id AND COALESCE(a.is_active, true)
        AND a.account_role IN ('vat_control','output_vat','input_vat'))
  ) INTO v_tax;

  -- ---- banking and opening balances --------------------------------------
  SELECT jsonb_build_object(
    'bank_account_count', count(*),
    'opening_balances_posted', COALESCE(bool_and(
      COALESCE(b.opening_balance_posted, false) OR COALESCE(b.opening_balance, 0) = 0), true)
  ) INTO v_banking
  FROM public.bank_accounts b WHERE b.company_id = p_company_id;

  -- ---- ledger integrity ---------------------------------------------------
  -- Debits equal credits is not the same claim as the balance sheet balancing;
  -- the second is the aggregation engine's to report, from the same journals.
  SELECT jsonb_build_object(
    'journal_count', (SELECT count(*) FROM public.journal_entries j WHERE j.company_id = p_company_id),
    'total_debits', ROUND(COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'debit'), 0), 2),
    'total_credits', ROUND(COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'credit'), 0), 2),
    'balanced', ROUND(COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'debit'), 0), 2)
                = ROUND(COALESCE(SUM(i.amount) FILTER (WHERE i.type = 'credit'), 0), 2),
    'unbalanced_journals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('journal_number', u.journal_number, 'drift', u.drift)), '[]'::jsonb)
      FROM (
        SELECT j.journal_number,
               ROUND(SUM(CASE WHEN k.type = 'debit' THEN k.amount ELSE -k.amount END), 2) AS drift
        FROM public.journal_entries j JOIN public.journal_entry_items k ON k.journal_entry_id = j.id
        WHERE j.company_id = p_company_id
        GROUP BY j.id, j.journal_number
        HAVING ROUND(SUM(CASE WHEN k.type = 'debit' THEN k.amount ELSE -k.amount END), 2) <> 0) u)
  ) INTO v_ledger
  FROM public.journal_entry_items i
  JOIN public.journal_entries j2 ON j2.id = i.journal_entry_id
  WHERE j2.company_id = p_company_id;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'as_of', CURRENT_DATE,
    'calendar', v_calendar,
    'chart', v_chart,
    'control_accounts', v_control,
    'tax', v_tax,
    'banking', v_banking,
    'ledger', v_ledger,
    'flags', jsonb_build_object(
      'bank_accounts_skipped', COALESCE(v_bank_skipped, false),
      'opening_balances_zero_intentional', COALESCE(v_ob_zero, false),
      'inventory_enabled', COALESCE(v_inventory, false),
      'fixed_assets_enabled', COALESCE(v_fixed_assets, false),
      'payroll_enabled', COALESCE(v_payroll, false))
  );
END;
$$;

COMMENT ON FUNCTION public.accounting_facts(uuid) IS
  'Every accounting readiness fact, derived live from master data. Facts only -- the readiness verdict is composed from these in one service. Control accounts are identified by role/classification, never by display name.';

REVOKE ALL ON FUNCTION public.accounting_facts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_facts(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_year_current(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_year_current(uuid) TO authenticated, service_role;
