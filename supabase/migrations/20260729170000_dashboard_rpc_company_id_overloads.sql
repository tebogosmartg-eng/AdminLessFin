-- HOTFIX: Dashboard operational RPCs company isolation
-- Root cause: dashboard-data / payments / budgets invoked AR/AP/overdue/monthly/
-- top-expenses/budgets RPCs without p_company_id. Those functions only read
-- profiles.active_company_id, which desyncs from the UI company switcher for
-- multi-company users.
-- Additive: replace with p_company_id DEFAULT NULL overloads, matching
-- get_balances_as_of_date / get_period_activity pattern. No engine redesign.

-- ---------------------------------------------------------------------------
-- get_customer_ar_balances
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_customer_ar_balances();
DROP FUNCTION IF EXISTS public.get_customer_ar_balances(uuid);

CREATE FUNCTION public.get_customer_ar_balances(
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(customer_id uuid, customer_name text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_company_exists boolean;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
  ELSE
    SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) INTO v_company_exists;
  IF NOT v_company_exists THEN RETURN; END IF;

  RETURN QUERY
  WITH ar_accounts AS (
    SELECT id FROM public.chart_of_accounts
    WHERE company_id = v_company_id
      AND type = 'Asset'
      AND (lower(name) LIKE '%accounts receivable%' OR lower(name) LIKE '%a/r%')
  ),
  customer_moves AS (
    SELECT
      je.customer_id,
      SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE 0 END) as total_debits,
      SUM(CASE WHEN jei.type = 'credit' THEN jei.amount ELSE 0 END) as total_credits
    FROM public.journal_entry_items jei
    JOIN public.journal_entries je ON jei.journal_entry_id = je.id
    WHERE je.company_id = v_company_id
      AND je.customer_id IS NOT NULL
      AND jei.account_id IN (SELECT id FROM ar_accounts)
    GROUP BY je.customer_id
  )
  SELECT
    c.id as customer_id,
    c.name as customer_name,
    COALESCE(cm.total_debits, 0) - COALESCE(cm.total_credits, 0) as balance
  FROM public.customers c
  JOIN customer_moves cm ON c.id = cm.customer_id
  WHERE c.company_id = v_company_id
    AND (COALESCE(cm.total_debits, 0) - COALESCE(cm.total_credits, 0)) > 0.009;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_vendor_ap_balances
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_vendor_ap_balances();
DROP FUNCTION IF EXISTS public.get_vendor_ap_balances(uuid);

CREATE FUNCTION public.get_vendor_ap_balances(
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(vendor_id uuid, vendor_name text, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_company_exists boolean;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
  ELSE
    SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) INTO v_company_exists;
  IF NOT v_company_exists THEN RETURN; END IF;

  RETURN QUERY
  WITH ap_accounts AS (
    SELECT id FROM public.chart_of_accounts
    WHERE company_id = v_company_id
      AND type = 'Liability'
      AND (lower(name) LIKE '%accounts payable%' OR lower(name) LIKE '%a/p%')
  ),
  vendor_moves AS (
    SELECT
      je.vendor_id,
      SUM(CASE WHEN jei.type = 'credit' THEN jei.amount ELSE 0 END) as total_credits,
      SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE 0 END) as total_debits
    FROM public.journal_entry_items jei
    JOIN public.journal_entries je ON jei.journal_entry_id = je.id
    WHERE je.company_id = v_company_id
      AND je.vendor_id IS NOT NULL
      AND jei.account_id IN (SELECT id FROM ap_accounts)
    GROUP BY je.vendor_id
  )
  SELECT
    v.id as vendor_id,
    v.name as vendor_name,
    COALESCE(vm.total_credits, 0) - COALESCE(vm.total_debits, 0) as balance
  FROM public.vendors v
  JOIN vendor_moves vm ON v.id = vm.vendor_id
  WHERE v.company_id = v_company_id
    AND (COALESCE(vm.total_credits, 0) - COALESCE(vm.total_debits, 0)) > 0.009;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_overdue_invoices
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_overdue_invoices();
DROP FUNCTION IF EXISTS public.get_overdue_invoices(uuid);

CREATE FUNCTION public.get_overdue_invoices(
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, invoice_number text, due_date date, customer_name text, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    RAISE EXCEPTION 'User does not have an active company.';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.due_date,
    c.name as customer_name,
    (
      SELECT SUM(jei.amount)
      FROM public.journal_entry_items jei
      WHERE jei.journal_entry_id = i.journal_entry_id AND jei.type = 'debit'
    ) as total
  FROM public.invoices i
  JOIN public.customers c ON i.customer_id = c.id
  WHERE i.company_id = v_company_id
    AND i.status = 'sent'
    AND i.due_date < CURRENT_DATE
  ORDER BY i.due_date ASC
  LIMIT 5;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_monthly_summary
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_monthly_summary(integer);
DROP FUNCTION IF EXISTS public.get_monthly_summary(integer, uuid);

CREATE FUNCTION public.get_monthly_summary(
  p_months integer,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(month_start date, total_income numeric, total_expenses numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_company_exists boolean;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
  ELSE
    SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) INTO v_company_exists;
  IF NOT v_company_exists THEN RETURN; END IF;

  RETURN QUERY
  WITH months AS (
    SELECT date_trunc('month', generate_series(
      NOW() - (p_months - 1) * interval '1 month',
      NOW(),
      '1 month'
    ))::date AS month_start
  ),
  monthly_moves AS (
    SELECT
      date_trunc('month', je.entry_date)::date as move_month,
      coa.type,
      SUM(CASE WHEN jei.type = 'credit' THEN jei.amount ELSE -jei.amount END) as income_activity,
      SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE -jei.amount END) as expense_activity
    FROM public.journal_entry_items jei
    JOIN public.journal_entries je ON jei.journal_entry_id = je.id
    JOIN public.chart_of_accounts coa ON jei.account_id = coa.id
    WHERE je.company_id = v_company_id
      AND je.entry_date >= date_trunc('month', NOW() - (p_months - 1) * interval '1 month')
      AND coa.type IN ('Income', 'Expense')
    GROUP BY move_month, coa.type
  )
  SELECT
    m.month_start,
    COALESCE(SUM(mm.income_activity) FILTER (WHERE mm.type = 'Income'), 0) as total_income,
    COALESCE(SUM(mm.expense_activity) FILTER (WHERE mm.type = 'Expense'), 0) as total_expenses
  FROM months m
  LEFT JOIN monthly_moves mm ON m.month_start = mm.move_month
  GROUP BY m.month_start
  ORDER BY m.month_start;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_top_expenses
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_top_expenses(date, date);
DROP FUNCTION IF EXISTS public.get_top_expenses(date, date, uuid);

CREATE FUNCTION public.get_top_expenses(
  p_start_date date,
  p_end_date date,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(account_name text, total_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_company_exists boolean;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
  ELSE
    SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) INTO v_company_exists;
  IF NOT v_company_exists THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    coa.name as account_name,
    SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE -jei.amount END) as total_amount
  FROM public.journal_entry_items jei
  JOIN public.journal_entries je ON jei.journal_entry_id = je.id
  JOIN public.chart_of_accounts coa ON jei.account_id = coa.id
  WHERE je.company_id = v_company_id
    AND coa.type = 'Expense'
    AND je.entry_date >= p_start_date
    AND je.entry_date <= p_end_date
  GROUP BY coa.name
  HAVING SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE -jei.amount END) > 0
  ORDER BY total_amount DESC
  LIMIT 5;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_budgets_with_activity (budgets edge already passes p_company_id)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_budgets_with_activity();
DROP FUNCTION IF EXISTS public.get_budgets_with_activity(uuid);

CREATE FUNCTION public.get_budgets_with_activity(
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  account_id uuid,
  amount numeric,
  period text,
  start_date date,
  account_name text,
  actual_amount numeric,
  period_start_date date,
  period_end_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    RAISE EXCEPTION 'User does not have an active company.';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.account_id,
    b.amount,
    b.period,
    b.start_date,
    coa.name as account_name,
    (
      SELECT COALESCE(SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE -jei.amount END), 0)
      FROM public.journal_entry_items jei
      JOIN public.journal_entries je ON jei.journal_entry_id = je.id
      WHERE je.company_id = v_company_id
        AND jei.account_id = b.account_id
        AND je.entry_date >=
          CASE
            WHEN b.period = 'monthly' THEN date_trunc('month', NOW())
            WHEN b.period = 'quarterly' THEN date_trunc('quarter', NOW())
            WHEN b.period = 'yearly' THEN date_trunc('year', NOW())
            ELSE NOW()
          END::date
        AND je.entry_date <=
          CASE
            WHEN b.period = 'monthly' THEN (date_trunc('month', NOW()) + interval '1 month - 1 day')
            WHEN b.period = 'quarterly' THEN (date_trunc('quarter', NOW()) + interval '3 months - 1 day')
            WHEN b.period = 'yearly' THEN (date_trunc('year', NOW()) + interval '1 year - 1 day')
            ELSE NOW()
          END::date
    ) as actual_amount,
    CASE
      WHEN b.period = 'monthly' THEN date_trunc('month', NOW())
      WHEN b.period = 'quarterly' THEN date_trunc('quarter', NOW())
      WHEN b.period = 'yearly' THEN date_trunc('year', NOW())
      ELSE NOW()
    END::date as period_start_date,
    CASE
      WHEN b.period = 'monthly' THEN (date_trunc('month', NOW()) + interval '1 month - 1 day')
      WHEN b.period = 'quarterly' THEN (date_trunc('quarter', NOW()) + interval '3 months - 1 day')
      WHEN b.period = 'yearly' THEN (date_trunc('year', NOW()) + interval '1 year - 1 day')
      ELSE NOW()
    END::date as period_end_date
  FROM public.budgets b
  JOIN public.chart_of_accounts coa ON b.account_id = coa.id
  WHERE b.company_id = v_company_id
  ORDER BY coa.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_ar_balances(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_ap_balances(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_overdue_invoices(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_monthly_summary(integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_top_expenses(date, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_budgets_with_activity(uuid) TO authenticated, service_role;
