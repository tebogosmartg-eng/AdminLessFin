-- ============================================================================
-- AdminLess Fin — readiness is derived; an exception is recorded, not implied.
--
-- WHAT WAS WRONG
-- The accounting-setup edge function evaluated readiness correctly and then
-- overrode it:
--
--     const preserveReady = row.status === 'READY' || row.status === 'LOCKED';
--     const accountingReady = preserveReady ? true : evaluation.accountingReady;
--
-- A company that had ever been READY stayed READY forever, while the same
-- response carried the live steps, progress and errors. One payload said both
-- things, so screens disagreed depending on which field they read: the
-- dashboard hid the setup card because "ready" was true, and Accounting Setup
-- showed 67% with incomplete steps under a READY badge.
--
-- On 2026-09-22 four companies were in that state, including a live client with
-- no equity account at all and a company with no tax configuration.
--
-- WHY NOT JUST DELETE IT
-- The ratchet did one real job: it kept the operational modules (invoices,
-- banking, payroll, journals) open for companies that had been using them. For
-- the live client, finishing setup is a bookkeeping engagement -- its chart
-- lacks equity, fixed asset, stock and payroll accounts, and those transactions
-- were posted elsewhere -- not something a migration should invent. Deleting
-- the ratchet outright would lock it out of invoicing today.
--
-- WHAT THIS DOES
-- Separates the two things one boolean was doing:
--
--   * the STATUS -- always the live evaluation, on every screen;
--   * whether the MODULES OPEN -- setup complete, or an exception that is
--     RECORDED here with a reason, a date and who granted it, and shown
--     wherever the status is shown.
--
-- Every company the ratchet was protecting gets that exception now, so nobody
-- loses access. The edge function clears it the first time a company's setup
-- is genuinely complete, so a later regression gates again instead of being
-- hidden. Companies already genuinely ready have theirs cleared on their next
-- status check.
--
-- Also drops get_balances_as_of_date(date): a one-argument overload that
-- resolved the company from profiles.active_company_id and returned NOTHING
-- when that was null -- a silent wrong answer. No code or database function
-- calls it; every caller passes the company.
-- ============================================================================

ALTER TABLE public.accounting_readiness
  ADD COLUMN IF NOT EXISTS modules_unlocked_by_exception boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exception_reason text,
  ADD COLUMN IF NOT EXISTS exception_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS exception_granted_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.accounting_readiness.modules_unlocked_by_exception IS
  'Keeps the operational modules open while setup is incomplete. Recorded, never implied; cleared automatically once setup is genuinely complete.';

-- The companies the ratchet was protecting: marked READY in the cache. Their
-- modules stay open, now for a stated reason instead of an invisible one.
UPDATE public.accounting_readiness
SET modules_unlocked_by_exception = true,
    exception_reason = 'Recorded on 2026-09-22 when accounting readiness became derived from the books. '
      || 'This company had been marked ready before it was checked, so its modules were kept open. '
      || 'Accounting Setup lists what is still outstanding; this exception clears itself once setup is complete.',
    exception_granted_at = now(),
    exception_granted_by = NULL
WHERE status = 'READY'
  AND modules_unlocked_by_exception = false;

DROP FUNCTION IF EXISTS public.get_balances_as_of_date(date);

-- ---------------------------------------------------------------------------
-- Tenant isolation for the facts layer.
--
-- 20260922160000 granted accounting_facts() and financial_year_current() to
-- `authenticated`. Both are SECURITY DEFINER and take a company id without
-- checking membership, so any signed-in user could read another company's
-- chart, calendar, tax and ledger facts. Only the edge functions call them, and
-- they do so with the service role after authorising the request.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.accounting_facts(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.financial_year_current(uuid) FROM authenticated;
