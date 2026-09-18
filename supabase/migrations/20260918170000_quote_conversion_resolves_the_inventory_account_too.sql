-- ============================================================================
-- AdminLess Fin — converting a quotation for stock needs a stock account.
--
-- WHAT WAS WRONG
-- 20260918160000 resolved the receivables and VAT accounts by role so the
-- conversion dialog no longer had to ask for them, and the dialog stopped
-- asking. It did NOT resolve the inventory asset account, which the dialog also
-- stopped sending -- so a quotation with an inventory product on it could not
-- be invoiced at all. post_sales_invoice_atomic posts cost of sales and
-- inventory for such a line, and with no inventory account to post to the
-- accounting policy refused the entry:
--
--     Accounting policy violation: Inventory account Cost of Goods Sold may
--     only be posted from the Inventory module.
--
-- Caught by the browser check before anyone met it: the certification tenant's
-- only product is an inventory item, so every quotation it wrote hit this.
--
-- WHAT THIS DOES
-- Resolves the inventory asset account by role as well, on the same terms as
-- the other two: the caller's choice is honoured only if it is an inventory
-- asset account of this company, otherwise the mapped one is used.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice_atomic(
  p_company_id uuid,
  p_quote_id uuid,
  p_percentage numeric,
  p_invoice_date date,
  p_due_date date,
  p_invoice_number text,
  p_ar_account_id uuid,
  p_actor_user_id uuid,
  p_inventory_asset_account_id uuid DEFAULT NULL,
  p_tax_payable_account_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
  v_pct numeric;
  v_gross numeric;
  v_already numeric;
  v_room numeric;
  v_this numeric;
  v_items jsonb;
  v_invoice_id uuid;
  v_ar_id uuid;
  v_vat_id uuid;
  v_stock_id uuid;
  v_has_tax boolean;
  v_has_stock boolean;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can invoice its quotations.'
      USING ERRCODE = '42501';
  END IF;

  v_pct := ROUND(COALESCE(p_percentage, 0), 4);
  IF v_pct <= 0 OR v_pct > 100 THEN
    RAISE EXCEPTION 'An invoice can be raised for more than nothing and no more than all of a quotation; % per cent is neither.',
      v_pct USING ERRCODE = '22023';
  END IF;

  SELECT id, quote_number, customer_id, status INTO v_quote
  FROM public.quotes WHERE id = p_quote_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_quote.status <> 'accepted' THEN
    RAISE EXCEPTION 'Quotation % is %, so it cannot be invoiced. A quotation is invoiced once the customer has accepted it.',
      v_quote.quote_number, v_quote.status USING ERRCODE = '22023';
  END IF;

  v_gross := public.quote_gross_amount(p_quote_id);
  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Quotation % comes to nothing, so there is nothing to invoice.', v_quote.quote_number
      USING ERRCODE = '22023';
  END IF;
  v_already := public.quote_invoiced_amount(p_quote_id);
  v_room := ROUND(v_gross - v_already, 2);
  v_this := ROUND(v_gross * v_pct / 100.0, 2);

  IF v_this > v_room + 0.005 THEN
    IF v_already > 0 THEN
      RAISE EXCEPTION 'Quotation % was for %, and % has already been invoiced against it, so no more than % can be invoiced now.',
        v_quote.quote_number, ROUND(v_gross, 2), ROUND(v_already, 2), GREATEST(v_room, 0)
        USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'Quotation % was for %, so an invoice against it cannot be for %.',
      v_quote.quote_number, ROUND(v_gross, 2), v_this USING ERRCODE = '22023';
  END IF;

  -- The receivable, VAT and stock accounts are resolved by ROLE unless the
  -- caller names one of this company's own. The dialog used to offer "any
  -- asset" and "any liability", and an invoice that debits the wrong asset or
  -- credits the wrong liability balances perfectly while corrupting the
  -- sub-ledger.
  IF p_ar_account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chart_of_accounts
    WHERE id = p_ar_account_id AND company_id = p_company_id
      AND type = 'Asset' AND account_role = 'trade_receivable'
  ) THEN
    v_ar_id := p_ar_account_id;
  ELSE
    SELECT id INTO v_ar_id FROM public.chart_of_accounts
    WHERE company_id = p_company_id AND type = 'Asset' AND account_role = 'trade_receivable'
    ORDER BY account_number LIMIT 1;
  END IF;
  IF v_ar_id IS NULL THEN
    RAISE EXCEPTION 'This company has no trade receivable control account mapped in its chart of accounts.'
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.quote_items WHERE quote_id = p_quote_id AND tax_rate_id IS NOT NULL)
    INTO v_has_tax;
  IF v_has_tax THEN
    IF p_tax_payable_account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE id = p_tax_payable_account_id AND company_id = p_company_id
        AND account_role IN ('output_vat', 'vat_control')
    ) THEN
      v_vat_id := p_tax_payable_account_id;
    ELSE
      SELECT id INTO v_vat_id FROM public.chart_of_accounts
      WHERE company_id = p_company_id AND account_role IN ('output_vat', 'vat_control')
      ORDER BY CASE account_role WHEN 'output_vat' THEN 0 ELSE 1 END, account_number
      LIMIT 1;
    END IF;
    IF v_vat_id IS NULL THEN
      RAISE EXCEPTION 'Quotation % charges VAT, but no output VAT account is mapped in the chart of accounts.',
        v_quote.quote_number USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Selling stock moves it off the balance sheet, so an invoice for an
  -- inventory product needs the account that stock sits in.
  SELECT EXISTS (
    SELECT 1 FROM public.quote_items qi
    JOIN public.products p ON p.id = qi.product_id
    WHERE qi.quote_id = p_quote_id AND p.type = 'inventory'
  ) INTO v_has_stock;
  IF v_has_stock THEN
    IF p_inventory_asset_account_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE id = p_inventory_asset_account_id AND company_id = p_company_id
        AND type = 'Asset' AND account_role = 'inventory_asset'
    ) THEN
      v_stock_id := p_inventory_asset_account_id;
    ELSE
      SELECT id INTO v_stock_id FROM public.chart_of_accounts
      WHERE company_id = p_company_id AND type = 'Asset' AND account_role = 'inventory_asset'
      ORDER BY account_number LIMIT 1;
    END IF;
    IF v_stock_id IS NULL THEN
      RAISE EXCEPTION 'Quotation % includes stock, but no inventory asset account is mapped in the chart of accounts.',
        v_quote.quote_number USING ERRCODE = '22023';
    END IF;
  END IF;

  -- The percentage scales the unit price, so a part invoice reads as the same
  -- lines at a share of the price rather than as one opaque "deposit" line.
  -- Rounded per unit, which can differ by a cent from scaling the line total;
  -- the invoice's own rounding then governs, as it does for any invoice.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', qi.product_id,
    'quantity', qi.quantity,
    'unit_price', ROUND(qi.unit_price * v_pct / 100.0, 2),
    'income_account_id', qi.income_account_id,
    'tax_rate_id', qi.tax_rate_id
  ) ORDER BY qi.position NULLS LAST, qi.id), '[]'::jsonb)
  INTO v_items
  FROM public.quote_items qi
  WHERE qi.quote_id = p_quote_id;

  v_invoice_id := public.post_sales_invoice_atomic(
    p_company_id,
    v_quote.customer_id,
    p_invoice_date,
    p_due_date,
    p_invoice_number,
    v_ar_id,
    v_stock_id,
    v_vat_id,
    COALESCE(p_description, 'Invoice for Quote ' || v_quote.quote_number || ' (' || v_pct || '%)'),
    v_items,
    p_notes,
    p_quote_id,
    p_actor_user_id
  );

  RETURN jsonb_build_object(
    'id', v_invoice_id,
    'quote_id', p_quote_id,
    'quote_total', ROUND(v_gross, 2),
    'invoiced_before', ROUND(v_already, 2),
    'invoiced_now', v_this,
    'left_to_invoice', ROUND(v_gross - public.quote_invoiced_amount(p_quote_id), 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.convert_quote_to_invoice_atomic(uuid, uuid, numeric, date, date, text, uuid, uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice_atomic(uuid, uuid, numeric, date, date, text, uuid, uuid, uuid, uuid, text, text)
  TO service_role;
