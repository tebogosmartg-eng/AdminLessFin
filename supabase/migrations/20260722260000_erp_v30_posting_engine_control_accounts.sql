-- AdminLess Fin — ERP Blueprint V3.0, Phase 3: Posting Engine control-account
-- and dimension enforcement. Same signature as Phase 2's posting_engine_submit
-- (p_request jsonb, p_mode text) — CREATE OR REPLACE genuinely replaces it,
-- no new overload. Only the line-validation section changes.

CREATE OR REPLACE FUNCTION public.posting_engine_submit(p_request jsonb, p_mode text DEFAULT 'commit')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_posting_date date;
  v_module text;
  v_document_type text;
  v_document_id uuid;
  v_reference text;
  v_description text;
  v_currency text;
  v_exchange_rate numeric;
  v_source text;
  v_created_by uuid;
  v_idempotency_key text;
  v_lines jsonb;
  v_line jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_debit numeric;
  v_credit numeric;
  v_warnings jsonb := '[]'::jsonb;
  v_erp jsonb;
  v_fy_id uuid;
  v_ap_id uuid;
  v_existing record;
  v_je_id uuid;
  v_journal_number text;
  v_account record;
  v_request_id uuid;
  v_line_item_id uuid;
  v_has_dimension boolean;
BEGIN
  IF p_mode NOT IN ('preview', 'validate', 'commit') THEN
    RAISE EXCEPTION 'posting_engine_submit: mode must be preview, validate, or commit (got %). Use posting_engine_rollback() to reverse a committed posting.', p_mode
      USING ERRCODE = '22023';
  END IF;

  v_company_id := NULLIF(p_request->>'company_id', '')::uuid;
  v_posting_date := NULLIF(p_request->>'posting_date', '')::date;
  v_module := p_request->>'module';
  v_document_type := p_request->>'document_type';
  v_document_id := NULLIF(p_request->>'document_id', '')::uuid;
  v_reference := p_request->>'reference';
  v_description := p_request->>'description';
  v_currency := UPPER(COALESCE(NULLIF(p_request->>'currency', ''), 'ZAR'));
  v_exchange_rate := COALESCE((p_request->>'exchange_rate')::numeric, 1);
  v_source := p_request->>'source';
  v_created_by := NULLIF(p_request->>'created_by', '')::uuid;
  v_lines := COALESCE(p_request->'lines', '[]'::jsonb);

  v_idempotency_key := NULLIF(p_request->>'idempotency_key', '');
  IF v_idempotency_key IS NULL THEN
    IF v_document_id IS NOT NULL THEN
      v_idempotency_key := COALESCE(v_module, 'unknown') || ':' || COALESCE(v_document_type, 'doc') || ':' || v_document_id::text;
    ELSE
      v_idempotency_key := COALESCE(v_module, 'unknown') || ':adhoc:' || gen_random_uuid()::text;
    END IF;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'posting_engine_submit: company_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_posting_date IS NULL THEN
    RAISE EXCEPTION 'posting_engine_submit: posting_date is required' USING ERRCODE = '22023';
  END IF;
  IF v_module IS NULL OR v_module NOT IN (
    'sales_invoice', 'inventory_receipt', 'inventory_issue', 'manual_journal',
    'accounts_payable', 'fixed_assets'
  ) THEN
    RAISE EXCEPTION 'posting_engine_submit: unsupported module %', v_module USING ERRCODE = '22023';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'posting_engine_submit: invalid currency code %', v_currency USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'posting_engine_submit: at least one posting line is required' USING ERRCODE = '22023';
  END IF;

  IF v_created_by IS NOT NULL THEN
    v_erp := public.resolve_erp_context(v_created_by, v_company_id);
    v_fy_id := NULLIF(v_erp->'financial_year'->>'id', '')::uuid;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM companies WHERE id = v_company_id) THEN
      RAISE EXCEPTION 'posting_engine_submit: company not found' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_fy_id FROM financial_years
      WHERE company_id = v_company_id AND status IN ('open', 'draft')
      ORDER BY start_date DESC LIMIT 1;
  END IF;

  IF p_mode = 'commit' THEN
    SELECT * INTO v_existing FROM posting_requests
      WHERE company_id = v_company_id AND idempotency_key = v_idempotency_key;

    IF FOUND THEN
      IF v_existing.status = 'committed' THEN
        RETURN jsonb_build_object(
          'journal_id', v_existing.journal_entry_id, 'journal_number', v_existing.journal_number,
          'posting_status', 'duplicate', 'financial_year_id', v_existing.financial_year_id,
          'accounting_period_id', v_existing.accounting_period_id, 'timestamp', v_existing.committed_at,
          'warnings', jsonb_build_array('Idempotent replay: existing posting returned, no new journal created.'),
          'posting_request_id', v_existing.id
        );
      END IF;
      RAISE EXCEPTION 'A posting for this idempotency key is already being committed. Retry shortly.'
        USING ERRCODE = '55006';
    ELSE
      INSERT INTO posting_requests (
        company_id, idempotency_key, module, document_type, document_id, reference, description,
        currency, exchange_rate, source, created_by, status
      ) VALUES (
        v_company_id, v_idempotency_key, v_module, v_document_type, v_document_id, v_reference, v_description,
        v_currency, v_exchange_rate, v_source, v_created_by, 'pending'
      )
      ON CONFLICT (company_id, idempotency_key) DO NOTHING
      RETURNING id INTO v_request_id;

      IF v_request_id IS NULL THEN
        SELECT * INTO v_existing FROM posting_requests WHERE company_id = v_company_id AND idempotency_key = v_idempotency_key;
        IF v_existing.status = 'committed' THEN
          RETURN jsonb_build_object(
            'journal_id', v_existing.journal_entry_id, 'journal_number', v_existing.journal_number,
            'posting_status', 'duplicate', 'financial_year_id', v_existing.financial_year_id,
            'accounting_period_id', v_existing.accounting_period_id, 'timestamp', v_existing.committed_at,
            'warnings', jsonb_build_array('Idempotent replay (concurrent): existing posting returned.'),
            'posting_request_id', v_existing.id
          );
        END IF;
        RAISE EXCEPTION 'A posting for this idempotency key is already in progress. Retry shortly.'
          USING ERRCODE = '55006';
      END IF;
    END IF;
  END IF;

  -- ── Line validation: account exists/active/not-blocked, control-account
  --    misuse, mandatory dimensions; accumulate debit/credit totals ────────
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);

    IF (v_line->>'account_id') IS NULL THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array('Missing account on a posting line.');
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: every line requires account_id' USING ERRCODE = '22023';
    END IF;

    SELECT id, is_active, posting_blocked, control_account, allow_manual_posting, requires_dimension, name
      INTO v_account FROM chart_of_accounts
      WHERE id = (v_line->>'account_id')::uuid AND company_id = v_company_id;

    IF v_account.id IS NULL THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s not found for this company.', v_line->>'account_id'));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % not found for this company', v_line->>'account_id' USING ERRCODE = '22023';
    END IF;

    IF NOT v_account.is_active THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s is inactive.', v_account.name));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % is inactive and cannot be posted to', v_account.name USING ERRCODE = '22023';
    END IF;

    IF v_account.posting_blocked THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s is blocked for posting.', v_account.name));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % is blocked for posting', v_account.name USING ERRCODE = '22023';
    END IF;

    -- Control-account misuse: only restricts ad hoc manual journals — the
    -- module that legitimately owns a control account (sales_invoice -> AR,
    -- accounts_payable -> AP, inventory_* -> Inventory Control, fixed_assets,
    -- etc.) is never blocked by its own systematic postings.
    IF v_account.control_account AND NOT v_account.allow_manual_posting AND v_module = 'manual_journal' THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s is a control account and does not accept manual postings.', v_account.name));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % is a control account and does not accept manual postings', v_account.name
        USING ERRCODE = '22023';
    END IF;

    IF v_account.requires_dimension THEN
      v_has_dimension := (v_line->>'project_id') IS NOT NULL
        OR (v_line ? 'dimensions' AND jsonb_typeof(v_line->'dimensions') = 'object' AND v_line->'dimensions' <> '{}'::jsonb);
      IF NOT v_has_dimension THEN
        IF p_mode = 'preview' THEN
          v_warnings := v_warnings || jsonb_build_array(format('Account %s requires a dimension (project, cost centre, etc.) but none was given.', v_account.name));
          CONTINUE;
        END IF;
        RAISE EXCEPTION 'posting_engine_submit: account % requires a dimension but none was given', v_account.name USING ERRCODE = '22023';
      END IF;
    END IF;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    IF p_mode = 'preview' THEN
      v_warnings := v_warnings || jsonb_build_array(format('Debits (%s) do not equal credits (%s).', v_total_debit, v_total_credit));
    ELSE
      RAISE EXCEPTION 'posting_engine_submit: debits (%) do not equal credits (%)', v_total_debit, v_total_credit
        USING ERRCODE = '22000';
    END IF;
  END IF;

  IF p_mode = 'preview' THEN
    BEGIN
      PERFORM public.assert_period_open(v_company_id, v_posting_date);
    EXCEPTION WHEN OTHERS THEN
      v_warnings := v_warnings || jsonb_build_array(SQLERRM);
    END;
  ELSE
    PERFORM public.assert_period_open(v_company_id, v_posting_date);
  END IF;

  IF p_mode = 'preview' THEN
    RETURN jsonb_build_object(
      'journal_id', NULL, 'journal_number', NULL, 'posting_status', 'previewed',
      'financial_year_id', v_fy_id, 'total_debit', v_total_debit, 'total_credit', v_total_credit,
      'timestamp', now(), 'warnings', v_warnings
    );
  END IF;
  IF p_mode = 'validate' THEN
    RETURN jsonb_build_object(
      'journal_id', NULL, 'journal_number', NULL, 'posting_status', 'validated',
      'financial_year_id', v_fy_id, 'total_debit', v_total_debit, 'total_credit', v_total_credit,
      'timestamp', now(), 'warnings', v_warnings
    );
  END IF;

  v_journal_number := public.posting_engine_next_journal_number(v_company_id);

  INSERT INTO journal_entries (company_id, entry_date, description, invoice_id, vendor_id, customer_id, journal_number, attachment_url, bill_id)
  VALUES (
    v_company_id, v_posting_date, COALESCE(v_description, v_reference, initcap(replace(v_module, '_', ' ')) || ' posting'),
    CASE WHEN v_document_type = 'invoice' THEN v_document_id END,
    NULLIF(p_request->>'vendor_id', '')::uuid,
    NULLIF(p_request->>'customer_id', '')::uuid,
    v_journal_number,
    NULLIF(p_request->>'attachment_url', ''),
    CASE WHEN v_document_type = 'bill' THEN v_document_id END
  )
  RETURNING id INTO v_je_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);
    IF v_debit <= 0 AND v_credit <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount, project_id, dimensions)
    VALUES (
      v_je_id, (v_line->>'account_id')::uuid,
      CASE WHEN v_debit > 0 THEN 'debit' ELSE 'credit' END,
      GREATEST(v_debit, v_credit),
      NULLIF(v_line->>'project_id', '')::uuid,
      COALESCE(v_line->'dimensions', '{}'::jsonb)
    )
    RETURNING id INTO v_line_item_id;

    IF (v_line->>'tax_rate_id') IS NOT NULL THEN
      INSERT INTO journal_entry_item_tax_rates (journal_entry_item_id, tax_rate_id)
      VALUES (v_line_item_id, (v_line->>'tax_rate_id')::uuid);
    END IF;
  END LOOP;

  SELECT financial_year_id, accounting_period_id INTO v_fy_id, v_ap_id FROM journal_entries WHERE id = v_je_id;

  UPDATE posting_requests SET
    status = 'committed', journal_entry_id = v_je_id, journal_number = v_journal_number,
    financial_year_id = v_fy_id, accounting_period_id = v_ap_id, warnings = v_warnings, committed_at = now()
  WHERE id = v_request_id;

  RETURN jsonb_build_object(
    'journal_id', v_je_id, 'journal_number', v_journal_number, 'posting_status', 'committed',
    'financial_year_id', v_fy_id, 'accounting_period_id', v_ap_id, 'timestamp', now(),
    'warnings', v_warnings, 'posting_request_id', v_request_id
  );
END;
$$;

COMMENT ON FUNCTION public.posting_engine_submit IS
  'ERP V3.0 Phase 3: single gateway into the General Ledger. Adds control-account/blocked-account/mandatory-dimension enforcement on top of Phase 2''s ERP-context, period, account, and double-entry validation. Modules: sales_invoice, inventory_receipt, inventory_issue, manual_journal, accounts_payable, fixed_assets.';
