-- AdminLess Fin — ERP Blueprint V3.0, Phase 3B: Banking & Cash Management
-- integration with the Posting Engine.
--
-- SCOPE NOTE: this codebase has no dedicated banking/cash tables (no
-- bank_accounts, petty_cash, bank_transfers, bank_reconciliations). "Bank
-- accounts" are ordinary chart_of_accounts rows of type 'Asset'. The real,
-- pre-existing direct-GL-write logic in this domain lives in exactly six
-- places: two legacy RPCs not present in tracked migrations (record_invoice_
-- payment, record_loan_payment — bodies read live via pg_get_functiondef)
-- and four inline direct-insert blocks inside edge functions (customer
-- payment-on-account and vendor payment-on-account in payments/index.ts,
-- loan disbursement in loans/index.ts, expense reimbursement in
-- expense-claims/index.ts). This migration retires all six in favour of
-- posting_engine_submit(module='banking'), following the exact template
-- established for accounts_payable/fixed_assets in Phase 3A. It does NOT
-- invent bank_accounts/petty_cash/transfer/reconciliation-adjustment tables
-- or RPCs that don't already exist as features — see the Phase 3B
-- certification report for full disclosure of what was and wasn't in scope.

-- ── record_invoice_payment: 5-param overload (the one actually called, by
--    payments/index.ts RECORD_INVOICE_PAYMENT). External signature unchanged.
--    The unused 4-param overload is left untouched (no caller found anywhere
--    in the codebase — safe to leave dormant, matching the discretion used
--    for the dormant create_invoice_with_taxes overloads in V1.1). ─────────
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid, p_payment_date date, p_asset_account_id uuid, p_ar_account_id uuid, p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_invoice_number text;
  v_total_invoice_amount numeric;
  v_total_paid_so_far numeric;
  v_company_id uuid;
  v_result jsonb;
BEGIN
  SELECT
    i.company_id, i.customer_id, i.invoice_number,
    COALESCE((
      SELECT SUM(jei.amount) FROM public.journal_entry_items jei
      WHERE jei.journal_entry_id = i.journal_entry_id AND jei.type = 'debit'
    ), 0)
  INTO v_company_id, v_customer_id, v_invoice_number, v_total_invoice_amount
  FROM public.invoices i WHERE i.id = p_invoice_id;

  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Invoice not found.'; END IF;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', v_company_id, 'posting_date', p_payment_date, 'module', 'banking',
    'document_type', 'invoice_payment', 'document_id', p_invoice_id,
    'description', 'Payment for Invoice ' || COALESCE(v_invoice_number, ''),
    'customer_id', v_customer_id,
    'idempotency_key', 'banking:invoice_payment:' || p_invoice_id::text || ':' || p_payment_date::text || ':' || p_amount::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_asset_account_id, 'debit', p_amount),
      jsonb_build_object('account_id', p_ar_account_id, 'credit', p_amount)
    )
  ), 'commit');

  -- Same-account credit sum (excluding the original invoice JE) determines
  -- paid/partial status, preserved exactly from the pre-migration logic.
  SELECT COALESCE(SUM(jei.amount), 0) INTO v_total_paid_so_far
  FROM public.journal_entries je
  JOIN public.journal_entry_items jei ON je.id = jei.journal_entry_id
  WHERE je.invoice_id = p_invoice_id AND jei.type = 'credit' AND jei.account_id = p_ar_account_id;

  IF v_total_paid_so_far >= v_total_invoice_amount THEN
    UPDATE public.invoices SET status = 'paid' WHERE id = p_invoice_id;
  END IF;
END;
$$;

-- ── record_loan_payment: unchanged 4-param signature, called by
--    loans/index.ts RECORD_PAYMENT. ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_loan_payment(
  p_schedule_item_id uuid, p_payment_date date, p_bank_account_id uuid, p_interest_expense_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan_data RECORD;
  v_result jsonb;
  v_je_id uuid;
BEGIN
  SELECT
    las.payment_number, las.payment_amount, las.principal, las.interest, las.status,
    l.company_id, l.lender_id, l.liability_account_id, v.name as lender_name
  INTO v_loan_data
  FROM public.loan_amortization_schedule las
  JOIN public.loans l ON las.loan_id = l.id
  JOIN public.vendors v ON l.lender_id = v.id
  WHERE las.id = p_schedule_item_id;

  IF NOT is_company_member(v_loan_data.company_id) THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  IF v_loan_data.status = 'paid' THEN
    RAISE EXCEPTION 'This payment has already been recorded.';
  END IF;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', v_loan_data.company_id, 'posting_date', p_payment_date, 'module', 'banking',
    'document_type', 'loan_payment', 'document_id', p_schedule_item_id,
    'description', 'Loan payment #' || v_loan_data.payment_number || ' to ' || v_loan_data.lender_name,
    'vendor_id', v_loan_data.lender_id,
    'idempotency_key', 'banking:loan_payment:' || p_schedule_item_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_interest_expense_account_id, 'debit', v_loan_data.interest),
      jsonb_build_object('account_id', v_loan_data.liability_account_id, 'debit', v_loan_data.principal),
      jsonb_build_object('account_id', p_bank_account_id, 'credit', v_loan_data.payment_amount)
    )
  ), 'commit');

  v_je_id := (v_result->>'journal_id')::uuid;

  UPDATE public.loan_amortization_schedule
  SET status = 'paid', journal_entry_id = v_je_id
  WHERE id = p_schedule_item_id;
END;
$$;

-- ── record_loan_disbursement_atomic: new. Replaces the direct journal_entries/
--    journal_entry_items insert inline in loans/index.ts POST. Folds in the
--    amortization-schedule generation so loan creation + disbursement posting
--    + schedule become one atomic transaction (an improvement over the
--    pre-existing two-step JS sequence, not a scope expansion). ───────────
CREATE OR REPLACE FUNCTION public.record_loan_disbursement_atomic(
  p_company_id uuid, p_lender_id uuid, p_principal_amount numeric, p_interest_rate numeric,
  p_term_months integer, p_repayment_frequency text, p_start_date date, p_loan_agreement_url text,
  p_deposit_account_id uuid, p_liability_account_id uuid, p_lender_name text,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan_id uuid;
BEGIN
  INSERT INTO public.loans (
    company_id, lender_id, principal_amount, interest_rate, term_months,
    repayment_frequency, start_date, loan_agreement_url, liability_account_id, status
  ) VALUES (
    p_company_id, p_lender_id, p_principal_amount, p_interest_rate, p_term_months,
    p_repayment_frequency, p_start_date, p_loan_agreement_url, p_liability_account_id, 'active'
  )
  RETURNING id INTO v_loan_id;

  PERFORM public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_start_date, 'module', 'banking',
    'document_type', 'loan_disbursement', 'document_id', v_loan_id,
    'description', 'Loan received from ' || COALESCE(p_lender_name, ''),
    'vendor_id', p_lender_id, 'created_by', p_actor_user_id,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_principal_amount),
      jsonb_build_object('account_id', p_liability_account_id, 'credit', p_principal_amount)
    )
  ), 'commit');

  PERFORM public.generate_amortization_schedule(v_loan_id);

  RETURN v_loan_id;
END;
$$;

-- ── record_customer_payment_on_account_atomic: new. Replaces the direct
--    journal_entries/journal_entry_items insert inline in payments/index.ts
--    RECORD_CUSTOMER_PAYMENT (general payment on account, not linked to a
--    specific invoice — record_invoice_payment above covers the linked
--    case). p_idempotency_key is accepted from the caller so a client-side
--    UUID can make retries replay-safe; without one a fresh key is used
--    (best-effort only, since there is no natural document to key off). ──
CREATE OR REPLACE FUNCTION public.record_customer_payment_on_account_atomic(
  p_company_id uuid, p_customer_id uuid, p_payment_date date, p_deposit_account_id uuid,
  p_accounts_receivable_id uuid, p_amount numeric, p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_payment_date, 'module', 'banking',
    'document_type', 'customer_payment_on_account',
    'description', COALESCE(p_description, 'Payment on account'),
    'customer_id', p_customer_id, 'created_by', p_actor_user_id,
    'idempotency_key', COALESCE(p_idempotency_key, 'banking:customer_payment_on_account:' || gen_random_uuid()::text),
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_amount),
      jsonb_build_object('account_id', p_accounts_receivable_id, 'credit', p_amount)
    )
  ), 'commit');
END;
$$;

-- ── record_vendor_payment_on_account_atomic: new. Replaces the direct insert
--    inline in payments/index.ts RECORD_VENDOR_PAYMENT's no-billId branch
--    (pay_specific_bill, already posting-engine-backed since Phase 3A,
--    continues to handle the billId branch unchanged). ────────────────────
CREATE OR REPLACE FUNCTION public.record_vendor_payment_on_account_atomic(
  p_company_id uuid, p_vendor_id uuid, p_payment_date date, p_payment_account_id uuid,
  p_accounts_payable_id uuid, p_amount numeric, p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_payment_date, 'module', 'banking',
    'document_type', 'vendor_payment_on_account',
    'description', COALESCE(p_description, 'Payment on account'),
    'vendor_id', p_vendor_id, 'created_by', p_actor_user_id,
    'idempotency_key', COALESCE(p_idempotency_key, 'banking:vendor_payment_on_account:' || gen_random_uuid()::text),
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_accounts_payable_id, 'debit', p_amount),
      jsonb_build_object('account_id', p_payment_account_id, 'credit', p_amount)
    )
  ), 'commit');
END;
$$;

-- ── reimburse_expense_claim_atomic: new. Replaces the direct insert inline
--    in expense-claims/index.ts REIMBURSE. claim_id is a natural, already-
--    unique idempotency key (a claim can only be reimbursed once — enforced
--    both by the pre-existing status guard below and, now, at the ledger
--    level too). ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reimburse_expense_claim_atomic(
  p_claim_id uuid, p_payment_account_id uuid, p_liability_account_id uuid, p_payment_date date,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_employee_name text;
  v_result jsonb;
BEGIN
  SELECT ec.company_id, ec.claim_number, ec.total_amount, ec.status, e.first_name, e.last_name
  INTO v_claim
  FROM public.expense_claims ec
  LEFT JOIN public.employees e ON e.id = ec.employee_id
  WHERE ec.id = p_claim_id;

  IF v_claim.company_id IS NULL THEN RAISE EXCEPTION 'Expense claim not found.'; END IF;
  IF v_claim.status = 'paid' THEN RAISE EXCEPTION 'Claim has already been reimbursed.'; END IF;
  IF v_claim.status != 'approved' THEN RAISE EXCEPTION 'Only approved claims can be reimbursed.'; END IF;

  v_employee_name := COALESCE(NULLIF(TRIM(COALESCE(v_claim.first_name, '') || ' ' || COALESCE(v_claim.last_name, '')), ''), 'Employee');

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', v_claim.company_id, 'posting_date', p_payment_date, 'module', 'banking',
    'document_type', 'expense_reimbursement', 'document_id', p_claim_id,
    'description', 'Reimbursement for Claim ' || v_claim.claim_number || ' - ' || v_employee_name,
    'created_by', p_actor_user_id,
    'idempotency_key', 'banking:expense_reimbursement:' || p_claim_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_liability_account_id, 'debit', v_claim.total_amount),
      jsonb_build_object('account_id', p_payment_account_id, 'credit', v_claim.total_amount)
    )
  ), 'commit');

  UPDATE public.expense_claims SET status = 'paid' WHERE id = p_claim_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.record_invoice_payment(uuid, date, uuid, uuid, numeric) IS 'V3.0 Phase 3B: unchanged external contract; journal writing delegated to posting_engine_submit(module=banking).';
COMMENT ON FUNCTION public.record_loan_payment IS 'V3.0 Phase 3B: unchanged external contract; journal writing delegated to posting_engine_submit(module=banking).';
COMMENT ON FUNCTION public.record_loan_disbursement_atomic IS 'V3.0 Phase 3B: new atomic RPC replacing direct-insert loan disbursement; folds in amortization schedule generation.';
COMMENT ON FUNCTION public.record_customer_payment_on_account_atomic IS 'V3.0 Phase 3B: new atomic RPC replacing direct-insert customer payment-on-account.';
COMMENT ON FUNCTION public.record_vendor_payment_on_account_atomic IS 'V3.0 Phase 3B: new atomic RPC replacing direct-insert vendor payment-on-account.';
COMMENT ON FUNCTION public.reimburse_expense_claim_atomic IS 'V3.0 Phase 3B: new atomic RPC replacing direct-insert expense claim reimbursement.';

GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, date, uuid, uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_loan_payment(uuid, date, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_loan_disbursement_atomic(uuid, uuid, numeric, numeric, integer, text, date, text, uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_customer_payment_on_account_atomic(uuid, uuid, date, uuid, uuid, numeric, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_vendor_payment_on_account_atomic(uuid, uuid, date, uuid, uuid, numeric, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reimburse_expense_claim_atomic(uuid, uuid, uuid, date, uuid) TO authenticated, service_role;
