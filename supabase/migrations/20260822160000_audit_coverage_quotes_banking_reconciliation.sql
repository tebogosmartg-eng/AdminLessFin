-- AdminLess Fin — close the audit-trail coverage gaps.
--
-- The generic audit_logs trigger already covers 19 tables (customers, invoices,
-- bills, journal_entries, chart_of_accounts, products, vendors, ...). Empirical
-- sampling of audit_logs showed four required business events produce NO audit
-- record at all:
--
--   quotes / quote_items   quotation creation and amendment
--   bank_transactions      money recorded against a bank account
--   journal_entry_items    UPDATE — how a reconciliation marks lines cleared
--                          (INSERT and DELETE were covered; UPDATE was not, so
--                          reconciling left no trace)
--
-- This migration attaches the SAME trigger function the covered tables already
-- use — discovered from the catalog rather than reimplemented — so the envelope
-- (table_name, record_id, operation, old_data, new_data, changed_by, company_id)
-- stays identical and the existing Audit Trail readers need no special cases.
--
-- SAFETY: additive and idempotent. It writes no business data, changes no
-- balance, and adds no table. Audit rows remain insert-only to normal users:
-- this migration does not grant any new privilege on audit_logs.

DO $$
DECLARE
  v_audit_fn regproc;
  v_target text;
  v_targets text[] := ARRAY['quotes', 'quote_items', 'bank_transactions'];
BEGIN
  -- Discover the audit trigger function from a table known to be covered.
  SELECT p.oid::regproc INTO v_audit_fn
  FROM pg_trigger t
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'customers'
    AND NOT t.tgisinternal
    AND p.proname ILIKE '%audit%'
  LIMIT 1;

  IF v_audit_fn IS NULL THEN
    RAISE NOTICE 'No audit trigger function found on public.customers — audit coverage NOT extended.';
    RETURN;
  END IF;

  RAISE NOTICE 'Extending audit coverage using %', v_audit_fn;

  -- ── Tables with no audit coverage at all ────────────────────────────────
  FOREACH v_target IN ARRAY v_targets LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_target
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s_trigger ON public.%1$I', v_target);
      EXECUTE format(
        'CREATE TRIGGER audit_%1$s_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
           FOR EACH ROW EXECUTE FUNCTION %2$s()',
        v_target, v_audit_fn
      );
      RAISE NOTICE '  audit coverage added: %', v_target;
    ELSE
      RAISE NOTICE '  skipped (table absent): %', v_target;
    END IF;
  END LOOP;

  -- ── journal_entry_items: UPDATE only ────────────────────────────────────
  -- A separate trigger so the existing INSERT/DELETE trigger is left exactly as
  -- certified. Marking lines reconciled is an UPDATE, which is why finishing a
  -- reconciliation previously left no audit record.
  DROP TRIGGER IF EXISTS audit_journal_entry_items_update_trigger ON public.journal_entry_items;
  EXECUTE format(
    'CREATE TRIGGER audit_journal_entry_items_update_trigger
       AFTER UPDATE ON public.journal_entry_items
       FOR EACH ROW EXECUTE FUNCTION %s()',
    v_audit_fn
  );
  RAISE NOTICE '  audit coverage added: journal_entry_items (UPDATE)';
END $$;

COMMENT ON TABLE public.audit_logs IS
  'Append-only audit trail. Covers accounting tables (journal_entries, '
  'journal_entry_items incl. reconciliation UPDATEs, chart_of_accounts, '
  'financial_years, accounting_periods, posting_requests) and business tables '
  '(customers, vendors, invoices, bills, quotes, quote_items, products, '
  'bank_transactions, employees, fixed_assets, expense_claims, ...). Written by '
  'trigger only; normal users never write or edit it directly.';
