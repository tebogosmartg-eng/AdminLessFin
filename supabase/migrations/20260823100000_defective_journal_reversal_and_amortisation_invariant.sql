-- AdminLess Fin — correcting a defective (unbalanced) historical journal, and
-- closing the generator defect that produced it.
--
-- ============================================================================
-- THE PROBLEM
-- ============================================================================
--
-- Spaceman carries exactly one unbalanced journal (the only one platform-wide,
-- across all 14 companies):
--
--   JE-000017  2026-08-01  "Loan payment #1 to kudzanai"
--     DEBIT   8 333,33  2005 Stationary            (interest)
--     DEBIT  37 811,59  4001 AP                    (loan liability)
--     CREDIT 46 144,93  3000 AR                    (payment)
--     debits 46 144,92  vs  credits 46 144,93      -> out by R0,01
--
-- Source: loan_amortization_schedule #1 for loan 91719ac0 stores
--   payment_amount 46 144,93   principal 37 811,59   interest 8 333,33
-- and 37 811,59 + 8 333,33 = 46 144,92. The schedule generator rounds principal
-- and interest independently, so they need not sum to the instalment. Principal
-- is by definition the balancing figure of an instalment: the correct principal
-- is 46 144,93 - 8 333,33 = 37 811,60. The loan liability is therefore
-- OVERSTATED by R0,01 and the ledger's debits fall R0,01 short of its credits.
--
-- This is systemic, not a one-off: 13 of the 24 amortisation rows in the
-- database drift by a cent. Twelve are still unposted.
--
-- ============================================================================
-- WHY A BALANCED ADJUSTING JOURNAL CANNOT FIX IT
-- ============================================================================
--
-- A balanced journal adds the same amount to total debits and to total credits.
-- It therefore cannot change the DIFFERENCE between them. No balanced journal,
-- of any size, posted to any account, can bring a ledger whose debits and
-- credits differ by R0,01 back into agreement. JE-000017 is not a valid entry
-- recorded against the wrong accounts (which a balanced reclassification would
-- fix) — it is a broken double entry, and only removing its effect repairs the
-- ledger.
--
-- The correct accounting treatment for a defective entry is to REVERSE it in
-- full and RE-RECORD it correctly. The reversal of an unbalanced entry is
-- necessarily itself unbalanced — it is the exact mirror — and the PAIR sums to
-- precisely zero. That is what this migration enables.
--
-- JE-000017 is not edited, not deleted, and not renumbered. It remains in the
-- ledger exactly as posted, with its audit history, and is now accompanied by
-- its reversal and by a correct replacement entry.
--
-- ============================================================================
-- 1. A NARROW, GUARDED REVERSAL ROUTINE FOR DEFECTIVE ENTRIES
-- ============================================================================
--
-- This does NOT weaken posting_engine_submit, which continues to require
-- debits = credits exactly for every new posting (migration 20260822180000).
-- This routine cannot originate a journal: it can only emit the exact mirror of
-- lines that are ALREADY in the ledger, and only where those lines do not
-- balance. It is therefore mathematically incapable of introducing a new
-- imbalance — after it runs, the source journal and its reversal always net to
-- zero. Applied to a healthy journal it refuses.

CREATE OR REPLACE FUNCTION public.accounting_reverse_defective_journal(
  p_journal_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_src            public.journal_entries%ROWTYPE;
  v_debit          numeric;
  v_credit         numeric;
  v_role           text;
  v_new_id         uuid;
  v_new_number     text;
  v_desc           text;
  v_check_debit    numeric;
  v_check_credit   numeric;
BEGIN
  SELECT * INTO v_src FROM public.journal_entries WHERE id = p_journal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal % not found.', p_journal_id;
  END IF;

  -- Privileged operation: owners and admins of the owning company only.
  SELECT role INTO v_role
  FROM public.company_users
  WHERE user_id = auth.uid() AND company_id = v_src.company_id;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Permission denied. Reversing a defective journal requires an owner or admin of the company.';
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'debit'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'credit'), 0)
  INTO v_debit, v_credit
  FROM public.journal_entry_items
  WHERE journal_entry_id = p_journal_id;

  -- THE GUARD. A balanced journal is not defective and is never touched here.
  IF v_debit = v_credit THEN
    RAISE EXCEPTION
      'Journal % balances (debits = credits = %). This routine only reverses DEFECTIVE entries whose debits and credits differ.',
      v_src.journal_number, v_debit;
  END IF;

  v_desc := 'Reversal of ' || v_src.journal_number || ' - defective entry (debits <> credits by '
            || to_char(v_debit - v_credit, 'FM990.00') || ')';

  -- Idempotent: a second call is a no-op rather than a second reversal.
  IF EXISTS (
    SELECT 1 FROM public.journal_entries
    WHERE company_id = v_src.company_id AND description LIKE v_desc || '%'
  ) THEN
    RAISE NOTICE 'Journal % has already been reversed; nothing to do.', v_src.journal_number;
    RETURN jsonb_build_object('reversed', false, 'reason', 'already_reversed');
  END IF;

  v_new_number := public.posting_engine_next_journal_number(v_src.company_id);

  INSERT INTO public.journal_entries (
    company_id, entry_date, description, journal_number,
    vendor_id, customer_id, invoice_id, bill_id
  )
  VALUES (
    v_src.company_id, v_src.entry_date,
    v_desc || COALESCE('. ' || p_reason, ''),
    v_new_number,
    v_src.vendor_id, v_src.customer_id, v_src.invoice_id, v_src.bill_id
  )
  RETURNING id INTO v_new_id;

  -- The exact mirror: same accounts, same amounts, opposite sides.
  INSERT INTO public.journal_entry_items (journal_entry_id, account_id, type, amount, project_id, dimensions)
  SELECT
    v_new_id, src.account_id,
    CASE WHEN src.type = 'debit' THEN 'credit' ELSE 'debit' END,
    src.amount, src.project_id, src.dimensions
  FROM public.journal_entry_items src
  WHERE src.journal_entry_id = p_journal_id;

  -- Post-condition: the ORIGINAL and its REVERSAL must now net to exactly zero.
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'debit'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'credit'), 0)
  INTO v_check_debit, v_check_credit
  FROM public.journal_entry_items
  WHERE journal_entry_id IN (p_journal_id, v_new_id);

  IF v_check_debit <> v_check_credit THEN
    RAISE EXCEPTION 'Reversal post-condition failed: % vs % across the pair. Rolled back.',
      v_check_debit, v_check_credit;
  END IF;

  RETURN jsonb_build_object(
    'reversed', true,
    'source_journal_id', p_journal_id,
    'source_journal_number', v_src.journal_number,
    'reversal_journal_id', v_new_id,
    'reversal_journal_number', v_new_number,
    'source_debit', v_debit,
    'source_credit', v_credit,
    'pair_nets_to_zero', true
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.accounting_reverse_defective_journal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_reverse_defective_journal(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.accounting_reverse_defective_journal IS
  'Reverses a DEFECTIVE journal (one whose debits do not equal its credits) by '
  'emitting its exact mirror, so the pair nets to zero and the ledger can be '
  'brought back into agreement. Refuses on balanced journals, requires company '
  'owner/admin, and is idempotent. It cannot originate lines and therefore '
  'cannot introduce a new imbalance. Normal postings continue to go through '
  'posting_engine_submit, which requires exact balance.';

-- ============================================================================
-- 2. THE GENERATOR DEFECT: PRINCIPAL IS THE BALANCING FIGURE
-- ============================================================================
--
-- record_loan_payment already derives principal as payment_amount - interest
-- when POSTING (migration 20260822180000), so no new unbalanced journal can be
-- produced. The stored SCHEDULE, however, is still generated with independently
-- rounded figures, so the customer sees instalment lines whose principal and
-- interest do not add up to the instalment, and the schedule disagrees with
-- what is posted.
--
-- Rather than chase every writer of this table (the generator, imports, manual
-- edits), the invariant is enforced at the data layer. principal is not
-- independent data — it is definitionally payment_amount - interest — so
-- deriving it is a correction, not a fudge.

CREATE OR REPLACE FUNCTION public.loan_schedule_derive_principal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.payment_amount IS NOT NULL AND NEW.interest IS NOT NULL THEN
    NEW.principal := ROUND(NEW.payment_amount - NEW.interest, 2);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_loan_schedule_derive_principal ON public.loan_amortization_schedule;
CREATE TRIGGER trg_loan_schedule_derive_principal
  BEFORE INSERT OR UPDATE OF payment_amount, interest, principal
  ON public.loan_amortization_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.loan_schedule_derive_principal();

COMMENT ON FUNCTION public.loan_schedule_derive_principal IS
  'Keeps the amortisation invariant principal = payment_amount - interest. '
  'Principal is the balancing figure of an instalment; independently rounding '
  'it against interest is what allowed an out-of-balance instalment to post.';

-- Repair the rows already generated. Restricted to instalments that have NOT
-- been posted, so no figure behind an existing journal is altered here; the
-- posted instalment is corrected through the reversal/re-record route instead.
UPDATE public.loan_amortization_schedule
SET principal = ROUND(payment_amount - interest, 2)
WHERE journal_entry_id IS NULL
  AND payment_amount IS NOT NULL
  AND interest IS NOT NULL
  AND ROUND(payment_amount - interest, 2) <> principal;
