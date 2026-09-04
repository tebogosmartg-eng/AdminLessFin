-- ============================================================================
-- Accounts receivable: receipt allocation
--
-- WHAT WAS WRONG
-- Receiving a customer payment posted the cash and the debtors control account
-- correctly, and then stopped. Nothing recorded WHICH invoices the money
-- settled, so:
--
--   * invoices stayed open for ever. On the live tenant, Meat and Veg paid
--     R115 000,00 on account and INV-000011 for R115 000,00 was still 'sent';
--     the control account said they owed nothing while the age analysis aged
--     R115 100,00 against them.
--   * even a payment made against a specific invoice did not reduce the aged
--     amount. The age analysis derives what a document still owes from the
--     movements on the invoice's OWN journal, and a receipt is a separate
--     journal, so a part-paid invoice aged at its full value until something
--     flipped it to 'paid'.
--   * that flip only ever happened on full settlement. There was no partial
--     state, and no guard against paying an invoice twice or paying more than
--     it was worth.
--
-- WHAT THIS ADDS
-- One table saying how much of a receipt settles which invoice, and the
-- functions that maintain it. An allocation row is the single fact from which
-- an invoice's outstanding balance, its status, and its ageing all derive, so
-- they cannot disagree.
--
-- Additive throughout: the existing RPCs keep their signatures and keep
-- working. record_invoice_payment now also writes an allocation, so both
-- payment routes produce the same books.
--
-- NOT DONE HERE: the receipts already posted without allocations are left
-- exactly as they are. Reallocating historical payments changes what the books
-- say about closed periods and is a decision for the business, not a migration.
-- ============================================================================

-- ── The allocation itself ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  -- The receipt that paid it. Deleting the journal removes the allocation; a
  -- REVERSED receipt is unwound by the trigger further down, because a
  -- reversal adds a journal rather than deleting one.
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  -- One receipt settles a given invoice once. A second instalment is a second
  -- receipt, and therefore a second row.
  CONSTRAINT invoice_payment_allocations_unique_pair UNIQUE (journal_entry_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS invoice_payment_allocations_invoice_idx
  ON public.invoice_payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payment_allocations_company_idx
  ON public.invoice_payment_allocations (company_id);
CREATE INDEX IF NOT EXISTS invoice_payment_allocations_journal_idx
  ON public.invoice_payment_allocations (journal_entry_id);

ALTER TABLE public.invoice_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_payment_allocations_select ON public.invoice_payment_allocations;
DROP POLICY IF EXISTS invoice_payment_allocations_all ON public.invoice_payment_allocations;
CREATE POLICY invoice_payment_allocations_select ON public.invoice_payment_allocations
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY invoice_payment_allocations_all ON public.invoice_payment_allocations
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

-- ── What an invoice is worth, and what is left on it ───────────────────────

/**
 * The invoice's gross value: what it put INTO the debtors control account.
 *
 * Defined off the control account rather than off every debit on the journal,
 * because that is how the age analysis defines it. Two definitions of "what
 * this invoice is worth" is how a sub-ledger drifts from its control account.
 */
CREATE OR REPLACE FUNCTION public.invoice_gross_amount(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN jei.type = 'debit' THEN jei.amount ELSE -jei.amount END
  ), 0)::numeric
  FROM public.invoices i
  JOIN public.journal_entry_items jei ON jei.journal_entry_id = i.journal_entry_id
  JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
  WHERE i.id = p_invoice_id
    AND coa.company_id = i.company_id
    AND coa.type = 'Asset'
    AND coa.account_role = 'trade_receivable';
$$;

/** How much of the invoice has been settled by receipts. */
CREATE OR REPLACE FUNCTION public.invoice_allocated_amount(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)::numeric
  FROM public.invoice_payment_allocations
  WHERE invoice_id = p_invoice_id;
$$;

/** Gross less settled. Never returns a negative: over-allocation is refused. */
CREATE OR REPLACE FUNCTION public.invoice_outstanding_amount(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(
    public.invoice_gross_amount(p_invoice_id) - public.invoice_allocated_amount(p_invoice_id),
    2
  );
$$;

-- ── Status follows the allocations, and is never set by hand ───────────────

/**
 * Re-derives one invoice's status from what has actually been allocated to it.
 *
 * draft, void and cancelled are left alone: those say something about the
 * document, not about how much of it has been paid, and a receipt must not
 * resurrect a voided invoice.
 */
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
  SELECT status INTO v_status FROM public.invoices WHERE id = p_invoice_id;
  IF v_status IS NULL THEN RETURN NULL; END IF;
  IF v_status IN ('draft', 'void', 'cancelled') THEN RETURN v_status; END IF;

  v_gross := public.invoice_gross_amount(p_invoice_id);
  v_allocated := public.invoice_allocated_amount(p_invoice_id);

  IF v_gross > 0 AND v_allocated >= v_gross - 0.005 THEN
    v_new := 'paid';
  ELSIF v_allocated > 0.005 THEN
    v_new := 'partially_paid';
  ELSE
    -- Nothing allocated. Back to unpaid, but 'overdue' is a statement about the
    -- due date rather than the payment, so it is preserved.
    v_new := CASE WHEN v_status = 'overdue' THEN 'overdue' ELSE 'sent' END;
  END IF;

  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE public.invoices SET status = v_new WHERE id = p_invoice_id;
  END IF;
  RETURN v_new;
END;
$$;

-- ── A receipt can never settle more than the invoice is worth ──────────────

CREATE OR REPLACE FUNCTION public.invoice_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross numeric;
  v_allocated numeric;
  v_invoice record;
BEGIN
  SELECT company_id, invoice_number, status INTO v_invoice
  FROM public.invoices WHERE id = NEW.invoice_id;

  IF v_invoice.company_id IS NULL THEN
    RAISE EXCEPTION 'Invoice % does not exist.', NEW.invoice_id USING ERRCODE = '22023';
  END IF;
  IF v_invoice.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Invoice % belongs to another company.', NEW.invoice_id USING ERRCODE = '42501';
  END IF;
  IF v_invoice.status IN ('void', 'cancelled') THEN
    RAISE EXCEPTION 'Invoice % is % and cannot be settled.', v_invoice.invoice_number, v_invoice.status
      USING ERRCODE = '22023';
  END IF;

  v_gross := public.invoice_gross_amount(NEW.invoice_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM public.invoice_payment_allocations
  WHERE invoice_id = NEW.invoice_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- The backstop for over-payment. The RPC checks this too, against a locked
  -- row; this catches anything that reaches the table by another route.
  IF v_allocated + NEW.amount > v_gross + 0.005 THEN
    RAISE EXCEPTION
      'Allocating % to invoice % would settle %, but the invoice is only worth %.',
      NEW.amount, v_invoice.invoice_number, v_allocated + NEW.amount, v_gross
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_allocation_guard_trg ON public.invoice_payment_allocations;
CREATE TRIGGER invoice_allocation_guard_trg
  BEFORE INSERT OR UPDATE ON public.invoice_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.invoice_allocation_guard();

-- ── Reversing a receipt un-settles what it settled ─────────────────────────

/**
 * A reversal ADDS a mirror journal rather than deleting the original, so the
 * allocation would otherwise survive and the invoice would stay 'paid' on money
 * that has been taken back out of the ledger.
 *
 * posting_engine_rollback records the reversal as a posting_request keyed
 * 'reversal:<original posting_request id>'. Hooking that, rather than editing
 * the posting engine, keeps a generic engine free of accounts-receivable
 * knowledge, and keeps one invariant true for every reader: an allocation row
 * that exists is a live settlement.
 */
CREATE OR REPLACE FUNCTION public.invoice_allocations_follow_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_id uuid;
  v_original_journal uuid;
  v_invoice uuid;
BEGIN
  IF NEW.status <> 'committed' OR NEW.idempotency_key NOT LIKE 'reversal:%' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_original_id := substring(NEW.idempotency_key from 10)::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;  -- not a key we recognise; nothing to unwind
  END;

  SELECT journal_entry_id INTO v_original_journal
  FROM public.posting_requests WHERE id = v_original_id;
  IF v_original_journal IS NULL THEN RETURN NEW; END IF;

  FOR v_invoice IN
    SELECT invoice_id FROM public.invoice_payment_allocations
    WHERE journal_entry_id = v_original_journal
  LOOP
    DELETE FROM public.invoice_payment_allocations
    WHERE journal_entry_id = v_original_journal AND invoice_id = v_invoice;
    PERFORM public.invoice_refresh_payment_status(v_invoice);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_allocations_follow_reversal_trg ON public.posting_requests;
CREATE TRIGGER invoice_allocations_follow_reversal_trg
  AFTER INSERT OR UPDATE OF status ON public.posting_requests
  FOR EACH ROW EXECUTE FUNCTION public.invoice_allocations_follow_reversal();

-- ── Recording a customer receipt ───────────────────────────────────────────

/**
 * Receive money from a customer and say what it settles.
 *
 * p_allocations is [{invoice_id, amount}, ...]. Omit it and the receipt is
 * applied oldest invoice first, which is what a clerk banking a cheque against
 * a statement means. Anything left over stays on the customer's account as a
 * credit, and is REPORTED rather than silently absorbed, because an
 * unallocated remainder is exactly what made the age analysis disagree with
 * the control account in the first place.
 *
 * Everything happens in one transaction: one journal through the posting
 * engine, the allocations, and the resulting invoice statuses.
 */
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
  -- receipt that credits some other asset account balances perfectly and
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
  IF v_deposit.id = v_ar_id OR v_deposit.account_role IN ('trade_receivable', 'trade_payable') THEN
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
      SELECT id, invoice_number, customer_id, status INTO v_inv
      FROM public.invoices WHERE id = v_invoice_id AND company_id = p_company_id FOR UPDATE;
      IF v_inv.id IS NULL THEN
        RAISE EXCEPTION 'Invoice not found in this company.' USING ERRCODE = '22023';
      END IF;
      IF v_inv.customer_id <> p_customer_id THEN
        RAISE EXCEPTION 'Invoice % belongs to a different customer.', v_inv.invoice_number
          USING ERRCODE = '22023';
      END IF;
      IF v_inv.status IN ('void', 'cancelled', 'draft') THEN
        RAISE EXCEPTION 'Invoice % is % and cannot be settled.', v_inv.invoice_number, v_inv.status
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
    -- Oldest first.
    FOR v_inv IN
      SELECT i.id, i.invoice_number
      FROM public.invoices i
      WHERE i.company_id = p_company_id AND i.customer_id = p_customer_id
        AND i.status NOT IN ('void', 'cancelled', 'draft', 'paid')
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
    RETURN jsonb_build_object(
      'journal_id', v_journal_id,
      'journal_number', v_result->>'journal_number',
      'posting_status', 'duplicate',
      'amount', v_amount,
      'allocated', public.receipt_allocated_total(v_journal_id),
      'unallocated', ROUND(v_amount - public.receipt_allocated_total(v_journal_id), 2),
      'allocations', COALESCE(public.receipt_allocations_json(v_journal_id), '[]'::jsonb),
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

-- Small readers used by the duplicate branch above.
CREATE OR REPLACE FUNCTION public.receipt_allocated_total(p_journal_entry_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)::numeric
  FROM public.invoice_payment_allocations WHERE journal_entry_id = p_journal_entry_id;
$$;

CREATE OR REPLACE FUNCTION public.receipt_allocations_json(p_journal_entry_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'invoice_id', a.invoice_id, 'invoice_number', i.invoice_number, 'amount', a.amount
  )), '[]'::jsonb)
  FROM public.invoice_payment_allocations a
  JOIN public.invoices i ON i.id = a.invoice_id
  WHERE a.journal_entry_id = p_journal_entry_id;
$$;

-- ── The per-invoice route now records an allocation too ────────────────────

/**
 * Unchanged signature, so the existing Invoice → Receive Payment dialog keeps
 * working. What changed: it refuses to over-pay, writes the allocation, and
 * derives the status from it instead of only ever setting 'paid'.
 */
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid, p_payment_date date, p_asset_account_id uuid, p_ar_account_id uuid, p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
BEGIN
  SELECT id, company_id, customer_id, invoice_number INTO v_inv
  FROM public.invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = '22023'; END IF;

  PERFORM public.record_customer_receipt_atomic(
    p_company_id => v_inv.company_id,
    p_customer_id => v_inv.customer_id,
    p_payment_date => p_payment_date,
    p_deposit_account_id => p_asset_account_id,
    p_amount => p_amount,
    p_allocations => jsonb_build_array(jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount)),
    p_description => 'Payment for Invoice ' || COALESCE(v_inv.invoice_number, ''),
    -- The date and amount stay in the key so an accidental double submit of the
    -- same instalment is caught, but the receipt is no longer indistinguishable
    -- from a genuine second instalment of the same size on the same day: the
    -- caller passes its own key for that case.
    p_idempotency_key => 'banking:invoice_payment:' || p_invoice_id::text || ':'
                         || p_payment_date::text || ':' || p_amount::text,
    p_accounts_receivable_id => p_ar_account_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_customer_receipt_atomic(
  uuid, uuid, date, uuid, numeric, jsonb, text, text, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_gross_amount(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_allocated_amount(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_outstanding_amount(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoice_refresh_payment_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_allocated_total(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receipt_allocations_json(uuid) TO authenticated, service_role;
