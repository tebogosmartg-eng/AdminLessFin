-- AdminLess Fin V17.1 — Period-lock enforcement + journal balance guard
-- Reuses the existing closed_financial_years architecture (no new period concept).
-- Applied before 20260722180000_eim_v171_atomic_sales_inventory_bridge.sql, which
-- calls assert_period_open() directly from the new atomic RPCs.

-- ── Period lock guard ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_period_open(p_company_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed record;
BEGIN
  IF p_company_id IS NULL OR p_date IS NULL THEN
    RETURN;
  END IF;

  SELECT start_date, end_date INTO v_closed
  FROM closed_financial_years
  WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot post to %: this date falls within a closed financial year (% to %). Reopen the financial year or choose a different date.',
      p_date, v_closed.start_date, v_closed.end_date
      USING ERRCODE = '2200G';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_period_open IS
  'V17.1: Raises if p_date falls inside a closed_financial_years range for the company. Reused by every GL/inventory posting trigger and RPC.';

-- One trigger on journal_entries covers every posting path that creates a journal
-- entry (invoices, bills, assets, payroll, manual entries, and the new inventory RPCs)
-- without having to edit each caller individually.
CREATE OR REPLACE FUNCTION public.trg_assert_journal_entry_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_period_open(NEW.company_id, NEW.entry_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eim_v171_period_lock ON public.journal_entries;
CREATE TRIGGER eim_v171_period_lock
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assert_journal_entry_period_open();

-- Defense-in-depth for inventory movements without a GL line (e.g. stock transfers).
CREATE OR REPLACE FUNCTION public.trg_assert_inventory_transaction_period_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_period_open(NEW.company_id, NEW.transaction_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS eim_v171_period_lock ON public.inventory_transactions;
CREATE TRIGGER eim_v171_period_lock
  BEFORE INSERT ON public.inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_assert_inventory_transaction_period_open();

-- ── Journal balance guard ─────────────────────────────────────────────────────
-- Deferred to COMMIT so a function can insert several unbalanced-so-far lines and
-- only needs to balance by the time its transaction ends. Any journal_entries row
-- left unbalanced at commit rolls back the *entire* transaction — the "no partial
-- writes" guarantee, applied database-wide rather than trusted per-RPC.

CREATE OR REPLACE FUNCTION public.check_journal_entry_balances()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_journal_entry_id uuid;
  v_debits numeric;
  v_credits numeric;
BEGIN
  v_journal_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  IF v_journal_entry_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'debit'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'credit'), 0)
  INTO v_debits, v_credits
  FROM journal_entry_items
  WHERE journal_entry_id = v_journal_entry_id;

  IF ABS(v_debits - v_credits) > 0.01 THEN
    RAISE EXCEPTION 'Journal entry % does not balance: debits % vs credits %',
      v_journal_entry_id, v_debits, v_credits
      USING ERRCODE = '22000';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS eim_v171_journal_balance_guard ON public.journal_entry_items;
CREATE CONSTRAINT TRIGGER eim_v171_journal_balance_guard
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entry_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_journal_entry_balances();

GRANT EXECUTE ON FUNCTION public.assert_period_open(uuid, date) TO authenticated, service_role;
