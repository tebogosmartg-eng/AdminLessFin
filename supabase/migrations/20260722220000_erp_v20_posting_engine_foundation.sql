-- AdminLess Fin — ERP Blueprint V2.0, Phase 2: Enterprise Posting Engine (schema)
-- Additive. Adds: chart_of_accounts.is_active (for account validation), journal
-- numbering, and posting_requests — the engine's idempotency ledger and rich
-- posting-specific audit trail (the generic audit_logs trigger already covers
-- row-level CRUD auditing; this table captures module/document/correlation
-- context that trigger has no visibility into).

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS journal_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_company_journal_number
  ON public.journal_entries (company_id, journal_number) WHERE journal_number IS NOT NULL;

-- ── Journal numbering (reuses the employee-number-engine's per-company atomic
--    sequence pattern — same shape, new domain) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.posting_journal_number_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT 'JE-',
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.posting_journal_number_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posting_journal_number_settings_select ON public.posting_journal_number_settings;
CREATE POLICY posting_journal_number_settings_select ON public.posting_journal_number_settings FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.posting_engine_next_journal_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings posting_journal_number_settings%ROWTYPE;
BEGIN
  INSERT INTO posting_journal_number_settings (company_id)
  VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE posting_journal_number_settings
    SET next_number = next_number + 1, updated_at = now()
    WHERE company_id = p_company_id
    RETURNING * INTO v_settings;

  RETURN v_settings.prefix || lpad((v_settings.next_number - 1)::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.posting_engine_next_journal_number(uuid) TO authenticated, service_role;

-- ── Posting Requests: idempotency ledger + posting-engine-specific audit trail ──
-- Every commit claims a (company_id, idempotency_key) slot atomically via the
-- unique constraint before writing a journal — this is what makes repeated
-- submissions with the same key safe under concurrency, not just sequential
-- re-runs. Callers that don't supply a key get one derived deterministically
-- from (module, document_type, document_id) by the engine itself.

CREATE TABLE IF NOT EXISTS public.posting_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  module text NOT NULL CHECK (module IN ('sales_invoice', 'inventory_receipt', 'inventory_issue', 'manual_journal')),
  document_type text,
  document_id uuid,
  reference text,
  description text,
  currency text NOT NULL DEFAULT 'ZAR',
  exchange_rate numeric NOT NULL DEFAULT 1,
  source text,
  created_by uuid,
  -- No 'failed' status: a plpgsql exception rolls back the whole transaction,
  -- including this row's own INSERT, so a failed attempt never persists here
  -- at all — retrying with the same key simply reclaims a fresh slot.
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'committed', 'reversed')),
  journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL,
  journal_number text,
  posting_engine_version text NOT NULL DEFAULT 'V1.0',
  financial_year_id uuid REFERENCES financial_years(id) ON DELETE SET NULL,
  accounting_period_id uuid REFERENCES accounting_periods(id) ON DELETE SET NULL,
  correlation_id text,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  reversal_of_id uuid REFERENCES posting_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_posting_requests_company_document
  ON public.posting_requests (company_id, module, document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_posting_requests_journal_entry
  ON public.posting_requests (journal_entry_id);

ALTER TABLE public.posting_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posting_requests_select ON public.posting_requests;
CREATE POLICY posting_requests_select ON public.posting_requests FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

COMMENT ON TABLE public.posting_requests IS
  'ERP V2.0 Phase 2: Posting Engine idempotency ledger + audit trail. One row per posting attempt (pending/committed/failed/reversed). Never written to directly by modules — only by posting_engine_submit()/posting_engine_rollback().';
