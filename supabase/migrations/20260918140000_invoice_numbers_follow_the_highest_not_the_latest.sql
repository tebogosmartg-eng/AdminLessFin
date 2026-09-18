-- ============================================================================
-- AdminLess Fin — the next invoice number is the one after the highest, not
-- the one after whatever was saved last.
--
-- WHAT WAS WRONG
-- get_next_invoice_number_for_user() read the MOST RECENTLY CREATED invoice and
-- took the number from that:
--
--     SELECT invoice_number ... ORDER BY created_at DESC LIMIT 1
--     next_number := COALESCE(substring(last FROM 'INV-(\d+)')::integer, 0) + 1
--
-- Three faults follow from those two lines:
--
--   1. If the last invoice saved was not an "INV-#####" -- a converted document,
--      an imported reference, a timestamp-style number -- the substring is NULL,
--      COALESCE makes it 0, and the routine offers INV-00001. In every company
--      that has ever raised an invoice, INV-00001 is taken, so saving fails with
--      a duplicate key and the invoice form cannot be used at all.
--
--      Live when this was written: Spaceman (newest DOC-1789647111989, offered
--      INV-00001, correct INV-00123), My's Company (PXI525510 -> INV-00001,
--      correct INV-00002), and CERT TX 1785230675937 (PDV3-1785393572273 ->
--      INV-00001, correct INV-00007).
--
--   2. ::integer overflows on any numeric run above 2 147 483 647, so a
--      timestamp-style reference raised 22003 instead of an invoice number.
--
--   3. It resolved the company from profiles.active_company_id -- the company
--      the user happens to have selected -- rather than the company the request
--      was for. Asking for one company's next number could answer for another.
--
-- The same defect was fixed for quotation numbers in
-- 20260918122633_quote_numbers_unique_and_sequential.sql. This is the invoice
-- side of it.
--
-- WHAT THIS DOES
--   * invoice_next_number(company) -- the highest INV-##### in THAT company,
--     plus one, matched with a bounded digit run so a timestamp reference can
--     neither drive the sequence nor overflow it. The company is an argument,
--     never inferred.
--   * get_next_invoice_number_for_user() keeps its name and its no-argument
--     shape so nothing that calls it breaks, and now delegates to it.
--
-- No invoice is renumbered. This changes only what is OFFERED for the next one.
-- ============================================================================

/**
 * The next 'INV-#####' for a company: one past the highest already used.
 *
 * Only numbers of the exact form INV-<1..9 digits> count towards the sequence.
 * A company that also raises DOC-… or imported references keeps its INV run
 * intact, and a 13-digit timestamp cannot become the next number -- which is
 * both what a clerk expects and what stops the bigint from being asked to hold
 * something it cannot.
 */
CREATE OR REPLACE FUNCTION public.invoice_next_number(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'INV-' || lpad(
    (COALESCE(MAX(substring(invoice_number FROM '^INV-(\d{1,9})$')::bigint), 0) + 1)::text,
    5, '0')
  FROM public.invoices
  WHERE company_id = p_company_id;
$$;

COMMENT ON FUNCTION public.invoice_next_number IS
  'Next INV-##### for one company: one past the HIGHEST such number, not one past the most recently created invoice.';

/**
 * Unchanged contract for the caller that has no company to hand: the invoices
 * edge function passes the company explicitly and calls invoice_next_number
 * directly, but this keeps working for anything that does not.
 */
CREATE OR REPLACE FUNCTION public.get_next_invoice_number_for_user()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  IF v_company_id IS NULL THEN
    RETURN 'INV-00001';
  END IF;
  RETURN public.invoice_next_number(v_company_id);
END;
$$;

COMMENT ON FUNCTION public.get_next_invoice_number_for_user IS
  'The active company''s next invoice number. Delegates to invoice_next_number; kept for callers that pass no company.';

REVOKE ALL ON FUNCTION public.invoice_next_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_next_number(uuid) TO service_role;
