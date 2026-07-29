-- Phase 4B — Enterprise Accountant Experience
-- READ PERFORMANCE ONLY. No Posting Engine / Banking / Quick Capture changes.

CREATE INDEX IF NOT EXISTS idx_jei_account_id_amount
  ON public.journal_entry_items (account_id, amount DESC);

CREATE INDEX IF NOT EXISTS idx_je_company_created
  ON public.journal_entries (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pr_company_committed
  ON public.posting_requests (company_id, committed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_coa_company_type_number
  ON public.chart_of_accounts (company_id, type, account_number);

CREATE INDEX IF NOT EXISTS idx_je_vendor_id
  ON public.journal_entries (company_id, vendor_id)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_je_customer_id
  ON public.journal_entries (company_id, customer_id)
  WHERE customer_id IS NOT NULL;
