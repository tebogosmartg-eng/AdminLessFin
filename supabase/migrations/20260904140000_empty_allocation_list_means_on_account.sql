-- ============================================================================
-- An empty allocation list means "leave it on account", not "decide for me".
--
-- The first version treated NULL and [] the same and applied both oldest-first,
-- which left no way to say the thing a clerk sometimes genuinely means: this
-- money is a deposit, or a payment in advance, and must NOT be applied to any
-- open invoice yet.
--
--   p_allocations = NULL  -> apply oldest invoice first (the default)
--   p_allocations = []    -> allocate nothing; the whole receipt sits on the
--                            customer's account as a credit
--   p_allocations = [...] -> exactly what is listed
--
-- Only the branch condition changes; the rest of the function is as it was.
-- ============================================================================

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
  v_explicit boolean;
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

  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'allocations must be a list of {invoice_id, amount}.' USING ERRCODE = '22023';
  END IF;
  v_explicit := p_allocations IS NOT NULL;

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

  v_remaining := v_amount;

  IF v_explicit THEN
    -- Exactly what was asked for, and nothing more. An empty list allocates
    -- nothing and the whole receipt stays on account.
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
