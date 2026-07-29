-- AdminLess Fin — ERP Blueprint V3.0, Phase 3: Accounts Payable integration
-- Refactors record_bill_with_taxes, record_bill_with_inventory, pay_specific_bill,
-- allocate_vendor_credit to delegate journal writing to posting_engine_submit().
-- External signatures UNCHANGED (all match live signatures exactly) — bills/
-- index.ts and recurring-bills/index.ts keep working with zero call-site changes.
-- The legacy simple products.quantity_on_hand bump (bypassing the eim_v170
-- warehouse/cost-layer system) is preserved as-is — reconciling AP-side goods
-- receipt with the newer inventory subledger is a separate initiative, not
-- "migrate journal writing to the engine".

CREATE OR REPLACE FUNCTION public.record_bill_with_taxes(
  p_company_id uuid, p_vendor_id uuid, p_bill_date date, p_due_date date, p_bill_number text,
  p_accounts_payable_id uuid, p_tax_receivable_account_id uuid, p_description text, p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_bill_id uuid;
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
  INSERT INTO public.bills (company_id, vendor_id, bill_date, due_date, bill_number, status)
  VALUES (p_company_id, p_vendor_id, p_bill_date, p_due_date, p_bill_number, 'open')
  RETURNING id INTO v_new_bill_id;

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
END;
$$;

CREATE OR REPLACE FUNCTION public.record_bill_with_inventory(
  p_company_id uuid, p_vendor_id uuid, p_bill_date date, p_due_date date,
  p_accounts_payable_id uuid, p_description text, p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_bill_id uuid;
  v_total_amount numeric := 0;
  item record;
  v_posting_lines jsonb := '[]'::jsonb;
  v_result jsonb;
  v_je_id uuid;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(quantity numeric, unit_cost numeric)
  LOOP
    v_total_amount := v_total_amount + (item.quantity * item.unit_cost);
  END LOOP;

  INSERT INTO public.bills (company_id, vendor_id, bill_date, due_date, status)
  VALUES (p_company_id, p_vendor_id, p_bill_date, p_due_date, 'open')
  RETURNING id INTO v_new_bill_id;

  v_posting_lines := jsonb_build_array(jsonb_build_object('account_id', p_accounts_payable_id, 'credit', v_total_amount));

  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_id uuid, quantity numeric, unit_cost numeric, expense_account_id uuid, project_id uuid
  )
  LOOP
    v_posting_lines := v_posting_lines || jsonb_build_array(jsonb_build_object(
      'account_id', item.expense_account_id, 'debit', item.quantity * item.unit_cost, 'project_id', item.project_id
    ));

    IF item.product_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.products WHERE id = item.product_id AND type = 'inventory') THEN
      UPDATE public.products
      SET quantity_on_hand = quantity_on_hand + item.quantity, cost = item.unit_cost
      WHERE id = item.product_id;

      INSERT INTO public.inventory_transactions (
        company_id, product_id, transaction_date, quantity_change, transaction_type, reference_id, description
      ) VALUES (
        p_company_id, item.product_id, p_bill_date, item.quantity, 'bill', v_new_bill_id, 'Purchase on Bill'
      );
    END IF;
  END LOOP;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_bill_date, 'module', 'accounts_payable',
    'document_type', 'bill', 'document_id', v_new_bill_id,
    'description', COALESCE(p_description, 'Bill (recurring)'),
    'vendor_id', p_vendor_id, 'lines', v_posting_lines
  ), 'commit');

  v_je_id := (v_result->>'journal_id')::uuid;
  UPDATE public.bills SET journal_entry_id = v_je_id WHERE id = v_new_bill_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_specific_bill(
  p_bill_id uuid, p_payment_date date, p_payment_account_id uuid, p_ap_account_id uuid, p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_bill_number text;
  v_company_id uuid;
  v_total_bill_amount numeric;
  v_bill_je_id uuid;
  v_result jsonb;
BEGIN
  SELECT company_id, vendor_id, bill_number, journal_entry_id
  INTO v_company_id, v_vendor_id, v_bill_number, v_bill_je_id
  FROM public.bills WHERE id = p_bill_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Bill not found.'; END IF;

  SELECT SUM(amount) INTO v_total_bill_amount
  FROM public.journal_entry_items WHERE journal_entry_id = v_bill_je_id AND type = 'credit';

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', v_company_id, 'posting_date', p_payment_date, 'module', 'accounts_payable',
    'document_type', 'bill_payment', 'document_id', p_bill_id,
    'description', 'Payment for Bill ' || COALESCE(v_bill_number, ''),
    'vendor_id', v_vendor_id,
    'idempotency_key', 'accounts_payable:bill_payment:' || p_bill_id::text || ':' || p_payment_date::text || ':' || p_amount::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_ap_account_id, 'debit', p_amount),
      jsonb_build_object('account_id', p_payment_account_id, 'credit', p_amount)
    )
  ), 'commit');

  IF p_amount >= v_total_bill_amount THEN
    UPDATE public.bills SET status = 'paid' WHERE id = p_bill_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_vendor_credit(
  p_company_id uuid, p_vendor_credit_id uuid, p_bill_id uuid, p_amount numeric, p_ap_account_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_number text;
  v_bill_number text;
  v_vendor_id uuid;
BEGIN
  SELECT credit_number, vendor_id INTO v_credit_number, v_vendor_id
  FROM public.vendor_credits WHERE id = p_vendor_credit_id AND company_id = p_company_id;
  IF v_credit_number IS NULL THEN RAISE EXCEPTION 'Vendor Credit not found.'; END IF;

  SELECT bill_number INTO v_bill_number FROM public.bills WHERE id = p_bill_id AND company_id = p_company_id;
  IF v_bill_number IS NULL THEN RAISE EXCEPTION 'Bill not found.'; END IF;

  -- Same-account debit+credit wash, preserved exactly from the original:
  -- reduces the bill's AP liability while consuming the vendor credit's own
  -- AP-side balance, without a separate "vendor credit" GL account.
  PERFORM public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', CURRENT_DATE, 'module', 'accounts_payable',
    'document_type', 'vendor_credit_allocation', 'document_id', p_vendor_credit_id,
    'description', 'Allocation of ' || v_credit_number || ' to Bill ' || COALESCE(v_bill_number, ''),
    'vendor_id', v_vendor_id,
    'idempotency_key', 'accounts_payable:vendor_credit_allocation:' || p_vendor_credit_id::text || ':' || p_bill_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_ap_account_id, 'debit', p_amount),
      jsonb_build_object('account_id', p_ap_account_id, 'credit', p_amount)
    )
  ), 'commit');
END;
$$;

COMMENT ON FUNCTION public.record_bill_with_taxes IS 'V3.0 Phase 3: unchanged external contract; journal writing delegated to posting_engine_submit().';
COMMENT ON FUNCTION public.record_bill_with_inventory IS 'V3.0 Phase 3: unchanged external contract; journal writing delegated to posting_engine_submit().';
COMMENT ON FUNCTION public.pay_specific_bill IS 'V3.0 Phase 3: unchanged external contract; journal writing delegated to posting_engine_submit(). Idempotency key includes date+amount so paying the same bill twice on different dates/amounts is not treated as one duplicate.';
COMMENT ON FUNCTION public.allocate_vendor_credit IS 'V3.0 Phase 3: unchanged external contract; journal writing delegated to posting_engine_submit().';

GRANT EXECUTE ON FUNCTION public.record_bill_with_taxes(uuid, uuid, date, date, text, uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_bill_with_inventory(uuid, uuid, date, date, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_specific_bill(uuid, date, uuid, uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_vendor_credit(uuid, uuid, uuid, numeric, uuid) TO authenticated, service_role;
