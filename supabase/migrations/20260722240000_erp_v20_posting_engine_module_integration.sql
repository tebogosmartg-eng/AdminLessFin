-- AdminLess Fin — ERP Blueprint V2.0, Phase 2: module integration
-- Refactors the three V1.1 atomic RPCs to delegate journal writing to
-- posting_engine_submit() instead of inserting into journal_entries /
-- journal_entry_items directly. External signatures, parameter names, and
-- return shapes are UNCHANGED — invoices/index.ts, recurring-invoices/index.ts,
-- and inventory/index.ts (via admin.rpc(...)) keep working with zero call-site
-- changes. Only the internal "how the journal gets written" changes.

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

    v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_item->>'income_account_id', 'credit', v_line_amount,
      'project_id', NULLIF(v_item->>'project_id', '')
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
  'V2.0 Phase 2: unchanged external contract; journal writing now delegated to posting_engine_submit(). Inventory consumption/subledger detail remains module-owned.';

GRANT EXECUTE ON FUNCTION public.post_sales_invoice_atomic(uuid, uuid, date, date, text, uuid, uuid, uuid, text, jsonb, text, uuid, uuid) TO authenticated, service_role;

-- ── receive_stock_atomic / issue_stock_atomic ────────────────────────────────
-- p_actor_user_id is a NEW trailing optional parameter (DEFAULT NULL) — additive
-- and backward compatible, since inventory/index.ts calls these RPCs with named
-- arguments. inventory/index.ts is updated in this same phase to actually pass
-- the authenticated user's id through, closing a previous audit-attribution gap.
--
-- Adding a parameter changes the function's argument-type signature, so
-- CREATE OR REPLACE alone would create a SECOND overload rather than replacing
-- the V1.1 one — exactly the ambiguous-overload class of bug this platform
-- already got burned by once (create_invoice_with_taxes). Drop the old
-- signature explicitly first.
DROP FUNCTION IF EXISTS public.receive_stock_atomic(uuid, uuid, uuid, numeric, numeric, date, text, uuid, uuid, uuid, text, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.issue_stock_atomic(uuid, uuid, uuid, numeric, date, text, uuid, uuid, uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.receive_stock_atomic(
  p_company_id uuid, p_product_id uuid, p_warehouse_id uuid, p_qty numeric, p_unit_cost numeric,
  p_date date, p_source_doc_type text, p_source_doc_id uuid,
  p_inventory_account_id uuid, p_offset_account_id uuid,
  p_description text DEFAULT NULL, p_vendor_id uuid DEFAULT NULL, p_lot_code text DEFAULT NULL,
  p_location_id uuid DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL
)
RETURNS TABLE(journal_entry_id uuid, amount numeric, unit_cost numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product record;
  v_bal inv_balances;
  v_method text;
  v_new_avg numeric;
  v_amount numeric;
  v_inv_acct uuid;
  v_result jsonb;
  v_je_id uuid;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Receipt quantity must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be a non-negative number' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_period_open(p_company_id, p_date);

  SELECT * INTO v_product FROM products WHERE id = p_product_id AND company_id = p_company_id;
  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found or permission denied.';
  END IF;

  v_bal := eim_get_or_create_balance(p_company_id, p_product_id, p_warehouse_id, p_location_id);
  v_method := COALESCE(v_product.cost_method, 'weighted_average');
  v_new_avg := CASE WHEN v_method = 'standard'
    THEN COALESCE(v_product.standard_cost, v_product.cost, p_unit_cost)
    ELSE eim_weighted_average(v_bal.qty_on_hand, v_bal.avg_unit_cost, p_qty, p_unit_cost)
  END;

  UPDATE inv_balances
    SET qty_on_hand = qty_on_hand + p_qty,
        avg_unit_cost = CASE WHEN v_method IN ('fifo', 'specific') THEN COALESCE(v_bal.avg_unit_cost, p_unit_cost) ELSE v_new_avg END,
        updated_at = now()
    WHERE id = v_bal.id;

  IF v_method IN ('fifo', 'specific', 'weighted_average') THEN
    INSERT INTO inv_cost_layers (company_id, product_id, warehouse_id, qty_remaining, unit_cost, received_at, source_doc_type, source_doc_id, lot_code, status)
    VALUES (p_company_id, p_product_id, p_warehouse_id, p_qty, p_unit_cost, COALESCE(p_date, CURRENT_DATE), p_source_doc_type, p_source_doc_id, p_lot_code, 'open');

    IF v_method IN ('fifo', 'specific') THEN
      UPDATE inv_balances SET avg_unit_cost = eim_weighted_average(v_bal.qty_on_hand, v_bal.avg_unit_cost, p_qty, p_unit_cost)
        WHERE id = v_bal.id;
    END IF;
  END IF;

  v_amount := p_qty * p_unit_cost;
  v_inv_acct := COALESCE(p_inventory_account_id, v_product.inventory_asset_account_id);
  IF v_inv_acct IS NULL OR p_offset_account_id IS NULL THEN
    RAISE EXCEPTION 'Inventory and offset GL accounts are required to post inventory journals.'
      USING ERRCODE = '22023';
  END IF;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_date, 'module', 'inventory_receipt',
    'document_type', COALESCE(p_source_doc_type, 'manual_receipt'), 'document_id', p_source_doc_id,
    'description', COALESCE(p_description, 'Inventory receipt: ' || v_product.name),
    'created_by', p_actor_user_id, 'vendor_id', p_vendor_id,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', v_inv_acct, 'debit', v_amount),
      jsonb_build_object('account_id', p_offset_account_id, 'credit', v_amount)
    )
  ), 'commit');
  v_je_id := (v_result->>'journal_id')::uuid;

  INSERT INTO inventory_transactions (
    company_id, product_id, transaction_date, quantity_change, transaction_type,
    unit_cost, total_cost, warehouse_id, location_id, journal_entry_id, cost_method,
    source_doc_type, source_doc_id, reference_id, description
  ) VALUES (
    p_company_id, p_product_id, p_date, p_qty, 'receipt',
    p_unit_cost, v_amount, p_warehouse_id, p_location_id, v_je_id, v_method,
    p_source_doc_type, p_source_doc_id, v_je_id, COALESCE(p_description, 'Goods receipt')
  );

  UPDATE products
    SET cost = CASE WHEN v_method = 'standard' THEN COALESCE(v_product.standard_cost, p_unit_cost) ELSE v_new_avg END,
        updated_at = now()
    WHERE id = p_product_id;

  PERFORM eim_sync_product_qty(p_company_id, p_product_id);

  RETURN QUERY SELECT v_je_id, v_amount, p_unit_cost;
END;
$$;

COMMENT ON FUNCTION public.receive_stock_atomic IS
  'V2.0 Phase 2: unchanged external contract; journal writing now delegated to posting_engine_submit().';

CREATE OR REPLACE FUNCTION public.issue_stock_atomic(
  p_company_id uuid, p_product_id uuid, p_warehouse_id uuid, p_qty numeric,
  p_date date, p_source_doc_type text, p_source_doc_id uuid,
  p_inventory_account_id uuid DEFAULT NULL, p_cogs_account_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL, p_specific_layer_id uuid DEFAULT NULL, p_location_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS TABLE(journal_entry_id uuid, amount numeric, unit_cost numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product record;
  v_consumed record;
  v_inv_acct uuid;
  v_cogs_acct uuid;
  v_result jsonb;
  v_je_id uuid;
BEGIN
  PERFORM public.assert_period_open(p_company_id, p_date);

  SELECT * INTO v_product FROM products WHERE id = p_product_id AND company_id = p_company_id;
  IF v_product.id IS NULL THEN
    RAISE EXCEPTION 'Product not found or permission denied.';
  END IF;

  v_inv_acct := COALESCE(p_inventory_account_id, v_product.inventory_asset_account_id);
  v_cogs_acct := COALESCE(p_cogs_account_id, v_product.cogs_account_id);
  IF v_inv_acct IS NULL OR v_cogs_acct IS NULL THEN
    RAISE EXCEPTION 'Inventory and COGS GL accounts are required to post inventory journals.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_consumed FROM eim_consume_stock(
    p_company_id, p_product_id, p_warehouse_id, p_qty,
    COALESCE(v_product.cost_method, 'weighted_average'), v_product.standard_cost, p_specific_layer_id
  );

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_date, 'module', 'inventory_issue',
    'document_type', COALESCE(p_source_doc_type, 'manual_issue'), 'document_id', p_source_doc_id,
    'description', COALESCE(p_description, 'Inventory issue / COGS: ' || v_product.name),
    'created_by', p_actor_user_id,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', v_cogs_acct, 'debit', v_consumed.total_cost),
      jsonb_build_object('account_id', v_inv_acct, 'credit', v_consumed.total_cost)
    )
  ), 'commit');
  v_je_id := (v_result->>'journal_id')::uuid;

  INSERT INTO inventory_transactions (
    company_id, product_id, transaction_date, quantity_change, transaction_type,
    unit_cost, total_cost, warehouse_id, location_id, journal_entry_id, cost_method,
    source_doc_type, source_doc_id, reference_id, description
  ) VALUES (
    p_company_id, p_product_id, p_date, -p_qty, 'issue',
    v_consumed.unit_cost, v_consumed.total_cost, p_warehouse_id, p_location_id, v_je_id, v_product.cost_method,
    p_source_doc_type, p_source_doc_id, v_je_id, COALESCE(p_description, 'Stock issue')
  );

  PERFORM eim_sync_product_qty(p_company_id, p_product_id);

  RETURN QUERY SELECT v_je_id, v_consumed.total_cost, v_consumed.unit_cost;
END;
$$;

COMMENT ON FUNCTION public.issue_stock_atomic IS
  'V2.0 Phase 2: unchanged external contract; journal writing now delegated to posting_engine_submit().';

GRANT EXECUTE ON FUNCTION public.receive_stock_atomic(uuid, uuid, uuid, numeric, numeric, date, text, uuid, uuid, uuid, text, uuid, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_stock_atomic(uuid, uuid, uuid, numeric, date, text, uuid, uuid, uuid, text, uuid, uuid, uuid) TO authenticated, service_role;
