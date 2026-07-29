-- =============================================================================
-- EFS FRP V7.0.0 — Canonical Trial Balance Layer (additive only)
-- CaseWare-class Financial Reporting Platform substrate.
--
-- Does NOT alter General Ledger, Journals, Chart of Accounts, Financial Close,
-- Reconciliation, Fixed Assets, Reporting Snapshot schema ownership, Statement
-- Engine math, Working Papers, Validation, Review, or Publication artefacts.
--
-- Purpose: converge native GL extracts and imported Trial Balances into one
-- Canonical Trial Balance consumed by sealed Fact Snapshots → Statement Engine.
-- =============================================================================

-- ── Source binding (native_gl | imported_tb) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_ctb_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  reporting_period_id uuid NOT NULL REFERENCES efs_reporting_periods(id) ON DELETE RESTRICT,
  snapshot_version_id uuid REFERENCES efs_snapshot_versions(id) ON DELETE SET NULL,
  source_kind text NOT NULL
    CHECK (source_kind IN ('native_gl', 'imported_tb')),
  source_system text NOT NULL DEFAULT 'adminless'
    CHECK (source_system IN (
      'adminless', 'sage', 'xero', 'quickbooks', 'pastel',
      'sap', 'dynamics365', 'netsuite', 'csv', 'excel', 'other'
    )),
  label text NOT NULL DEFAULT 'Trial Balance Source',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'imported', 'mapped', 'sealed', 'superseded')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_ctb_sources_ws
  ON efs_ctb_sources (company_id, workspace_id, created_at DESC);

-- ── Trial Balance import batch ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_tb_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES efs_ctb_sources(id) ON DELETE CASCADE,
  file_name text,
  format text NOT NULL DEFAULT 'csv'
    CHECK (format IN ('csv', 'excel', 'json_rows')),
  period_start date,
  period_end date,
  raw_text text,
  parse_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'parsed', 'mapping', 'mapped', 'failed', 'sealed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_tb_imports_source
  ON efs_tb_imports (source_id, created_at DESC);

-- ── Imported raw lines (pre-mapping) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_tb_import_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES efs_tb_imports(id) ON DELETE CASCADE,
  row_number int NOT NULL DEFAULT 0,
  source_account_code text,
  source_account_name text NOT NULL,
  source_account_type text,
  debit numeric(18, 2) NOT NULL DEFAULT 0,
  credit numeric(18, 2) NOT NULL DEFAULT 0,
  balance numeric(18, 2),
  period_activity numeric(18, 2),
  opening_balance numeric(18, 2),
  raw_row jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapping_status text NOT NULL DEFAULT 'unmapped'
    CHECK (mapping_status IN ('unmapped', 'auto_mapped', 'manual_mapped', 'excluded')),
  taxonomy_line_code text,
  canonical_account_type text
    CHECK (canonical_account_type IS NULL OR canonical_account_type IN (
      'Asset', 'Liability', 'Equity', 'Income', 'Expense'
    )),
  sign_rule_applied text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_tb_import_lines_import
  ON efs_tb_import_lines (import_id, row_number);

-- ── FRP mapping sets / rules (import + external systems) ─────────────────────
CREATE TABLE IF NOT EXISTS efs_frp_mapping_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id),
  source_system text NOT NULL DEFAULT 'csv'
    CHECK (source_system IN (
      'adminless', 'sage', 'xero', 'quickbooks', 'pastel',
      'sap', 'dynamics365', 'netsuite', 'csv', 'excel', 'other'
    )),
  version_label text NOT NULL DEFAULT 'v1',
  label text NOT NULL DEFAULT 'FRP Mapping Set',
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, framework_pack_id, source_system, version_label)
);

CREATE TABLE IF NOT EXISTS efs_frp_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  mapping_set_id uuid NOT NULL REFERENCES efs_frp_mapping_sets(id) ON DELETE CASCADE,
  match_kind text NOT NULL
    CHECK (match_kind IN ('account_code', 'account_name', 'account_type', 'pattern')),
  match_value text NOT NULL,
  taxonomy_line_code text,
  canonical_account_type text
    CHECK (canonical_account_type IS NULL OR canonical_account_type IN (
      'Asset', 'Liability', 'Equity', 'Income', 'Expense'
    )),
  sign_rule text NOT NULL DEFAULT 'as_is'
    CHECK (sign_rule IN ('as_is', 'invert', 'debit_positive', 'credit_positive')),
  priority int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_frp_mapping_rules_set
  ON efs_frp_mapping_rules (mapping_set_id, priority);

-- Default sign rules by canonical account type (platform reference)
CREATE TABLE IF NOT EXISTS efs_frp_sign_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type text NOT NULL
    CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Income', 'Expense')),
  natural_balance text NOT NULL
    CHECK (natural_balance IN ('debit', 'credit')),
  reporting_sign text NOT NULL DEFAULT 'as_is'
    CHECK (reporting_sign IN ('as_is', 'invert')),
  UNIQUE (account_type)
);

INSERT INTO efs_frp_sign_rules (account_type, natural_balance, reporting_sign) VALUES
  ('Asset', 'debit', 'as_is'),
  ('Liability', 'credit', 'as_is'),
  ('Equity', 'credit', 'as_is'),
  ('Income', 'credit', 'as_is'),
  ('Expense', 'debit', 'as_is')
ON CONFLICT (account_type) DO NOTHING;

-- ── Manual mapping queue ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_frp_mapping_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES efs_tb_imports(id) ON DELETE CASCADE,
  import_line_id uuid NOT NULL REFERENCES efs_tb_import_lines(id) ON DELETE CASCADE,
  suggested_taxonomy_line_code text,
  suggested_account_type text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'skipped')),
  resolved_taxonomy_line_code text,
  resolved_account_type text,
  resolved_sign_rule text,
  resolved_by uuid,
  resolved_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_line_id)
);

CREATE INDEX IF NOT EXISTS idx_efs_frp_mapping_queue_import
  ON efs_frp_mapping_queue (import_id, status);

-- ── Canonical Trial Balance (sealed reporting substrate) ─────────────────────
CREATE TABLE IF NOT EXISTS efs_canonical_trial_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  reporting_period_id uuid NOT NULL REFERENCES efs_reporting_periods(id) ON DELETE RESTRICT,
  snapshot_version_id uuid REFERENCES efs_snapshot_versions(id) ON DELETE SET NULL,
  source_id uuid NOT NULL REFERENCES efs_ctb_sources(id) ON DELETE RESTRICT,
  source_kind text NOT NULL
    CHECK (source_kind IN ('native_gl', 'imported_tb')),
  schema_version text NOT NULL DEFAULT '7.0.0',
  period_start date NOT NULL,
  period_end date NOT NULL,
  prior_as_of date,
  content_hash text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sealed', 'superseded')),
  line_count int NOT NULL DEFAULT 0,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  sealed_by uuid,
  sealed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_canonical_tb_ws
  ON efs_canonical_trial_balances (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_efs_canonical_tb_version
  ON efs_canonical_trial_balances (snapshot_version_id)
  WHERE snapshot_version_id IS NOT NULL;

-- ── Canonical TB lines (fully traceable) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_canonical_tb_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  canonical_tb_id uuid NOT NULL REFERENCES efs_canonical_trial_balances(id) ON DELETE CASCADE,
  line_key text NOT NULL,
  account_code text,
  account_name text NOT NULL,
  account_type text NOT NULL
    CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Income', 'Expense')),
  taxonomy_line_code text,
  opening_balance numeric(18, 2) NOT NULL DEFAULT 0,
  closing_balance numeric(18, 2) NOT NULL DEFAULT 0,
  period_activity numeric(18, 2) NOT NULL DEFAULT 0,
  debit numeric(18, 2) NOT NULL DEFAULT 0,
  credit numeric(18, 2) NOT NULL DEFAULT 0,
  sign_rule_applied text NOT NULL DEFAULT 'as_is',
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (canonical_tb_id, line_key)
);

CREATE INDEX IF NOT EXISTS idx_efs_canonical_tb_lines_tb
  ON efs_canonical_tb_lines (canonical_tb_id, sort_order);

-- Link sealed fact snapshots to Canonical TB (additive column; nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'efs_fact_snapshots'
      AND column_name = 'canonical_tb_id'
  ) THEN
    ALTER TABLE efs_fact_snapshots
      ADD COLUMN canonical_tb_id uuid REFERENCES efs_canonical_trial_balances(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_efs_fact_snapshots_ctb
  ON efs_fact_snapshots (canonical_tb_id)
  WHERE canonical_tb_id IS NOT NULL;

-- ── RLS (tenant pattern identical to EFS / EFCP) ─────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efs_ctb_sources',
    'efs_tb_imports',
    'efs_tb_import_lines',
    'efs_frp_mapping_sets',
    'efs_frp_mapping_rules',
    'efs_frp_mapping_queue',
    'efs_canonical_trial_balances',
    'efs_canonical_tb_lines'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))',
      t || '_select', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_mutate', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid())) WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))',
      t || '_mutate', t
    );
  END LOOP;
END $$;

-- Sign rules are platform reference — authenticated read only
ALTER TABLE efs_frp_sign_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS efs_frp_sign_rules_select ON efs_frp_sign_rules;
CREATE POLICY efs_frp_sign_rules_select ON efs_frp_sign_rules
  FOR SELECT TO authenticated USING (true);
