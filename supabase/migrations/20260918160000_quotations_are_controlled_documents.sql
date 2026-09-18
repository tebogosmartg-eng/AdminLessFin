-- ============================================================================
-- AdminLess Fin — a quotation is an offer on the record, not a scratch pad.
--
-- WHAT WAS WRONG
-- Probed against production (tools/staging-recovery/probe-quote-controls.ts),
-- 13 of 14 controls a quotation module is expected to have were absent. Every
-- one of these was ACCEPTED by the live API:
--
--   * a quote with the status 'totally-made-up';
--   * a quote with no lines at all;
--   * a line for quantity -5;
--   * a line posted to ANOTHER COMPANY'S income account;
--   * a quote inserted straight into the table, past the edge function, because
--     RLS was FOR ALL to any member;
--   * rewriting the lines of an ALREADY-ACCEPTED quote -- the probe changed an
--     accepted price to 999 999 and it took it;
--   * deleting a quote that had already been invoiced, orphaning the invoice
--     from the offer it came from.
--
-- And on the conversion itself, once a separate invoice-numbering defect was
-- fixed and the path could be exercised at all:
--
--   * the SAME quote was invoiced four times over, each at 100%;
--   * a quote was invoiced at 500% of its value;
--   * a DECLINED quote was invoiced.
--
-- Nothing here was hypothetical; each was demonstrated and then cleaned up.
--
-- WHAT THIS DOES
--   * save_quote_atomic writes the quote and its lines in one transaction,
--     validates every line against THIS company, and refuses to rewrite what a
--     customer has already accepted or been invoiced for.
--   * set_quote_status_atomic is the only way a status changes, so a quote can
--     only hold a status that exists, and who accepted or declined it, and
--     when, is on the record.
--   * convert_quote_to_invoice_atomic locks the quote, refuses anything but an
--     accepted one, and caps the total invoiced across ALL conversions at what
--     the quote was for -- so a 40% deposit and a 60% balance are fine and a
--     second 100% is not.
--   * delete_quote_atomic refuses to remove an accepted or invoiced quote.
--   * Lines remember where they sat and what they were quoted at, so the
--     printed order is the entered order and editing a tax rate later cannot
--     restate what a customer accepted.
--   * RLS becomes read-only: only these functions write.
--
-- No quote is rewritten. Existing lines are given their position and their
-- amounts from what they already say.
-- ============================================================================

-- ── What a quotation records ───────────────────────────────────────────────

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_by uuid,
  ADD COLUMN IF NOT EXISTS decline_reason text;

-- What each line was quoted at, and where it sat: every line of a quote is
-- written in one statement, so neither created_at nor the uuid key says which
-- came first, and the printed order was whatever the database returned.
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS position integer,
  ADD COLUMN IF NOT EXISTS line_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18, 2);

-- Existing lines keep what they already say. Ordered by the id so a quote's
-- lines at least have a stable order from here on; it cannot recover an entry
-- order that was never recorded.
WITH numbered AS (
  SELECT qi.id, row_number() OVER (PARTITION BY qi.quote_id ORDER BY qi.id) AS pos,
         ROUND(COALESCE(qi.quantity, 0) * COALESCE(qi.unit_price, 0), 2) AS line,
         ROUND(COALESCE(qi.quantity, 0) * COALESCE(qi.unit_price, 0)
               * COALESCE(tr.rate, 0) / 100.0, 2) AS tax
  FROM public.quote_items qi
  LEFT JOIN public.tax_rates tr ON tr.id = qi.tax_rate_id
)
UPDATE public.quote_items qi
SET position = n.pos,
    line_amount = COALESCE(qi.line_amount, n.line),
    tax_amount = COALESCE(qi.tax_amount, n.tax)
FROM numbered n
WHERE n.id = qi.id AND qi.position IS NULL;

-- A quote is a draft, an offer that has gone out, or an answer. "Expired" is
-- derived from the expiry date, never stored: a quote does not change hands to
-- become expired, the date simply passes.
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check CHECK (status IN ('draft', 'sent', 'accepted', 'declined'));

CREATE INDEX IF NOT EXISTS quotes_company_status_idx ON public.quotes (company_id, status);
CREATE INDEX IF NOT EXISTS quote_items_quote_position_idx ON public.quote_items (quote_id, position);

-- ── Only these functions write quotations ──────────────────────────────────

DROP POLICY IF EXISTS "Company members can manage quotes" ON public.quotes;
DROP POLICY IF EXISTS quotes_select ON public.quotes;
CREATE POLICY quotes_select ON public.quotes
  FOR SELECT TO authenticated
  USING (is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can manage quote items" ON public.quote_items;
DROP POLICY IF EXISTS quote_items_select ON public.quote_items;
CREATE POLICY quote_items_select ON public.quote_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id AND is_company_member(q.company_id)
  ));

-- ── What a quotation is worth, and what has been invoiced off it ───────────

/** The quote's gross value: its lines and their VAT, as quoted. */
CREATE OR REPLACE FUNCTION public.quote_gross_amount(p_quote_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    COALESCE(qi.line_amount, ROUND(COALESCE(qi.quantity, 0) * COALESCE(qi.unit_price, 0), 2))
    + COALESCE(qi.tax_amount, 0)
  ), 0)::numeric
  FROM public.quote_items qi
  WHERE qi.quote_id = p_quote_id;
$$;

/**
 * How much has already been invoiced against the quote.
 *
 * Measured off the invoices' own debtors movement rather than off a percentage
 * anyone recorded, for the same reason an invoice's value is: a percentage is a
 * statement of intent, and the ledger is what happened. A voided invoice
 * counts for nothing, so voiding a deposit frees the quote to be invoiced again.
 */
CREATE OR REPLACE FUNCTION public.quote_invoiced_amount(p_quote_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(public.invoice_gross_amount(i.id)), 0)::numeric
  FROM public.invoices i
  WHERE i.quote_id = p_quote_id
    AND i.status::text NOT IN ('void', 'cancelled');
$$;

-- ── Writing a quotation ────────────────────────────────────────────────────

/**
 * p_items: [{description, quantity, unit_price, income_account_id, tax_rate_id?, product_id?}]
 *
 * p_quote_id null creates; otherwise it replaces that quote and its lines.
 * Returns {quote_id, quote_number, subtotal, tax, total}.
 */
CREATE OR REPLACE FUNCTION public.save_quote_atomic(
  p_company_id uuid,
  p_customer_id uuid,
  p_quote_date date,
  p_items jsonb,
  p_actor_user_id uuid,
  p_quote_id uuid DEFAULT NULL,
  p_quote_number text DEFAULT NULL,
  p_expiry_date date DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_terms text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_existing_number text;
  v_existing_status text;
  v_customer_name text;
  v_item jsonb;
  v_index int := 0;
  v_description text;
  v_qty numeric;
  v_price numeric;
  v_account record;
  v_income_account_id uuid;
  v_rate_value numeric;
  v_product_id uuid;
  v_line numeric;
  v_tax numeric;
  v_subtotal numeric := 0;
  v_tax_total numeric := 0;
  v_rows jsonb := '[]'::jsonb;
  v_number text;
  v_quote_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'A quotation needs a company and a customer.' USING ERRCODE = '22023';
  END IF;
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can write its quotations.'
      USING ERRCODE = '42501';
  END IF;
  IF p_quote_date IS NULL THEN
    RAISE EXCEPTION 'A quotation needs a date.' USING ERRCODE = '22023';
  END IF;
  IF p_expiry_date IS NOT NULL AND p_expiry_date < p_quote_date THEN
    RAISE EXCEPTION 'A quotation cannot expire before the day it was made.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A quotation needs at least one line.' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_customer_name FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found in this company.' USING ERRCODE = '22023';
  END IF;

  -- ---- What may still be changed ------------------------------------------
  IF p_quote_id IS NOT NULL THEN
    SELECT id, quote_number, status INTO v_existing_id, v_existing_number, v_existing_status
    FROM public.quotes WHERE id = p_quote_id AND company_id = p_company_id
    FOR UPDATE;
    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Quotation not found in this company.' USING ERRCODE = '22023';
    END IF;
    IF v_existing_status = 'accepted' THEN
      RAISE EXCEPTION 'Quotation % has been accepted and can no longer be changed. Copy it to a new quotation instead.',
        v_existing_number USING ERRCODE = '22023';
    END IF;
    IF public.quote_invoiced_amount(p_quote_id) > 0 THEN
      RAISE EXCEPTION 'Quotation % has already been invoiced and can no longer be changed.',
        v_existing_number USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ---- The lines -----------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_index := v_index + 1;
    v_description := NULLIF(btrim(COALESCE(v_item->>'description', '')), '');
    IF v_description IS NULL THEN
      RAISE EXCEPTION 'Line %: a description is required.', v_index USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_qty := NULLIF(v_item->>'quantity', '')::numeric;
      v_price := NULLIF(v_item->>'unit_price', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Line %: the quantity and unit price must be numbers.', v_index USING ERRCODE = '22023';
    END;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Line %: the quantity must be more than zero.', v_index USING ERRCODE = '22023';
    END IF;
    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Line %: the price cannot be negative.', v_index USING ERRCODE = '22023';
    END IF;

    -- A quote becomes an invoice, and an invoice credits income. Letting a
    -- quote name any account at all is how a converted invoice came to post
    -- revenue somewhere that was not revenue.
    v_income_account_id := NULLIF(v_item->>'income_account_id', '')::uuid;
    IF v_income_account_id IS NOT NULL THEN
      SELECT id, name, type INTO v_account FROM public.chart_of_accounts
      WHERE id = v_income_account_id AND company_id = p_company_id;
      IF v_account.id IS NULL THEN
        RAISE EXCEPTION 'Line %: that income account does not belong to this company.', v_index
          USING ERRCODE = '22023';
      END IF;
      IF v_account.type <> 'Income' THEN
        RAISE EXCEPTION 'Line %: a quotation line is income, and % is a % account.',
          v_index, v_account.name, v_account.type USING ERRCODE = '22023';
      END IF;
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products WHERE id = v_product_id AND company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Line %: the product does not belong to this company.', v_index USING ERRCODE = '22023';
    END IF;

    v_line := ROUND(v_qty * v_price, 2);

    v_tax := 0;
    v_rate_value := NULL;
    IF NULLIF(v_item->>'tax_rate_id', '') IS NOT NULL THEN
      SELECT rate INTO v_rate_value FROM public.tax_rates
      WHERE id = (v_item->>'tax_rate_id')::uuid AND company_id = p_company_id;
      IF v_rate_value IS NULL THEN
        RAISE EXCEPTION 'Line %: the tax rate does not belong to this company.', v_index USING ERRCODE = '22023';
      END IF;
      v_tax := ROUND(v_line * v_rate_value / 100.0, 2);
    END IF;

    v_subtotal := v_subtotal + v_line;
    v_tax_total := v_tax_total + v_tax;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'description', v_description,
      'quantity', v_qty,
      'unit_price', v_price,
      'income_account_id', v_income_account_id,
      'tax_rate_id', NULLIF(v_item->>'tax_rate_id', '')::uuid,
      'line_amount', v_line,
      'tax_amount', v_tax
    ));
  END LOOP;

  -- ---- Number --------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtextextended('quote_number:' || p_company_id::text, 0));
  v_number := NULLIF(btrim(COALESCE(p_quote_number, '')), '');
  IF v_number IS NULL THEN
    v_number := COALESCE(v_existing_number, public.get_next_quote_number(p_company_id));
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.quotes
    WHERE company_id = p_company_id AND lower(quote_number) = lower(v_number)
      AND (p_quote_id IS NULL OR id <> p_quote_id)
  ) THEN
    RAISE EXCEPTION 'Quotation number % is already in use.', v_number USING ERRCODE = '23505';
  END IF;

  -- ---- Write it ------------------------------------------------------------
  IF p_quote_id IS NULL THEN
    INSERT INTO public.quotes (
      company_id, customer_id, quote_number, quote_date, expiry_date, status, description, terms, created_by
    ) VALUES (
      p_company_id, p_customer_id, v_number, p_quote_date, p_expiry_date, 'draft', p_description, p_terms,
      p_actor_user_id
    )
    RETURNING id INTO v_quote_id;
  ELSE
    v_quote_id := p_quote_id;
    UPDATE public.quotes
    SET customer_id = p_customer_id,
        quote_number = v_number,
        quote_date = p_quote_date,
        expiry_date = p_expiry_date,
        description = p_description,
        terms = p_terms
    WHERE id = v_quote_id;
    DELETE FROM public.quote_items WHERE quote_id = v_quote_id;
  END IF;

  INSERT INTO public.quote_items (
    quote_id, product_id, description, quantity, unit_price, income_account_id, tax_rate_id,
    line_amount, tax_amount, position
  )
  SELECT v_quote_id,
         NULLIF(r->>'product_id', '')::uuid,
         r->>'description',
         (r->>'quantity')::numeric,
         (r->>'unit_price')::numeric,
         NULLIF(r->>'income_account_id', '')::uuid,
         NULLIF(r->>'tax_rate_id', '')::uuid,
         (r->>'line_amount')::numeric,
         (r->>'tax_amount')::numeric,
         ord::integer
  FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS e(r, ord);

  RETURN jsonb_build_object(
    'quote_id', v_quote_id,
    'quote_number', v_number,
    'subtotal', ROUND(v_subtotal, 2),
    'tax', ROUND(v_tax_total, 2),
    'total', ROUND(v_subtotal + v_tax_total, 2)
  );
END;
$$;

-- ── Answering a quotation ──────────────────────────────────────────────────

/**
 * The only way a quote's status changes. Who answered, and when, is recorded:
 * "the customer accepted" is the fact an invoice is later raised on.
 */
CREATE OR REPLACE FUNCTION public.set_quote_status_atomic(
  p_company_id uuid,
  p_quote_id uuid,
  p_status text,
  p_actor_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
  v_status text;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can answer its quotations.'
      USING ERRCODE = '42501';
  END IF;

  v_status := lower(btrim(COALESCE(p_status, '')));
  IF v_status NOT IN ('draft', 'sent', 'accepted', 'declined') THEN
    RAISE EXCEPTION 'A quotation is draft, sent, accepted or declined; % is none of those.',
      COALESCE(NULLIF(v_status, ''), '(nothing)') USING ERRCODE = '22023';
  END IF;

  SELECT id, quote_number, status INTO v_quote
  FROM public.quotes WHERE id = p_quote_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found in this company.' USING ERRCODE = '22023';
  END IF;

  -- An invoiced quote is settled history. Marking it declined afterwards would
  -- leave an invoice standing on an offer the record says was refused.
  IF public.quote_invoiced_amount(p_quote_id) > 0 AND v_status <> 'accepted' THEN
    RAISE EXCEPTION 'Quotation % has been invoiced, so it cannot be marked %.',
      v_quote.quote_number, v_status USING ERRCODE = '22023';
  END IF;

  IF v_status = 'accepted' AND NOT EXISTS (SELECT 1 FROM public.quote_items WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'Quotation % has no lines, so there is nothing to accept.', v_quote.quote_number
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.quotes
  SET status = v_status,
      accepted_at  = CASE WHEN v_status = 'accepted' THEN now() ELSE NULL END,
      accepted_by  = CASE WHEN v_status = 'accepted' THEN p_actor_user_id ELSE NULL END,
      declined_at  = CASE WHEN v_status = 'declined' THEN now() ELSE NULL END,
      declined_by  = CASE WHEN v_status = 'declined' THEN p_actor_user_id ELSE NULL END,
      decline_reason = CASE WHEN v_status = 'declined' THEN NULLIF(btrim(COALESCE(p_reason, '')), '') ELSE NULL END
  WHERE id = p_quote_id;

  RETURN jsonb_build_object('quote_id', p_quote_id, 'status', v_status, 'was', v_quote.status);
END;
$$;

-- ── Turning a quotation into an invoice ────────────────────────────────────

/**
 * One transaction: the quote is locked, checked, and the invoice posted through
 * post_sales_invoice_atomic. Locking matters -- two clicks half a second apart
 * were enough to raise two full invoices from one quote.
 *
 * p_percentage is how much of the quote this invoice is for. Deposits add up:
 * 40% then 60% is fine, 100% then anything is not, and the cap is measured
 * against what the LEDGER says has been invoiced, so voiding a deposit frees
 * the quote again.
 */
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
  v_has_tax boolean;
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

  -- The receivable and VAT accounts are resolved by ROLE unless the caller
  -- names one of this company's own. The dialog offers "any asset" and "any
  -- liability", and an invoice that debits the wrong asset or credits the wrong
  -- liability balances perfectly while corrupting the sub-ledger.
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
    p_inventory_asset_account_id,
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

-- ── Removing a quotation ───────────────────────────────────────────────────

/**
 * A quote that was never answered is a draft and may be thrown away. One the
 * customer accepted, or that has been invoiced, is the record of an agreement
 * and is not deleted -- the probe deleted the quote behind a posted invoice,
 * leaving the invoice pointing at nothing.
 */
CREATE OR REPLACE FUNCTION public.delete_quote_atomic(
  p_company_id uuid,
  p_quote_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote record;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can remove its quotations.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, quote_number, status INTO v_quote
  FROM public.quotes WHERE id = p_quote_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_quote.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found in this company.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE quote_id = p_quote_id) THEN
    RAISE EXCEPTION 'Quotation % has been invoiced and cannot be deleted. The invoice is the record of what was agreed.',
      v_quote.quote_number USING ERRCODE = '22023';
  END IF;
  IF v_quote.status = 'accepted' THEN
    RAISE EXCEPTION 'Quotation % has been accepted and cannot be deleted. Mark it declined if it is not going ahead.',
      v_quote.quote_number USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;
  DELETE FROM public.quotes WHERE id = p_quote_id;

  RETURN jsonb_build_object('quote_id', p_quote_id, 'quote_number', v_quote.quote_number, 'deleted', true);
END;
$$;

-- ── Service role only: the edge functions authorise the caller first ───────

REVOKE ALL ON FUNCTION public.quote_gross_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_invoiced_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_quote_atomic(uuid, uuid, date, jsonb, uuid, uuid, text, date, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_quote_status_atomic(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_quote_to_invoice_atomic(uuid, uuid, numeric, date, date, text, uuid, uuid, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_quote_atomic(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.quote_gross_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.quote_invoiced_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_quote_atomic(uuid, uuid, date, jsonb, uuid, uuid, text, date, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_quote_status_atomic(uuid, uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice_atomic(uuid, uuid, numeric, date, date, text, uuid, uuid, uuid, uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_quote_atomic(uuid, uuid, uuid) TO service_role;
