-- ============================================================================
-- AdminLess Fin — a stock product must name real stock accounts.
--
-- WHAT WAS WRONG
-- post_sales_invoice_atomic checked only that a stock product HAD an inventory
-- asset account and a cost of sales account, never that they were those things.
--
-- Spaceman has a stock product whose inventory asset account is "AR" -- the
-- trade receivable control account -- and whose cost of sales account is
-- "Fuel". Selling it debited Fuel and CREDITED ACCOUNTS RECEIVABLE with the
-- cost of the goods, quietly understating what customers owe. It has happened
-- twice, on 2026-07-28 and 2026-08-20.
--
-- The accounting policy could not catch it: the policy looks for the roles
-- `inventory_asset` and `cogs`, and neither of those accounts carries one.
-- Spaceman has no account carrying either role at all, which is also why its
-- stock ledger holds 1 560,00 of value that the general ledger has never seen.
--
-- WHAT THIS DOES
-- Checks the two accounts before consuming any stock: the stock account must be
-- an Asset that is not a control account, and the cost of sales account must be
-- an Expense that is not a control account. A product pointed at the wrong
-- thing is refused with a message naming the account, instead of posting.
--
-- This is deliberately not a check on account_role: several companies map a
-- perfectly good cost of sales account without setting a role, and refusing
-- those would be wrong. It is the control accounts that must never receive
-- the cost of goods sold.
--
-- Nothing is repaired here. Spaceman's two historical postings are left
-- exactly as they are -- correcting them is a decision about a client's books,
-- not a migration. What this stops is a third one.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_sales_invoice_atomic(p_company_id uuid, p_customer_id uuid, p_invoice_date date, p_due_date date, p_invoice_number text, p_ar_account_id uuid, p_inventory_asset_account_id uuid, p_tax_payable_account_id uuid, p_description text, p_items jsonb, p_notes text DEFAULT NULL::text, p_quote_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_stock_account_id uuid;
  v_stock_account record;
  v_cogs_account record;
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

        -- The accounts are checked BEFORE the stock is consumed. Selling stock
        -- moves its cost off the balance sheet and into cost of sales, so the
        -- two accounts the product names have to be those two things. A live
        -- tenant had a stock product whose "stock" account was Accounts
        -- Receivable and whose "cost of sales" account was Fuel, so every sale
        -- quietly credited the customer control account with the cost of the
        -- goods. Neither account carries a stock role, so the accounting policy
        -- never saw it either.
        v_stock_account_id := COALESCE(v_product.inventory_asset_account_id, p_inventory_asset_account_id);
        IF v_product.cogs_account_id IS NULL OR v_stock_account_id IS NULL THEN
          RAISE EXCEPTION 'Product % cannot be sold until it has both a stock account and a cost of sales account.',
            v_product.name USING ERRCODE = '22023';
        END IF;

        SELECT id, name, type, account_role INTO v_stock_account
        FROM chart_of_accounts WHERE id = v_stock_account_id AND company_id = p_company_id;
        IF v_stock_account.id IS NULL THEN
          RAISE EXCEPTION 'The stock account set on product % does not belong to this company.',
            v_product.name USING ERRCODE = '22023';
        END IF;
        IF v_stock_account.type <> 'Asset' OR COALESCE(v_stock_account.account_role, '') IN
             ('trade_receivable', 'trade_payable', 'bank', 'input_vat', 'output_vat', 'vat_control', 'retained_earnings') THEN
          RAISE EXCEPTION 'Product % carries its stock in %, which is not a stock account. Point it at the account stock is held in before selling it.',
            v_product.name, v_stock_account.name USING ERRCODE = '22023';
        END IF;

        SELECT id, name, type, account_role INTO v_cogs_account
        FROM chart_of_accounts WHERE id = v_product.cogs_account_id AND company_id = p_company_id;
        IF v_cogs_account.id IS NULL THEN
          RAISE EXCEPTION 'The cost of sales account set on product % does not belong to this company.',
            v_product.name USING ERRCODE = '22023';
        END IF;
        IF v_cogs_account.type <> 'Expense' OR COALESCE(v_cogs_account.account_role, '') IN
             ('trade_receivable', 'trade_payable', 'bank', 'input_vat', 'output_vat', 'vat_control', 'retained_earnings') THEN
          RAISE EXCEPTION 'Product % charges the cost of what it sells to %, which is not a cost of sales account.',
            v_product.name, v_cogs_account.name USING ERRCODE = '22023';
        END IF;

        SELECT * INTO v_consumed FROM eim_consume_stock(
          p_company_id, v_product.id, v_warehouse_id,
          (v_item->>'quantity')::numeric,
          COALESCE(v_product.cost_method, 'weighted_average'),
          v_product.standard_cost
        );

        v_posting_lines := v_posting_lines || jsonb_build_array(
          jsonb_build_object('account_id', v_product.cogs_account_id, 'debit', v_consumed.total_cost),
          jsonb_build_object('account_id', v_stock_account_id, 'credit', v_consumed.total_cost)
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
$function$;

COMMENT ON FUNCTION public.post_sales_invoice_atomic(uuid, uuid, date, date, text, uuid, uuid, uuid, text, jsonb, text, uuid, uuid) IS
  'Posts a sales invoice through posting_engine_submit. A stock line now also checks that the product''s stock and cost of sales accounts really are an asset and an expense, and not control accounts.';
