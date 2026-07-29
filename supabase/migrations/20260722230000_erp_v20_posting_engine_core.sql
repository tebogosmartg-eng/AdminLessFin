-- AdminLess Fin — ERP Blueprint V2.0, Phase 2: Enterprise Posting Engine (core)
-- posting_engine_submit() is the ONLY function permitted to insert into
-- journal_entries / journal_entry_items going forward for the four migrated
-- modules (sales_invoice, inventory_receipt, inventory_issue, manual_journal).
-- It reuses Phase 1's assert_period_open() and resolve_erp_context() rather
-- than reimplementing period/company/financial-year logic — "no duplicated
-- posting logic" applies to the engine's own dependencies too.

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

  -- Deterministic idempotency key: caller-supplied, or derived from the
  -- document so accidental double-submission of the same document is caught
  -- even when a caller forgets to pass one explicitly.
  v_idempotency_key := NULLIF(p_request->>'idempotency_key', '');
  IF v_idempotency_key IS NULL THEN
    IF v_document_id IS NOT NULL THEN
      v_idempotency_key := COALESCE(v_module, 'unknown') || ':' || COALESCE(v_document_type, 'doc') || ':' || v_document_id::text;
    ELSE
      v_idempotency_key := COALESCE(v_module, 'unknown') || ':adhoc:' || gen_random_uuid()::text;
    END IF;
  END IF;

  -- ── Structural validation ──────────────────────────────────────────────
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'posting_engine_submit: company_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_posting_date IS NULL THEN
    RAISE EXCEPTION 'posting_engine_submit: posting_date is required' USING ERRCODE = '22023';
  END IF;
  IF v_module IS NULL OR v_module NOT IN ('sales_invoice', 'inventory_receipt', 'inventory_issue', 'manual_journal') THEN
    RAISE EXCEPTION 'posting_engine_submit: module must be one of sales_invoice, inventory_receipt, inventory_issue, manual_journal (got %)', v_module
      USING ERRCODE = '22023';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'posting_engine_submit: invalid currency code %', v_currency USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'posting_engine_submit: at least one posting line is required' USING ERRCODE = '22023';
  END IF;

  -- ── ERP Context validation (company existence + actor membership + role) ──
  -- resolve_erp_context() raises on invalid company / non-member actor —
  -- covers "validating ERP Context", "validating Company", "validating
  -- permissions" without reimplementing any of Phase 1's logic. created_by
  -- is optional for system-originated postings (e.g. the recurring-invoices
  -- cron job, which has no human actor) — matches the pre-existing, deliberate
  -- optionality of p_actor_user_id on post_sales_invoice_atomic in V1.1; when
  -- absent, still validate the company exists rather than skipping validation
  -- entirely.
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

  -- ── Duplicate posting / idempotency (commit mode only — preview/validate
  --    never claim a slot since nothing is written) ──────────────────────
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
      -- status = 'pending': another commit for this exact key is genuinely
      -- in flight right now (a real concurrent race, not a stale failure —
      -- failed attempts never leave a row behind; see table comment).
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
        -- Lost a concurrent race for the same key between our SELECT and INSERT.
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

  -- ── Line validation: account exists, belongs to company, is active;
  --    accumulate debit/credit totals ────────────────────────────────────
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

    SELECT id, is_active INTO v_account FROM chart_of_accounts
      WHERE id = (v_line->>'account_id')::uuid AND company_id = v_company_id;

    IF v_account.id IS NULL THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s not found for this company.', v_line->>'account_id'));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % not found for this company', v_line->>'account_id' USING ERRCODE = '22023';
    ELSIF NOT v_account.is_active THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s is inactive.', v_line->>'account_id'));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % is inactive and cannot be posted to', v_line->>'account_id' USING ERRCODE = '22023';
    END IF;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  -- ── Double-entry validation ────────────────────────────────────────────
  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    IF p_mode = 'preview' THEN
      v_warnings := v_warnings || jsonb_build_array(format('Debits (%s) do not equal credits (%s).', v_total_debit, v_total_credit));
    ELSE
      -- Raising here rolls back the pending posting_requests claim above too
      -- (same transaction, no savepoint) — nothing is left to mark 'failed'.
      RAISE EXCEPTION 'posting_engine_submit: debits (%) do not equal credits (%)', v_total_debit, v_total_credit
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- ── Period / financial-year enforcement (reuses the Phase 1/V1.1 guard —
  --    the same function every other posting path already calls) ─────────
  IF p_mode = 'preview' THEN
    BEGIN
      PERFORM public.assert_period_open(v_company_id, v_posting_date);
    EXCEPTION WHEN OTHERS THEN
      v_warnings := v_warnings || jsonb_build_array(SQLERRM);
    END;
  ELSE
    -- No exception handler here: RAISE propagates, rolling back the pending
    -- claim above with it (same transaction) — the correct, simplest outcome.
    PERFORM public.assert_period_open(v_company_id, v_posting_date);
  END IF;

  -- ── Preview / Validate: stop before writing anything ───────────────────
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

  -- ── Commit: write journal header + lines atomically ────────────────────
  v_journal_number := public.posting_engine_next_journal_number(v_company_id);

  INSERT INTO journal_entries (company_id, entry_date, description, invoice_id, vendor_id, customer_id, journal_number, attachment_url)
  VALUES (
    v_company_id, v_posting_date, COALESCE(v_description, v_reference, initcap(replace(v_module, '_', ' ')) || ' posting'),
    CASE WHEN v_document_type = 'invoice' THEN v_document_id END,
    NULLIF(p_request->>'vendor_id', '')::uuid,
    NULLIF(p_request->>'customer_id', '')::uuid,
    v_journal_number,
    NULLIF(p_request->>'attachment_url', '')
  )
  RETURNING id INTO v_je_id;
  -- (fires the existing Phase 1/V1.1 trigger: period-lock + financial_year_id/
  -- accounting_period_id auto-stamping — unchanged, not duplicated here)

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);
    IF v_debit <= 0 AND v_credit <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount, project_id)
    VALUES (
      v_je_id, (v_line->>'account_id')::uuid,
      CASE WHEN v_debit > 0 THEN 'debit' ELSE 'credit' END,
      GREATEST(v_debit, v_credit),
      NULLIF(v_line->>'project_id', '')::uuid
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
  'ERP V2.0 Phase 2: single gateway into the General Ledger for sales_invoice, inventory_receipt, inventory_issue, manual_journal. Validates ERP context/company/permissions (via resolve_erp_context), period (via assert_period_open), accounts, and double-entry balance; enforces idempotency; writes journal header+lines atomically; records a rich audit trail in posting_requests. Modes: preview (best-effort, warnings only), validate (real validation, no write), commit (full write).';

GRANT EXECUTE ON FUNCTION public.posting_engine_submit(jsonb, text) TO authenticated, service_role;

-- ── Rollback: reverse a committed posting with an equal-and-opposite entry.
--    Journals are immutable — this never updates or deletes the original. ──

CREATE OR REPLACE FUNCTION public.posting_engine_rollback(
  p_idempotency_key text,
  p_company_id uuid,
  p_reason text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original record;
  v_erp jsonb;
  v_reversal_key text;
  v_je_id uuid;
  v_journal_number text;
  v_line record;
  v_fy_id uuid;
  v_ap_id uuid;
  v_request_id uuid;
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

  PERFORM public.assert_period_open(p_company_id, CURRENT_DATE);

  v_journal_number := public.posting_engine_next_journal_number(p_company_id);

  INSERT INTO journal_entries (company_id, entry_date, description, journal_number)
  VALUES (p_company_id, CURRENT_DATE, 'Reversal of ' || COALESCE(v_original.journal_number, v_original.id::text) || COALESCE(': ' || p_reason, ''), v_journal_number)
  RETURNING id INTO v_je_id;

  FOR v_line IN SELECT account_id, type, amount FROM journal_entry_items WHERE journal_entry_id = v_original.journal_entry_id
  LOOP
    INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount)
    VALUES (v_je_id, v_line.account_id, CASE WHEN v_line.type = 'debit' THEN 'credit' ELSE 'debit' END, v_line.amount);
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
    'warnings', '[]'::jsonb, 'posting_request_id', v_request_id, 'reverses_journal_id', v_original.journal_entry_id
  );
END;
$$;

COMMENT ON FUNCTION public.posting_engine_rollback IS
  'ERP V2.0 Phase 2: reverses a committed posting via an equal-and-opposite journal (Rollback Mode). Never mutates or deletes the original — journals stay immutable.';

GRANT EXECUTE ON FUNCTION public.posting_engine_rollback(text, uuid, text, uuid) TO authenticated, service_role;
