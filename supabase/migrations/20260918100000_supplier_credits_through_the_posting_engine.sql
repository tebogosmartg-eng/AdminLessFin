-- ============================================================================
-- AdminLess Fin — a supplier credit is a controlled document, and a bill
-- records what has been paid off it.
--
-- WHAT WAS WRONG
-- The payables side was where the receivables side was before the receipt
-- allocation engine, and supplier credits were where credit notes were before
-- they went through the posting engine. Both faults at once:
--
--   * Nothing recorded how much of a bill had been paid. pay_specific_bill
--     posted the cash and then flipped the bill to 'paid' only if that single
--     payment covered the whole bill. Pay half and the bill stayed 'open' at
--     its full value: the creditors age analysis aged the whole amount, and
--     paying the other half was unguarded, so a bill could be paid twice over.
--   * create_vendor_credit wrote a journal outside the posting engine. No
--     period lock, no account validation, no accounting policy, VAT unrounded,
--     and the payables control account taken from the caller -- so a supplier
--     credit could be dated into a closed month or debit any liability at all.
--   * allocate_vendor_credit posted a journal that debited AND credited the
--     same account by the same amount. It moved nothing. The bill's balance,
--     its status and its ageing were all untouched, and it accepted any amount
--     against any bill of any supplier, including credit it did not have.
--   * the edge function's DELETE erased the posted journal, and looked that
--     journal up by id ALONE -- no company -- so a member of one company could
--     destroy another company's posted entries.
--   * RLS let any member insert, rewrite or delete vendor credit rows by hand.
--
-- No supplier credit has ever been issued in production (0 rows in every
-- company when this was written) and no allocation journal was ever posted, so
-- nothing posted is rewritten here. The eight bill payments that exist are
-- matched to their bills below, from the posting request that recorded them.
--
-- WHAT THIS ADDS
--   * bill_payment_allocations: how much of which payment settles which bill,
--     the exact twin of invoice_payment_allocations. One allocation row is the
--     single fact from which a bill's outstanding balance, its status and its
--     ageing all derive, so they cannot disagree.
--   * post_vendor_credit_atomic: one transaction, through posting_engine_submit.
--     The credit reverses what the bill was posted to -- expenses and the
--     assets a bill can buy, never the control account itself -- input VAT is
--     rounded per line the way the bill charged it, and payables are debited on
--     the control account resolved by role, the same one the credited bill
--     itself raised. A reason is required, and a credit raised against a bill
--     can never exceed what that bill was worth.
--   * Applying a supplier credit writes bill_payment_allocations against the
--     credit's OWN journal. That journal already debits payables, so no second
--     journal is needed.
--   * Voiding reverses the journal through posting_engine_rollback, and the
--     reversal trigger withdraws its allocations. Nothing is ever deleted.
--   * Every function here is service_role only; the vendor-credits edge
--     function authorises the caller against company_users first.
-- ============================================================================

-- ══ PART 1 ═══ What has been paid off a bill ═════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bill_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  -- The payment, or the supplier credit, that settled it. Deleting the journal
  -- removes the allocation; a REVERSED journal is unwound by the trigger
  -- further down, because a reversal adds a journal rather than deleting one.
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  -- One payment settles a given bill once. A second instalment is a second
  -- payment, and therefore a second row.
  CONSTRAINT bill_payment_allocations_unique_pair UNIQUE (journal_entry_id, bill_id)
);

CREATE INDEX IF NOT EXISTS bill_payment_allocations_bill_idx
  ON public.bill_payment_allocations (bill_id);
CREATE INDEX IF NOT EXISTS bill_payment_allocations_company_idx
  ON public.bill_payment_allocations (company_id);
CREATE INDEX IF NOT EXISTS bill_payment_allocations_journal_idx
  ON public.bill_payment_allocations (journal_entry_id);

ALTER TABLE public.bill_payment_allocations ENABLE ROW LEVEL SECURITY;

-- Members may read what settles their bills; only the posting functions write.
-- (invoice_payment_allocations still carries a writable policy from before the
-- posting functions existed. The new table does not repeat that.)
DROP POLICY IF EXISTS bill_payment_allocations_select ON public.bill_payment_allocations;
CREATE POLICY bill_payment_allocations_select ON public.bill_payment_allocations
  FOR SELECT TO authenticated
  USING (is_company_member(company_id));

DROP TRIGGER IF EXISTS audit_bill_payment_allocations ON public.bill_payment_allocations;
CREATE TRIGGER audit_bill_payment_allocations
  AFTER INSERT OR DELETE OR UPDATE ON public.bill_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- ── What a bill is worth, and what is left on it ───────────────────────────

/**
 * The bill's gross value: what it put INTO the creditors control account.
 *
 * Defined off the control account rather than off every credit on the journal,
 * because that is how the age analysis defines it. Two definitions of "what
 * this bill is worth" is how a sub-ledger drifts from its control account.
 */
CREATE OR REPLACE FUNCTION public.bill_gross_amount(p_bill_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN jei.type = 'credit' THEN jei.amount ELSE -jei.amount END
  ), 0)::numeric
  FROM public.bills b
  JOIN public.journal_entry_items jei ON jei.journal_entry_id = b.journal_entry_id
  JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
  WHERE b.id = p_bill_id
    AND coa.company_id = b.company_id
    AND coa.type = 'Liability'
    AND coa.account_role = 'trade_payable';
$$;

/** How much of the bill has been settled, by payment or by supplier credit. */
CREATE OR REPLACE FUNCTION public.bill_allocated_amount(p_bill_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0)::numeric
  FROM public.bill_payment_allocations
  WHERE bill_id = p_bill_id;
$$;

/** Gross less settled. Never returns a negative: over-allocation is refused. */
CREATE OR REPLACE FUNCTION public.bill_outstanding_amount(p_bill_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(
    public.bill_gross_amount(p_bill_id) - public.bill_allocated_amount(p_bill_id),
    2
  );
$$;

/**
 * Re-derives one bill's status from what has actually been allocated to it.
 *
 * 'void' is left alone: that says something about the document, not about how
 * much of it has been paid, and a payment must not resurrect a voided bill.
 */
CREATE OR REPLACE FUNCTION public.bill_refresh_payment_status(p_bill_id uuid)
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
  SELECT status INTO v_status FROM public.bills WHERE id = p_bill_id;
  IF v_status IS NULL THEN RETURN NULL; END IF;
  IF v_status IN ('void', 'cancelled', 'draft') THEN RETURN v_status; END IF;

  v_gross := public.bill_gross_amount(p_bill_id);
  v_allocated := public.bill_allocated_amount(p_bill_id);

  IF v_gross > 0 AND v_allocated >= v_gross - 0.005 THEN
    v_new := 'paid';
  ELSIF v_allocated > 0.005 THEN
    v_new := 'partially_paid';
  ELSE
    v_new := 'open';
  END IF;

  IF v_new IS DISTINCT FROM v_status THEN
    UPDATE public.bills SET status = v_new WHERE id = p_bill_id;
  END IF;
  RETURN v_new;
END;
$$;

-- ── A payment can never settle more than the bill is worth ─────────────────

CREATE OR REPLACE FUNCTION public.bill_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross numeric;
  v_allocated numeric;
  v_bill record;
BEGIN
  SELECT company_id, bill_number, status INTO v_bill
  FROM public.bills WHERE id = NEW.bill_id;

  IF v_bill.company_id IS NULL THEN
    RAISE EXCEPTION 'Bill % does not exist.', NEW.bill_id USING ERRCODE = '22023';
  END IF;
  IF v_bill.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Bill % belongs to another company.', NEW.bill_id USING ERRCODE = '42501';
  END IF;
  IF v_bill.status IN ('void', 'cancelled') THEN
    RAISE EXCEPTION 'Bill % is % and cannot be settled.', COALESCE(v_bill.bill_number, NEW.bill_id::text), v_bill.status
      USING ERRCODE = '22023';
  END IF;

  v_gross := public.bill_gross_amount(NEW.bill_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM public.bill_payment_allocations
  WHERE bill_id = NEW.bill_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- The backstop for over-payment. The RPCs check this too, against a locked
  -- row; this catches anything that reaches the table by another route.
  IF v_allocated + NEW.amount > v_gross + 0.005 THEN
    RAISE EXCEPTION
      'Allocating % to bill % would settle %, but the bill is only worth %.',
      NEW.amount, COALESCE(v_bill.bill_number, NEW.bill_id::text), v_allocated + NEW.amount, v_gross
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bill_allocation_guard_trg ON public.bill_payment_allocations;
CREATE TRIGGER bill_allocation_guard_trg
  BEFORE INSERT OR UPDATE ON public.bill_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.bill_allocation_guard();

-- ── Reversing a payment or a credit un-settles what it settled ─────────────

/**
 * The payables twin of invoice_allocations_follow_reversal, and separate from
 * it on purpose: one trigger doing both would make a failure on either side
 * roll back the other.
 */
CREATE OR REPLACE FUNCTION public.bill_allocations_follow_reversal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_id uuid;
  v_original_journal uuid;
  v_bill uuid;
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

  FOR v_bill IN
    SELECT bill_id FROM public.bill_payment_allocations
    WHERE journal_entry_id = v_original_journal
  LOOP
    DELETE FROM public.bill_payment_allocations
    WHERE journal_entry_id = v_original_journal AND bill_id = v_bill;
    PERFORM public.bill_refresh_payment_status(v_bill);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bill_allocations_follow_reversal_trg ON public.posting_requests;
CREATE TRIGGER bill_allocations_follow_reversal_trg
  AFTER INSERT OR UPDATE OF status ON public.posting_requests
  FOR EACH ROW EXECUTE FUNCTION public.bill_allocations_follow_reversal();

-- ── Paying a bill now records what it paid off ─────────────────────────────

/**
 * The old pay_specific_bill took a bill id with no company beside it, and was
 * executable by every signed-in user: the company it posted into came from the
 * bill itself, so a member of one company could pay -- and post into the books
 * of -- another company's bill. It also took the payables and bank accounts
 * from the caller without checking either.
 *
 * Replaced rather than patched, because the safe version needs the company and
 * the actor, and a function that silently ignored them would be worse than one
 * that will not compile against the old call. The payments edge function is
 * its only caller.
 *
 * The allocation is capped at what the bill still owes rather than refused when
 * it exceeds it: over-paying a supplier happens, and the payment must still
 * reach the cash book. The excess stays on the supplier's account, exactly as
 * an over-receipt does on the customer side.
 */
DROP FUNCTION IF EXISTS public.pay_specific_bill(uuid, date, uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION public.pay_specific_bill(
  p_company_id uuid,
  p_bill_id uuid,
  p_payment_date date,
  p_payment_account_id uuid,
  p_ap_account_id uuid,
  p_amount numeric,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_bill_number text;
  v_bill_status text;
  v_amount numeric;
  v_ap_id uuid;
  v_bank record;
  v_bill_journal uuid;
  v_result jsonb;
  v_je_id uuid;
  v_outstanding numeric;
  v_apply numeric;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can pay its bills.'
      USING ERRCODE = '42501';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0), 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'A payment must be for a positive amount.' USING ERRCODE = '22023';
  END IF;

  SELECT vendor_id, bill_number, status, journal_entry_id
  INTO v_vendor_id, v_bill_number, v_bill_status, v_bill_journal
  FROM public.bills WHERE id = p_bill_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_bill_status IN ('void', 'cancelled') THEN
    RAISE EXCEPTION 'Bill % is % and cannot be paid.', COALESCE(v_bill_number, ''), v_bill_status
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_period_open(p_company_id, p_payment_date);

  -- The payables control account: the one this bill actually raised. A caller's
  -- choice is honoured only if it is a payables control account of this company.
  IF p_ap_account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.chart_of_accounts
    WHERE id = p_ap_account_id AND company_id = p_company_id
      AND type = 'Liability' AND account_role = 'trade_payable'
  ) THEN
    v_ap_id := p_ap_account_id;
  ELSE
    SELECT jei.account_id INTO v_ap_id
    FROM public.journal_entry_items jei
    JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
    WHERE jei.journal_entry_id = v_bill_journal
      AND jei.type = 'credit'
      AND coa.company_id = p_company_id
      AND coa.type = 'Liability'
      AND coa.account_role = 'trade_payable'
    ORDER BY jei.amount DESC
    LIMIT 1;
    IF v_ap_id IS NULL THEN
      SELECT id INTO v_ap_id FROM public.chart_of_accounts
      WHERE company_id = p_company_id AND type = 'Liability' AND account_role = 'trade_payable'
      ORDER BY account_number LIMIT 1;
    END IF;
  END IF;
  IF v_ap_id IS NULL THEN
    RAISE EXCEPTION 'This company has no trade payable control account mapped in its chart of accounts.'
      USING ERRCODE = '22023';
  END IF;

  -- Money leaves an asset. Paying a bill "from" a liability or an expense
  -- balances and is nonsense.
  SELECT id, name, type INTO v_bank FROM public.chart_of_accounts
  WHERE id = p_payment_account_id AND company_id = p_company_id;
  IF v_bank.id IS NULL THEN
    RAISE EXCEPTION 'Choose the account the money was paid from.' USING ERRCODE = '22023';
  END IF;
  IF v_bank.type <> 'Asset' THEN
    RAISE EXCEPTION 'A bill is paid from a bank or cash account, and % is a % account.', v_bank.name, v_bank.type
      USING ERRCODE = '22023';
  END IF;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', p_payment_date, 'module', 'accounts_payable',
    'document_type', 'bill_payment', 'document_id', p_bill_id,
    'description', 'Payment for Bill ' || COALESCE(v_bill_number, ''),
    'vendor_id', v_vendor_id,
    'created_by', p_actor_user_id,
    'idempotency_key', 'accounts_payable:bill_payment:' || p_bill_id::text || ':' || p_payment_date::text || ':' || v_amount::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', v_ap_id, 'debit', v_amount),
      jsonb_build_object('account_id', v_bank.id, 'credit', v_amount)
    )
  ), 'commit');

  v_je_id := NULLIF(v_result->>'journal_id', '')::uuid;

  IF v_je_id IS NOT NULL THEN
    v_outstanding := public.bill_outstanding_amount(p_bill_id);
    v_apply := ROUND(LEAST(v_amount, GREATEST(v_outstanding, 0)), 2);
    IF v_apply > 0 THEN
      -- ON CONFLICT rather than a plain insert because a replayed request comes
      -- back with the journal it already posted; that payment is already
      -- matched, so the row must not be added to a second time.
      INSERT INTO public.bill_payment_allocations (company_id, bill_id, journal_entry_id, amount, created_by)
      VALUES (p_company_id, p_bill_id, v_je_id, v_apply, p_actor_user_id)
      ON CONFLICT ON CONSTRAINT bill_payment_allocations_unique_pair DO NOTHING;
    END IF;
    PERFORM public.bill_refresh_payment_status(p_bill_id);
  END IF;

  RETURN jsonb_build_object(
    'bill_id', p_bill_id,
    'journal_id', v_je_id,
    'journal_number', v_result->>'journal_number',
    'paid', v_amount,
    'allocated', COALESCE(v_apply, 0),
    'outstanding', public.bill_outstanding_amount(p_bill_id)
  );
END;
$$;

COMMENT ON FUNCTION public.pay_specific_bill IS
  'Pays one bill. Company and actor are checked, the payables and bank accounts are validated, and the payment is matched to the bill by a bill_payment_allocation so a part-paid bill is partially_paid with the remainder still aged.';

-- ── The payments already made are matched to their bills ───────────────────

/**
 * Every bill payment posted before this migration went through
 * posting_engine_submit with document_type 'bill_payment' and the bill's id as
 * document_id, so what each one paid is on record -- it simply was not written
 * down anywhere the ageing could read. Matching them is a restatement of facts
 * already in the ledger, not a new posting: no journal is written, no period is
 * touched, and the amount taken is the payment's own debit to the payables
 * control account.
 *
 * Capped at what the bill was worth, so an over-payment matches what it
 * settled and leaves the rest on the supplier's account.
 */
DO $backfill$
DECLARE
  v_row record;
  v_allocated numeric;
  v_gross numeric;
  v_apply numeric;
  v_count int := 0;
BEGIN
  FOR v_row IN
    SELECT pr.document_id AS bill_id,
           pr.company_id,
           pr.journal_entry_id,
           je.entry_date,
           COALESCE(SUM(CASE WHEN jei.type = 'debit' THEN jei.amount ELSE -jei.amount END), 0) AS paid
    FROM public.posting_requests pr
    JOIN public.journal_entries je ON je.id = pr.journal_entry_id
    JOIN public.journal_entry_items jei ON jei.journal_entry_id = pr.journal_entry_id
    JOIN public.chart_of_accounts coa
      ON coa.id = jei.account_id
     AND coa.company_id = pr.company_id
     AND coa.type = 'Liability'
     AND coa.account_role = 'trade_payable'
    JOIN public.bills b ON b.id = pr.document_id AND b.company_id = pr.company_id
    WHERE pr.document_type = 'bill_payment'
      AND pr.status = 'committed'
      AND pr.journal_entry_id IS NOT NULL
      AND b.status NOT IN ('void', 'cancelled')
      -- A payment whose own journal was later reversed settled nothing.
      AND NOT EXISTS (
        SELECT 1 FROM public.posting_requests rev
        WHERE rev.idempotency_key = 'reversal:' || pr.id::text AND rev.status = 'committed'
      )
    GROUP BY pr.document_id, pr.company_id, pr.journal_entry_id, je.entry_date
    ORDER BY je.entry_date, pr.journal_entry_id
  LOOP
    CONTINUE WHEN v_row.paid <= 0;
    v_gross := public.bill_gross_amount(v_row.bill_id);
    v_allocated := public.bill_allocated_amount(v_row.bill_id);
    v_apply := ROUND(LEAST(v_row.paid, GREATEST(v_gross - v_allocated, 0)), 2);
    CONTINUE WHEN v_apply <= 0;

    INSERT INTO public.bill_payment_allocations (company_id, bill_id, journal_entry_id, amount)
    VALUES (v_row.company_id, v_row.bill_id, v_row.journal_entry_id, v_apply)
    ON CONFLICT ON CONSTRAINT bill_payment_allocations_unique_pair DO NOTHING;

    PERFORM public.bill_refresh_payment_status(v_row.bill_id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'bill payments matched to their bills: %', v_count;
END;
$backfill$;

-- ══ PART 2 ═══ The supplier credit itself ════════════════════════════════════

-- ── What a supplier credit records ─────────────────────────────────────────

ALTER TABLE public.vendor_credits
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES public.bills(id),
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS void_reason text;

COMMENT ON COLUMN public.vendor_credits.bill_id IS
  'The bill this credit was raised against, if any. Identifies the original supply on the document and caps how much may be credited; it does NOT by itself settle anything -- bill_payment_allocations does.';

-- What each line was worth when it was posted, so the printed document shows
-- the figures that reached the ledger rather than recomputing them, and where
-- it sat: every line is inserted in one statement, so neither created_at nor
-- the uuid key says which came first.
ALTER TABLE public.vendor_credit_items
  ADD COLUMN IF NOT EXISTS tax_rate_id uuid REFERENCES public.tax_rates(id),
  ADD COLUMN IF NOT EXISTS line_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS position integer;

-- A supplier credit is issued when it is posted, and void when it is reversed.
-- How much of it has been applied is derived from the allocations, never
-- stored, so it cannot disagree with them.
ALTER TABLE public.vendor_credits ALTER COLUMN status SET DEFAULT 'issued';
ALTER TABLE public.vendor_credits DROP CONSTRAINT IF EXISTS vendor_credits_status_check;
ALTER TABLE public.vendor_credits
  ADD CONSTRAINT vendor_credits_status_check CHECK (status IN ('issued', 'void'));

CREATE UNIQUE INDEX IF NOT EXISTS vendor_credits_company_number_key
  ON public.vendor_credits (company_id, lower(credit_number));
CREATE INDEX IF NOT EXISTS vendor_credits_bill_idx ON public.vendor_credits (bill_id);
CREATE INDEX IF NOT EXISTS vendor_credits_vendor_idx ON public.vendor_credits (company_id, vendor_id);
CREATE INDEX IF NOT EXISTS vendor_credits_journal_idx ON public.vendor_credits (journal_entry_id);

-- ── Only the posting functions write supplier credits ──────────────────────

DROP POLICY IF EXISTS "Company members can manage vendor_credits" ON public.vendor_credits;
DROP POLICY IF EXISTS vendor_credits_select ON public.vendor_credits;
CREATE POLICY vendor_credits_select ON public.vendor_credits
  FOR SELECT TO authenticated
  USING (is_company_member(company_id));

DROP POLICY IF EXISTS "Company members can manage vendor_credit_items" ON public.vendor_credit_items;
DROP POLICY IF EXISTS vendor_credit_items_select ON public.vendor_credit_items;
CREATE POLICY vendor_credit_items_select ON public.vendor_credit_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_credits vc
    WHERE vc.id = vendor_credit_items.vendor_credit_id AND is_company_member(vc.company_id)
  ));

DROP TRIGGER IF EXISTS audit_vendor_credit_items ON public.vendor_credit_items;
CREATE TRIGGER audit_vendor_credit_items
  AFTER INSERT OR DELETE OR UPDATE ON public.vendor_credit_items
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- ── The unsafe functions go ────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.create_vendor_credit(uuid, uuid, text, date, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.allocate_vendor_credit(uuid, uuid, uuid, numeric, uuid);

-- ── What a supplier credit is worth, and what is left of it ────────────────

/**
 * The credit's value: what it took OUT of the creditors control account.
 * Defined off the control account for the same reason bill_gross_amount is.
 */
CREATE OR REPLACE FUNCTION public.vendor_credit_total(p_vendor_credit_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    CASE WHEN jei.type = 'debit' THEN jei.amount ELSE -jei.amount END
  ), 0)::numeric
  FROM public.vendor_credits vc
  JOIN public.journal_entry_items jei ON jei.journal_entry_id = vc.journal_entry_id
  JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
  WHERE vc.id = p_vendor_credit_id
    AND coa.company_id = vc.company_id
    AND coa.type = 'Liability'
    AND coa.account_role = 'trade_payable';
$$;

/** How much of the credit has been applied to bills. */
CREATE OR REPLACE FUNCTION public.vendor_credit_applied_amount(p_vendor_credit_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(a.amount), 0)::numeric
  FROM public.vendor_credits vc
  JOIN public.bill_payment_allocations a ON a.journal_entry_id = vc.journal_entry_id
  WHERE vc.id = p_vendor_credit_id;
$$;

/**
 * How much has been credited against a bill by issued supplier credits raised
 * against it -- whether or not those credits were applied to it. This is what
 * stops a bill for R1 000 being credited R1 000 twice.
 */
CREATE OR REPLACE FUNCTION public.bill_credited_amount(p_bill_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(public.vendor_credit_total(vc.id)), 0)::numeric
  FROM public.vendor_credits vc
  WHERE vc.bill_id = p_bill_id
    AND vc.status = 'issued';
$$;

/** Total, applied and remaining for every supplier credit in a company. */
CREATE OR REPLACE FUNCTION public.vendor_credit_settlements(p_company_id uuid)
RETURNS TABLE (vendor_credit_id uuid, total numeric, applied numeric, remaining numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH totals AS (
    SELECT vc.id, COALESCE(SUM(
      CASE WHEN coa.id IS NULL THEN 0
           WHEN jei.type = 'debit' THEN jei.amount ELSE -jei.amount END
    ), 0) AS total
    FROM public.vendor_credits vc
    LEFT JOIN public.journal_entry_items jei ON jei.journal_entry_id = vc.journal_entry_id
    LEFT JOIN public.chart_of_accounts coa
      ON coa.id = jei.account_id
     AND coa.company_id = vc.company_id
     AND coa.type = 'Liability'
     AND coa.account_role = 'trade_payable'
    WHERE vc.company_id = p_company_id
    GROUP BY vc.id
  ),
  applied AS (
    SELECT vc.id, COALESCE(SUM(a.amount), 0) AS applied
    FROM public.vendor_credits vc
    LEFT JOIN public.bill_payment_allocations a ON a.journal_entry_id = vc.journal_entry_id
    WHERE vc.company_id = p_company_id
    GROUP BY vc.id
  )
  SELECT t.id, ROUND(t.total, 2), ROUND(ap.applied, 2), ROUND(t.total - ap.applied, 2)
  FROM totals t JOIN applied ap ON ap.id = t.id;
$$;

/** VCN-00001, VCN-00002, ... from the highest number already used. */
CREATE OR REPLACE FUNCTION public.vendor_credit_next_number(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'VCN-' || lpad((COALESCE(MAX(substring(credit_number FROM '^VCN-(\d{1,9})$')::bigint), 0) + 1)::text, 5, '0')
  FROM public.vendor_credits
  WHERE company_id = p_company_id;
$$;

-- ── Issuing a supplier credit ──────────────────────────────────────────────

/**
 * p_items: [{description, quantity, unit_price, account_id, tax_rate_id?, product_id?}]
 *
 * Returns {vendor_credit_id, credit_number, journal_id, journal_number,
 *          subtotal, tax, total, applied, unapplied}.
 */
CREATE OR REPLACE FUNCTION public.post_vendor_credit_atomic(
  p_company_id uuid,
  p_vendor_id uuid,
  p_credit_date date,
  p_reason text,
  p_items jsonb,
  p_actor_user_id uuid,
  p_credit_number text DEFAULT NULL,
  p_bill_id uuid DEFAULT NULL,
  p_apply_to_bill boolean DEFAULT true,
  p_tax_account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_name text;
  v_reason text;
  v_bill_found uuid;
  v_bill_number text;
  v_bill_vendor uuid;
  v_bill_status text;
  v_bill_date date;
  v_bill_journal uuid;
  v_ap_id uuid;
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
  v_cost_lines jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_lines jsonb;
  v_bill_gross numeric;
  v_already_credited numeric;
  v_creditable numeric;
  v_outstanding numeric;
  v_apply numeric := 0;
  v_number text;
  v_vc_id uuid;
  v_result jsonb;
  v_je_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'A supplier credit needs a company and a supplier.' USING ERRCODE = '22023';
  END IF;
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can issue its supplier credits.'
      USING ERRCODE = '42501';
  END IF;
  IF p_credit_date IS NULL THEN
    RAISE EXCEPTION 'A supplier credit needs a date.' USING ERRCODE = '22023';
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A supplier credit must say why it is being issued.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A supplier credit needs at least one line.' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_vendor_name FROM public.vendors
  WHERE id = p_vendor_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier not found in this company.' USING ERRCODE = '22023';
  END IF;

  -- Fail before anything is written; the posting engine checks again.
  PERFORM public.assert_period_open(p_company_id, p_credit_date);

  -- ---- The bill being credited, if any ------------------------------------
  IF p_bill_id IS NOT NULL THEN
    -- Locked, so two credits cannot both see the same uncredited balance.
    SELECT id, bill_number, vendor_id, status, bill_date, journal_entry_id
      INTO v_bill_found, v_bill_number, v_bill_vendor, v_bill_status, v_bill_date, v_bill_journal
    FROM public.bills
    WHERE id = p_bill_id AND company_id = p_company_id
    FOR UPDATE;
    IF v_bill_found IS NULL THEN
      RAISE EXCEPTION 'Bill not found in this company.' USING ERRCODE = '22023';
    END IF;
    IF v_bill_vendor <> p_vendor_id THEN
      RAISE EXCEPTION 'Bill % belongs to a different supplier.', v_bill_number USING ERRCODE = '22023';
    END IF;
    IF v_bill_status IN ('draft', 'void', 'cancelled') THEN
      RAISE EXCEPTION 'Bill % is % and cannot be credited.', v_bill_number, v_bill_status
        USING ERRCODE = '22023';
    END IF;
    IF p_credit_date < v_bill_date THEN
      RAISE EXCEPTION 'A supplier credit cannot be dated before the bill it credits (% is dated %).',
        v_bill_number, v_bill_date USING ERRCODE = '22023';
    END IF;

    -- Debit the payable the bill actually raised, not merely the first control
    -- account in the chart.
    SELECT jei.account_id INTO v_ap_id
    FROM public.journal_entry_items jei
    JOIN public.chart_of_accounts coa ON coa.id = jei.account_id
    WHERE jei.journal_entry_id = v_bill_journal
      AND jei.type = 'credit'
      AND coa.company_id = p_company_id
      AND coa.type = 'Liability'
      AND coa.account_role = 'trade_payable'
    ORDER BY jei.amount DESC
    LIMIT 1;
  END IF;

  -- The creditors control account is resolved by ROLE, never taken from the
  -- caller: debiting some other liability balances perfectly and silently
  -- corrupts the creditors sub-ledger.
  IF v_ap_id IS NULL THEN
    SELECT id INTO v_ap_id FROM public.chart_of_accounts
    WHERE company_id = p_company_id AND type = 'Liability' AND account_role = 'trade_payable'
    ORDER BY account_number
    LIMIT 1;
  END IF;
  IF v_ap_id IS NULL THEN
    RAISE EXCEPTION 'This company has no trade payable control account mapped in its chart of accounts.'
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

    SELECT id, name, type, account_role INTO v_account FROM public.chart_of_accounts
    WHERE id = NULLIF(v_item->>'account_id', '')::uuid AND company_id = p_company_id;
    IF v_account.id IS NULL THEN
      RAISE EXCEPTION 'Line %: choose the account this credit reverses.', v_index USING ERRCODE = '22023';
    END IF;
    -- A bill debits an expense, or the asset it bought. A credit reverses that
    -- and nothing else: crediting the control account, the bank or VAT here
    -- would post the entry twice on one side and balance while being wrong.
    IF v_account.type NOT IN ('Expense', 'Asset')
       OR COALESCE(v_account.account_role, '') IN
          ('trade_payable', 'trade_receivable', 'bank', 'input_vat', 'output_vat', 'vat_control') THEN
      RAISE EXCEPTION 'Line %: a supplier credit reverses what the bill was bought as, so it must be posted to an expense or asset account, and % is not one.',
        v_index, v_account.name USING ERRCODE = '22023';
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

    -- Rounded per line, the same way the bill's own VAT was rounded, so
    -- crediting a bill in full reverses exactly the VAT it claimed.
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

    v_cost_lines := v_cost_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_account.id,
      'credit', v_line,
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

  -- ---- Input VAT being given back ------------------------------------------
  IF v_tax_total > 0 THEN
    IF p_tax_account_id IS NOT NULL THEN
      SELECT id, name, type, account_role INTO v_tax_account FROM public.chart_of_accounts
      WHERE id = p_tax_account_id AND company_id = p_company_id;
      IF v_tax_account.id IS NULL THEN
        RAISE EXCEPTION 'The VAT account does not belong to this company.' USING ERRCODE = '22023';
      END IF;
      IF COALESCE(v_tax_account.account_role, '') NOT IN ('input_vat', 'vat_control') THEN
        RAISE EXCEPTION 'Input VAT is reversed on the VAT account it was claimed on, and % is not one.',
          v_tax_account.name USING ERRCODE = '22023';
      END IF;
      v_tax_account_id := v_tax_account.id;
    ELSE
      SELECT id INTO v_tax_account_id FROM public.chart_of_accounts
      WHERE company_id = p_company_id AND account_role IN ('input_vat', 'vat_control')
      ORDER BY CASE account_role WHEN 'input_vat' THEN 0 ELSE 1 END, account_number
      LIMIT 1;
      IF v_tax_account_id IS NULL THEN
        RAISE EXCEPTION 'This supplier credit reverses VAT, but no input VAT account is mapped in the chart of accounts.'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  -- ---- Never credit more than was billed ------------------------------------
  IF v_bill_found IS NOT NULL THEN
    v_bill_gross := public.bill_gross_amount(v_bill_found);
    v_already_credited := public.bill_credited_amount(v_bill_found);
    v_creditable := ROUND(v_bill_gross - v_already_credited, 2);
    IF v_total > v_creditable + 0.005 THEN
      IF v_already_credited > 0 THEN
        RAISE EXCEPTION 'Bill % was for %, and % has already been credited against it, so no more than % can be credited now.',
          v_bill_number, ROUND(v_bill_gross, 2), ROUND(v_already_credited, 2), GREATEST(v_creditable, 0)
          USING ERRCODE = '22023';
      END IF;
      RAISE EXCEPTION 'Bill % was for %, so a credit against it cannot be for %.',
        v_bill_number, ROUND(v_bill_gross, 2), v_total USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ---- Number ------------------------------------------------------------
  -- Serialised per company so two clerks cannot be handed the same next number.
  PERFORM pg_advisory_xact_lock(hashtextextended('vendor_credit_number:' || p_company_id::text, 0));
  v_number := NULLIF(btrim(COALESCE(p_credit_number, '')), '');
  IF v_number IS NULL THEN
    v_number := public.vendor_credit_next_number(p_company_id);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vendor_credits
    WHERE company_id = p_company_id AND lower(credit_number) = lower(v_number)
  ) THEN
    RAISE EXCEPTION 'Supplier credit number % is already in use.', v_number USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.vendor_credits (
    company_id, vendor_id, credit_number, credit_date, status, reason, bill_id, created_by
  ) VALUES (
    p_company_id, p_vendor_id, v_number, p_credit_date, 'issued', v_reason, v_bill_found, p_actor_user_id
  )
  RETURNING id INTO v_vc_id;

  -- ---- Post it -------------------------------------------------------------
  v_lines := v_cost_lines;
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_rows)
  LOOP
    IF (v_row->>'tax_amount')::numeric > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_tax_account_id,
        'credit', (v_row->>'tax_amount')::numeric,
        'tax_rate_id', v_row->>'tax_rate_id'
      ));
    END IF;
  END LOOP;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_ap_id, 'debit', v_total));

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id,
    'posting_date', p_credit_date,
    'module', 'accounts_payable',
    'document_type', 'vendor_credit',
    'document_id', v_vc_id,
    'reference', v_number,
    'description', 'Supplier credit ' || v_number
      || COALESCE(' against ' || v_bill_number, '')
      || ': ' || v_reason,
    'created_by', p_actor_user_id,
    'vendor_id', p_vendor_id,
    'lines', v_lines
  ), 'commit');

  v_je_id := NULLIF(v_result->>'journal_id', '')::uuid;
  IF v_je_id IS NULL THEN
    RAISE EXCEPTION 'The supplier credit journal was not created.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.vendor_credits SET journal_entry_id = v_je_id WHERE id = v_vc_id;

  INSERT INTO public.vendor_credit_items (
    vendor_credit_id, product_id, description, quantity, unit_price, tax_rate_id, account_id,
    line_amount, tax_amount, position
  )
  SELECT v_vc_id,
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

  -- ---- Settle the bill it was raised against --------------------------------
  IF v_bill_found IS NOT NULL AND COALESCE(p_apply_to_bill, true) THEN
    v_outstanding := public.bill_outstanding_amount(v_bill_found);
    v_apply := ROUND(LEAST(v_total, GREATEST(v_outstanding, 0)), 2);
    IF v_apply > 0 THEN
      INSERT INTO public.bill_payment_allocations (company_id, bill_id, journal_entry_id, amount, created_by)
      VALUES (p_company_id, v_bill_found, v_je_id, v_apply, p_actor_user_id);
      PERFORM public.bill_refresh_payment_status(v_bill_found);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'vendor_credit_id', v_vc_id,
    'credit_number', v_number,
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

-- ── Applying a supplier credit to bills ────────────────────────────────────

/**
 * p_allocations: [{bill_id, amount}]. Writes allocations against the credit's
 * own journal, so the bills' outstanding balances, statuses and ageing move
 * exactly as they do when a payment settles them.
 */
CREATE OR REPLACE FUNCTION public.apply_vendor_credit_atomic(
  p_company_id uuid,
  p_vendor_credit_id uuid,
  p_allocations jsonb,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vc record;
  v_remaining numeric;
  v_alloc jsonb;
  v_bill_id uuid;
  v_amount numeric;
  v_bill record;
  v_outstanding numeric;
  v_applied_now numeric := 0;
  v_done jsonb := '[]'::jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can apply its supplier credits.'
      USING ERRCODE = '42501';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'Say which bills the credit is applied to.' USING ERRCODE = '22023';
  END IF;

  SELECT id, credit_number, vendor_id, status, journal_entry_id INTO v_vc
  FROM public.vendor_credits
  WHERE id = p_vendor_credit_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_vc.id IS NULL THEN
    RAISE EXCEPTION 'Supplier credit not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_vc.status <> 'issued' THEN
    RAISE EXCEPTION 'Supplier credit % is % and cannot be applied.', v_vc.credit_number, v_vc.status
      USING ERRCODE = '22023';
  END IF;
  IF v_vc.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Supplier credit % was never posted and cannot be applied.', v_vc.credit_number
      USING ERRCODE = '22023';
  END IF;

  v_remaining := ROUND(public.vendor_credit_total(v_vc.id) - public.vendor_credit_applied_amount(v_vc.id), 2);

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_bill_id := NULLIF(v_alloc->>'bill_id', '')::uuid;
    v_amount := ROUND(COALESCE(NULLIF(v_alloc->>'amount', '')::numeric, 0), 2);
    IF v_bill_id IS NULL THEN
      RAISE EXCEPTION 'Every allocation needs a bill.' USING ERRCODE = '22023';
    END IF;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'An allocation must be for a positive amount.' USING ERRCODE = '22023';
    END IF;

    SELECT id, bill_number, vendor_id, status INTO v_bill
    FROM public.bills
    WHERE id = v_bill_id AND company_id = p_company_id
    FOR UPDATE;
    IF v_bill.id IS NULL THEN
      RAISE EXCEPTION 'Bill not found in this company.' USING ERRCODE = '22023';
    END IF;
    IF v_bill.vendor_id <> v_vc.vendor_id THEN
      RAISE EXCEPTION 'Bill % belongs to a different supplier from credit %.',
        v_bill.bill_number, v_vc.credit_number USING ERRCODE = '22023';
    END IF;
    IF v_bill.status IN ('draft', 'void', 'cancelled') THEN
      RAISE EXCEPTION 'Bill % is % and cannot be settled.', v_bill.bill_number, v_bill.status
        USING ERRCODE = '22023';
    END IF;

    v_outstanding := public.bill_outstanding_amount(v_bill.id);
    IF v_amount > v_outstanding + 0.005 THEN
      RAISE EXCEPTION 'Bill % has % outstanding; % cannot be applied to it.',
        v_bill.bill_number, v_outstanding, v_amount USING ERRCODE = '22023';
    END IF;
    IF v_amount > v_remaining + 0.005 THEN
      RAISE EXCEPTION 'Supplier credit % has % left to apply; % cannot be applied.',
        v_vc.credit_number, v_remaining, v_amount USING ERRCODE = '22023';
    END IF;

    -- A second application to the same bill adds to the first: one credit
    -- settles a given bill by one allocation row.
    INSERT INTO public.bill_payment_allocations (company_id, bill_id, journal_entry_id, amount, created_by)
    VALUES (p_company_id, v_bill.id, v_vc.journal_entry_id, v_amount, p_actor_user_id)
    ON CONFLICT ON CONSTRAINT bill_payment_allocations_unique_pair
    DO UPDATE SET amount = public.bill_payment_allocations.amount + EXCLUDED.amount;

    PERFORM public.bill_refresh_payment_status(v_bill.id);

    v_remaining := ROUND(v_remaining - v_amount, 2);
    v_applied_now := ROUND(v_applied_now + v_amount, 2);
    v_done := v_done || jsonb_build_array(jsonb_build_object(
      'bill_id', v_bill.id, 'bill_number', v_bill.bill_number, 'amount', v_amount));
  END LOOP;

  RETURN jsonb_build_object(
    'vendor_credit_id', v_vc.id,
    'applied_now', v_applied_now,
    'applied', ROUND(public.vendor_credit_applied_amount(v_vc.id), 2),
    'remaining', v_remaining,
    'allocations', v_done
  );
END;
$$;

/**
 * Take a credit back off a bill it was applied to by mistake. The credit stays
 * issued and its journal is untouched; only the statement of which bill it
 * settles is withdrawn.
 */
CREATE OR REPLACE FUNCTION public.unapply_vendor_credit_atomic(
  p_company_id uuid,
  p_vendor_credit_id uuid,
  p_bill_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vc record;
  v_removed numeric;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can change its supplier credits.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, credit_number, status, journal_entry_id INTO v_vc
  FROM public.vendor_credits
  WHERE id = p_vendor_credit_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_vc.id IS NULL THEN
    RAISE EXCEPTION 'Supplier credit not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_vc.status <> 'issued' THEN
    RAISE EXCEPTION 'Supplier credit % is %; its applications were already withdrawn when it was voided.',
      v_vc.credit_number, v_vc.status USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.bills WHERE id = p_bill_id AND company_id = p_company_id FOR UPDATE;

  DELETE FROM public.bill_payment_allocations
  WHERE journal_entry_id = v_vc.journal_entry_id
    AND bill_id = p_bill_id
    AND company_id = p_company_id
  RETURNING amount INTO v_removed;

  IF v_removed IS NULL THEN
    RAISE EXCEPTION 'Supplier credit % is not applied to that bill.', v_vc.credit_number
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.bill_refresh_payment_status(p_bill_id);

  RETURN jsonb_build_object(
    'vendor_credit_id', v_vc.id,
    'bill_id', p_bill_id,
    'removed', v_removed,
    'remaining', ROUND(public.vendor_credit_total(v_vc.id) - public.vendor_credit_applied_amount(v_vc.id), 2)
  );
END;
$$;

-- ── Voiding a supplier credit ──────────────────────────────────────────────

/**
 * Reverses the credit's journal through the posting engine, dated today and
 * subject to today's period being open. The reversal trigger on
 * posting_requests removes its allocations and re-derives each bill's status,
 * so the bills it settled are owed again.
 */
CREATE OR REPLACE FUNCTION public.void_vendor_credit_atomic(
  p_company_id uuid,
  p_vendor_credit_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vc record;
  v_reason text;
  v_result jsonb;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users cu WHERE cu.user_id = p_actor_user_id AND cu.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Permission denied: only a member of this company can void its supplier credits.'
      USING ERRCODE = '42501';
  END IF;

  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Say why the supplier credit is being voided.' USING ERRCODE = '22023';
  END IF;

  SELECT id, credit_number, status, journal_entry_id INTO v_vc
  FROM public.vendor_credits
  WHERE id = p_vendor_credit_id AND company_id = p_company_id
  FOR UPDATE;
  IF v_vc.id IS NULL THEN
    RAISE EXCEPTION 'Supplier credit not found in this company.' USING ERRCODE = '22023';
  END IF;
  IF v_vc.status = 'void' THEN
    RAISE EXCEPTION 'Supplier credit % is already void.', v_vc.credit_number USING ERRCODE = '22023';
  END IF;

  v_result := public.posting_engine_rollback(
    'accounts_payable:vendor_credit:' || v_vc.id::text,
    p_company_id,
    'Supplier credit ' || v_vc.credit_number || ' voided: ' || v_reason,
    p_actor_user_id
  );

  UPDATE public.vendor_credits
  SET status = 'void', voided_at = now(), voided_by = p_actor_user_id, void_reason = v_reason
  WHERE id = v_vc.id;

  RETURN jsonb_build_object(
    'vendor_credit_id', v_vc.id,
    'status', 'void',
    'reversal_journal_id', v_result->>'journal_id',
    'reversal_journal_number', v_result->>'journal_number'
  );
END;
$$;

-- ── Service role only: the edge functions authorise the caller first ───────

REVOKE ALL ON FUNCTION public.bill_gross_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bill_allocated_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bill_outstanding_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bill_refresh_payment_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vendor_credit_total(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vendor_credit_applied_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bill_credited_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vendor_credit_settlements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vendor_credit_next_number(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_vendor_credit_atomic(uuid, uuid, date, text, jsonb, uuid, text, uuid, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_vendor_credit_atomic(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unapply_vendor_credit_atomic(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_vendor_credit_atomic(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bill_gross_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bill_allocated_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bill_outstanding_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bill_refresh_payment_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vendor_credit_total(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vendor_credit_applied_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.bill_credited_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vendor_credit_settlements(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vendor_credit_next_number(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.post_vendor_credit_atomic(uuid, uuid, date, text, jsonb, uuid, text, uuid, boolean, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_vendor_credit_atomic(uuid, uuid, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.unapply_vendor_credit_atomic(uuid, uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_vendor_credit_atomic(uuid, uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.pay_specific_bill(uuid, uuid, date, uuid, uuid, numeric, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_specific_bill(uuid, uuid, date, uuid, uuid, numeric, uuid) TO service_role;
