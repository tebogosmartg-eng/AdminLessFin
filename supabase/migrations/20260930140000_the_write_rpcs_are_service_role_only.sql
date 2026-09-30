-- ============================================================================
-- AdminLess Fin — the write RPCs are service-role only.
--
-- 20260729060100 revoked function EXECUTE from PUBLIC/anon and then granted
-- EVERY public function to authenticated (and made that the default for new
-- functions). The posting engine and every module's atomic write RPC are
-- SECURITY DEFINER, and most identify the tenant from their arguments — so
-- any signed-in user could call POST /rest/v1/rpc/posting_engine_submit (or
-- record_bill_with_taxes, finalize_payroll_run_atomic, …) against ANY
-- company. The frontend has no supabase.rpc() calls at all: every legitimate
-- write goes through an edge function that checks company membership and
-- then uses the service-role client.
--
-- This migration applies the pattern the credit-note/quote/receipt work
-- proved (Pattern B): EXECUTE revoked from authenticated, granted to
-- service_role; the edge function is the authorisation layer. Nested calls
-- between SECURITY DEFINER functions run as the function owner and are
-- unaffected.
--
-- The four dashboard reads the browser still reaches with the user's JWT
-- keep their grant but now assert real-caller membership via
-- assert_can_read_company_ledger (the 20260922190000 helper), exactly like
-- the canonical ledger reads.
--
-- Deploy order: the payments edge function (record_invoice_payment moved to
-- the admin client) deploys with this migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The dashboard/AR/AP reads called with the user's JWT: guard, keep grant.
--    Bodies identical to their latest definitions (20260822170000 and
--    20260729170000) plus the one PERFORM line.
-- ----------------------------------------------------------------------------

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

  -- A signed-in caller may only read a company they belong to.
  PERFORM public.assert_can_read_company_ledger(v_company_id);

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

  -- A signed-in caller may only read a company they belong to.
  PERFORM public.assert_can_read_company_ledger(v_company_id);

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

CREATE OR REPLACE FUNCTION public.get_overdue_invoices(
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

  -- A signed-in caller may only read a company they belong to.
  PERFORM public.assert_can_read_company_ledger(v_company_id);

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

CREATE OR REPLACE FUNCTION public.get_budgets_with_activity(
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

  -- A signed-in caller may only read a company they belong to.
  PERFORM public.assert_can_read_company_ledger(v_company_id);

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

-- ----------------------------------------------------------------------------
-- 2. Everything a browser must never call directly: EXECUTE for the service
--    role only, every overload. The list is deliberately explicit; a DO block
--    resolves each name to its live signatures so no overload is missed and
--    a function absent from an environment is skipped, not an error.
--
--    Left callable by authenticated on purpose:
--    - the guarded ledger/account reads (assert_can_read_company_ledger and
--      the inline auth.uid() membership checks): record_loan_payment,
--      dispose_asset, get_account_*, get_balances_as_of_date,
--      get_period_activity, get_cash_flow_statement, get_next_*_for_user;
--    - assert_period_open / assert_bank_account_open (benign assertions used
--      as defense-in-depth from many contexts).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
        -- the ledger gateway itself
        'posting_engine_submit',
        'posting_engine_rollback',
        'posting_engine_next_journal_number',
        -- sales
        'post_sales_invoice_atomic',
        'record_invoice_payment',
        'invoice_refresh_payment_status',
        'update_invoice_full',
        'create_invoice_with_taxes',
        'convert_quote_to_invoice_atomic',
        'update_journal_entry_full',
        -- purchases
        'record_bill_with_taxes',
        'record_bill_with_inventory',
        -- banking
        'record_customer_payment_on_account_atomic',
        'record_vendor_payment_on_account_atomic',
        'record_bank_transaction_atomic',
        'record_bank_transfer_atomic',
        'post_bank_opening_balance_atomic',
        'create_bank_account_atomic',
        'match_statement_line_atomic',
        'post_statement_line_adjustment_atomic',
        'create_bank_statement_import_atomic',
        'set_default_bank_account',
        -- payroll
        'finalize_payroll_run_atomic',
        'reverse_payroll_run_atomic',
        'post_payroll_adjustment_atomic',
        -- treasury / claims / assets
        'record_loan_disbursement_atomic',
        'generate_amortization_schedule',
        'reimburse_expense_claim_atomic',
        'acquire_fixed_asset_atomic',
        'allocate_asset_code',
        -- inventory
        'receive_stock_atomic',
        'issue_stock_atomic',
        'eim_consume_stock',
        'eim_get_or_create_balance',
        'eim_sync_product_qty',
        'eim_ensure_default_warehouse',
        -- quick capture
        'record_owner_paid_expense_atomic',
        'record_bank_paid_quick_capture',
        'ensure_due_to_owner_account',
        'ensure_expense_account_by_name',
        'seed_quick_expense_categories',
        -- calendar / counters / logs / sync
        'generate_accounting_periods',
        'business_event_next_sequence',
        'generate_employee_number',
        'sync_employee_sequence_after_import',
        'accounting_policy_log_result',
        'accounting_rules_log_execution',
        'ensure_auth_user_in_public_users',
        -- internal-only reads (edge functions call them with the admin
        -- client; resolve_erp_context otherwise leaks any company's name,
        -- tax id and any user's role to any signed-in caller)
        'resolve_erp_context',
        'accounting_policy_evaluate_posting',
        'accounting_rules_resolve',
        'peek_next_asset_code',
        'preview_employee_number',
        'validate_employee_number_format',
        'suggest_quick_expense_category',
        'resolve_payroll_control_account',
        -- retired dashboard reads (no caller left in the app)
        'get_monthly_summary',
        'get_top_expenses'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. invoice_payment_allocations: settlement is written ONLY by the posting
--    RPCs (service role). The FOR ALL policy let any member write, update or
--    delete allocations directly and skew outstanding/ageing past the engine.
--    bill_payment_allocations has been SELECT-only from day one; match it.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS invoice_payment_allocations_all ON public.invoice_payment_allocations;
