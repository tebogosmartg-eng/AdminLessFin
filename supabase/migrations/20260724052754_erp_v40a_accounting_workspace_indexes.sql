-- Phase 4A — Enterprise Accounting Workspace
-- READ PERFORMANCE ONLY. Does not alter Posting Engine, Banking, or Quick Capture.
-- Supports server-side ledger / posting-request inquiry at 100k+ row scale.

CREATE INDEX IF NOT EXISTS idx_jei_account_journal
  ON public.journal_entry_items (account_id, journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_jei_journal_entry_id
  ON public.journal_entry_items (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_je_company_entry_date
  ON public.journal_entries (company_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_je_company_journal_number
  ON public.journal_entries (company_id, journal_number);

CREATE INDEX IF NOT EXISTS idx_je_company_fy_period
  ON public.journal_entries (company_id, financial_year_id, accounting_period_id);

CREATE INDEX IF NOT EXISTS idx_pr_company_created
  ON public.posting_requests (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pr_company_status
  ON public.posting_requests (company_id, status);

CREATE INDEX IF NOT EXISTS idx_pr_company_module
  ON public.posting_requests (company_id, module);

CREATE INDEX IF NOT EXISTS idx_pr_journal_entry_id
  ON public.posting_requests (journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_pr_document
  ON public.posting_requests (company_id, document_type, document_id);

CREATE INDEX IF NOT EXISTS idx_pr_journal_number
  ON public.posting_requests (company_id, journal_number);

CREATE INDEX IF NOT EXISTS idx_pr_reference
  ON public.posting_requests (company_id, reference);

CREATE INDEX IF NOT EXISTS idx_ap_company_status
  ON public.accounting_periods (company_id, status);

CREATE INDEX IF NOT EXISTS idx_fy_company_status
  ON public.financial_years (company_id, status);

CREATE INDEX IF NOT EXISTS idx_audit_company_created
  ON public.audit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_company_table
  ON public.audit_logs (company_id, table_name, created_at DESC);
