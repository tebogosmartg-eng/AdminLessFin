-- ═══════════════════════════════════════════════════════════════════════════
-- Central Import Engine — staging, history and audit for every bulk import.
--
-- Replaces the direct-write journal import path. Every import now runs as a
-- recorded, resumable run: rows are staged with their original file values,
-- validated server-side, and committed one row (or one document group) at a
-- time through the existing module RPCs and the posting engine. Nothing in
-- this migration posts to the ledger; the tables only stage and record.
--
-- Access model (same as the compliance module):
--   * Owners/admins read their own company's runs and rows through REST.
--   * All writes go through the data-import edge function with the service
--     role; there are no INSERT/UPDATE/DELETE policies at all.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Import runs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN (
    'chart_of_accounts', 'customers', 'vendors', 'products',
    'invoices', 'bills', 'customer_payments', 'supplier_payments',
    'bank_transactions', 'journal_entries', 'opening_balances'
  )),
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'created',     -- run exists, rows are being appended
    'validating',  -- server validation in progress (resumable)
    'validated',   -- every row has a validation verdict
    'committing',  -- commit in progress (resumable)
    'committed',   -- finished; per-row outcomes are final
    'failed',      -- a non-row-level fault stopped the run
    'cancelled'    -- abandoned before commit; nothing was written
  )),
  file_name text,
  file_hash text,                         -- sha-256 of the uploaded file, for "already imported" warnings
  file_size integer,
  storage_path text,                      -- original file in the private import-files bucket
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { targetField: sourceHeader }
  options jsonb NOT NULL DEFAULT '{}'::jsonb,   -- date_format, number_format, on_duplicate, entity extras
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,    -- { rows, valid, warnings, errors, imported, updated, skipped, failed }
  row_count integer NOT NULL DEFAULT 0,
  cursor_position integer NOT NULL DEFAULT 0,   -- resume point for validate/commit passes
  lease_until timestamptz,                -- one validate/commit pass at a time; expires if a call dies
  last_error text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  committed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_import_runs_company_created
  ON public.import_runs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_runs_company_hash
  ON public.import_runs (company_id, file_hash) WHERE file_hash IS NOT NULL;

-- ── Staged rows ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.import_run_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.import_runs(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),   -- 1-based position in the source file (data rows)
  raw jsonb NOT NULL,                     -- original cells, keyed by source header
  normalized jsonb,                       -- server-normalized record with resolved ids
  group_key text,                         -- document grouping (invoice number, journal reference, …)
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
    'pending', 'valid', 'warning', 'error'
  )),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ severity, field, code, message }]
  planned_action text CHECK (planned_action IN ('create', 'update', 'skip')),
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN (
    'pending', 'imported', 'updated', 'skipped', 'failed'
  )),
  outcome_detail jsonb,                   -- { id?, journal_id?, document_number?, error? }
  UNIQUE (run_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_import_run_rows_run
  ON public.import_run_rows (run_id, row_number);
CREATE INDEX IF NOT EXISTS idx_import_run_rows_run_status
  ON public.import_run_rows (run_id, validation_status);

-- ── updated_at and the generic audit trail ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.import_runs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS import_runs_touch ON public.import_runs;
CREATE TRIGGER import_runs_touch
  BEFORE UPDATE ON public.import_runs
  FOR EACH ROW EXECUTE FUNCTION public.import_runs_touch_updated_at();

-- Runs join the generic audit trail. Rows are deliberately left out: they are
-- bulk staging detail, and the run row plus per-row outcomes already carry the
-- full story.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'process_audit_log') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_import_runs ON public.import_runs';
    EXECUTE 'CREATE TRIGGER audit_import_runs AFTER INSERT OR DELETE OR UPDATE ON public.import_runs FOR EACH ROW EXECUTE FUNCTION public.process_audit_log()';
  END IF;
END;
$$;

-- ── Row-level security ──────────────────────────────────────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['import_runs', 'import_run_rows']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_admin_of(company_id))',
      t || '_admin_select', t
    );
  END LOOP;
END;
$$;

-- ── Private bucket for the original uploaded files ──────────────────────────
-- Uploads go through server-issued signed URLs only; the browser never picks
-- the path, and there are no storage policies for user roles.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'import-files',
  'import-files',
  false,
  20971520,
  ARRAY[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
