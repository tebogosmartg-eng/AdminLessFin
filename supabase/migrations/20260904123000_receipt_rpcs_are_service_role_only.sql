-- ============================================================================
-- The receipt RPCs are reachable only through the edge function.
--
-- record_customer_receipt_atomic validates the customer, the invoices and the
-- accounts against the company it is given -- but it does not, and should not,
-- decide whether the CALLER may act for that company. That check belongs to the
-- edge function, which reads company_users for the authenticated user.
--
-- Granting the function to `authenticated` therefore handed any signed-in user
-- a way past that check: pass someone else's company_id and post a receipt into
-- their books. The same applies to the read helpers, which take an invoice id
-- and, being SECURITY DEFINER, would answer for any company's invoice.
--
-- So they are service_role only. The UI gets what it needs through the payments
-- function, which authorises first.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.record_customer_receipt_atomic(
  uuid, uuid, date, uuid, numeric, jsonb, text, text, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_gross_amount(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_allocated_amount(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoice_outstanding_amount(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.receipt_allocated_total(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.receipt_allocations_json(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.record_customer_receipt_atomic(
  uuid, uuid, date, uuid, numeric, jsonb, text, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_gross_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_allocated_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_outstanding_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_allocated_total(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.receipt_allocations_json(uuid) TO service_role;
