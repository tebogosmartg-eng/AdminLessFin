-- HOTFIX: EXTRACT_FACT_SNAPSHOT / reports RPC company isolation
-- Root cause: edge invoked get_period_activity / get_cash_flow_statement with p_company_id,
-- but only (p_start_date, p_end_date) signatures existed → PostgREST PGRST202 → HTTP 500.
-- Additive: replace 2-arg functions with 3-arg (p_company_id DEFAULT NULL), matching
-- get_balances_as_of_date(p_end_date, p_company_id) pattern. No engine redesign.

DROP FUNCTION IF EXISTS public.get_period_activity(date, date);
DROP FUNCTION IF EXISTS public.get_period_activity(date, date, uuid);

CREATE FUNCTION public.get_period_activity(
  p_start_date date,
  p_end_date date,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, type account_type, activity numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
  ELSE
    SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH account_moves AS (
    SELECT
      jei.account_id,
      SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE 0 END) AS total_debits,
      SUM(CASE WHEN jei.type = 'credit' THEN jei.amount ELSE 0 END) AS total_credits
    FROM public.journal_entry_items jei
    JOIN public.journal_entries je ON jei.journal_entry_id = je.id
    WHERE je.entry_date >= p_start_date
      AND je.entry_date <= p_end_date
      AND je.company_id = v_company_id
    GROUP BY jei.account_id
  )
  SELECT
    coa.id,
    coa.name,
    coa.type,
    CASE
      WHEN coa.type IN ('Income') THEN COALESCE(am.total_credits, 0) - COALESCE(am.total_debits, 0)
      WHEN coa.type IN ('Expense') THEN COALESCE(am.total_debits, 0) - COALESCE(am.total_credits, 0)
      ELSE 0
    END AS activity
  FROM public.chart_of_accounts coa
  LEFT JOIN account_moves am ON coa.id = am.account_id
  WHERE coa.company_id = v_company_id
    AND coa.type IN ('Income', 'Expense');
END;
$$;

DROP FUNCTION IF EXISTS public.get_cash_flow_statement(date, date);
DROP FUNCTION IF EXISTS public.get_cash_flow_statement(date, date, uuid);

CREATE FUNCTION public.get_cash_flow_statement(
  p_start_date date,
  p_end_date date,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(section text, category text, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
  ELSE
    SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH cash_accounts AS (
    SELECT id
    FROM public.chart_of_accounts
    WHERE company_id = v_company_id
      AND (
        type = 'Asset'
        AND (
          lower(name) LIKE '%cash%'
          OR lower(name) LIKE '%bank%'
          OR lower(name) LIKE '%checking%'
        )
      )
  ),
  cash_moves AS (
    SELECT
      je.id AS journal_entry_id,
      jei.amount * (CASE WHEN jei.type = 'debit' THEN 1 ELSE -1 END) AS move_amount
    FROM public.journal_entry_items jei
    JOIN public.journal_entries je ON jei.journal_entry_id = je.id
    WHERE je.company_id = v_company_id
      AND je.entry_date BETWEEN p_start_date AND p_end_date
      AND jei.account_id IN (SELECT id FROM cash_accounts)
  ),
  classified_moves AS (
    SELECT
      cm.move_amount,
      CASE
        WHEN other_coa.type IN ('Income', 'Expense') THEN 'Operating'
        WHEN other_coa.type = 'Asset' AND other_coa.id NOT IN (SELECT id FROM cash_accounts) THEN 'Investing'
        WHEN other_coa.type IN ('Liability', 'Equity') THEN 'Financing'
        ELSE 'Unclassified'
      END AS section,
      other_coa.name AS category
    FROM cash_moves cm
    JOIN public.journal_entry_items other_jei ON cm.journal_entry_id = other_jei.journal_entry_id
    JOIN public.chart_of_accounts other_coa ON other_jei.account_id = other_coa.id
    WHERE other_jei.account_id NOT IN (SELECT id FROM cash_accounts)
  )
  SELECT
    cm.section,
    cm.category,
    SUM(cm.move_amount) AS amount
  FROM classified_moves cm
  GROUP BY cm.section, cm.category
  ORDER BY
    CASE cm.section
      WHEN 'Operating' THEN 1
      WHEN 'Investing' THEN 2
      WHEN 'Financing' THEN 3
      ELSE 4
    END,
    cm.category;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_period_activity(date, date, uuid) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_flow_statement(date, date, uuid) TO authenticated, service_role, anon;
