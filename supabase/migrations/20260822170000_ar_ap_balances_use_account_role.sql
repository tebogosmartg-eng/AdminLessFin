-- AdminLess Fin — AR/AP balance RPCs must identify control accounts by role,
-- not by display name.
--
-- get_customer_ar_balances and get_vendor_ap_balances located the control
-- account with
--
--     lower(name) LIKE '%accounts payable%' OR lower(name) LIKE '%a/p%'
--
-- A company whose control account is simply named "AP" (or "Trade Creditors",
-- or any localised name) matches neither pattern, so the CTE returned no
-- accounts and EVERY vendor balance computed as zero. Observed on a live tenant
-- with 8 open bills: get_vendor_ap_balances returned 0 rows, so the AP ageing
-- and Pay Bills screens showed nothing outstanding.
--
-- The canonical identifier is `account_role` ('trade_receivable' /
-- 'trade_payable'), the same field accountRoles.ts uses and which the
-- Accounting Setup control-account mapping populates. Runtime accounting
-- identity must never depend on a display name.
--
-- The name patterns are retained ONLY as a fallback for a chart that has not
-- mapped the role yet, so no company that works today regresses.
--
-- SAFETY: read-only reporting functions. No schema change, no data change, no
-- new privilege. SECURITY DEFINER and search_path are preserved exactly.

CREATE OR REPLACE FUNCTION public.get_customer_ar_balances(
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
      AND account_role = 'trade_receivable'
    UNION
    -- Fallback for charts that have not mapped the role yet.
    SELECT id FROM public.chart_of_accounts
    WHERE company_id = v_company_id
      AND type = 'Asset'
      AND (lower(name) LIKE '%accounts receivable%' OR lower(name) LIKE '%a/r%'
           OR lower(name) LIKE '%trade debtor%' OR lower(name) = 'ar')
      AND NOT EXISTS (
        SELECT 1 FROM public.chart_of_accounts r
        WHERE r.company_id = v_company_id AND r.account_role = 'trade_receivable'
      )
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
  LEFT JOIN customer_moves cm ON cm.customer_id = c.id
  WHERE c.company_id = v_company_id
  ORDER BY c.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_vendor_ap_balances(
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
      AND account_role = 'trade_payable'
    UNION
    -- Fallback for charts that have not mapped the role yet.
    SELECT id FROM public.chart_of_accounts
    WHERE company_id = v_company_id
      AND type = 'Liability'
      AND (lower(name) LIKE '%accounts payable%' OR lower(name) LIKE '%a/p%'
           OR lower(name) LIKE '%trade creditor%' OR lower(name) = 'ap')
      AND NOT EXISTS (
        SELECT 1 FROM public.chart_of_accounts r
        WHERE r.company_id = v_company_id AND r.account_role = 'trade_payable'
      )
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
  LEFT JOIN vendor_moves vm ON vm.vendor_id = v.id
  WHERE v.company_id = v_company_id
  ORDER BY v.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_ar_balances(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_vendor_ap_balances(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_vendor_ap_balances IS
  'Vendor AP balances. Identifies the control account by account_role = trade_payable; '
  'the display-name patterns are a fallback for charts that have not mapped the role.';
COMMENT ON FUNCTION public.get_customer_ar_balances IS
  'Customer AR balances. Identifies the control account by account_role = trade_receivable; '
  'the display-name patterns are a fallback for charts that have not mapped the role.';
