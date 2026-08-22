-- AdminLess Fin — a reversal must belong to the same party as what it reverses.
--
-- ============================================================================
-- THE DEFECT
-- ============================================================================
--
-- Voiding a bill marks it void and posts an equal-and-opposite journal, but the
-- supplier goes on owing the money. Reproduced on production:
--
--   bill VOIDTEST-... R750 to a fresh supplier
--   AP balance before void: 750
--   void: HTTP 200, bill status -> void, reversal journal posted
--   AP balance after  void: 750        <-- still owed
--
-- posting_engine_rollback creates the reversal with:
--
--   INSERT INTO journal_entries (company_id, entry_date, description, journal_number)
--
-- and nothing else. The reversal therefore carries no vendor_id and no
-- customer_id. get_vendor_ap_balances and get_customer_ar_balances attribute
-- movements by journal_entries.vendor_id / customer_id and explicitly skip rows
-- where it IS NULL, so the original bill (attributed) reduces nothing and the
-- reversal (unattributed) is invisible. The control account is correct in the
-- trial balance; only the SUB-LEDGER by party is wrong.
--
-- This is a regression, not an original gap. The legacy void path that the
-- posting engine replaced did carry the attribution:
--
--   .insert({ ..., vendor_id: jeData.vendor_id })   (bills VOID fallback)
--
-- so bills voided before the migration reverse correctly and bills voided after
-- it do not.
--
-- The same defect applies to every module that rolls back a posting, so it is
-- fixed once, in the engine, rather than per caller: a voided customer invoice
-- would equally have left the customer's AR balance overstated.
--
-- ============================================================================
-- WHAT IS AND IS NOT COPIED
-- ============================================================================
--
--   vendor_id, customer_id   COPIED. These say WHO the entry relates to. A
--                            reversal of vendor X's bill is vendor X's entry.
--
--   bill_id, invoice_id      NOT COPIED. These are document links used to find
--                            "the journal that posted this document". Copying
--                            them would make two journals answer to one
--                            document and break single-row lookups.
--
-- Amounts, accounts, sides, dates and journal numbers are untouched. This adds
-- the attribution that was missing; it changes no figure in the ledger.

CREATE OR REPLACE FUNCTION public.posting_engine_rollback(
  p_idempotency_key text,
  p_company_id uuid,
  p_reason text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_original record;
  v_source_je record;
  v_erp jsonb;
  v_reversal_key text;
  v_je_id uuid;
  v_journal_number text;
  v_line record;
  v_fy_id uuid;
  v_ap_id uuid;
  v_request_id uuid;
BEGIN
  IF p_actor_user_id IS NOT NULL THEN
    v_erp := public.resolve_erp_context(p_actor_user_id, p_company_id);
  ELSIF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id) THEN
    RAISE EXCEPTION 'posting_engine_rollback: company not found' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_original FROM posting_requests
    WHERE company_id = p_company_id AND idempotency_key = p_idempotency_key;

  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'posting_engine_rollback: no posting found for idempotency key %', p_idempotency_key
      USING ERRCODE = '22023';
  END IF;
  IF v_original.status <> 'committed' THEN
    RAISE EXCEPTION 'posting_engine_rollback: posting % is % — only a committed posting can be reversed', p_idempotency_key, v_original.status
      USING ERRCODE = '22023';
  END IF;

  v_reversal_key := 'reversal:' || v_original.id::text;
  IF EXISTS (SELECT 1 FROM posting_requests WHERE company_id = p_company_id AND idempotency_key = v_reversal_key AND status = 'committed') THEN
    RAISE EXCEPTION 'posting_engine_rollback: posting % has already been reversed', p_idempotency_key USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_period_open(p_company_id, CURRENT_DATE);

  -- The journal being reversed, for its party attribution.
  SELECT vendor_id, customer_id INTO v_source_je
  FROM journal_entries WHERE id = v_original.journal_entry_id;

  v_journal_number := public.posting_engine_next_journal_number(p_company_id);

  INSERT INTO journal_entries (
    company_id, entry_date, description, journal_number,
    vendor_id, customer_id
  )
  VALUES (
    p_company_id, CURRENT_DATE,
    'Reversal of ' || COALESCE(v_original.journal_number, v_original.id::text) || COALESCE(': ' || p_reason, ''),
    v_journal_number,
    v_source_je.vendor_id, v_source_je.customer_id
  )
  RETURNING id INTO v_je_id;

  -- project_id and dimensions are carried too: without them a voided document
  -- keeps inflating project and dimensional reporting even though the control
  -- account nets to zero.
  FOR v_line IN
    SELECT account_id, type, amount, project_id, dimensions
    FROM journal_entry_items WHERE journal_entry_id = v_original.journal_entry_id
  LOOP
    INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount, project_id, dimensions)
    VALUES (
      v_je_id, v_line.account_id,
      CASE WHEN v_line.type = 'debit' THEN 'credit' ELSE 'debit' END,
      v_line.amount, v_line.project_id, COALESCE(v_line.dimensions, '{}'::jsonb)
    );
  END LOOP;

  SELECT financial_year_id, accounting_period_id INTO v_fy_id, v_ap_id FROM journal_entries WHERE id = v_je_id;

  INSERT INTO posting_requests (
    company_id, idempotency_key, module, document_type, document_id, reference, description,
    created_by, status, journal_entry_id, journal_number, financial_year_id, accounting_period_id,
    reversal_of_id, committed_at
  ) VALUES (
    p_company_id, v_reversal_key, v_original.module, v_original.document_type, v_original.document_id,
    v_original.reference, 'Reversal: ' || COALESCE(p_reason, 'no reason given'),
    p_actor_user_id, 'committed', v_je_id, v_journal_number, v_fy_id, v_ap_id, v_original.id, now()
  ) RETURNING id INTO v_request_id;

  UPDATE posting_requests SET status = 'reversed' WHERE id = v_original.id;

  RETURN jsonb_build_object(
    'journal_id', v_je_id, 'journal_number', v_journal_number, 'posting_status', 'committed',
    'financial_year_id', v_fy_id, 'accounting_period_id', v_ap_id, 'timestamp', now(),
    'warnings', '[]'::jsonb, 'posting_request_id', v_request_id, 'reverses_journal_id', v_original.journal_entry_id
  );
END;
$fn$;

COMMENT ON FUNCTION public.posting_engine_rollback IS
  'ERP V2.0 Phase 2: reverses a committed posting via an equal-and-opposite '
  'journal (Rollback Mode). Never mutates or deletes the original. The reversal '
  'carries the source journal''s vendor_id/customer_id so the party sub-ledger '
  'clears with the control account, and its project_id/dimensions so project '
  'reporting clears too.';

-- ============================================================================
-- REPAIR THE REVERSALS ALREADY POSTED WITHOUT ATTRIBUTION
-- ============================================================================
--
-- Every document voided through the posting engine since the regression has an
-- unattributed reversal, so its supplier or customer still shows the amount as
-- outstanding. This records the party those reversals always belonged to,
-- copied from the journal each one reverses.
--
-- No amount, account, side, date or journal number is altered, and no journal
-- is created or removed. Only rows that ARE posting-engine reversals, that have
-- NO party recorded, and whose source journal HAS one, are touched.

UPDATE public.journal_entries je
SET vendor_id = src.vendor_id,
    customer_id = src.customer_id
FROM public.posting_requests rev
JOIN public.posting_requests orig ON orig.id = rev.reversal_of_id
JOIN public.journal_entries src ON src.id = orig.journal_entry_id
WHERE je.id = rev.journal_entry_id
  AND rev.reversal_of_id IS NOT NULL
  AND je.vendor_id IS NULL
  AND je.customer_id IS NULL
  AND (src.vendor_id IS NOT NULL OR src.customer_id IS NOT NULL);
