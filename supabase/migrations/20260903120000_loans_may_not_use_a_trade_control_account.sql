-- AdminLess Fin — a loan may not be booked to a trade control account.
--
-- ============================================================================
-- THE PROBLEM
-- ============================================================================
--
-- A live tenant's R1 000 000 loan is mapped to account 4001 "AP", whose
-- account_role is trade_payable — the creditors control account. Every loan
-- movement therefore lands in trade creditors, and the creditors age analysis
-- reports open bills of R2 645 against a control balance of R970 975.
--
-- The age analysis discloses that difference rather than hiding it, so the
-- report is honest. The mapping is still wrong: a control account exists so
-- that its balance equals the sub-ledger it controls. Once anything that is not
-- a trade balance is posted to it, the sub-ledger can never agree with the
-- control account again, and every debtors/creditors reconciliation an auditor
-- performs will carry an unexplained reconciling item.
--
-- The same applies to the debtors side: the loan's payment account is 3000
-- "AR", so R1 084 899 of that tenant's R1 095 814 receivables control balance is
-- also not trade.
--
-- ============================================================================
-- WHAT THIS DOES, AND DELIBERATELY DOES NOT, DO
-- ============================================================================
--
-- DOES     prevent a loan being created against, or moved onto, a trade control
--          account, with an error that says which account and why.
--
-- DOES NOT touch the existing loan or any journal it has already posted.
--          Correcting posted history is a reclassification journal and an
--          accounting decision for the customer, not something a migration
--          should do silently. The existing row is left exactly as it is and is
--          only re-validated if someone edits its account mapping — at which
--          point the correct account must be chosen, which is the right moment
--          to ask.
--
-- Note for that customer: their chart has no borrowings account at all (only
-- VAT Output, AP, and an uncategorised "Due to Owner"), which is why AP was
-- chosen. Creating a non-current "Loans" liability account is the fix, followed
-- by a reclassification journal out of AP.

CREATE OR REPLACE FUNCTION public.loans_reject_trade_control_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_role text;
  v_label text;
BEGIN
  IF NEW.liability_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT account_role,
         COALESCE(account_code, account_number::text) || ' ' || name
    INTO v_role, v_label
  FROM public.chart_of_accounts
  WHERE id = NEW.liability_account_id;

  IF v_role IN ('trade_payable', 'trade_receivable') THEN
    RAISE EXCEPTION
      'Account % is the %s control account and may not hold a loan. A control account must contain only the sub-ledger it controls, otherwise the age analysis can never reconcile to it. Use a borrowings liability account instead.',
      v_label,
      CASE WHEN v_role = 'trade_payable' THEN 'creditors' ELSE 'debtors' END
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.loans_reject_trade_control_account IS
  'Keeps trade control accounts free of non-trade balances, so the debtors and '
  'creditors age analyses can reconcile to them.';

-- INSERT, and UPDATE only when the mapping actually changes: an existing loan
-- that is already mis-mapped is not re-validated by unrelated edits.
DROP TRIGGER IF EXISTS trg_loans_reject_trade_control_account ON public.loans;
CREATE TRIGGER trg_loans_reject_trade_control_account
  BEFORE INSERT OR UPDATE OF liability_account_id
  ON public.loans
  FOR EACH ROW
  WHEN (NEW.liability_account_id IS NOT NULL)
  EXECUTE FUNCTION public.loans_reject_trade_control_account();
