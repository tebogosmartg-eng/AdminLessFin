-- ============================================================================
-- AdminLess Fin — a credit note is a controlled document, not a loose journal.
--
-- WHAT WAS WRONG
-- Credit notes were the one sales document still posted outside the posting
-- engine, and every step of their life was unsafe in a different way:
--
--   * create_credit_note wrote journal_entries directly. No period lock, no
--     balance check, no account validation, no accounting policy, and VAT
--     computed unrounded -- so a credit note could be dated into a closed
--     month, credit any asset account as "receivables", or post a VAT figure
--     with more decimals than a VAT return has.
--   * allocate_credit_note posted a journal that debited AND credited the same
--     account by the same amount. It moved nothing: the invoice's outstanding
--     balance, its status and its ageing never changed. It also accepted any
--     amount, any invoice of any customer, and credit it did not have.
--   * the edge function's DELETE removed the posted journal outright, and looked
--     that journal up without the company, so a member of one company could
--     erase another company's posted entries.
--   * both functions were executable by every signed-in user and trusted the
--     p_company_id they were given, so anyone could post a credit note into any
--     company's books by calling the RPC directly.
--   * RLS let any member insert, rewrite or delete credit note rows by hand.
--
-- No credit note has ever been issued in production (0 rows in every company
-- when this was written), so nothing posted is rewritten here.
--
-- WHAT THIS DOES
--   * post_credit_note_atomic: one transaction, through posting_engine_submit.
--     Revenue is debited to income accounts only, VAT is rounded per line
--     exactly as post_sales_invoice_atomic rounds it, and receivables are
--     credited on the control account resolved by role -- the same one the
--     credited invoice debited. A reason is required (a VAT credit note must
--     state why it was issued), and a credit note raised against an invoice
--     can never credit more than that invoice was worth.
--   * Applying a credit note writes invoice_payment_allocations against the
--     credit note's OWN journal. That journal already credits receivables, so
--     no second journal is needed; the allocation is the fact that says which
--     invoice the credit settles, and the invoice's outstanding balance, status
--     and ageing derive from it exactly as they do for a receipt.
--   * Voiding reverses the journal through posting_engine_rollback. The
--     existing reversal trigger then removes its allocations and re-derives
--     the invoices' statuses. Nothing is ever deleted.
--   * Every function here is service_role only; the credit-notes edge function
--     authorises the caller against company_users first.
-- ============================================================================

-- ── What a credit note records ─────────────────────────────────────────────

ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;

COMMENT ON COLUMN public.credit_notes.invoice_id IS
  'The invoice this credit note was raised against, if any. Identifies the original supply on the document and caps how much may be credited; it does NOT by itself settle anything -- invoice_payment_allocations does.';

-- What each line was worth when it was posted, so the printed document shows
-- the figures that reached the ledger rather than recomputing them, and where
-- it sat: every line of a credit note is inserted in one statement, so neither
-- created_at nor the uuid key says which came first.
ALTER TABLE public.credit_note_items
  ADD COLUMN IF NOT EXISTS line_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS position integer;

-- A credit note is issued when it is posted, and void when it is reversed.
-- How much of it has been applied is derived from the allocations, never
-- stored, so it cannot disagree with them.
ALTER TABLE public.credit_notes ALTER COLUMN status SET DEFAULT 'issued';
ALTER TABLE public.credit_notes DROP CONSTRAINT IF EXISTS credit_notes_status_check;
ALTER TABLE public.credit_notes
  ADD CONSTRAINT credit_notes_status_check CHECK (status IN ('issued', 'void'));

CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_company_number_key
  ON public.credit_notes (company_id, lower(credit_note_number));
CREATE INDEX IF NOT EXISTS credit_notes_invoice_idx ON public.credit_notes (invoice_id);
CREATE INDEX IF NOT EXISTS credit_notes_customer_idx ON public.credit_notes (company_id, customer_id);
CREATE INDEX IF NOT EXISTS credit_notes_journal_idx ON public.credit_notes (journal_entry_id);

-- ── Only the posting functions write credit notes ──────────────────────────

DROP POLICY IF EXISTS "Company members can manage credit_notes" ON public.credit_notes;
DROP POLICY IF EXISTS credit_notes_select ON public.credit_notes;
CREATE POLICY credit_notes_select ON public.credit_notes
  FOR SELECT TO authenticated
  USING (is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can manage credit_note_items" ON public.credit_note_items;
DROP POLICY IF EXISTS credit_note_items_select ON public.credit_note_items;
CREATE POLICY credit_note_items_select ON public.credit_note_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.credit_notes cn
    WHERE cn.id = credit_note_items.credit_note_id AND is_company_member(cn.company_id)
  ));

-- The lines and the settlements were the two parts of this workflow with no
-- audit trail. process_audit_log already knows how to find a line's company.
DROP TRIGGER IF EXISTS audit_credit_note_items ON public.credit_note_items;
CREATE TRIGGER audit_credit_note_items
  AFTER INSERT OR DELETE OR UPDATE ON public.credit_note_items
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_invoice_payment_allocations ON public.invoice_payment_allocations;
CREATE TRIGGER audit_invoice_payment_allocations
  AFTER INSERT OR DELETE OR UPDATE ON public.invoice_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- ── The unsafe functions go ────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_credit_note(uuid, uuid, text, date, uuid, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.allocate_credit_note(uuid, uuid, uuid, numeric, uuid);

-- The supplier-side twins have the same hole: executable by any signed-in user
-- with a caller-supplied company. The vendor-credits edge function calls them
-- with the service role after checking membership, so nothing legitimate
-- depends on the grant. Their posting logic is not changed here.
REVOKE EXECUTE ON FUNCTION public.create_vendor_credit(uuid, uuid, text, date, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.allocate_vendor_credit(uuid, uuid, uuid, numeric, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── What a credit note is worth, and what is left of it ────────────────────

/**
 * The credit note's value: what it took OUT of the debtors control account.
 * Defined off the control account for the same reason invoice_gross_amount is.
 */
CREATE OR REPLACE FUNCTION public.credit_note_total(p_credit_note_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN jei.type = 'credit' THEN jei.amount ELSE -jei.amount END
  ), 0)::numeric
  FROM public.credit_notes cn
  JOIN public.journal_entry_items jei ON jei.journal_entry_id = cn.journal_entry_id
  JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
  WHERE cn.id = p_credit_note_id
    AND coa.company_id = cn.company_id
    AND coa.type = 'Asset'
    AND coa.account_role = 'trade_receivable';
$$;

/** How much of the credit note has been applied to invoices. */
CREATE OR REPLACE FUNCTION public.credit_note_applied_amount(p_credit_note_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(a.amount), 0)::numeric
  FROM public.credit_notes cn
  JOIN public.invoice_payment_allocations a ON a.journal_entry_id = cn.journal_entry_id
  WHERE cn.id = p_credit_note_id;
$$;

/**
 * How much has been credited against an invoice by issued credit notes raised
 * against it -- whether or not those credits were applied to it. This is what
 * stops an invoice for R1 000 being credited R1 000 twice.
 */
CREATE OR REPLACE FUNCTION public.invoice_credited_amount(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(public.credit_note_total(cn.id)), 0)::numeric
  FROM public.credit_notes cn
  WHERE cn.invoice_id = p_invoice_id
    AND cn.status = 'issued';
$$;

/** Total, applied and remaining for every credit note in a company, in one read. */
CREATE OR REPLACE FUNCTION public.credit_note_settlements(p_company_id uuid)
RETURNS TABLE (credit_note_id uuid, total numeric, applied numeric, remaining numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH totals AS (
    SELECT cn.id, COALESCE(SUM(
      CASE WHEN coa.id IS NULL THEN 0
           WHEN jei.type = 'credit' THEN jei.amount ELSE -jei.amount END
    ), 0) AS total
    FROM public.credit_notes cn
    LEFT JOIN public.journal_entry_items jei ON jei.journal_entry_id = cn.journal_entry_id
    LEFT JOIN public.chart_of_accounts coa
      ON coa.id = jei.account_id
     AND coa.company_id = cn.company_id
     AND coa.type = 'Asset'
     AND coa.account_role = 'trade_receivable'
    WHERE cn.company_id = p_company_id
    GROUP BY cn.id
  ),
  applied AS (
    SELECT cn.id, COALESCE(SUM(a.amount), 0) AS applied
    FROM public.credit_notes cn
    LEFT JOIN public.invoice_payment_allocations a ON a.journal_entry_id = cn.journal_entry_id
    WHERE cn.company_id = p_company_id
    GROUP BY cn.id
  )
  SELECT t.id, ROUND(t.total, 2), ROUND(ap.applied, 2), ROUND(t.total - ap.applied, 2)
  FROM totals t JOIN applied ap ON ap.id = t.id;
$$;

/** CN-00001, CN-00002, ... from the highest number already used in the company. */
CREATE OR REPLACE FUNCTION public.credit_note_next_number(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'CN-' || lpad((COALESCE(MAX(substring(credit_note_number FROM '^CN-(\d{1,9})$')::bigint), 0) + 1)::text, 5, '0')
  FROM public.credit_notes
  WHERE company_id = p_company_id;
$$;

-- ── Issuing a credit note ──────────────────────────────────────────────────

/**
 * p_items: [{description, quantity, unit_price, account_id, tax_rate_id?, product_id?}]
 *
 * Returns {credit_note_id, credit_note_number, journal_id, journal_number,
 *          subtotal, tax, total, applied, unapplied}.
 */
CREATE OR REPLACE FUNCTION public.post_credit_note_atomic(
  p_company_id uuid,
  p_customer_id uuid,
  p_credit_note_date date,
  p_reason text,
  p_items jsonb,
  p_actor_user_id uuid,
  p_credit_note_number text DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL,
  p_apply_to_invoice boolean DEFAULT true,
  p_tax_account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_name text;
  v_reason text;
  v_invoice_found uuid;
  v_invoice_number text;
  v_invoice_customer uuid;
  v_invoice_status text;
  v_invoice_date date;
  v_invoice_journal uuid;
  v_ar_id uuid;
  v_tax_account_id uuid;
  v_tax_account record;
  v_item jsonb;
  v_index int := 0;
  v_description text;
  v_qty numeric;
  v_price numeric;
  v_account record;
  v_rate_id uuid;
  v_rate_value numeric;
  v_product_id uuid;
  v_line numeric;
  v_tax numeric;
  v_subtotal numeric := 0;
  v_tax_total numeric := 0;
  v_total numeric;
  v_revenue_lines jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_lines jsonb;
  v_invoice_gross numeric;
  v_already_credited numeric;
  v_creditable numeric;
  v_outstanding numeric;
  v_apply numeric := 0;
  v_number text;
  v_cn_id uuid;
  v_result jsonb;
  v_je_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'A credit note needs a company and a customer.' USING ERRCODE = '22023';
  END IF;
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can issue its credit notes.'
      USING ERRCODE = '42501';
  END IF;
  IF p_credit_note_date IS NULL THEN
    RAISE EXCEPTION 'A credit note needs a date.' USING ERRCODE = '22023';
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A credit note must say why it is being issued.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A credit note needs at least one line.' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_customer_name FROM public.customers
  WHERE id = p_customer_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found in this company.' USING ERRCODE = '22023';
  END IF;

  -- Fail before anything is written; the posting engine checks again.
  PERFORM public.assert_period_open(p_company_id, p_credit_note_date);

  -- ---- The invoice being credited, if any --------------------------------
  IF p_invoice_id IS NOT NULL THEN
    -- Locked, so two credit notes cannot both see the same uncredited balance.
    SELECT id, invoice_number, customer_id, status::text, invoice_date, journal_entry_id
      INTO v_invoice_found, v_invoice_number, v_invoice_customer, v_invoice_status, v_invoice_date, v_invoice_journal
    FROM public.invoices
    WHERE id = p_invoice_id AND company_id = p_company_id
    FOR UPDATE;
    IF v_invoice_found IS NULL THEN
      RAISE EXCEPTION 'Invoice not found in this company.' USING ERRCODE = '22023';
    END IF;
    IF v_invoice_customer <> p_customer_id THEN
      RAISE EXCEPTION 'Invoice % belongs to a different customer.', v_invoice_number USING ERRCODE = '22023';
    END IF;
    IF v_invoice_status IN ('draft', 'void', 'cancelled') THEN
      RAISE EXCEPTION 'Invoice % is % and cannot be credited.', v_invoice_number, v_invoice_status
        USING ERRCODE = '22023';
    END IF;
    IF p_credit_note_date < v_invoice_date THEN
      RAISE EXCEPTION 'A credit note cannot be dated before the invoice it credits (% is dated %).',
        v_invoice_number, v_invoice_date USING ERRCODE = '22023';
    END IF;

    -- Credit the receivable the invoice actually raised, not merely the first
    -- control account in the chart.
    SELECT jei.account_id INTO v_ar_id
    FROM public.journal_entry_items jei
    JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
    WHERE jei.journal_entry_id = v_invoice_journal
      AND jei.type = 'debit'
      AND coa.company_id = p_company_id
      AND coa.type = 'Asset'
      AND coa.account_role = 'trade_receivable'
    ORDER BY jei.amount DESC
    LIMIT 1;
  END IF;

  -- The debtors control account is resolved by ROLE, never taken from the
  -- caller: crediting some other asset balances perfectly and silently
  -- corrupts the debtors sub-ledger.
  IF v_ar_id IS NULL THEN
    SELECT id INTO v_ar_id FROM public.chart_of_accounts
    WHERE company_id = p_company_id AND type = 'Asset' AND account_role = 'trade_receivable'
    ORDER BY account_number
    LIMIT 1;
  END IF;
  IF v_ar_id IS NULL THEN
    RAISE EXCEPTION 'This company has no trade receivable control account mapped in its chart of accounts.'
      USING ERRCODE = '22023';
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
      RAISE EXCEPTION 'Line %: the unit price cannot be negative.', v_index USING ERRCODE = '22023';
    END IF;

    SELECT id, name, type INTO v_account FROM public.chart_of_accounts
    WHERE id = NULLIF(v_item->>'account_id', '')::uuid AND company_id = p_company_id;
    IF v_account.id IS NULL THEN
      RAISE EXCEPTION 'Line %: choose the income account this credit reverses.', v_index USING ERRCODE = '22023';
    END IF;
    IF v_account.type <> 'Income' THEN
      RAISE EXCEPTION 'Line %: a credit note reverses revenue, so it must be posted to an income account, and % is %.',
        v_index, v_account.name, v_account.type USING ERRCODE = '22023';
    END IF;

    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products WHERE id = v_product_id AND company_id = p_company_id
    ) THEN
      RAISE EXCEPTION 'Line %: the product does not belong to this company.', v_index USING ERRCODE = '22023';
    END IF;

    v_line := ROUND(v_qty * v_price, 2);
    IF v_line <= 0 THEN
      RAISE EXCEPTION 'Line %: the line comes to nothing, so there is nothing to credit.', v_index
        USING ERRCODE = '22023';
    END IF;

    -- Rounded per line, the same way post_sales_invoice_atomic rounds the VAT
    -- it charged, so crediting an invoice in full reverses exactly its VAT.
    v_tax := 0;
    v_rate_id := NULL;
    v_rate_value := NULL;
    IF NULLIF(v_item->>'tax_rate_id', '') IS NOT NULL THEN
      SELECT id, rate INTO v_rate_id, v_rate_value FROM public.tax_rates
      WHERE id = (v_item->>'tax_rate_id')::uuid AND company_id = p_company_id;
      IF v_rate_id IS NULL THEN
        RAISE EXCEPTION 'Line %: the tax rate does not belong to this company.', v_index USING ERRCODE = '22023';
      END IF;
      v_tax := ROUND(v_line * COALESCE(v_rate_value, 0) / 100.0, 2);
    END IF;

    v_subtotal := v_subtotal + v_line;
    v_tax_total := v_tax_total + v_tax;

    v_revenue_lines := v_revenue_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_account.id,
      'debit', v_line,
      'description', v_description,
      'quantity', v_qty,
      'unit_price', v_price
    ));
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'description', v_description,
      'quantity', v_qty,
      'unit_price', v_price,
      'account_id', v_account.id,
      'tax_rate_id', v_rate_id,
      'line_amount', v_line,
      'tax_amount', v_tax
    ));
  END LOOP;

  v_total := ROUND(v_subtotal + v_tax_total, 2);

  -- ---- Output VAT being reversed -------------------------------------------
  IF v_tax_total > 0 THEN
    IF p_tax_account_id IS NOT NULL THEN
      SELECT id, name, type, account_role INTO v_tax_account FROM public.chart_of_accounts
      WHERE id = p_tax_account_id AND company_id = p_company_id;
      IF v_tax_account.id IS NULL THEN
        RAISE EXCEPTION 'The VAT account does not belong to this company.' USING ERRCODE = '22023';
      END IF;
      IF v_tax_account.type <> 'Liability' OR v_tax_account.account_role = 'trade_payable' THEN
        RAISE EXCEPTION 'Output VAT is reversed on a VAT liability account, and % is not one.', v_tax_account.name
          USING ERRCODE = '22023';
      END IF;
      v_tax_account_id := v_tax_account.id;
    ELSE
      SELECT id INTO v_tax_account_id FROM public.chart_of_accounts
      WHERE company_id = p_company_id AND type = 'Liability' AND account_role IN ('output_vat', 'vat_control')
      ORDER BY CASE account_role WHEN 'output_vat' THEN 0 ELSE 1 END, account_number
      LIMIT 1;
      IF v_tax_account_id IS NULL THEN
        RAISE EXCEPTION 'This credit note reverses VAT, but no output VAT account is mapped in the chart of accounts.'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  -- ---- Never credit more than was invoiced ----------------------------------
  IF v_invoice_found IS NOT NULL THEN
    v_invoice_gross := public.invoice_gross_amount(v_invoice_found);
    v_already_credited := public.invoice_credited_amount(v_invoice_found);
    v_creditable := ROUND(v_invoice_gross - v_already_credited, 2);
    IF v_total > v_creditable + 0.005 THEN
      IF v_already_credited > 0 THEN
        RAISE EXCEPTION 'Invoice % was for %, and % has already been credited against it, so no more than % can be credited now.',
          v_invoice_number, ROUND(v_invoice_gross, 2), ROUND(v_already_credited, 2), GREATEST(v_creditable, 0)
          USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'Invoice % was for %, so a credit note against it cannot be for %.',
        v_invoice_number, ROUND(v_invoice_gross, 2), v_total USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ---- Number ------------------------------------------------------------
  -- Serialised per company so two clerks cannot be handed the same next number.
  PERFORM pg_advisory_xact_lock(hashtextextended('credit_note_number:' || p_company_id::text, 0));
  v_number := NULLIF(btrim(COALESCE(p_credit_note_number, '')), '');
  IF v_number IS NULL THEN
    v_number := public.credit_note_next_number(p_company_id);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.credit_notes
    WHERE company_id = p_company_id AND lower(credit_note_number) = lower(v_number)
  ) THEN
    RAISE EXCEPTION 'Credit note number % is already in use.', v_number USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.credit_notes (
    company_id, customer_id, credit_note_number, credit_note_date, status, reason, invoice_id, created_by
  ) VALUES (
    p_company_id, p_customer_id, v_number, p_credit_note_date, 'issued', v_reason, v_invoice_found, p_actor_user_id
  )
  RETURNING id INTO v_cn_id;

  -- ---- Post it -------------------------------------------------------------
  v_lines := v_revenue_lines;
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_rows)
  LOOP
    IF (v_row->>'tax_amount')::numeric > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_tax_account_id,
        'debit', (v_row->>'tax_amount')::numeric,
        'tax_rate_id', v_row->>'tax_rate_id'
      ));
    END IF;
  END LOOP;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_ar_id, 'credit', v_total));

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id,
    'posting_date', p_credit_note_date,
    'module', 'sales_invoice',
    'document_type', 'credit_note',
    'document_id', v_cn_id,
    'reference', v_number,
    'description', 'Credit note ' || v_number
      || COALESCE(' against ' || v_invoice_number, '')
      || ': ' || v_reason,
    'created_by', p_actor_user_id,
    'customer_id', p_customer_id,
    'lines', v_lines
  ), 'commit');

  v_je_id := NULLIF(v_result->>'journal_id', '')::uuid;
  IF v_je_id IS NULL THEN
    RAISE EXCEPTION 'The credit note journal was not created.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.credit_notes SET journal_entry_id = v_je_id WHERE id = v_cn_id;

  INSERT INTO public.credit_note_items (
    credit_note_id, product_id, description, quantity, unit_price, tax_rate_id, account_id, line_amount, tax_amount,
    position
  )
  SELECT v_cn_id,
         NULLIF(r->>'product_id', '')::uuid,
         r->>'description',
         (r->>'quantity')::numeric,
         (r->>'unit_price')::numeric,
         NULLIF(r->>'tax_rate_id', '')::uuid,
         (r->>'account_id')::uuid,
         (r->>'line_amount')::numeric,
         (r->>'tax_amount')::numeric,
         ord::integer
  FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS e(r, ord);

  -- ---- Settle the invoice it was raised against -----------------------------
  IF v_invoice_found IS NOT NULL AND COALESCE(p_apply_to_invoice, true) THEN
    v_outstanding := public.invoice_outstanding_amount(v_invoice_found);
    v_apply := ROUND(LEAST(v_total, GREATEST(v_outstanding, 0)), 2);
    IF v_apply > 0 THEN
      INSERT INTO public.invoice_payment_allocations (company_id, invoice_id, journal_entry_id, amount, created_by)
      VALUES (p_company_id, v_invoice_found, v_je_id, v_apply, p_actor_user_id);
      PERFORM public.invoice_refresh_payment_status(v_invoice_found);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'credit_note_id', v_cn_id,
    'credit_note_number', v_number,
    'journal_id', v_je_id,
    'journal_number', v_result->>'journal_number',
    'subtotal', ROUND(v_subtotal, 2),
    'tax', ROUND(v_tax_total, 2),
    'total', v_total,
    'applied', v_apply,
    'unapplied', ROUND(v_total - v_apply, 2)
  );
END;
$$;

-- ── Applying a credit note to invoices ─────────────────────────────────────

/**
 * p_allocations: [{invoice_id, amount}]. Writes allocations against the credit
 * note's own journal, so the invoices' outstanding balances, statuses and
 * ageing move exactly as they do when a receipt settles them.
 */
CREATE OR REPLACE FUNCTION public.apply_credit_note_atomic(
  p_company_id uuid,
  p_credit_note_id uuid,
  p_allocations jsonb,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn record;
  v_remaining numeric;
  v_alloc jsonb;
  v_invoice_id uuid;
  v_amount numeric;
  v_inv record;
  v_outstanding numeric;
  v_applied_now numeric := 0;
  v_done jsonb := '[]'::jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can apply its credit notes.'
      USING ERRCODE = '42501';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Say which invoices the credit is applied to.' USING ERRCODE = '22023';
  END IF;

  SELECT id, credit_note_number, customer_id, status, journal_entry_id INTO v_cn
  FROM public.credit_notes
  WHERE id = p_credit_note_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_cn.id IS NULL THEN
    RAISE EXCEPTION 'Credit note not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_cn.status <> 'issued' THEN
    RAISE EXCEPTION 'Credit note % is % and cannot be applied.', v_cn.credit_note_number, v_cn.status
      USING ERRCODE = '22023';
  END IF;
  IF v_cn.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Credit note % was never posted and cannot be applied.', v_cn.credit_note_number
      USING ERRCODE = '22023';
  END IF;

  v_remaining := ROUND(public.credit_note_total(v_cn.id) - public.credit_note_applied_amount(v_cn.id), 2);

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_invoice_id := NULLIF(v_alloc->>'invoice_id', '')::uuid;
    v_amount := ROUND(COALESCE(NULLIF(v_alloc->>'amount', '')::numeric, 0), 2);
    IF v_invoice_id IS NULL THEN
      RAISE EXCEPTION 'Every allocation needs an invoice.' USING ERRCODE = '22023';
    END IF;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'An allocation must be for a positive amount.' USING ERRCODE = '22023';
    END IF;

    SELECT id, invoice_number, customer_id, status::text AS status INTO v_inv
    FROM public.invoices
    WHERE id = v_invoice_id AND company_id = p_company_id
    FOR UPDATE;
    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'Invoice not found in this company.' USING ERRCODE = '22023';
    END IF;
    IF v_inv.customer_id <> v_cn.customer_id THEN
      RAISE EXCEPTION 'Invoice % belongs to a different customer from credit note %.',
        v_inv.invoice_number, v_cn.credit_note_number USING ERRCODE = '22023';
    END IF;
    IF v_inv.status IN ('draft', 'void', 'cancelled') THEN
      RAISE EXCEPTION 'Invoice % is % and cannot be settled.', v_inv.invoice_number, v_inv.status
        USING ERRCODE = '22023';
    END IF;

    v_outstanding := public.invoice_outstanding_amount(v_inv.id);
    IF v_amount > v_outstanding + 0.005 THEN
      RAISE EXCEPTION 'Invoice % has % outstanding; % cannot be applied to it.',
        v_inv.invoice_number, v_outstanding, v_amount USING ERRCODE = '22023';
    END IF;
    IF v_amount > v_remaining + 0.005 THEN
      RAISE EXCEPTION 'Credit note % has % left to apply; % cannot be applied.',
        v_cn.credit_note_number, v_remaining, v_amount USING ERRCODE = '22023';
    END IF;

    -- A second application to the same invoice adds to the first: one credit
    -- note settles a given invoice by one allocation row.
    INSERT INTO public.invoice_payment_allocations (company_id, invoice_id, journal_entry_id, amount, created_by)
    VALUES (p_company_id, v_inv.id, v_cn.journal_entry_id, v_amount, p_actor_user_id)
    ON CONFLICT ON CONSTRAINT invoice_payment_allocations_unique_pair
    DO UPDATE SET amount = public.invoice_payment_allocations.amount + EXCLUDED.amount;

    PERFORM public.invoice_refresh_payment_status(v_inv.id);

    v_remaining := ROUND(v_remaining - v_amount, 2);
    v_applied_now := ROUND(v_applied_now + v_amount, 2);
    v_done := v_done || jsonb_build_array(jsonb_build_object(
      'invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number, 'amount', v_amount));
  END LOOP;

  RETURN jsonb_build_object(
    'credit_note_id', v_cn.id,
    'applied_now', v_applied_now,
    'applied', ROUND(public.credit_note_applied_amount(v_cn.id), 2),
    'remaining', v_remaining,
    'allocations', v_done
  );
END;
$$;

/**
 * Take a credit back off an invoice it was applied to by mistake. The credit
 * note stays issued and its journal is untouched; only the statement of which
 * invoice it settles is withdrawn.
 */
CREATE OR REPLACE FUNCTION public.unapply_credit_note_atomic(
  p_company_id uuid,
  p_credit_note_id uuid,
  p_invoice_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn record;
  v_removed numeric;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can change its credit notes.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, credit_note_number, status, journal_entry_id INTO v_cn
  FROM public.credit_notes
  WHERE id = p_credit_note_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_cn.id IS NULL THEN
    RAISE EXCEPTION 'Credit note not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_cn.status <> 'issued' THEN
    RAISE EXCEPTION 'Credit note % is %; its applications were already withdrawn when it was voided.',
      v_cn.credit_note_number, v_cn.status USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.invoices WHERE id = p_invoice_id AND company_id = p_company_id FOR UPDATE;

  DELETE FROM public.invoice_payment_allocations
  WHERE journal_entry_id = v_cn.journal_entry_id
    AND invoice_id = p_invoice_id
    AND company_id = p_company_id
  RETURNING amount INTO v_removed;

  IF v_removed IS NULL THEN
    RAISE EXCEPTION 'Credit note % is not applied to that invoice.', v_cn.credit_note_number
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.invoice_refresh_payment_status(p_invoice_id);

  RETURN jsonb_build_object(
    'credit_note_id', v_cn.id,
    'invoice_id', p_invoice_id,
    'removed', v_removed,
    'remaining', ROUND(public.credit_note_total(v_cn.id) - public.credit_note_applied_amount(v_cn.id), 2)
  );
END;
$$;

-- ── Voiding a credit note ──────────────────────────────────────────────────

/**
 * Reverses the credit note's journal through the posting engine, dated today
 * and subject to today's period being open. The reversal trigger on
 * posting_requests removes the credit note's allocations and re-derives each
 * invoice's status, so the invoices it settled are owed again.
 */
CREATE OR REPLACE FUNCTION public.void_credit_note_atomic(
  p_company_id uuid,
  p_credit_note_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn record;
  v_reason text;
  v_result jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can void its credit notes.'
      USING ERRCODE = '42501';
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Say why the credit note is being voided.' USING ERRCODE = '22023';
  END IF;

  SELECT id, credit_note_number, status, journal_entry_id INTO v_cn
  FROM public.credit_notes
  WHERE id = p_credit_note_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_cn.id IS NULL THEN
    RAISE EXCEPTION 'Credit note not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_cn.status = 'void' THEN
    RAISE EXCEPTION 'Credit note % is already void.', v_cn.credit_note_number USING ERRCODE = '22023';
  END IF;

  v_result := public.posting_engine_rollback(
    'sales_invoice:credit_note:' || v_cn.id::text,
    p_company_id,
    'Credit note ' || v_cn.credit_note_number || ' voided: ' || v_reason,
    p_actor_user_id
  );

  UPDATE public.credit_notes
  SET status = 'void', voided_at = now(), voided_by = p_actor_user_id, void_reason = v_reason
  WHERE id = v_cn.id;

  RETURN jsonb_build_object(
    'credit_note_id', v_cn.id,
    'status', 'void',
    'reversal_journal_id', v_result->>'journal_id',
    'reversal_journal_number', v_result->>'journal_number'
  );
END;
$$;

-- ── Service role only: the edge function authorises the caller first ───────

REVOKE ALL ON FUNCTION public.credit_note_total(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_note_applied_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_credited_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_note_settlements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_note_next_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_credit_note_atomic(uuid, uuid, date, text, jsonb, uuid, text, uuid, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_credit_note_atomic(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unapply_credit_note_atomic(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_credit_note_atomic(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.credit_note_total(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_note_applied_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_credited_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_note_settlements(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_note_next_number(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_credit_note_atomic(uuid, uuid, date, text, jsonb, uuid, text, uuid, boolean, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_credit_note_atomic(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unapply_credit_note_atomic(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_credit_note_atomic(uuid, uuid, text, uuid) TO service_role;
