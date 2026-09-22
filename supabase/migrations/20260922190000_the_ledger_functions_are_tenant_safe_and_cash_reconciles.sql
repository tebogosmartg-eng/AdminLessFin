-- ============================================================================
-- AdminLess Fin — the ledger functions are tenant-safe, and cash reconciles.
--
-- get_balances_as_of_date, get_period_activity and get_cash_flow_statement are
-- the canonical money functions: the Trial Balance and the Financial
-- Statements both read them, through one aggregation engine. Three defects.
--
-- 1. ANY SIGNED-IN USER COULD READ ANY COMPANY'S LEDGER.
--    All three are SECURITY DEFINER, executable by `authenticated`, take a
--    company id, and never checked membership. Proved against production: as
--    an ordinary user, 5 of 6 reads of companies that user does not belong to
--    returned balances, period activity or cash flows.
--    They also fell back to profiles.active_company_id when no company was
--    passed -- and that fallback could not even run: `id` is ambiguous with the
--    function's own OUT column, so it raised instead of answering.
--
-- 2. THE CASH FLOW STATEMENT DECIDED WHAT CASH IS BY ACCOUNT NAME.
--        type = 'Asset' AND (name LIKE '%cash%' OR '%bank%' OR '%checking%')
--    The balance sheet decides it by account_role (bank, cash) or the
--    'Cash and Cash Equivalents' subcategory. Two definitions of cash, so the
--    cash flow statement could not reconcile to the balance sheet: one company
--    moved 672 225,82 of cash on the balance sheet's definition and the cash
--    flow statement reported 0, because its bank accounts are not NAMED bank.
--
-- 3. THE CASH FLOW STATEMENT COUNTED EACH MOVEMENT ONCE PER OTHER LINE.
--    Every cash line was joined to every non-cash line of its journal and
--    carried its full amount to each. A receipt against an invoice with VAT
--    counted twice. Measured: two companies reported exactly 4x their real
--    cash movement (-256 143,24 against -64 035,81; -70 559,20 against
--    -17 639,80).
--    It also filed every non-cash asset under Investing and every liability
--    under Financing, so collecting a debtor showed as an investment and paying
--    a supplier as financing.
--
-- WHAT THIS DOES
--   * One guard for all three: a company is required, and a signed-in user
--     must be a member of it -- the same is_company_member() rule the row
--     policies use. The service role, which the edge functions use after
--     authorising, carries no user and is unaffected.
--   * One definition of cash, cash_account_ids(), identical to the balance
--     sheet's: account_role bank or cash, or subcategory Cash and Cash
--     Equivalents. Never a name.
--   * The cash a journal moved is equal and opposite to its other lines,
--     because it balances; each non-cash line's own amount, negated, is the
--     cash it accounts for. Summed, that is exactly the cash moved, once.
--   * Each counter-line is classified by the account's own
--     cash_flow_classification when it has one, otherwise by its authoritative
--     category: current assets and liabilities, income and expenses are
--     operating; non-current assets investing; non-current liabilities and
--     equity financing.
--
-- The balance and period-activity arithmetic is unchanged; only the guard is
-- added. No posted entry is touched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_can_read_company_ledger(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'A company is required to read its ledger.' USING ERRCODE = '22023';
  END IF;
  -- The service role carries no user: that is the edge functions, which have
  -- already authorised the request. A signed-in user must belong to the company.
  IF auth.uid() IS NOT NULL AND NOT public.is_company_member(p_company_id) THEN
    RAISE EXCEPTION 'Permission denied: not a member of this company.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_can_read_company_ledger(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_can_read_company_ledger(uuid) TO authenticated, service_role;

-- The one definition of cash. The aggregation engine's balance-sheet rule
-- (isCashBalanceAccount) is the same test: role bank or cash, or the
-- Cash and Cash Equivalents subcategory.
CREATE OR REPLACE FUNCTION public.cash_account_ids(p_company_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id
  FROM public.chart_of_accounts a
  WHERE a.company_id = p_company_id
    AND (a.account_role IN ('bank', 'cash') OR a.subcategory = 'Cash and Cash Equivalents');
$$;

COMMENT ON FUNCTION public.cash_account_ids(uuid) IS
  'The accounts that are cash, by role or classification -- never by name. Must match isCashBalanceAccount in canonicalFinancialAggregation.ts.';

REVOKE ALL ON FUNCTION public.cash_account_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_account_ids(uuid) TO service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_balances_as_of_date(p_end_date date, p_company_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, account_number integer, name text, type account_type, balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_can_read_company_ledger(p_company_id);

  RETURN QUERY
  WITH account_moves AS (
    SELECT
      jei.account_id,
      SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE 0 END) AS total_debits,
      SUM(CASE WHEN jei.type = 'credit' THEN jei.amount ELSE 0 END) AS total_credits
    FROM public.journal_entry_items jei
    JOIN public.journal_entries je ON jei.journal_entry_id = je.id
    WHERE je.entry_date <= p_end_date AND je.company_id = p_company_id
    GROUP BY jei.account_id
  )
  SELECT
    coa.id,
    coa.account_number,
    coa.name,
    coa.type,
    CASE
      WHEN coa.type IN ('Asset', 'Expense') THEN COALESCE(am.total_debits, 0) - COALESCE(am.total_credits, 0)
      ELSE COALESCE(am.total_credits, 0) - COALESCE(am.total_debits, 0)
    END AS balance
  FROM public.chart_of_accounts coa
  LEFT JOIN account_moves am ON coa.id = am.account_id
  WHERE coa.company_id = p_company_id;
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_period_activity(p_start_date date, p_end_date date, p_company_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, name text, type account_type, activity numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_can_read_company_ledger(p_company_id);

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
      AND je.company_id = p_company_id
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
  WHERE coa.company_id = p_company_id
    AND coa.type IN ('Income', 'Expense');
END;
$function$;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_cash_flow_statement(p_start_date date, p_end_date date, p_company_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(section text, category text, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_can_read_company_ledger(p_company_id);

  RETURN QUERY
  WITH cash_accounts AS (
    SELECT c.cash_id FROM public.cash_account_ids(p_company_id) AS c(cash_id)
  ),
  cash_journals AS (
    -- Every journal in the period that touched cash.
    SELECT DISTINCT je.id AS journal_entry_id
    FROM public.journal_entries je
    JOIN public.journal_entry_items jei ON jei.journal_entry_id = je.id
    WHERE je.company_id = p_company_id
      AND je.entry_date BETWEEN p_start_date AND p_end_date
      AND jei.account_id IN (SELECT ca.cash_id FROM cash_accounts ca)
  ),
  counter_lines AS (
    -- A journal balances, so the cash it moved is equal and opposite to the sum
    -- of its other lines. Each non-cash line's own amount, negated, is the cash
    -- that line accounts for; summed over the journal it is the cash moved,
    -- counted once. A transfer between two cash accounts has no other lines
    -- and is correctly not a cash flow at all.
    SELECT
      -1 * jei.amount * (CASE WHEN jei.type = 'debit' THEN 1 ELSE -1 END) AS cash_effect,
      coa.name AS account_name,
      coa.type::text AS account_type,
      coa.category AS account_category,
      lower(COALESCE(coa.cash_flow_classification, '')) AS cfc
    FROM cash_journals cj
    JOIN public.journal_entry_items jei ON jei.journal_entry_id = cj.journal_entry_id
    JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
    WHERE jei.account_id NOT IN (SELECT ca.cash_id FROM cash_accounts ca)
  ),
  classified AS (
    SELECT
      cl.cash_effect,
      CASE
        -- The account's own cash flow classification wins when it has one.
        WHEN cl.cfc = 'operating' THEN 'Operating'
        WHEN cl.cfc = 'investing' THEN 'Investing'
        WHEN cl.cfc = 'financing' THEN 'Financing'
        -- Otherwise its authoritative category.
        WHEN cl.account_type IN ('Income', 'Expense') THEN 'Operating'
        WHEN cl.account_type = 'Asset' AND cl.account_category = 'Current Assets' THEN 'Operating'
        WHEN cl.account_type = 'Asset' AND cl.account_category = 'Non-Current Assets' THEN 'Investing'
        WHEN cl.account_type = 'Liability' AND cl.account_category = 'Current Liabilities' THEN 'Operating'
        WHEN cl.account_type = 'Liability' AND cl.account_category = 'Non-Current Liabilities' THEN 'Financing'
        WHEN cl.account_type = 'Equity' THEN 'Financing'
        ELSE 'Unclassified'
      END AS cf_section,
      cl.account_name AS cf_category
    FROM counter_lines cl
  )
  SELECT
    k.cf_section,
    k.cf_category,
    ROUND(SUM(k.cash_effect), 2)
  FROM classified k
  GROUP BY k.cf_section, k.cf_category
  ORDER BY
    CASE k.cf_section
      WHEN 'Operating' THEN 1
      WHEN 'Investing' THEN 2
      WHEN 'Financing' THEN 3
      ELSE 4
    END,
    k.cf_category;
END;
$function$;
