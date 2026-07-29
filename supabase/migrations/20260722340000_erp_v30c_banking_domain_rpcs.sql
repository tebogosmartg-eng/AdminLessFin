-- AdminLess Fin — ERP Blueprint V3.0, Phase 3C: Enterprise Banking Foundation
-- (RPC layer). Every function here either delegates to posting_engine_submit
-- directly or calls another function in this file that does — none of them
-- write journal_entries/journal_entry_items directly. "banking" module
-- validation (control accounts, blocked accounts, dimensions, period locks,
-- currency) is entirely inherited from Phase 3B's posting_engine_submit;
-- this layer adds banking-domain-specific checks (bank account active/
-- closed, cross-tenant, duplicate transfer, duplicate statement line) on
-- top, then hands off.

CREATE OR REPLACE FUNCTION public.assert_bank_account_open(p_bank_account_id uuid, p_company_id uuid)
RETURNS public.bank_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.bank_accounts;
BEGIN
  SELECT * INTO v_account FROM public.bank_accounts WHERE id = p_bank_account_id AND company_id = p_company_id;
  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'Bank account not found for this company.' USING ERRCODE = '22023';
  END IF;
  IF v_account.status = 'closed' THEN
    RAISE EXCEPTION 'Bank account % is closed and cannot be posted to.', v_account.name USING ERRCODE = '22023';
  END IF;
  IF v_account.status = 'inactive' THEN
    RAISE EXCEPTION 'Bank account % is inactive and cannot be posted to.', v_account.name USING ERRCODE = '22023';
  END IF;
  RETURN v_account;
END;
$$;

-- ── create_bank_account_atomic: either wraps an existing chart_of_accounts
--    row or creates a new Asset account for it (so the recommended path is
--    now "create a Bank Account", not "create a GL account and hope the
--    name heuristic finds it"). Optionally posts the opening balance in the
--    same call. ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_bank_account_atomic(
  p_company_id uuid, p_name text, p_account_type text DEFAULT 'bank',
  p_account_number text DEFAULT NULL, p_bank_name text DEFAULT NULL, p_branch_code text DEFAULT NULL,
  p_currency text DEFAULT 'ZAR', p_chart_of_account_id uuid DEFAULT NULL, p_is_default boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_opening_balance numeric DEFAULT 0, p_opening_balance_date date DEFAULT NULL,
  p_opening_balance_contra_account_id uuid DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coa_id uuid;
  v_next_number int;
  v_bank_account_id uuid;
BEGIN
  IF p_account_type NOT IN ('bank', 'cash', 'petty_cash') THEN
    RAISE EXCEPTION 'Invalid account_type %', p_account_type USING ERRCODE = '22023';
  END IF;

  IF p_chart_of_account_id IS NOT NULL THEN
    SELECT id INTO v_coa_id FROM public.chart_of_accounts WHERE id = p_chart_of_account_id AND company_id = p_company_id AND type = 'Asset';
    IF v_coa_id IS NULL THEN
      RAISE EXCEPTION 'chart_of_account_id must reference an existing Asset account for this company.' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT COALESCE(MAX(account_number), 0) + 1 INTO v_next_number FROM public.chart_of_accounts WHERE company_id = p_company_id;
    INSERT INTO public.chart_of_accounts (company_id, account_number, name, type, normal_balance)
    VALUES (p_company_id, v_next_number, p_name, 'Asset', 'debit')
    RETURNING id INTO v_coa_id;
  END IF;

  IF p_is_default THEN
    UPDATE public.bank_accounts SET is_default = false WHERE company_id = p_company_id AND is_default;
  END IF;

  INSERT INTO public.bank_accounts (
    company_id, chart_of_account_id, name, account_type, account_number, bank_name, branch_code,
    currency, is_default, opening_balance, opening_balance_date, metadata, created_by
  ) VALUES (
    p_company_id, v_coa_id, p_name, p_account_type, p_account_number, p_bank_name, p_branch_code,
    UPPER(p_currency), p_is_default, COALESCE(p_opening_balance, 0), p_opening_balance_date, COALESCE(p_metadata, '{}'::jsonb), p_actor_user_id
  )
  RETURNING id INTO v_bank_account_id;

  IF COALESCE(p_opening_balance, 0) <> 0 THEN
    IF p_opening_balance_contra_account_id IS NULL THEN
      RAISE EXCEPTION 'p_opening_balance_contra_account_id is required when p_opening_balance is non-zero.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.post_bank_opening_balance_atomic(v_bank_account_id, p_opening_balance_contra_account_id, p_opening_balance_date, p_actor_user_id);
  END IF;

  RETURN v_bank_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_bank_account(p_bank_account_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.bank_accounts WHERE id = p_bank_account_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account not found for this company.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.bank_accounts SET is_default = false WHERE company_id = p_company_id AND is_default;
  UPDATE public.bank_accounts SET is_default = true WHERE id = p_bank_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_bank_opening_balance_atomic(
  p_bank_account_id uuid, p_contra_account_id uuid, p_opening_balance_date date DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.bank_accounts;
  v_date date;
  v_result jsonb := jsonb_build_object('posting_status', 'not_required');
  v_txn_id uuid;
BEGIN
  SELECT * INTO v_account FROM public.bank_accounts WHERE id = p_bank_account_id;
  IF v_account.id IS NULL THEN RAISE EXCEPTION 'Bank account not found.' USING ERRCODE = '22023'; END IF;
  IF v_account.opening_balance_posted THEN
    RAISE EXCEPTION 'Opening balance already posted for bank account %.', v_account.name USING ERRCODE = '22023';
  END IF;

  v_date := COALESCE(p_opening_balance_date, v_account.opening_balance_date, CURRENT_DATE);

  IF v_account.opening_balance <> 0 THEN
    INSERT INTO public.bank_transactions (
      company_id, bank_account_id, transaction_type, transaction_date, amount, description, contra_account_id, created_by
    ) VALUES (
      v_account.company_id, p_bank_account_id, 'opening_balance', v_date, ABS(v_account.opening_balance),
      'Opening balance for ' || v_account.name, p_contra_account_id, p_actor_user_id
    )
    RETURNING id INTO v_txn_id;

    v_result := public.posting_engine_submit(jsonb_build_object(
      'company_id', v_account.company_id, 'posting_date', v_date, 'module', 'banking',
      'document_type', 'opening_balance', 'document_id', v_txn_id,
      'description', 'Opening balance for ' || v_account.name, 'created_by', p_actor_user_id,
      'lines', CASE WHEN v_account.opening_balance > 0 THEN
        jsonb_build_array(
          jsonb_build_object('account_id', v_account.chart_of_account_id, 'debit', ABS(v_account.opening_balance)),
          jsonb_build_object('account_id', p_contra_account_id, 'credit', ABS(v_account.opening_balance))
        )
      ELSE
        jsonb_build_array(
          jsonb_build_object('account_id', p_contra_account_id, 'debit', ABS(v_account.opening_balance)),
          jsonb_build_object('account_id', v_account.chart_of_account_id, 'credit', ABS(v_account.opening_balance))
        )
      END
    ), 'commit');

    UPDATE public.bank_transactions SET posting_request_id = (v_result->>'posting_request_id')::uuid, journal_entry_id = (v_result->>'journal_id')::uuid
      WHERE id = v_txn_id;
  END IF;

  UPDATE public.bank_accounts SET opening_balance_posted = true, opening_balance_date = v_date WHERE id = p_bank_account_id;

  RETURN v_result;
END;
$$;

-- ── record_bank_transaction_atomic: the single dedicated-transaction RPC
--    covering deposit / withdrawal / interest / bank charge / manual
--    adjustment / all petty-cash movements. p_direction is explicit rather
--    than inferred from transaction_type, so callers never rely on a
--    guessed increase/decrease mapping for the inherently ambiguous types
--    (manual_adjustment, cash_count_adjustment can go either way). ───────
CREATE OR REPLACE FUNCTION public.record_bank_transaction_atomic(
  p_company_id uuid, p_bank_account_id uuid, p_transaction_type text, p_direction text,
  p_transaction_date date, p_amount numeric, p_contra_account_id uuid,
  p_description text DEFAULT NULL, p_reference text DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.bank_accounts;
  v_txn_id uuid;
  v_result jsonb;
BEGIN
  IF p_transaction_type NOT IN (
    'deposit', 'withdrawal', 'interest_received', 'interest_paid', 'bank_charge', 'manual_adjustment',
    'cash_float', 'cash_topup', 'cash_reimbursement', 'cash_count_adjustment', 'cash_shortage', 'cash_overage'
  ) THEN
    RAISE EXCEPTION 'Unsupported transaction_type %', p_transaction_type USING ERRCODE = '22023';
  END IF;
  IF p_direction NOT IN ('increase', 'decrease') THEN
    RAISE EXCEPTION 'p_direction must be increase or decrease' USING ERRCODE = '22023';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive' USING ERRCODE = '22023';
  END IF;

  v_account := public.assert_bank_account_open(p_bank_account_id, p_company_id);

  INSERT INTO public.bank_transactions (
    company_id, bank_account_id, transaction_type, transaction_date, amount, description, contra_account_id, reference, created_by
  ) VALUES (
    p_company_id, p_bank_account_id, p_transaction_type, p_transaction_date, p_amount, p_description, p_contra_account_id, p_reference, p_actor_user_id
  )
  RETURNING id INTO v_txn_id;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_transaction_date, 'module', 'banking',
    'document_type', p_transaction_type, 'document_id', v_txn_id,
    'reference', p_reference, 'description', COALESCE(p_description, initcap(replace(p_transaction_type, '_', ' '))),
    'created_by', p_actor_user_id,
    'lines', CASE WHEN p_direction = 'increase' THEN
      jsonb_build_array(
        jsonb_build_object('account_id', v_account.chart_of_account_id, 'debit', p_amount),
        jsonb_build_object('account_id', p_contra_account_id, 'credit', p_amount)
      )
    ELSE
      jsonb_build_array(
        jsonb_build_object('account_id', p_contra_account_id, 'debit', p_amount),
        jsonb_build_object('account_id', v_account.chart_of_account_id, 'credit', p_amount)
      )
    END
  ), 'commit');

  UPDATE public.bank_transactions SET posting_request_id = (v_result->>'posting_request_id')::uuid, journal_entry_id = (v_result->>'journal_id')::uuid
    WHERE id = v_txn_id;

  RETURN jsonb_build_object('bank_transaction_id', v_txn_id) || v_result;
END;
$$;

-- ── record_bank_transfer_atomic: one business transaction, two bank
--    accounts, one posting_request, one balanced journal, no manual JE. ──
CREATE OR REPLACE FUNCTION public.record_bank_transfer_atomic(
  p_company_id uuid, p_from_bank_account_id uuid, p_to_bank_account_id uuid,
  p_transfer_date date, p_amount numeric, p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from public.bank_accounts;
  v_to public.bank_accounts;
  v_key text;
  v_transfer_id uuid;
  v_existing record;
  v_result jsonb;
BEGIN
  IF p_from_bank_account_id = p_to_bank_account_id THEN
    RAISE EXCEPTION 'Cannot transfer a bank account to itself.' USING ERRCODE = '22023';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive' USING ERRCODE = '22023';
  END IF;

  v_from := public.assert_bank_account_open(p_from_bank_account_id, p_company_id);
  v_to := public.assert_bank_account_open(p_to_bank_account_id, p_company_id);

  v_key := COALESCE(p_idempotency_key, gen_random_uuid()::text);

  INSERT INTO public.bank_transfers (company_id, from_bank_account_id, to_bank_account_id, transfer_date, amount, description, idempotency_key, created_by)
  VALUES (p_company_id, p_from_bank_account_id, p_to_bank_account_id, p_transfer_date, p_amount, p_description, v_key, p_actor_user_id)
  ON CONFLICT (company_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_transfer_id;

  IF v_transfer_id IS NULL THEN
    SELECT * INTO v_existing FROM public.bank_transfers WHERE company_id = p_company_id AND idempotency_key = v_key;
    RETURN jsonb_build_object(
      'transfer_id', v_existing.id, 'journal_id', v_existing.journal_entry_id,
      'posting_request_id', v_existing.posting_request_id, 'posting_status', 'duplicate',
      'warnings', jsonb_build_array('Duplicate transfer rejected: an identical transfer with this idempotency key already exists.')
    );
  END IF;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_transfer_date, 'module', 'banking',
    'document_type', 'bank_transfer', 'document_id', v_transfer_id,
    'description', COALESCE(p_description, 'Transfer from ' || v_from.name || ' to ' || v_to.name),
    'created_by', p_actor_user_id,
    'idempotency_key', 'banking:bank_transfer:' || v_transfer_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', v_to.chart_of_account_id, 'debit', p_amount),
      jsonb_build_object('account_id', v_from.chart_of_account_id, 'credit', p_amount)
    )
  ), 'commit');

  UPDATE public.bank_transfers SET posting_request_id = (v_result->>'posting_request_id')::uuid, journal_entry_id = (v_result->>'journal_id')::uuid
    WHERE id = v_transfer_id;

  INSERT INTO public.bank_transactions (company_id, bank_account_id, transaction_type, transaction_date, amount, description, transfer_id, posting_request_id, journal_entry_id, created_by)
  VALUES
    (p_company_id, p_from_bank_account_id, 'transfer_out', p_transfer_date, p_amount, COALESCE(p_description, 'Transfer to ' || v_to.name), v_transfer_id, (v_result->>'posting_request_id')::uuid, (v_result->>'journal_id')::uuid, p_actor_user_id),
    (p_company_id, p_to_bank_account_id, 'transfer_in', p_transfer_date, p_amount, COALESCE(p_description, 'Transfer from ' || v_from.name), v_transfer_id, (v_result->>'posting_request_id')::uuid, (v_result->>'journal_id')::uuid, p_actor_user_id);

  RETURN jsonb_build_object('transfer_id', v_transfer_id) || v_result;
END;
$$;

-- ── create_bank_statement_import_atomic: imports a batch of statement
--    lines, skipping any that duplicate an existing (bank_account_id,
--    external_reference) pair. ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_bank_statement_import_atomic(
  p_company_id uuid, p_bank_account_id uuid, p_period_start date, p_period_end date,
  p_opening_balance numeric, p_closing_balance numeric, p_file_name text, p_lines jsonb,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_import_id uuid;
  v_line jsonb;
  v_inserted int := 0;
  v_duplicates int := 0;
  v_new_id uuid;
BEGIN
  PERFORM public.assert_bank_account_open(p_bank_account_id, p_company_id);

  INSERT INTO public.bank_statement_imports (company_id, bank_account_id, period_start, period_end, opening_balance, closing_balance, file_name, imported_by)
  VALUES (p_company_id, p_bank_account_id, p_period_start, p_period_end, p_opening_balance, p_closing_balance, p_file_name, p_actor_user_id)
  RETURNING id INTO v_import_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_new_id := NULL;
    INSERT INTO public.bank_statement_lines (company_id, statement_import_id, bank_account_id, line_date, description, amount, external_reference)
    VALUES (
      p_company_id, v_import_id, p_bank_account_id,
      (v_line->>'line_date')::date, v_line->>'description', (v_line->>'amount')::numeric, NULLIF(v_line->>'external_reference', '')
    )
    ON CONFLICT (bank_account_id, external_reference) DO NOTHING
    RETURNING id INTO v_new_id;

    IF v_new_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_duplicates := v_duplicates + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('import_id', v_import_id, 'inserted_count', v_inserted, 'duplicate_count', v_duplicates);
END;
$$;

-- ── match_statement_line_atomic: ties a statement line to an existing GL
--    line, reusing journal_entry_items.reconciled (the same column the
--    pre-existing Reconciliation.tsx page already reads/writes) instead of
--    inventing a second reconciled-flag mechanism. ───────────────────────
CREATE OR REPLACE FUNCTION public.match_statement_line_atomic(
  p_statement_line_id uuid, p_journal_entry_item_id uuid, p_company_id uuid, p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line public.bank_statement_lines;
  v_bank_account public.bank_accounts;
  v_item_account_id uuid;
BEGIN
  SELECT * INTO v_line FROM public.bank_statement_lines WHERE id = p_statement_line_id AND company_id = p_company_id;
  IF v_line.id IS NULL THEN RAISE EXCEPTION 'Statement line not found for this company.' USING ERRCODE = '22023'; END IF;
  IF v_line.match_status <> 'unmatched' THEN RAISE EXCEPTION 'Statement line is already %.', v_line.match_status USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_bank_account FROM public.bank_accounts WHERE id = v_line.bank_account_id;

  SELECT jei.account_id INTO v_item_account_id
  FROM public.journal_entry_items jei JOIN public.journal_entries je ON je.id = jei.journal_entry_id
  WHERE jei.id = p_journal_entry_item_id AND je.company_id = p_company_id;

  IF v_item_account_id IS NULL THEN RAISE EXCEPTION 'Journal entry item not found for this company.' USING ERRCODE = '22023'; END IF;
  IF v_item_account_id <> v_bank_account.chart_of_account_id THEN
    RAISE EXCEPTION 'Journal entry item does not belong to the GL account behind this bank account.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bank_statement_lines SET match_status = 'matched', matched_journal_entry_item_id = p_journal_entry_item_id WHERE id = p_statement_line_id;
  UPDATE public.journal_entry_items SET reconciled = true, reconciled_at = now() WHERE id = p_journal_entry_item_id;

  RETURN jsonb_build_object('statement_line_id', p_statement_line_id, 'journal_entry_item_id', p_journal_entry_item_id, 'match_status', 'matched');
END;
$$;

-- ── post_statement_line_adjustment_atomic: for a statement line with no
--    matching GL entry (bank charge, bank-applied interest, bank error) —
--    posts through the Posting Engine via record_bank_transaction_atomic
--    (reused, not reimplemented) and marks the line resolved. Closes the
--    exact gap flagged in the Phase 3B report: a protected/control bank
--    account previously had no path for this except a blocked manual JE. ─
CREATE OR REPLACE FUNCTION public.post_statement_line_adjustment_atomic(
  p_statement_line_id uuid, p_company_id uuid, p_contra_account_id uuid,
  p_description text DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line public.bank_statement_lines;
  v_direction text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_line FROM public.bank_statement_lines WHERE id = p_statement_line_id AND company_id = p_company_id;
  IF v_line.id IS NULL THEN RAISE EXCEPTION 'Statement line not found for this company.' USING ERRCODE = '22023'; END IF;
  IF v_line.match_status <> 'unmatched' THEN RAISE EXCEPTION 'Statement line is already %.', v_line.match_status USING ERRCODE = '22023'; END IF;

  v_direction := CASE WHEN v_line.amount >= 0 THEN 'increase' ELSE 'decrease' END;

  v_result := public.record_bank_transaction_atomic(
    p_company_id, v_line.bank_account_id, 'manual_adjustment', v_direction, v_line.line_date,
    ABS(v_line.amount), p_contra_account_id, COALESCE(p_description, 'Reconciliation adjustment: ' || COALESCE(v_line.description, '')),
    v_line.external_reference, p_actor_user_id
  );

  UPDATE public.bank_statement_lines SET match_status = 'manual_adjustment', matched_bank_transaction_id = (v_result->>'bank_transaction_id')::uuid
    WHERE id = p_statement_line_id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.create_bank_account_atomic IS 'ERP V3.0 Phase 3C: creates (or wraps) the GL account and the Banking-domain bank_accounts row atomically; posts opening balance if given.';
COMMENT ON FUNCTION public.record_bank_transaction_atomic IS 'ERP V3.0 Phase 3C: single dedicated-transaction RPC for deposit/withdrawal/interest/charge/adjustment/petty-cash movements. Always delegates to posting_engine_submit(module=banking).';
COMMENT ON FUNCTION public.record_bank_transfer_atomic IS 'ERP V3.0 Phase 3C: bank-to-bank transfer — one posting_request, one balanced journal, idempotent on caller-supplied key.';
COMMENT ON FUNCTION public.create_bank_statement_import_atomic IS 'ERP V3.0 Phase 3C: reconciliation foundation — imports statement lines, skipping duplicates by (bank_account_id, external_reference).';
COMMENT ON FUNCTION public.match_statement_line_atomic IS 'ERP V3.0 Phase 3C: matches a statement line to an existing journal_entry_item, reusing the pre-existing reconciled/reconciled_at columns.';
COMMENT ON FUNCTION public.post_statement_line_adjustment_atomic IS 'ERP V3.0 Phase 3C: posts a reconciliation adjustment for an unmatched statement line via the Posting Engine.';

GRANT EXECUTE ON FUNCTION public.assert_bank_account_open(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_bank_account_atomic(uuid, text, text, text, text, text, text, uuid, boolean, jsonb, numeric, date, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_default_bank_account(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_bank_opening_balance_atomic(uuid, uuid, date, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_bank_transaction_atomic(uuid, uuid, text, text, date, numeric, uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_bank_transfer_atomic(uuid, uuid, uuid, date, numeric, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_bank_statement_import_atomic(uuid, uuid, date, date, numeric, numeric, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_statement_line_atomic(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_statement_line_adjustment_atomic(uuid, uuid, uuid, text, uuid) TO authenticated, service_role;
