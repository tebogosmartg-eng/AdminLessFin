-- ============================================================================
-- AdminLess Fin — voiding an invoice is a posting, not a status change.
--
-- WHAT WAS WRONG
-- void_invoice(p_invoice_id) took one argument and did four things badly.
--
--   1. NO TENANT CHECK, AND GRANTED TO `authenticated`. It looked the invoice
--      up by id alone -- its own body carried the comment "Removed
--      is_company_member check here for RPC internal calls" -- and any signed-in
--      user could execute it. Any user could void any company's invoice.
--
--   2. IT BYPASSED THE POSTING ENGINE. It INSERTed the reversal journal and its
--      mirrored lines straight into the tables. So the reversal got no
--      journal_number (NULL), no posting_requests row, no period check and no
--      accounting policy evaluation. An invoice could be voided into a closed
--      period, and the reversal was invisible to everything that reads the
--      posting request ledger -- including invoice_allocations_follow_reversal,
--      the trigger that is supposed to unwind settlements.
--
--   3. IT NEVER RETURNED THE STOCK. The function carried a comment saying the
--      stock movement "should ideally" be reversed, and then did not. The
--      journal reversal DOES debit the inventory asset back, so after voiding a
--      stock invoice the ledger said the stock was back on the balance sheet
--      and products.quantity_on_hand said it was gone. This only became
--      reachable on 2026-09-22, when 20260922100000 allowed a stock item to be
--      sold on an invoice at all.
--
--   4. IT COULD BE RUN TWICE. Nothing looked at status, so voiding an already
--      void invoice posted a second reversal -- turning the reversal into a
--      duplicate of the original sale.
--
-- WHAT THIS DOES
-- Makes voiding a posting like any other: authorised, period-checked,
-- policy-checked, numbered, recorded, and reversible exactly once.
--
--   * The company and the person doing it are required, and the person must be
--     a member of that company. EXECUTE is taken away from `authenticated`;
--     the edge function calls it with the service role after authorising.
--   * The reversal goes through posting_engine_rollback, which refuses a second
--     reversal, checks the period, allocates a real journal number, carries the
--     party, project and dimensions, and records the posting request.
--   * Stock that went out on the invoice comes back: the balance, the cost
--     layer where the costing method uses one, a matching sub-ledger movement
--     against the reversal journal, and the product quantity re-synced.
--   * An invoice with money or credit allocated against it is refused, because
--     the allocation would be left pointing at a document that no longer
--     exists. The settlement comes off first.
--   * Who voided it, when, and why is recorded on the invoice.
--
-- Two invoices in Spaceman predate the posting engine and have no posting
-- request to roll back. They keep a direct mirror, but with the guarantees the
-- engine would have given: an open period and a real journal number.
--
-- No posted historical entry is rewritten. The backfill at the end only adds
-- the stock return that voiding should have written, for invoices already void
-- whose stock never came back.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text;

-- Every status in the table today is one of these five.
DO $status$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_status_check
      CHECK (status IN ('draft', 'sent', 'paid', 'partially_paid', 'void'));
  END IF;
END;
$status$;

DROP FUNCTION IF EXISTS public.void_invoice(uuid);

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_key text;
  v_result jsonb;
  v_je_id uuid;
  v_journal_number text;
  v_txn record;
  v_bal inv_balances;
  v_qty numeric;
  v_returned numeric := 0;
  v_allocated numeric;
  v_through_engine boolean := false;
BEGIN
  IF p_company_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Voiding an invoice needs the company it belongs to and the person doing it.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can void its invoices.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.invoices
  WHERE id = p_invoice_id AND company_id = p_company_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_inv.status = 'void' THEN
    RAISE EXCEPTION 'Invoice % has already been voided, so there is nothing left to reverse.',
      v_inv.invoice_number USING ERRCODE = '22023';
  END IF;
  IF v_inv.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Invoice % was never posted to the ledger, so there is nothing to void.',
      v_inv.invoice_number USING ERRCODE = '22023';
  END IF;

  -- A settlement records that this invoice was paid or credited. Voiding the
  -- invoice under it would leave that record pointing at a document that no
  -- longer exists, and the customer's balance would be wrong in a way nothing
  -- reports. The settlement comes off first.
  v_allocated := COALESCE(public.invoice_allocated_amount(p_invoice_id), 0);
  IF v_allocated > 0.005 THEN
    RAISE EXCEPTION 'Invoice % has % settled against it. Reverse the receipt or take the credit note off it before voiding it.',
      v_inv.invoice_number, ROUND(v_allocated, 2) USING ERRCODE = '22023';
  END IF;

  v_key := 'sales_invoice:invoice:' || p_invoice_id::text;

  IF EXISTS (
    SELECT 1 FROM public.posting_requests
    WHERE company_id = p_company_id AND idempotency_key = v_key AND status = 'committed'
  ) THEN
    v_result := public.posting_engine_rollback(
      v_key, p_company_id,
      COALESCE(NULLIF(btrim(p_reason), ''), 'Invoice ' || v_inv.invoice_number || ' voided'),
      p_actor_user_id);
    v_je_id := (v_result->>'journal_id')::uuid;
    v_journal_number := v_result->>'journal_number';
    v_through_engine := true;
  ELSE
    -- Posted before the posting engine existed, so there is no request to roll
    -- back. Mirror it directly, but do not skip what the engine would check.
    PERFORM public.assert_period_open(p_company_id, CURRENT_DATE);
    v_journal_number := public.posting_engine_next_journal_number(p_company_id);

    INSERT INTO public.journal_entries (
      company_id, entry_date, description, journal_number, customer_id, invoice_id
    ) VALUES (
      p_company_id, CURRENT_DATE,
      'Reversal of Invoice ' || v_inv.invoice_number
        || COALESCE(': ' || NULLIF(btrim(p_reason), ''), ''),
      v_journal_number, v_inv.customer_id, p_invoice_id
    ) RETURNING id INTO v_je_id;

    INSERT INTO public.journal_entry_items (
      journal_entry_id, account_id, type, amount, project_id, dimensions
    )
    SELECT v_je_id, account_id,
           CASE WHEN type = 'debit' THEN 'credit' ELSE 'debit' END,
           amount, project_id, COALESCE(dimensions, '{}'::jsonb)
    FROM public.journal_entry_items
    WHERE journal_entry_id = v_inv.journal_entry_id;
  END IF;

  -- The document views find the reversal through this.
  UPDATE public.journal_entries
  SET invoice_id = p_invoice_id
  WHERE id = v_je_id AND invoice_id IS NULL;

  -- Put the stock back. The journal reversal has already debited the inventory
  -- asset, so without this the ledger and the stock records disagree.
  FOR v_txn IN
    SELECT * FROM public.inventory_transactions
    WHERE company_id = p_company_id
      AND source_doc_type = 'invoice'
      AND source_doc_id = p_invoice_id
      AND transaction_type = 'issue'
  LOOP
    v_qty := -v_txn.quantity_change;
    CONTINUE WHEN v_qty <= 0;

    v_bal := public.eim_get_or_create_balance(
      p_company_id, v_txn.product_id, v_txn.warehouse_id, v_txn.location_id);
    UPDATE public.inv_balances
    SET qty_on_hand = qty_on_hand + v_qty, updated_at = now()
    WHERE id = v_bal.id;

    -- fifo and specific consume cost layers; weighted average does not. Put a
    -- layer back only where one was taken, at the cost it went out at.
    IF COALESCE(v_txn.cost_method, 'weighted_average') IN ('fifo', 'specific') THEN
      INSERT INTO public.inv_cost_layers (
        company_id, product_id, warehouse_id, qty_remaining, unit_cost,
        status, received_at, source_doc_type, source_doc_id
      ) VALUES (
        p_company_id, v_txn.product_id, v_txn.warehouse_id, v_qty, v_txn.unit_cost,
        'open', now(), 'invoice', p_invoice_id
      );
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, product_id, transaction_date, quantity_change, transaction_type,
      unit_cost, total_cost, warehouse_id, location_id, journal_entry_id, cost_method,
      source_doc_type, source_doc_id, reference_id, description
    ) VALUES (
      p_company_id, v_txn.product_id, CURRENT_DATE, v_qty, 'receipt',
      v_txn.unit_cost, v_txn.total_cost, v_txn.warehouse_id, v_txn.location_id,
      v_je_id, v_txn.cost_method,
      'invoice', p_invoice_id, v_je_id,
      'Stock returned when invoice ' || v_inv.invoice_number || ' was voided'
    );

    PERFORM public.eim_sync_product_qty(p_company_id, v_txn.product_id);
    v_returned := v_returned + v_qty;
  END LOOP;

  UPDATE public.timesheets
  SET is_billed = false, invoice_id = NULL
  WHERE invoice_id = p_invoice_id;

  UPDATE public.invoices
  SET status = 'void',
      voided_at = now(),
      voided_by = p_actor_user_id,
      void_reason = NULLIF(btrim(p_reason), '')
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'invoice_number', v_inv.invoice_number,
    'reversal_journal_id', v_je_id,
    'reversal_journal_number', v_journal_number,
    'through_posting_engine', v_through_engine,
    'stock_returned', v_returned
  );
END;
$$;

COMMENT ON FUNCTION public.void_invoice(uuid, uuid, uuid, text) IS
  'Voids an invoice by reversing its posting through posting_engine_rollback, returning any stock it issued, and recording who voided it. Refuses a second void, an invoice with settlements against it, and a caller who is not a member of the company.';

REVOKE ALL ON FUNCTION public.void_invoice(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Backfill: invoices already void whose stock never came back.
--
-- Their journals were reversed in full, including debiting the inventory asset,
-- so the ledger already says the stock is back. This writes the sub-ledger
-- return that the old void_invoice left out, so the two agree again. It adds
-- movements; it rewrites nothing.
-- ---------------------------------------------------------------------------
DO $backfill$
DECLARE
  v_txn record;
  v_bal inv_balances;
  v_qty numeric;
  v_je uuid;
  v_count int := 0;
  v_units numeric := 0;
BEGIN
  FOR v_txn IN
    SELECT it.*, i.invoice_number, i.company_id AS inv_company
    FROM public.inventory_transactions it
    JOIN public.invoices i ON i.id = it.source_doc_id
    WHERE it.source_doc_type = 'invoice'
      AND it.transaction_type = 'issue'
      AND i.status = 'void'
      AND NOT EXISTS (
        SELECT 1 FROM public.inventory_transactions r
        WHERE r.company_id = it.company_id
          AND r.source_doc_id = it.source_doc_id
          AND r.transaction_type = 'receipt'
      )
  LOOP
    v_qty := -v_txn.quantity_change;
    CONTINUE WHEN v_qty <= 0;

    SELECT je.id INTO v_je FROM public.journal_entries je
    WHERE je.company_id = v_txn.company_id
      AND je.invoice_id = v_txn.source_doc_id
      AND je.description LIKE 'Reversal of %'
    ORDER BY je.created_at DESC LIMIT 1;

    v_bal := public.eim_get_or_create_balance(
      v_txn.company_id, v_txn.product_id, v_txn.warehouse_id, v_txn.location_id);
    UPDATE public.inv_balances
    SET qty_on_hand = qty_on_hand + v_qty, updated_at = now()
    WHERE id = v_bal.id;

    IF COALESCE(v_txn.cost_method, 'weighted_average') IN ('fifo', 'specific') THEN
      INSERT INTO public.inv_cost_layers (
        company_id, product_id, warehouse_id, qty_remaining, unit_cost,
        status, received_at, source_doc_type, source_doc_id
      ) VALUES (
        v_txn.company_id, v_txn.product_id, v_txn.warehouse_id, v_qty, v_txn.unit_cost,
        'open', now(), 'invoice', v_txn.source_doc_id
      );
    END IF;

    INSERT INTO public.inventory_transactions (
      company_id, product_id, transaction_date, quantity_change, transaction_type,
      unit_cost, total_cost, warehouse_id, location_id, journal_entry_id, cost_method,
      source_doc_type, source_doc_id, reference_id, description
    ) VALUES (
      v_txn.company_id, v_txn.product_id, CURRENT_DATE, v_qty, 'receipt',
      v_txn.unit_cost, v_txn.total_cost, v_txn.warehouse_id, v_txn.location_id,
      v_je, v_txn.cost_method,
      'invoice', v_txn.source_doc_id, v_je,
      'Stock returned for voided invoice ' || v_txn.invoice_number
    );

    PERFORM public.eim_sync_product_qty(v_txn.company_id, v_txn.product_id);
    v_count := v_count + 1;
    v_units := v_units + v_qty;
  END LOOP;

  RAISE NOTICE 'void stock backfill: % movements returned, % units', v_count, v_units;
END;
$backfill$;
