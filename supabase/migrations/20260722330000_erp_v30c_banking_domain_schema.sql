-- AdminLess Fin — ERP Blueprint V3.0, Phase 3C: Enterprise Banking Foundation
-- (schema). Introduces a real Banking domain sitting ON TOP of the existing
-- chart_of_accounts/journal_entries/posting_engine architecture — it does
-- NOT replace or duplicate the GL. Every bank_accounts row wraps exactly one
-- chart_of_accounts row (via chart_of_account_id); the GL account remains
-- the single source of truth for the account's balance, and every posting
-- still lands in journal_entries/journal_entry_items via posting_engine_submit
-- (Phase 2/3A/3B, untouched by this migration). Petty cash is modeled as
-- bank_accounts.account_type = 'petty_cash', not a parallel table — "Single
-- Banking Domain" per the Phase 3C brief.

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  chart_of_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  name text NOT NULL,
  account_type text NOT NULL DEFAULT 'bank' CHECK (account_type IN ('bank', 'cash', 'petty_cash')),
  account_number text,
  bank_name text,
  branch_code text,
  currency text NOT NULL DEFAULT 'ZAR' CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'closed')),
  is_default boolean NOT NULL DEFAULT false,
  opening_balance numeric NOT NULL DEFAULT 0,
  opening_balance_date date,
  opening_balance_posted boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chart_of_account_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_one_default_per_company
  ON public.bank_accounts (company_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS bank_accounts_company_idx ON public.bank_accounts (company_id);

CREATE TABLE IF NOT EXISTS public.bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  to_bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  transfer_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  idempotency_key text NOT NULL,
  posting_request_id uuid REFERENCES public.posting_requests(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_bank_account_id <> to_bank_account_id),
  UNIQUE (company_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS bank_transfers_company_idx ON public.bank_transfers (company_id);

CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  period_start date,
  period_end date,
  opening_balance numeric,
  closing_balance numeric,
  file_name text,
  status text NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'in_progress', 'completed')),
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_statement_imports_company_idx ON public.bank_statement_imports (company_id);

-- external_reference dedup: banks always emit a per-transaction reference in
-- CSV/OFX exports. UNIQUE ignores NULLs by design in Postgres, so a line
-- imported without a reference is never treated as a duplicate — disclosed
-- as a known limitation (best-effort dedup, not exhaustive) rather than
-- silently pretending it's exhaustive.
CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statement_import_id uuid NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  line_date date NOT NULL,
  description text,
  amount numeric NOT NULL,
  external_reference text,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'matched', 'manual_adjustment', 'ignored')),
  matched_journal_entry_item_id uuid REFERENCES public.journal_entry_items(id) ON DELETE SET NULL,
  matched_bank_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_account_id, external_reference)
);
CREATE INDEX IF NOT EXISTS bank_statement_lines_company_idx ON public.bank_statement_lines (company_id);
CREATE INDEX IF NOT EXISTS bank_statement_lines_import_idx ON public.bank_statement_lines (statement_import_id);
CREATE INDEX IF NOT EXISTS bank_statement_lines_status_idx ON public.bank_statement_lines (bank_account_id, match_status);

-- The one dedicated banking-transaction record required by the brief: every
-- deposit/withdrawal/transfer-leg/interest/charge/adjustment/petty-cash
-- movement gets a row here, permanently linking bank account, statement
-- line (if reconciliation-sourced), transfer (if transfer-sourced), posting
-- request, and journal — full source traceability in one place.
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'interest_received', 'interest_paid',
    'bank_charge', 'manual_adjustment', 'opening_balance',
    'cash_float', 'cash_topup', 'cash_reimbursement', 'cash_count_adjustment', 'cash_shortage', 'cash_overage'
  )),
  transaction_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  contra_account_id uuid REFERENCES public.chart_of_accounts(id),
  transfer_id uuid REFERENCES public.bank_transfers(id) ON DELETE SET NULL,
  statement_line_id uuid REFERENCES public.bank_statement_lines(id) ON DELETE SET NULL,
  posting_request_id uuid REFERENCES public.posting_requests(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reference text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_transactions_company_idx ON public.bank_transactions (company_id);
CREATE INDEX IF NOT EXISTS bank_transactions_account_idx ON public.bank_transactions (bank_account_id, transaction_date);

ALTER TABLE public.bank_statement_lines
  ADD CONSTRAINT bank_statement_lines_matched_txn_fkey
  FOREIGN KEY (matched_bank_transaction_id) REFERENCES public.bank_transactions(id) ON DELETE SET NULL;

-- ── RLS: identical company_users-membership pattern used throughout V3.0 ──
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_accounts_select ON public.bank_accounts;
DROP POLICY IF EXISTS bank_accounts_all ON public.bank_accounts;
CREATE POLICY bank_accounts_select ON public.bank_accounts FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY bank_accounts_all ON public.bank_accounts FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

DROP POLICY IF EXISTS bank_transfers_select ON public.bank_transfers;
DROP POLICY IF EXISTS bank_transfers_all ON public.bank_transfers;
CREATE POLICY bank_transfers_select ON public.bank_transfers FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY bank_transfers_all ON public.bank_transfers FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

DROP POLICY IF EXISTS bank_statement_imports_select ON public.bank_statement_imports;
DROP POLICY IF EXISTS bank_statement_imports_all ON public.bank_statement_imports;
CREATE POLICY bank_statement_imports_select ON public.bank_statement_imports FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY bank_statement_imports_all ON public.bank_statement_imports FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

DROP POLICY IF EXISTS bank_statement_lines_select ON public.bank_statement_lines;
DROP POLICY IF EXISTS bank_statement_lines_all ON public.bank_statement_lines;
CREATE POLICY bank_statement_lines_select ON public.bank_statement_lines FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY bank_statement_lines_all ON public.bank_statement_lines FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

DROP POLICY IF EXISTS bank_transactions_select ON public.bank_transactions;
DROP POLICY IF EXISTS bank_transactions_all ON public.bank_transactions;
CREATE POLICY bank_transactions_select ON public.bank_transactions FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY bank_transactions_all ON public.bank_transactions FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

COMMENT ON TABLE public.bank_accounts IS 'ERP V3.0 Phase 3C: Banking domain wrapper around a chart_of_accounts Asset account. GL balance remains authoritative; this table adds banking-specific metadata, status, currency, and default-account designation.';
COMMENT ON TABLE public.bank_transactions IS 'ERP V3.0 Phase 3C: dedicated banking transaction ledger. Every row links to its posting_request/journal_entry — no banking transaction exists without a Posting Engine journal behind it.';
COMMENT ON TABLE public.bank_transfers IS 'ERP V3.0 Phase 3C: bank-to-bank transfers as one business transaction backed by exactly one posting_request / one balanced journal.';
COMMENT ON TABLE public.bank_statement_lines IS 'ERP V3.0 Phase 3C: reconciliation foundation. Deduplicated by (bank_account_id, external_reference) — lines without a bank-supplied reference are not deduplicated.';
