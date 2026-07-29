-- AdminLess Fin — Chart of Accounts: system-account immutability guard
--
-- Closes a real integrity gap: system accounts (system_account = true) are the
-- deterministic anchors every module posts to (Retained Earnings, VAT Control,
-- AR/AP control, etc.). Until now nothing at the database level stopped an admin
-- (or a bug) from deleting one or changing its identity, which would silently
-- break posting, reporting and the trial balance.
--
-- Enterprise behaviour enforced here (matches SAP/NetSuite/Sage Intacct):
--   • Cannot delete a system account.
--   • Cannot change its type, account_role, system flag, or control flag.
--   • MAY still rename it, change its account_code/description, reorder it, and
--     deactivate it (is_active = false) — display and lifecycle stay flexible.
--
-- Backward-compatible: only rows with system_account = true are affected; every
-- ordinary account keeps full CRUD. Additive (new function + trigger); no data
-- is rewritten. The BEFORE trigger fires for all callers including the service
-- role, so the rule cannot be bypassed by an edge function.

CREATE OR REPLACE FUNCTION public.chart_of_accounts_protect_system()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.system_account, false) THEN
      RAISE EXCEPTION
        'System account "%" (role %) cannot be deleted. Deactivate it instead (set is_active = false).',
        OLD.name, COALESCE(OLD.account_role, 'unassigned')
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE path: protect the identity of system accounts only.
  IF COALESCE(OLD.system_account, false) THEN
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      RAISE EXCEPTION 'Cannot change the account type of system account "%".', OLD.name
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.account_role IS DISTINCT FROM OLD.account_role THEN
      RAISE EXCEPTION 'Cannot change the account role of system account "%".', OLD.name
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF COALESCE(NEW.system_account, false) IS DISTINCT FROM COALESCE(OLD.system_account, false) THEN
      RAISE EXCEPTION 'Cannot clear the system flag on account "%".', OLD.name
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF COALESCE(NEW.control_account, false) IS DISTINCT FROM COALESCE(OLD.control_account, false) THEN
      RAISE EXCEPTION 'Cannot change the control-account flag on system account "%".', OLD.name
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.chart_of_accounts_protect_system IS
  'Guards system accounts: blocks DELETE and blocks changes to type/account_role/system_account/control_account. Rename, code, description, reorder and deactivate remain allowed.';

DROP TRIGGER IF EXISTS trg_chart_of_accounts_protect_system ON public.chart_of_accounts;
CREATE TRIGGER trg_chart_of_accounts_protect_system
  BEFORE UPDATE OR DELETE ON public.chart_of_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.chart_of_accounts_protect_system();
