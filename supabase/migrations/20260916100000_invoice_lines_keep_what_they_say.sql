-- AdminLess Fin — an invoice line remembers what it was for.
--
-- THE DEFECT
-- InvoiceForm collects a description, a quantity and a unit price for every
-- line, and post_sales_invoice_atomic used all three only to compute
-- quantity * unit_price before discarding them. The invoice document could
-- therefore never show what was sold: it fell back to the general-ledger
-- account name, so a customer received an invoice that read "Consulting
-- Income" where it should have read "Design of the Q3 brand refresh, 12 hrs
-- @ R950.00". That is the single biggest reason the printed invoice looked
-- blank.
--
-- THE FIX
-- Three nullable presentation columns on journal_entry_items, populated by
-- the posting function for revenue lines. They are presentation only: no
-- balance, no total and no report derives from them, and amount remains the
-- one authority on what the line is worth. Nothing recomputes an existing
-- journal -- rows posted before this migration simply keep NULL and the
-- document falls back to the account name exactly as it does today.

ALTER TABLE public.journal_entry_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit_price numeric;

COMMENT ON COLUMN public.journal_entry_items.description IS
  'Presentation only: what this line was for, as typed on the source document. Never drives a balance; amount remains authoritative.';
COMMENT ON COLUMN public.journal_entry_items.quantity IS
  'Presentation only: quantity billed on the source document line. NULL on lines that were not captured as quantity x price.';
COMMENT ON COLUMN public.journal_entry_items.unit_price IS
  'Presentation only: price per unit on the source document line. NULL on lines that were not captured as quantity x price.';

-- Both functions below are reproduced verbatim from their latest definitions
-- (posting_engine_submit from 20260727180000, post_sales_invoice_atomic from
-- 20260722240000) with only the marked lines changed, because CREATE OR
-- REPLACE FUNCTION has no partial form and a hand-retyped copy would silently
-- revert whatever it failed to reproduce.

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
  v_policy jsonb;
  v_policy_item jsonb;
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
  v_rule_id uuid;
  v_rule_version integer;
  v_business_event text;
  v_generated_by uuid;
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
  v_rule_id := NULLIF(p_request->>'rule_id', '')::uuid;
  v_rule_version := NULLIF(p_request->>'rule_version', '')::integer;
  v_business_event := NULLIF(p_request->>'business_event', '');
  v_generated_by := COALESCE(NULLIF(p_request->>'generated_by', '')::uuid, v_created_by);

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
    'accounts_payable', 'fixed_assets', 'banking', 'payroll'
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
        currency, exchange_rate, source, created_by, status,
        rule_id, rule_version, business_event, generated_by, generated_at
      ) VALUES (
        v_company_id, v_idempotency_key, v_module, v_document_type, v_document_id, v_reference, v_description,
        v_currency, v_exchange_rate, v_source, v_created_by, 'pending',
        v_rule_id, v_rule_version, v_business_event, v_generated_by,
        CASE WHEN v_rule_id IS NOT NULL THEN now() ELSE NULL END
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

  v_policy := public.accounting_policy_evaluate_posting(
    v_company_id, v_module, v_lines, p_mode,
    NULLIF(p_request->>'policy_override_reason', ''),
    COALESCE(p_request->'policy_override_codes', '[]'::jsonb),
    v_created_by, v_request_id, v_description
  );

  IF (v_policy->>'blocking')::boolean AND p_mode IN ('validate', 'commit') THEN
    IF p_mode = 'commit' AND v_request_id IS NOT NULL THEN
      DELETE FROM posting_requests WHERE id = v_request_id AND status = 'pending';
    END IF;
    RAISE EXCEPTION 'Accounting policy violation: %',
      (SELECT string_agg(x->>'message', '; ') FROM jsonb_array_elements(v_policy->'violations') x)
      USING ERRCODE = '22023';
  END IF;

  FOR v_policy_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_policy->'warnings', '[]'::jsonb))
  LOOP
    v_warnings := v_warnings || jsonb_build_array(
      format('[Policy %s] %s', v_policy_item->>'code', v_policy_item->>'message')
    );
  END LOOP;

  IF p_mode = 'preview' THEN
    RETURN jsonb_build_object(
      'journal_id', NULL, 'journal_number', NULL, 'posting_status', 'previewed',
      'financial_year_id', v_fy_id, 'total_debit', v_total_debit, 'total_credit', v_total_credit,
      'timestamp', now(), 'warnings', v_warnings, 'policy_results', v_policy,
      'rule_id', v_rule_id, 'rule_version', v_rule_version, 'business_event', v_business_event
    );
  END IF;
  IF p_mode = 'validate' THEN
    RETURN jsonb_build_object(
      'journal_id', NULL, 'journal_number', NULL, 'posting_status', 'validated',
      'financial_year_id', v_fy_id, 'total_debit', v_total_debit, 'total_credit', v_total_credit,
      'timestamp', now(), 'warnings', v_warnings, 'policy_results', v_policy,
      'rule_id', v_rule_id, 'rule_version', v_rule_version, 'business_event', v_business_event
    );
  END IF;

  v_journal_number := public.posting_engine_next_journal_number(v_company_id);

  INSERT INTO journal_entries (
    company_id, entry_date, description, invoice_id, vendor_id, customer_id,
    journal_number, attachment_url, bill_id,
    rule_id, rule_version, business_event, generated_by, generated_at
  )
  VALUES (
    v_company_id, v_posting_date, COALESCE(v_description, v_reference, initcap(replace(v_module, '_', ' ')) || ' posting'),
    CASE WHEN v_document_type = 'invoice' THEN v_document_id END,
    NULLIF(p_request->>'vendor_id', '')::uuid,
    NULLIF(p_request->>'customer_id', '')::uuid,
    v_journal_number,
    NULLIF(p_request->>'attachment_url', ''),
    CASE WHEN v_document_type = 'bill' THEN v_document_id END,
    v_rule_id, v_rule_version, v_business_event, v_generated_by,
    CASE WHEN v_rule_id IS NOT NULL THEN now() ELSE NULL END
  )
  RETURNING id INTO v_je_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);
    IF v_debit <= 0 AND v_credit <= 0 THEN
      CONTINUE;
    END IF;

    -- description/quantity/unit_price are presentation only: they record what
    -- the source document said the line was for, so an invoice can be printed
    -- without guessing from the account name. They take no part in validation,
    -- balancing or any reported figure -- amount remains the only authority.
    INSERT INTO journal_entry_items (
      journal_entry_id, account_id, type, amount, project_id, dimensions,
      description, quantity, unit_price
    )
    VALUES (
      v_je_id, (v_line->>'account_id')::uuid,
      CASE WHEN v_debit > 0 THEN 'debit' ELSE 'credit' END,
      GREATEST(v_debit, v_credit),
      NULLIF(v_line->>'project_id', '')::uuid,
      COALESCE(v_line->'dimensions', '{}'::jsonb),
      NULLIF(btrim(COALESCE(v_line->>'description', '')), ''),
      (v_line->>'quantity')::numeric,
      (v_line->>'unit_price')::numeric
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
    financial_year_id = v_fy_id, accounting_period_id = v_ap_id, warnings = v_warnings, committed_at = now(),
    rule_id = v_rule_id, rule_version = v_rule_version, business_event = v_business_event,
    generated_by = v_generated_by, generated_at = CASE WHEN v_rule_id IS NOT NULL THEN now() ELSE generated_at END
  WHERE id = v_request_id;

  RETURN jsonb_build_object(
    'journal_id', v_je_id, 'journal_number', v_journal_number, 'posting_status', 'committed',
    'financial_year_id', v_fy_id, 'accounting_period_id', v_ap_id, 'timestamp', now(),
    'warnings', v_warnings, 'posting_request_id', v_request_id, 'policy_results', v_policy,
    'rule_id', v_rule_id, 'rule_version', v_rule_version, 'business_event', v_business_event
  );
END;
$$;

COMMENT ON FUNCTION public.posting_engine_submit IS
  'ERP Phase 4: posting gateway with Policy Engine validation and Rules Engine audit metadata. Also carries optional per-line description/quantity/unit_price through to journal_entry_items for document presentation. Modules unchanged.';

CREATE OR REPLACE FUNCTION public.post_sales_invoice_atomic(
  p_company_id uuid,
  p_customer_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_invoice_number text,
  p_ar_account_id uuid,
  p_inventory_asset_account_id uuid,
  p_tax_payable_account_id uuid,
  p_description text,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_quote_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_item jsonb;
  v_product record;
  v_line_amount numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_grand_total numeric := 0;
  v_warehouse_id uuid;
  v_consumed record;
  v_item_class text;
  v_posting_lines jsonb := '[]'::jsonb;
  v_result jsonb;
  v_je_id uuid;
  v_inv_line_index int := 0;
  v_inventory_moves jsonb := '[]'::jsonb;
  v_move jsonb;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_ar_account_id IS NULL THEN
    RAISE EXCEPTION 'post_sales_invoice_atomic: company, customer, and AR account are required'
      USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'post_sales_invoice_atomic: at least one invoice line is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: actor is not a member of this company.';
  END IF;

  -- Fail fast before touching inventory; the Posting Engine re-checks this
  -- too (defense in depth, same pattern as V1.1).
  PERFORM public.assert_period_open(p_company_id, p_invoice_date);

  INSERT INTO invoices (company_id, customer_id, invoice_date, due_date, invoice_number, notes, quote_id, status)
  VALUES (p_company_id, p_customer_id, p_invoice_date, p_due_date, p_invoice_number, p_notes, p_quote_id, 'sent')
  RETURNING id INTO v_invoice_id;

  -- Build the Posting Request's lines: revenue/tax credits per item, then
  -- inventory consumption (COGS debit / inventory-asset credit) for any
  -- stock-tracked item, then one consolidated AR debit. Inventory balances/
  -- cost layers are consumed here (module-owned subledger detail); only the
  -- resulting journal lines are handed to the engine.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'income_account_id') IS NULL THEN
      RAISE EXCEPTION 'post_sales_invoice_atomic: income_account_id is required on every line'
        USING ERRCODE = '22023';
    END IF;

    v_line_amount := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
    v_grand_total := v_grand_total + v_line_amount;

    -- Carry the words and the arithmetic the user actually typed. InvoiceForm
    -- has always collected all three and this function has always thrown two
    -- of them away, which is why a printed invoice could only ever name the
    -- general-ledger account it credited.
    v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_item->>'income_account_id', 'credit', v_line_amount,
      'project_id', NULLIF(v_item->>'project_id', ''),
      'description', NULLIF(btrim(COALESCE(v_item->>'description', '')), ''),
      'quantity', (v_item->>'quantity')::numeric,
      'unit_price', (v_item->>'unit_price')::numeric
    ));

    IF (v_item->>'tax_rate_id') IS NOT NULL THEN
      SELECT rate INTO v_tax_rate FROM tax_rates WHERE id = (v_item->>'tax_rate_id')::uuid;
      IF v_tax_rate IS NOT NULL THEN
        v_tax_amount := ROUND(v_line_amount * v_tax_rate / 100.0, 2);
        IF v_tax_amount > 0 THEN
          IF p_tax_payable_account_id IS NULL THEN
            RAISE EXCEPTION 'post_sales_invoice_atomic: tax_payable_account_id is required when a line has tax'
              USING ERRCODE = '22023';
          END IF;
          v_grand_total := v_grand_total + v_tax_amount;
          v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object(
            'account_id', p_tax_payable_account_id, 'credit', v_tax_amount, 'tax_rate_id', v_item->>'tax_rate_id'
          ));
        END IF;
      END IF;
    END IF;

    IF (v_item->>'product_id') IS NOT NULL THEN
      SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::uuid AND company_id = p_company_id;
      v_item_class := COALESCE(v_product.item_class, CASE WHEN v_product.type = 'service' THEN 'service' ELSE 'finished_good' END);

      IF v_product.id IS NOT NULL AND v_item_class NOT IN ('service', 'non_stock') THEN
        v_warehouse_id := COALESCE(v_product.default_warehouse_id, eim_ensure_default_warehouse(p_company_id));

        SELECT * INTO v_consumed FROM eim_consume_stock(
          p_company_id, v_product.id, v_warehouse_id,
          (v_item->>'quantity')::numeric,
          COALESCE(v_product.cost_method, 'weighted_average'),
          v_product.standard_cost
        );

        IF v_product.cogs_account_id IS NULL OR COALESCE(v_product.inventory_asset_account_id, p_inventory_asset_account_id) IS NULL THEN
          RAISE EXCEPTION 'post_sales_invoice_atomic: product % is missing a COGS or inventory asset account', v_product.name
            USING ERRCODE = '22023';
        END IF;

        v_posting_lines := v_posting_lines || jsonb_build_array(
          jsonb_build_object('account_id', v_product.cogs_account_id, 'debit', v_consumed.total_cost),
          jsonb_build_object('account_id', COALESCE(v_product.inventory_asset_account_id, p_inventory_asset_account_id), 'credit', v_consumed.total_cost)
        );

        -- Deferred: inventory_transactions needs the journal id the engine
        -- will only produce after commit, so stash the move and write it
        -- once posting_engine_submit returns.
        v_inv_line_index := v_inv_line_index + 1;
        v_inventory_moves := v_inventory_moves || jsonb_build_array(jsonb_build_object(
          'product_id', v_product.id, 'warehouse_id', v_warehouse_id, 'qty', v_item->>'quantity',
          'unit_cost', v_consumed.unit_cost, 'total_cost', v_consumed.total_cost, 'cost_method', v_product.cost_method
        ));
      END IF;
    END IF;
  END LOOP;

  v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object('account_id', p_ar_account_id, 'debit', v_grand_total));

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id,
    'posting_date', p_invoice_date,
    'module', 'sales_invoice',
    'document_type', 'invoice',
    'document_id', v_invoice_id,
    'reference', p_invoice_number,
    'description', COALESCE(p_description, 'Invoice ' || p_invoice_number),
    'created_by', p_actor_user_id,
    'customer_id', p_customer_id,
    'lines', v_posting_lines
  ), 'commit');

  v_je_id := (v_result->>'journal_id')::uuid;
  UPDATE invoices SET journal_entry_id = v_je_id WHERE id = v_invoice_id;

  FOR v_move IN SELECT * FROM jsonb_array_elements(v_inventory_moves)
  LOOP
    INSERT INTO inventory_transactions (
      company_id, product_id, transaction_date, quantity_change, transaction_type,
      unit_cost, total_cost, warehouse_id, journal_entry_id, cost_method,
      source_doc_type, source_doc_id, reference_id, description
    ) VALUES (
      p_company_id, (v_move->>'product_id')::uuid, p_invoice_date, -(v_move->>'qty')::numeric, 'issue',
      (v_move->>'unit_cost')::numeric, (v_move->>'total_cost')::numeric, (v_move->>'warehouse_id')::uuid,
      v_je_id, v_move->>'cost_method', 'invoice', v_invoice_id, v_je_id, 'Sales invoice ' || p_invoice_number
    );
    PERFORM eim_sync_product_qty(p_company_id, (v_move->>'product_id')::uuid);
  END LOOP;

  RETURN v_invoice_id;
END;
$$;

COMMENT ON FUNCTION public.post_sales_invoice_atomic IS
  'V2.0 Phase 2: unchanged external contract; journal writing delegated to posting_engine_submit(). Each revenue line now also carries its description, quantity and unit price so the invoice document can show what was sold. Inventory consumption/subledger detail remains module-owned.';

GRANT EXECUTE ON FUNCTION public.post_sales_invoice_atomic(uuid, uuid, date, date, text, uuid, uuid, uuid, text, jsonb, text, uuid, uuid) TO authenticated, service_role;
