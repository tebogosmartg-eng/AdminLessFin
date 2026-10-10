-- A payroll run is reversed on its own date (ADR-0009).
--
-- posting_engine_rollback dated every reversal today. Reversing a payroll run that
-- belongs to another month or year therefore moved its cost: reversing a 2027 run
-- in 2026 made 2026's wages negative, and the financial statements' employee costs
-- no longer agreed with payroll for either year.
--
-- 1. posting_engine_rollback takes an optional reversal date (default today, so
--    every existing caller is unchanged). The period of the date used must be open,
--    exactly as before. The reversal also keeps each line's description.
-- 2. reverse_payroll_run_atomic reverses on the run's pay date when that period is
--    still open, and today when it is closed (a correction in the current period).
-- Journals already posted are not changed.

DROP FUNCTION IF EXISTS public.posting_engine_rollback(text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.posting_engine_rollback(
  p_idempotency_key text,
  p_company_id uuid,
  p_reason text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_reversal_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_original record;
  v_source_je record;
  v_erp jsonb;
  v_reversal_key text;
  v_je_id uuid;
  v_journal_number text;
  v_line record;
  v_fy_id uuid;
  v_ap_id uuid;
  v_request_id uuid;
  v_date date := COALESCE(p_reversal_date, CURRENT_DATE);
BEGIN
  IF p_actor_user_id IS NOT NULL THEN
    v_erp := public.resolve_erp_context(p_actor_user_id, p_company_id);
  ELSIF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'posting_engine_rollback: company not found' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_original FROM posting_requests
    WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;

  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'posting_engine_rollback: no posting found for idempotency key %', p_idempotency_key
      USING ERRCODE = '22023';
  END IF;
  IF v_original.status <> 'committed' THEN
    RAISE EXCEPTION 'posting_engine_rollback: posting % is % — only a committed posting can be reversed', p_idempotency_key, v_original.status
      USING ERRCODE = '22023';
  END IF;

  v_reversal_key := 'reversal:' || v_original.id::text;
  IF EXISTS (SELECT 1 FROM posting_requests WHERE company_id = p_company_id AND idempotency_key = v_reversal_key AND status = 'committed') THEN
    RAISE EXCEPTION 'posting_engine_rollback: posting % has already been reversed', p_idempotency_key USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_period_open(p_company_id, v_date);

  -- The journal being reversed, for its party attribution.
  SELECT vendor_id, customer_id INTO v_source_je
  FROM journal_entries WHERE id = v_original.journal_entry_id;

  v_journal_number := public.posting_engine_next_journal_number(p_company_id);

  INSERT INTO journal_entries (
    company_id, entry_date, description, journal_number,
    vendor_id, customer_id
  )
  VALUES (
    p_company_id, v_date,
    'Reversal of ' || COALESCE(v_original.journal_number, v_original.id::text) || COALESCE(': ' || p_reason, ''),
    v_journal_number,
    v_source_je.vendor_id, v_source_je.customer_id
  )
  RETURNING id INTO v_je_id;

  -- project_id, dimensions and the line's description are carried too: without
  -- them a voided document keeps inflating project and dimensional reporting even
  -- though the control account nets to zero.
  FOR v_line IN
    SELECT account_id, type, amount, project_id, dimensions, description
    FROM journal_entry_items WHERE journal_entry_id = v_original.journal_entry_id
  LOOP
    INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount, project_id, dimensions, description)
    VALUES (
      v_je_id, v_line.account_id,
      CASE WHEN v_line.type = 'debit' THEN 'credit' ELSE 'debit' END,
      v_line.amount, v_line.project_id, COALESCE(v_line.dimensions, '{}'::jsonb), v_line.description
    );
  END LOOP;

  SELECT financial_year_id, accounting_period_id INTO v_fy_id, v_ap_id FROM journal_entries WHERE id = v_je_id;

  INSERT INTO posting_requests (
    company_id, idempotency_key, module, document_type, document_id, reference, description,
    created_by, status, journal_entry_id, journal_number, financial_year_id, accounting_period_id,
    reversal_of_id, committed_at
  ) VALUES (
    p_company_id, v_reversal_key, v_original.module, v_original.document_type, v_original.document_id,
    v_original.reference, 'Reversal: ' || COALESCE(p_reason, 'no reason given'),
    p_actor_user_id, 'committed', v_je_id, v_journal_number, v_fy_id, v_ap_id, v_original.id, now()
  ) RETURNING id INTO v_request_id;

  UPDATE posting_requests SET status = 'reversed' WHERE id = v_original.id;

  RETURN jsonb_build_object(
    'journal_id', v_je_id, 'journal_number', v_journal_number, 'posting_status', 'committed',
    'financial_year_id', v_fy_id, 'accounting_period_id', v_ap_id, 'timestamp', now(),
    'warnings', '[]'::jsonb, 'posting_request_id', v_request_id, 'reverses_journal_id', v_original.journal_entry_id,
    'reversal_date', v_date
  );
END;
$fn$;

COMMENT ON FUNCTION public.posting_engine_rollback IS
  'ERP V2.0 Phase 2: reverses a committed posting via an equal-and-opposite '
  'journal (Rollback Mode), dated p_reversal_date (default today; its period must '
  'be open). Never mutates or deletes the original. The reversal carries the '
  'source journal''s vendor_id/customer_id, project_id, dimensions and line '
  'descriptions.';

REVOKE ALL ON FUNCTION public.posting_engine_rollback(text, uuid, text, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.posting_engine_rollback(text, uuid, text, uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_payroll_run_atomic(
  p_company_id uuid,
  p_run_id uuid,
  p_reason text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_reopen boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_result jsonb;
  v_idempotency_key text;
  v_date date := CURRENT_DATE;
BEGIN
  SELECT * INTO v_run
  FROM public.payroll_runs
  WHERE id = p_run_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found for this company' USING ERRCODE = '22023';
  END IF;

  IF v_run.status NOT IN ('finalized', 'paid') THEN
    RAISE EXCEPTION 'Only finalized/paid payroll runs can be reversed.' USING ERRCODE = 'P0001';
  END IF;

  IF v_run.posting_request_id IS NULL AND v_run.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Payroll run has no posting to reverse.' USING ERRCODE = 'P0001';
  END IF;

  v_idempotency_key := 'payroll:payroll_run:' || p_run_id::text;

  -- The run's own date while its period is open, so its cost leaves the period
  -- it was charged to; today once that period is closed.
  IF v_run.pay_date IS NOT NULL THEN
    BEGIN
      PERFORM public.assert_period_open(p_company_id, v_run.pay_date);
      v_date := v_run.pay_date;
    EXCEPTION WHEN OTHERS THEN
      v_date := CURRENT_DATE;
    END;
  END IF;

  IF v_run.posting_request_id IS NOT NULL THEN
    v_result := public.posting_engine_rollback(
      v_idempotency_key,
      p_company_id,
      COALESCE(p_reason, 'Payroll reversal'),
      p_actor_user_id,
      v_date
    );
  ELSE
    RAISE EXCEPTION 'Legacy payroll journal (pre-Posting Engine) cannot be reversed via the engine. Create a manual correcting journal.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payslips
  SET payment_status = 'pending'
  WHERE payroll_run_id = p_run_id AND company_id = p_company_id;

  IF p_reopen THEN
    UPDATE public.payroll_runs
    SET
      status = 'draft',
      journal_entry_id = NULL,
      posting_request_id = NULL,
      processed_at = NULL,
      processed_by = NULL,
      output_metadata = COALESCE(output_metadata, '{}'::jsonb) || jsonb_build_object(
        'reversed_at', now(),
        'reversal_date', v_date,
        'reversal_posting_request_id', v_result->>'posting_request_id',
        'reopened', true,
        'journal_posted', false
      )
    WHERE id = p_run_id AND company_id = p_company_id;
  ELSE
    UPDATE public.payroll_runs
    SET output_metadata = COALESCE(output_metadata, '{}'::jsonb) || jsonb_build_object(
      'reversed_at', now(),
      'reversal_date', v_date,
      'reversal_posting_request_id', v_result->>'posting_request_id',
      'cancelled', true,
      'journal_posted', false
    )
    WHERE id = p_run_id AND company_id = p_company_id;
  END IF;

  INSERT INTO public.payroll_audit_events (
    company_id, payroll_run_id, event_type, event_data, created_by
  ) VALUES (
    p_company_id, p_run_id,
    CASE WHEN p_reopen THEN 'run_reopened' ELSE 'run_reversed' END,
    jsonb_build_object(
      'reason', p_reason,
      'reversal_date', v_date,
      'reversal_posting_request_id', v_result->>'posting_request_id',
      'reverses_journal_id', v_result->>'reverses_journal_id',
      'reopened', p_reopen
    ),
    p_actor_user_id
  );

  RETURN v_result || jsonb_build_object('run_id', p_run_id, 'reopened', p_reopen);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_payroll_run_atomic(uuid, uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_payroll_run_atomic(uuid, uuid, text, uuid, boolean) TO service_role;
