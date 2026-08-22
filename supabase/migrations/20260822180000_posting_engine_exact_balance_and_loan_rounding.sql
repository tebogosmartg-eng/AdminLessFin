-- AdminLess Fin — double entry must be exact.
--
-- A live tenant carried an unbalanced journal:
--
--   JE-000017  2026-08-01  "Loan payment #1 to kudzanai"
--     debit   8 333,33  interest
--     debit  37 811,59  loan liability
--     credit 46 144,93  payment
--     debits 46 144,92  vs credits 46 144,93   -> out by R0,01
--
-- Two defects combined to allow it.
--
-- 1. record_loan_payment posted `principal` and `interest` from the
--    amortisation schedule as independent figures. Each is rounded to cents on
--    its own, so principal + interest need not equal payment_amount. Principal
--    is by definition the balancing figure of a loan instalment, so it is now
--    derived as payment_amount - interest. The instalment can no longer be
--    posted out of balance regardless of what the stored schedule rounds to,
--    and the amount charged to the customer is unchanged.
--
-- 2. posting_engine_submit accepted any imbalance up to and including one cent:
--
--        IF ABS(v_total_debit - v_total_credit) > 0.01 THEN ... reject
--
--    An out-by-exactly-0.01 journal passes that test, which is how the entry
--    above reached the ledger. Amounts are `numeric`, not floating point, so
--    there is no rounding noise to absorb: the tolerance only ever admitted
--    real errors. The check is tightened to exact equality.
--
--    The tightening is applied by rewriting the CURRENT function definition
--    from the catalog rather than restating the (large) body here, so this
--    migration cannot silently revert any later change to the posting engine.
--
-- This STRENGTHENS an accounting control. Nothing is relaxed. Existing balanced
-- journals are unaffected; a module that was quietly relying on the one-cent
-- slack will now fail loudly at posting time, which is the correct outcome.
--
-- NOTE: the historical JE-000017 imbalance is NOT edited by this migration.
-- Posted history is not rewritten silently; correcting it requires a one-cent
-- adjusting journal, which is an accounting decision for the customer.

-- ── 1. Loan instalment: principal is the balancing figure ──────────────────
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
  v_principal numeric;
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

  -- Principal is the plug: payment less interest. Posting the stored principal
  -- alongside the stored payment_amount allowed the two independently rounded
  -- figures to disagree by a cent.
  v_principal := ROUND(COALESCE(v_loan_data.payment_amount, 0) - COALESCE(v_loan_data.interest, 0), 2);

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', v_loan_data.company_id, 'posting_date', p_payment_date, 'module', 'banking',
    'document_type', 'loan_payment', 'document_id', p_schedule_item_id,
    'description', 'Loan payment #' || v_loan_data.payment_number || ' to ' || v_loan_data.lender_name,
    'vendor_id', v_loan_data.lender_id,
    'idempotency_key', 'banking:loan_payment:' || p_schedule_item_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_interest_expense_account_id, 'debit', ROUND(COALESCE(v_loan_data.interest, 0), 2)),
      jsonb_build_object('account_id', v_loan_data.liability_account_id, 'debit', v_principal),
      jsonb_build_object('account_id', p_bank_account_id, 'credit', ROUND(COALESCE(v_loan_data.payment_amount, 0), 2))
    )
  ), 'commit');

  v_je_id := (v_result->>'journal_id')::uuid;

  UPDATE public.loan_amortization_schedule
  SET status = 'paid', journal_entry_id = v_je_id
  WHERE id = p_schedule_item_id;
END;
$$;

COMMENT ON FUNCTION public.record_loan_payment IS
  'Posts a loan instalment. Principal is derived as payment_amount - interest so '
  'the instalment always balances exactly; the stored schedule principal is '
  'presentation only.';

-- ── 2. Posting engine: exact balance ──────────────────────────────────────
DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'posting_engine_submit'
  LIMIT 1;

  IF v_def IS NULL THEN
    RAISE NOTICE 'posting_engine_submit not found — balance tolerance unchanged.';
    RETURN;
  END IF;

  v_new := replace(
    v_def,
    'ABS(v_total_debit - v_total_credit) > 0.01',
    'ABS(v_total_debit - v_total_credit) > 0'
  );

  IF v_new = v_def THEN
    RAISE NOTICE 'One-cent tolerance not present in posting_engine_submit — already exact.';
  ELSE
    EXECUTE v_new;
    RAISE NOTICE 'posting_engine_submit now requires debits to equal credits exactly.';
  END IF;
END $$;
