-- ============================================================================
-- AdminLess Fin — creating an invoice or a bill twice records it once.
--
-- The realistic duplicate: the server commits, the response is lost (network
-- drop, edge runtime killed), the user presses Save again. Bills had no
-- protection at all — the retry created a second bill AND a second AP journal.
-- Invoices most likely hit the live unique invoice-number constraint and
-- showed a misleading error for work that had already saved.
--
-- Fix: the client sends one idempotency key per submission (kept across
-- retries of that submission), the document row records it under a partial
-- unique index, and a replay returns the original document instead of posting
-- again. Same mechanism bank transfers have used all along
-- (record_bank_transfer_atomic); manual journals ride posting_requests'
-- existing key. Legacy rows, recurring jobs and quote conversion pass no key
-- and are untouched.
-- ============================================================================

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_idempotency_key
  ON public.invoices (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bills_company_idempotency_key
  ON public.bills (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- post_sales_invoice_atomic gains a trailing p_idempotency_key. The old
-- 13-argument signature is dropped so PostgREST never sees two overloads;
-- the positional callers (convert_quote_to_invoice_atomic) resolve against
-- the new signature through the default. Body identical to 20260922140000
-- apart from the replay check and the conflict-safe insert.
-- ----------------------------------------------------------------------------
DROP FUNCTION public.post_sales_invoice_atomic(uuid, uuid, date, date, text, uuid, uuid, uuid, text, jsonb, text, uuid, uuid);

CREATE FUNCTION public.post_sales_invoice_atomic(p_company_id uuid, p_customer_id uuid, p_invoice_date date, p_due_date date, p_invoice_number text, p_ar_account_id uuid, p_inventory_asset_account_id uuid, p_tax_payable_account_id uuid, p_description text, p_items jsonb, p_notes text DEFAULT NULL::text, p_quote_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
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

  -- Idempotent replay: this submission already created its invoice (and the
  -- whole function is one transaction, so an existing row means everything
  -- committed). Return it; consume no stock, post nothing.
  IF NULLIF(p_idempotency_key, '') IS NOT NULL THEN
    SELECT id INTO v_invoice_id FROM invoices
    WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;
    IF v_invoice_id IS NOT NULL THEN
      RETURN v_invoice_id;
    END IF;
  END IF;

  -- Fail fast before touching inventory; the Posting Engine re-checks this
  -- too (defense in depth, same pattern as V1.1).
  PERFORM public.assert_period_open(p_company_id, p_invoice_date);

  INSERT INTO invoices (company_id, customer_id, invoice_date, due_date, invoice_number, notes, quote_id, status, idempotency_key)
  VALUES (p_company_id, p_customer_id, p_invoice_date, p_due_date, p_invoice_number, p_notes, p_quote_id, 'sent', NULLIF(p_idempotency_key, ''))
  ON CONFLICT (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_invoice_id;

  -- A concurrent submission with the same key won the insert: return its
  -- invoice rather than posting a second one.
  IF v_invoice_id IS NULL THEN
    SELECT id INTO v_invoice_id FROM invoices
    WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;
    IF v_invoice_id IS NULL THEN
      RAISE EXCEPTION 'post_sales_invoice_atomic: could not create the invoice.' USING ERRCODE = '55006';
    END IF;
    RETURN v_invoice_id;
  END IF;

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

COMMENT ON FUNCTION public.post_sales_invoice_atomic(uuid, uuid, date, date, text, uuid, uuid, uuid, text, jsonb, text, uuid, uuid, text) IS
  'Posts a sales invoice through posting_engine_submit. p_idempotency_key makes a retried submission return the original invoice instead of posting a second one; stock and cost-of-sales account checks unchanged from 20260922140000.';

-- ----------------------------------------------------------------------------
-- record_bill_with_taxes: same treatment, and it now RETURNS the bill and
-- journal ids (the edge function used to re-find the bill by number, which
-- broke down the moment numbers repeat). Old void signature dropped.
-- ----------------------------------------------------------------------------
DROP FUNCTION public.record_bill_with_taxes(uuid, uuid, date, date, text, uuid, uuid, text, jsonb);

CREATE FUNCTION public.record_bill_with_taxes(
  p_company_id uuid, p_vendor_id uuid, p_bill_date date, p_due_date date, p_bill_number text,
  p_accounts_payable_id uuid, p_tax_receivable_account_id uuid, p_description text, p_items jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_bill_id uuid;
  v_existing record;
  v_total_amount numeric := 0;
  v_total_tax numeric := 0;
  item record;
  v_tax_rate record;
  v_line_total numeric;
  v_tax_amount numeric;
  v_posting_lines jsonb := '[]'::jsonb;
  v_result jsonb;
  v_je_id uuid;
BEGIN
  -- Idempotent replay: the whole function is one transaction, so an existing
  -- row for this key means the bill AND its journal committed. Return them.
  IF NULLIF(p_idempotency_key, '') IS NOT NULL THEN
    SELECT id, journal_entry_id INTO v_existing FROM public.bills
    WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'bill_id', v_existing.id, 'journal_id', v_existing.journal_entry_id,
        'posting_status', 'duplicate',
        'warnings', jsonb_build_array('Idempotent replay: existing bill returned, nothing recorded twice.')
      );
    END IF;
  END IF;

  INSERT INTO public.bills (company_id, vendor_id, bill_date, due_date, bill_number, status, idempotency_key)
  VALUES (p_company_id, p_vendor_id, p_bill_date, p_due_date, p_bill_number, 'open', NULLIF(p_idempotency_key, ''))
  ON CONFLICT (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_new_bill_id;

  IF v_new_bill_id IS NULL THEN
    SELECT id, journal_entry_id INTO v_existing FROM public.bills
    WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_bill_with_taxes: could not create the bill.' USING ERRCODE = '55006';
    END IF;
    RETURN jsonb_build_object(
      'bill_id', v_existing.id, 'journal_id', v_existing.journal_entry_id,
      'posting_status', 'duplicate',
      'warnings', jsonb_build_array('Idempotent replay (concurrent): existing bill returned.')
    );
  END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id uuid, description text, quantity numeric, unit_cost numeric,
    expense_account_id uuid, tax_rate_id uuid, project_id uuid
  )
  LOOP
    v_line_total := item.quantity * item.unit_cost;
    v_tax_amount := 0;

    IF item.tax_rate_id IS NOT NULL THEN
      SELECT rate INTO v_tax_rate FROM public.tax_rates WHERE id = item.tax_rate_id;
      IF FOUND THEN
        v_tax_amount := v_line_total * (v_tax_rate.rate / 100.0);
        v_total_tax := v_total_tax + v_tax_amount;
      END IF;
    END IF;

    v_total_amount := v_total_amount + v_line_total + v_tax_amount;

    v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object(
      'account_id', item.expense_account_id, 'debit', v_line_total,
      'project_id', item.project_id, 'tax_rate_id', item.tax_rate_id
    ));

    IF item.product_id IS NOT NULL THEN
      PERFORM 1 FROM public.products WHERE id = item.product_id AND type = 'inventory';
      IF FOUND THEN
        UPDATE public.products
        SET quantity_on_hand = quantity_on_hand + item.quantity, cost = item.unit_cost
        WHERE id = item.product_id;

        INSERT INTO public.inventory_transactions (
          company_id, product_id, transaction_date, quantity_change, transaction_type, reference_id, reference_number, description
        ) VALUES (
          p_company_id, item.product_id, p_bill_date, item.quantity, 'bill', v_new_bill_id, p_bill_number, 'Purchase on Bill'
        );
      END IF;
    END IF;
  END LOOP;

  IF v_total_tax > 0 THEN
    IF p_tax_receivable_account_id IS NULL THEN
      RAISE EXCEPTION 'Tax Receivable account required when taxes are applied.';
    END IF;
    v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object('account_id', p_tax_receivable_account_id, 'debit', v_total_tax));
  END IF;

  v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object('account_id', p_accounts_payable_id, 'credit', v_total_amount));

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_bill_date, 'module', 'accounts_payable',
    'document_type', 'bill', 'document_id', v_new_bill_id, 'reference', p_bill_number,
    'description', COALESCE(p_description, 'Bill ' || COALESCE(p_bill_number, '')),
    'vendor_id', p_vendor_id, 'lines', v_posting_lines
  ), 'commit');

  v_je_id := (v_result->>'journal_id')::uuid;
  UPDATE public.bills SET journal_entry_id = v_je_id WHERE id = v_new_bill_id;

  RETURN jsonb_build_object('bill_id', v_new_bill_id, 'journal_id', v_je_id, 'posting_status', 'posted');
END;
$$;

COMMENT ON FUNCTION public.record_bill_with_taxes(uuid, uuid, date, date, text, uuid, uuid, text, jsonb, text) IS
  'Records a bill and posts its AP journal through posting_engine_submit. p_idempotency_key makes a retried submission return the original bill; returns {bill_id, journal_id, posting_status}.';

-- Both functions are service-role paths: the edge functions authorise the
-- caller. (20260930140000 revokes the wider write surface; these two are
-- pinned here because DROP discarded their previous grants.)
REVOKE ALL ON FUNCTION public.post_sales_invoice_atomic(uuid, uuid, date, date, text, uuid, uuid, uuid, text, jsonb, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice_atomic(uuid, uuid, date, date, text, uuid, uuid, uuid, text, jsonb, text, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.record_bill_with_taxes(uuid, uuid, date, date, text, uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_bill_with_taxes(uuid, uuid, date, date, text, uuid, uuid, text, jsonb, text) TO service_role;
