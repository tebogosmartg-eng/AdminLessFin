-- AdminLess Fin V17.1 — Atomic Sales Invoice + Inventory/COGS bridge
-- Fixes: ambiguous create_invoice_with_taxes overload (two signatures colliding),
-- and the missing Sales -> Inventory bridge (existing invoice RPCs never touched inventory).
-- All business writes for a given operation happen inside one SECURITY DEFINER plpgsql
-- function body, so Postgres rolls back everything on any error (no partial writes).

-- ── Shared helpers (reused by invoice posting and manual receive/issue) ──────

CREATE OR REPLACE FUNCTION public.eim_weighted_average(q0 numeric, c0 numeric, q1 numeric, c1 numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  a numeric := GREATEST(COALESCE(q0, 0), 0);
  b numeric := COALESCE(q1, 0);
BEGIN
  IF a + b <= 0 THEN
    RETURN COALESCE(c1, 0);
  END IF;
  RETURN (a * COALESCE(c0, 0) + b * COALESCE(c1, 0)) / (a + b);
END;
$$;

CREATE OR REPLACE FUNCTION public.eim_ensure_default_warehouse(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warehouse_id uuid;
BEGIN
  SELECT id INTO v_warehouse_id FROM inv_warehouses
    WHERE company_id = p_company_id AND is_default = true LIMIT 1;
  IF v_warehouse_id IS NOT NULL THEN RETURN v_warehouse_id; END IF;

  SELECT id INTO v_warehouse_id FROM inv_warehouses
    WHERE company_id = p_company_id LIMIT 1;
  IF v_warehouse_id IS NOT NULL THEN RETURN v_warehouse_id; END IF;

  INSERT INTO inv_warehouses (company_id, code, name, is_default, status)
  VALUES (p_company_id, 'MAIN', 'Main Warehouse', true, 'active')
  RETURNING id INTO v_warehouse_id;

  INSERT INTO inv_uom (company_id, code, name, is_base)
  VALUES
    (p_company_id, 'EA', 'Each', true),
    (p_company_id, 'KG', 'Kilogram', false),
    (p_company_id, 'BOX', 'Box', false)
  ON CONFLICT (company_id, code) DO NOTHING;

  RETURN v_warehouse_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.eim_get_or_create_balance(
  p_company_id uuid, p_product_id uuid, p_warehouse_id uuid, p_location_id uuid DEFAULT NULL
)
RETURNS public.inv_balances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal inv_balances;
BEGIN
  SELECT * INTO v_bal FROM inv_balances
    WHERE company_id = p_company_id AND product_id = p_product_id AND warehouse_id = p_warehouse_id
      AND ((p_location_id IS NULL AND location_id IS NULL) OR location_id = p_location_id)
    FOR UPDATE;
  IF FOUND THEN RETURN v_bal; END IF;

  INSERT INTO inv_balances (company_id, product_id, warehouse_id, location_id, qty_on_hand, qty_reserved, avg_unit_cost)
  VALUES (p_company_id, p_product_id, p_warehouse_id, p_location_id, 0, 0, 0)
  RETURNING * INTO v_bal;
  RETURN v_bal;
END;
$$;

CREATE OR REPLACE FUNCTION public.eim_sync_product_qty(p_company_id uuid, p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  SELECT COALESCE(SUM(qty_on_hand), 0) INTO v_total FROM inv_balances
    WHERE company_id = p_company_id AND product_id = p_product_id;
  UPDATE products SET quantity_on_hand = v_total, updated_at = now()
    WHERE id = p_product_id AND company_id = p_company_id;
END;
$$;

-- Consumes stock (FIFO/specific/weighted-average/standard) from balances/cost layers.
-- Raises on insufficient stock. Does NOT post journals or inventory_transactions —
-- callers (post_sales_invoice_atomic, issue_stock_atomic) own that so they can share
-- one journal_entries header with their other lines.
CREATE OR REPLACE FUNCTION public.eim_consume_stock(
  p_company_id uuid, p_product_id uuid, p_warehouse_id uuid, p_qty numeric,
  p_cost_method text, p_standard_cost numeric DEFAULT NULL, p_specific_layer_id uuid DEFAULT NULL
)
RETURNS TABLE(unit_cost numeric, total_cost numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal inv_balances;
  v_remaining numeric := p_qty;
  v_take numeric;
  v_total numeric := 0;
  v_unit_cost numeric;
  v_layer record;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Consume quantity must be positive' USING ERRCODE = '22023';
  END IF;

  v_bal := eim_get_or_create_balance(p_company_id, p_product_id, p_warehouse_id, NULL);
  IF v_bal.qty_on_hand + 0.0001 < p_qty THEN
    RAISE EXCEPTION 'Insufficient stock for product %: on hand % but % requested',
      p_product_id, v_bal.qty_on_hand, p_qty USING ERRCODE = '22023';
  END IF;

  IF p_cost_method = 'standard' THEN
    v_unit_cost := COALESCE(p_standard_cost, v_bal.avg_unit_cost, 0);
    v_total := v_unit_cost * p_qty;
  ELSIF p_cost_method IN ('fifo', 'specific') THEN
    FOR v_layer IN
      SELECT * FROM inv_cost_layers
      WHERE company_id = p_company_id AND product_id = p_product_id AND warehouse_id = p_warehouse_id
        AND status = 'open' AND qty_remaining > 0
        AND (p_cost_method <> 'specific' OR id = p_specific_layer_id)
      ORDER BY received_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_layer.qty_remaining, v_remaining);
      v_total := v_total + v_take * v_layer.unit_cost;
      UPDATE inv_cost_layers
        SET qty_remaining = qty_remaining - v_take,
            status = CASE WHEN qty_remaining - v_take <= 0.0000001 THEN 'exhausted' ELSE 'open' END
        WHERE id = v_layer.id;
      v_remaining := v_remaining - v_take;
    END LOOP;
    IF v_remaining > 0.0001 THEN
      RAISE EXCEPTION 'Insufficient FIFO/specific cost layers for product %', p_product_id
        USING ERRCODE = '22023';
    END IF;
    v_unit_cost := v_total / p_qty;
  ELSE
    v_unit_cost := COALESCE(v_bal.avg_unit_cost, 0);
    v_total := v_unit_cost * p_qty;
  END IF;

  UPDATE inv_balances SET qty_on_hand = qty_on_hand - p_qty, updated_at = now() WHERE id = v_bal.id;

  RETURN QUERY SELECT v_unit_cost, v_total;
END;
$$;

-- ── Atomic sales invoice posting (AR/Revenue/Tax + Inventory/COGS in one transaction) ──

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
  v_je_id uuid;
  v_item jsonb;
  v_product record;
  v_line_amount numeric;
  v_tax_rate numeric;
  v_tax_amount numeric;
  v_line_item_id uuid;
  v_grand_total numeric := 0;
  v_warehouse_id uuid;
  v_consumed record;
  v_item_class text;
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

  -- Period-lock is also enforced by the trigger on journal_entries below,
  -- checked explicitly here too so we fail before touching inventory.
  PERFORM public.assert_period_open(p_company_id, p_invoice_date);

  INSERT INTO invoices (company_id, customer_id, invoice_date, due_date, invoice_number, notes, quote_id, status)
  VALUES (p_company_id, p_customer_id, p_invoice_date, p_due_date, p_invoice_number, p_notes, p_quote_id, 'sent')
  RETURNING id INTO v_invoice_id;

  INSERT INTO journal_entries (company_id, entry_date, description, invoice_id, customer_id)
  VALUES (p_company_id, p_invoice_date, COALESCE(p_description, 'Invoice ' || p_invoice_number), v_invoice_id, p_customer_id)
  RETURNING id INTO v_je_id;

  UPDATE invoices SET journal_entry_id = v_je_id WHERE id = v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'income_account_id') IS NULL THEN
      RAISE EXCEPTION 'post_sales_invoice_atomic: income_account_id is required on every line'
        USING ERRCODE = '22023';
    END IF;

    v_line_amount := (v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric;
    v_grand_total := v_grand_total + v_line_amount;

    INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount, project_id)
    VALUES (
      v_je_id,
      (v_item->>'income_account_id')::uuid,
      'credit',
      v_line_amount,
      NULLIF(v_item->>'project_id', '')::uuid
    )
    RETURNING id INTO v_line_item_id;

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
          INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount)
          VALUES (v_je_id, p_tax_payable_account_id, 'credit', v_tax_amount);
        END IF;
        INSERT INTO journal_entry_item_tax_rates (journal_entry_item_id, tax_rate_id)
        VALUES (v_line_item_id, (v_item->>'tax_rate_id')::uuid);
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

        INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount)
        VALUES (v_je_id, v_product.cogs_account_id, 'debit', v_consumed.total_cost);
        INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount)
        VALUES (v_je_id, COALESCE(v_product.inventory_asset_account_id, p_inventory_asset_account_id), 'credit', v_consumed.total_cost);

        INSERT INTO inventory_transactions (
          company_id, product_id, transaction_date, quantity_change, transaction_type,
          unit_cost, total_cost, warehouse_id, journal_entry_id, cost_method,
          source_doc_type, source_doc_id, reference_id, description
        ) VALUES (
          p_company_id, v_product.id, p_invoice_date, -(v_item->>'quantity')::numeric, 'issue',
          v_consumed.unit_cost, v_consumed.total_cost, v_warehouse_id, v_je_id, v_product.cost_method,
          'invoice', v_invoice_id, v_je_id, 'Sales invoice ' || p_invoice_number
        );

        PERFORM eim_sync_product_qty(p_company_id, v_product.id);
      END IF;
    END IF;
  END LOOP;

  INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount)
  VALUES (v_je_id, p_ar_account_id, 'debit', v_grand_total);

  RETURN v_invoice_id;
END;
$$;

COMMENT ON FUNCTION public.post_sales_invoice_atomic IS
  'V17.1: Single-transaction sales invoice posting — AR/Revenue/Tax + Inventory/COGS. Supersedes the ambiguous create_invoice_with_taxes overloads.';

-- ── Atomic manual stock receive/issue (completes inventory+journal atomicity beyond invoices) ──

CREATE OR REPLACE FUNCTION public.receive_stock_atomic(
  p_company_id uuid, p_product_id uuid, p_warehouse_id uuid, p_qty numeric, p_unit_cost numeric,
  p_date date, p_source_doc_type text, p_source_doc_id uuid,
  p_inventory_account_id uuid, p_offset_account_id uuid,
  p_description text DEFAULT NULL, p_vendor_id uuid DEFAULT NULL, p_lot_code text DEFAULT NULL,
  p_location_id uuid DEFAULT NULL
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

  INSERT INTO journal_entries (company_id, entry_date, description, vendor_id)
  VALUES (p_company_id, p_date, COALESCE(p_description, 'Inventory receipt: ' || v_product.name), p_vendor_id)
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount)
  VALUES (v_je_id, v_inv_acct, 'debit', v_amount), (v_je_id, p_offset_account_id, 'credit', v_amount);

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

CREATE OR REPLACE FUNCTION public.issue_stock_atomic(
  p_company_id uuid, p_product_id uuid, p_warehouse_id uuid, p_qty numeric,
  p_date date, p_source_doc_type text, p_source_doc_id uuid,
  p_inventory_account_id uuid DEFAULT NULL, p_cogs_account_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL, p_specific_layer_id uuid DEFAULT NULL, p_location_id uuid DEFAULT NULL
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

  INSERT INTO journal_entries (company_id, entry_date, description)
  VALUES (p_company_id, p_date, COALESCE(p_description, 'Inventory issue / COGS: ' || v_product.name))
  RETURNING id INTO v_je_id;

  INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount)
  VALUES (v_je_id, v_cogs_acct, 'debit', v_consumed.total_cost), (v_je_id, v_inv_acct, 'credit', v_consumed.total_cost);

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

COMMENT ON FUNCTION public.receive_stock_atomic IS 'V17.1: Single-transaction stock receipt — balance/cost-layer update + balanced journal, replacing multi-step JS orchestration.';
COMMENT ON FUNCTION public.issue_stock_atomic IS 'V17.1: Single-transaction stock issue/COGS — balance/cost-layer consumption + balanced journal, replacing multi-step JS orchestration.';

GRANT EXECUTE ON FUNCTION public.eim_weighted_average(numeric, numeric, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eim_ensure_default_warehouse(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eim_get_or_create_balance(uuid, uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eim_sync_product_qty(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.eim_consume_stock(uuid, uuid, uuid, numeric, text, numeric, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice_atomic(uuid, uuid, date, date, text, uuid, uuid, uuid, text, jsonb, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_stock_atomic(uuid, uuid, uuid, numeric, numeric, date, text, uuid, uuid, uuid, text, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_stock_atomic(uuid, uuid, uuid, numeric, date, text, uuid, uuid, uuid, text, uuid, uuid) TO authenticated, service_role;
