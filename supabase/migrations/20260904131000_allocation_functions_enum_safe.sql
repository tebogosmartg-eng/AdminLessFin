-- ============================================================================
-- The allocation functions, with every invoice-status comparison cast to text.
--
-- See 20260904130000 for why: comparing the invoice_status enum against a label
-- it does not have raises, rather than returning false. Casting to text makes
-- the comparison mean what the code says and survives the type changing.
--
-- The status the engine WRITES is cast back to invoice_status explicitly, since
-- assigning text to an enum column is not implicit.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invoice_refresh_payment_status(p_invoice_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_gross numeric;
  v_allocated numeric;
  v_new text;
BEGIN
  SELECT status::text INTO v_status FROM public.invoices WHERE id = p_invoice_id;
  IF v_status IS NULL THEN RETURN NULL; END IF;
  -- These say something about the document, not about how much has been paid,
  -- and a receipt must never resurrect a voided invoice.
  IF v_status IN ('draft', 'void', 'cancelled') THEN RETURN v_status; END IF;

  v_gross := public.invoice_gross_amount(p_invoice_id);
  v_allocated := public.invoice_allocated_amount(p_invoice_id);

  IF v_gross > 0 AND v_allocated >= v_gross - 0.005 THEN
    v_new := 'paid';
  ELSIF v_allocated > 0.005 THEN
    v_new := 'partially_paid';
  ELSE
    v_new := 'sent';
  END IF;

  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE public.invoices SET status = v_new::invoice_status WHERE id = p_invoice_id;
  END IF;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross numeric;
  v_allocated numeric;
  v_company uuid;
  v_number text;
  v_status text;
BEGIN
  SELECT company_id, invoice_number, status::text
    INTO v_company, v_number, v_status
  FROM public.invoices WHERE id = NEW.invoice_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Invoice % does not exist.', NEW.invoice_id USING ERRCODE = '22023';
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Invoice % belongs to another company.', NEW.invoice_id USING ERRCODE = '42501';
  END IF;
  IF v_status IN ('void', 'cancelled') THEN
    RAISE EXCEPTION 'Invoice % is % and cannot be settled.', v_number, v_status USING ERRCODE = '22023';
  END IF;

  v_gross := public.invoice_gross_amount(NEW.invoice_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM public.invoice_payment_allocations
  WHERE invoice_id = NEW.invoice_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- The backstop for over-payment. The RPC checks this too, against a locked
  -- row; this catches anything reaching the table by another route.
  IF v_allocated + NEW.amount > v_gross + 0.005 THEN
    RAISE EXCEPTION
      'Allocating % to invoice % would settle %, but the invoice is only worth %.',
      NEW.amount, v_number, v_allocated + NEW.amount, v_gross
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_customer_receipt_atomic(
  p_company_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_deposit_account_id uuid,
  p_amount numeric,
  p_allocations jsonb DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_accounts_receivable_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ar_id uuid;
  v_deposit record;
  v_customer record;
  v_amount numeric;
  v_remaining numeric;
  v_alloc jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric;
  v_outstanding numeric;
  v_planned jsonb := '[]'::jsonb;
  v_total_allocated numeric := 0;
  v_inv record;
  v_result jsonb;
  v_journal_id uuid;
  v_posting_status text;
  v_key text;
  v_settled numeric;
BEGIN
  v_amount := ROUND(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'A receipt must be for a positive amount.' USING ERRCODE = '22023';
  END IF;

  SELECT id, name INTO v_customer FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id;
  IF v_customer.id IS NULL THEN
    RAISE EXCEPTION 'Customer not found in this company.' USING ERRCODE = '22023';
  END IF;

  -- The debtors control account is resolved by ROLE, not taken on trust. A
  -- receipt credited to some other asset account balances perfectly and
  -- silently corrupts the debtors sub-ledger.
  IF p_accounts_receivable_id IS NOT NULL THEN
    SELECT id INTO v_ar_id FROM public.chart_of_accounts
    WHERE id = p_accounts_receivable_id AND company_id = p_company_id
      AND type = 'Asset' AND account_role = 'trade_receivable';
    IF v_ar_id IS NULL THEN
      RAISE EXCEPTION
        'The account given for accounts receivable is not this company''s trade receivable control account.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT id INTO v_ar_id FROM public.chart_of_accounts
    WHERE company_id = p_company_id AND type = 'Asset' AND account_role = 'trade_receivable'
    ORDER BY account_number LIMIT 1;
    IF v_ar_id IS NULL THEN
      RAISE EXCEPTION 'This company has no trade receivable control account mapped in its chart of accounts.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT id, name, type, account_role, is_active INTO v_deposit
  FROM public.chart_of_accounts
  WHERE id = p_deposit_account_id AND company_id = p_company_id;
  IF v_deposit.id IS NULL THEN
    RAISE EXCEPTION 'The deposit account does not belong to this company.' USING ERRCODE = '22023';
  END IF;
  IF v_deposit.type <> 'Asset' THEN
    RAISE EXCEPTION 'Money received must be deposited to an asset account, and % is a %.',
      v_deposit.name, v_deposit.type USING ERRCODE = '22023';
  END IF;
  IF v_deposit.id = v_ar_id
     OR COALESCE(v_deposit.account_role, '') IN ('trade_receivable', 'trade_payable') THEN
    RAISE EXCEPTION 'A receipt cannot be deposited into a control account (%).', v_deposit.name
      USING ERRCODE = '22023';
  END IF;

  -- ---- Decide what the money settles --------------------------------------
  v_remaining := v_amount;

  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array'
     AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_invoice_id := NULLIF(v_alloc->>'invoice_id', '')::uuid;
      v_alloc_amount := ROUND(COALESCE((v_alloc->>'amount')::numeric, 0), 2);
      IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION 'Every allocation needs an invoice_id.' USING ERRCODE = '22023';
      END IF;
      IF v_alloc_amount <= 0 THEN
        RAISE EXCEPTION 'An allocation must be for a positive amount.' USING ERRCODE = '22023';
      END IF;

      -- Locked, so two receipts cannot both see the same invoice as unpaid and
      -- between them settle it twice.
      SELECT id, invoice_number, customer_id, status::text AS status_text INTO v_inv
      FROM public.invoices WHERE id = v_invoice_id AND company_id = p_company_id FOR UPDATE;
      IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invoice not found in this company.' USING ERRCODE = '22023';
      END IF;
      IF v_inv.customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'Invoice % belongs to a different customer.', v_inv.invoice_number
          USING ERRCODE = '22023';
      END IF;
      IF v_inv.status_text IN ('void', 'cancelled', 'draft') THEN
        RAISE EXCEPTION 'Invoice % is % and cannot be settled.', v_inv.invoice_number, v_inv.status_text
          USING ERRCODE = '22023';
      END IF;

      v_outstanding := public.invoice_outstanding_amount(v_invoice_id);
      IF v_alloc_amount > v_outstanding + 0.005 THEN
        RAISE EXCEPTION 'Invoice % has % outstanding; % cannot be allocated to it.',
          v_inv.invoice_number, v_outstanding, v_alloc_amount USING ERRCODE = '22023';
      END IF;
      IF v_alloc_amount > v_remaining + 0.005 THEN
        RAISE EXCEPTION 'The allocations come to more than the % received.', v_amount
          USING ERRCODE = '22023';
      END IF;

      v_planned := v_planned || jsonb_build_array(jsonb_build_object(
        'invoice_id', v_invoice_id, 'invoice_number', v_inv.invoice_number, 'amount', v_alloc_amount));
      v_remaining := ROUND(v_remaining - v_alloc_amount, 2);
      v_total_allocated := ROUND(v_total_allocated + v_alloc_amount, 2);
    END LOOP;
  ELSE
    -- Oldest first, which is what a clerk banking a cheque against a statement
    -- means when they do not say which invoice it is for.
    FOR v_inv IN
      SELECT i.id, i.invoice_number
      FROM public.invoices i
      WHERE i.company_id = p_company_id
        AND i.customer_id = p_customer_id
        AND i.status::text NOT IN ('void', 'cancelled', 'draft', 'paid')
      ORDER BY i.invoice_date, i.invoice_number
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0.005;
      v_outstanding := public.invoice_outstanding_amount(v_inv.id);
      CONTINUE WHEN v_outstanding <= 0.005;
      v_alloc_amount := LEAST(v_outstanding, v_remaining);
      v_planned := v_planned || jsonb_build_array(jsonb_build_object(
        'invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number, 'amount', v_alloc_amount));
      v_remaining := ROUND(v_remaining - v_alloc_amount, 2);
      v_total_allocated := ROUND(v_total_allocated + v_alloc_amount, 2);
    END LOOP;
  END IF;

  -- ---- Post it ------------------------------------------------------------
  v_key := COALESCE(
    NULLIF(p_idempotency_key, ''),
    'banking:customer_receipt:' || gen_random_uuid()::text
  );

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id,
    'posting_date', p_payment_date,
    'module', 'banking',
    'document_type', 'customer_receipt',
    'description', COALESCE(NULLIF(p_description, ''), 'Receipt from ' || v_customer.name),
    'customer_id', p_customer_id,
    'created_by', p_actor_user_id,
    'idempotency_key', v_key,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_deposit_account_id, 'debit', v_amount),
      jsonb_build_object('account_id', v_ar_id, 'credit', v_amount)
    )
  ), 'commit');

  v_journal_id := NULLIF(v_result->>'journal_id', '')::uuid;
  v_posting_status := v_result->>'posting_status';

  -- A replay already has its allocations. Saying so lets the caller tell the
  -- user "this receipt was already recorded" instead of reporting a second
  -- success for money that was only banked once.
  IF v_posting_status = 'duplicate' THEN
    v_settled := public.receipt_allocated_total(v_journal_id);
    RETURN jsonb_build_object(
      'journal_id', v_journal_id,
      'journal_number', v_result->>'journal_number',
      'posting_status', 'duplicate',
      'amount', v_amount,
      'allocated', v_settled,
      'unallocated', ROUND(v_amount - v_settled, 2),
      'allocations', public.receipt_allocations_json(v_journal_id),
      'idempotency_key', v_key
    );
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_planned)
  LOOP
    INSERT INTO public.invoice_payment_allocations
      (company_id, invoice_id, journal_entry_id, amount, created_by)
    VALUES (
      p_company_id,
      (v_alloc->>'invoice_id')::uuid,
      v_journal_id,
      (v_alloc->>'amount')::numeric,
      p_actor_user_id
    );
    PERFORM public.invoice_refresh_payment_status((v_alloc->>'invoice_id')::uuid);
  END LOOP;

  RETURN jsonb_build_object(
    'journal_id', v_journal_id,
    'journal_number', v_result->>'journal_number',
    'posting_status', COALESCE(v_posting_status, 'committed'),
    'amount', v_amount,
    'allocated', v_total_allocated,
    'unallocated', ROUND(v_amount - v_total_allocated, 2),
    'allocations', v_planned,
    'idempotency_key', v_key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_customer_receipt_atomic(
  uuid, uuid, date, uuid, numeric, jsonb, text, text, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_receipt_atomic(
  uuid, uuid, date, uuid, numeric, jsonb, text, text, uuid, uuid) TO service_role;
