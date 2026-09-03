-- Corrects the wording of the loan control-account guard.
--
-- RAISE EXCEPTION uses % as its placeholder, not %s. The previous message
-- therefore substituted the argument for the % and left the s behind, reading
-- "is the creditorss control account". Behaviour is unchanged; only the
-- sentence the user is shown is fixed.

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
      'Account % is the % control account and may not hold a loan. A control account must contain only the sub-ledger it controls, otherwise the age analysis can never reconcile to it. Use a borrowings liability account instead.',
      v_label,
      CASE WHEN v_role = 'trade_payable' THEN 'creditors' ELSE 'debtors' END
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;
