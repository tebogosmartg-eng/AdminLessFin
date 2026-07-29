-- =============================================================================
-- EFS V6.4.1 Phase B — Statement Engine Foundation
-- Taxonomy lines, statement definitions, type→line default maps, statement instances
-- Additive. Does not alter Accounting, Reports, Payroll, Assets, or Phase A immutability.
-- =============================================================================

CREATE TABLE IF NOT EXISTS efs_statement_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id) ON DELETE CASCADE,
  statement_type text NOT NULL
    CHECK (statement_type IN (
      'financial_position',
      'financial_performance',
      'cash_flows',
      'changes_in_equity'
    )),
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  required_flag boolean NOT NULL DEFAULT true,
  UNIQUE (framework_pack_id, statement_type)
);

CREATE TABLE IF NOT EXISTS efs_taxonomy_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id) ON DELETE CASCADE,
  line_code text NOT NULL,
  label text NOT NULL,
  statement_type text NOT NULL
    CHECK (statement_type IN (
      'financial_position',
      'financial_performance',
      'cash_flows',
      'changes_in_equity'
    )),
  section text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  amount_basis text NOT NULL DEFAULT 'balance'
    CHECK (amount_basis IN ('balance', 'activity', 'cash_flow', 'derived')),
  is_total boolean NOT NULL DEFAULT false,
  UNIQUE (framework_pack_id, line_code)
);

-- Default classification: Accounting account_type → taxonomy line (presentation only)
CREATE TABLE IF NOT EXISTS efs_default_type_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id) ON DELETE CASCADE,
  account_type text NOT NULL
    CHECK (account_type IN ('Asset', 'Liability', 'Equity', 'Income', 'Expense')),
  taxonomy_line_code text NOT NULL,
  UNIQUE (framework_pack_id, account_type, taxonomy_line_code)
);

-- Tenant optional override maps (Phase B scaffold; default type maps used if empty)
CREATE TABLE IF NOT EXISTS efs_chart_mapping_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reporting_entity_id uuid NOT NULL REFERENCES efs_reporting_entities(id) ON DELETE CASCADE,
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id),
  version_label text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reporting_entity_id, framework_pack_id, version_label)
);

CREATE TABLE IF NOT EXISTS efs_mapping_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  mapping_set_id uuid NOT NULL REFERENCES efs_chart_mapping_sets(id) ON DELETE CASCADE,
  source_account_id uuid,
  source_account_type text,
  taxonomy_line_code text NOT NULL,
  UNIQUE (mapping_set_id, source_account_id),
  CHECK (source_account_id IS NOT NULL OR source_account_type IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS efs_statement_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  snapshot_version_id uuid NOT NULL REFERENCES efs_snapshot_versions(id) ON DELETE RESTRICT,
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id),
  statement_type text NOT NULL
    CHECK (statement_type IN (
      'financial_position',
      'financial_performance',
      'cash_flows',
      'changes_in_equity'
    )),
  title text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  content_hash text NOT NULL,
  fact_snapshot_id uuid NOT NULL REFERENCES efs_fact_snapshots(id) ON DELETE RESTRICT,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (snapshot_version_id, statement_type)
);

CREATE INDEX IF NOT EXISTS idx_efs_statement_instances_ws
  ON efs_statement_instances (workspace_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_efs_taxonomy_lines_pack
  ON efs_taxonomy_lines (framework_pack_id, statement_type, sort_order);

-- ── Seed pack presentation structures (labels only; balances unchanged) ──────
DO $$
DECLARE
  pack record;
  labels jsonb;
BEGIN
  FOR pack IN
    SELECT id, framework_key, version_id FROM efs_framework_packs WHERE status IN ('published', 'active')
  LOOP
    labels := CASE pack.framework_key
      WHEN 'IFRS' THEN jsonb_build_object(
        'financial_position', 'Statement of Financial Position',
        'financial_performance', 'Statement of Profit or Loss',
        'cash_flows', 'Statement of Cash Flows',
        'changes_in_equity', 'Statement of Changes in Equity',
        'assets', 'Assets',
        'liabilities', 'Liabilities',
        'equity', 'Equity',
        'revenue', 'Revenue',
        'expenses', 'Expenses',
        'surplus', 'Profit / (Loss) for the period',
        'net_assets', 'Equity',
        'equity_movements', 'Total changes in equity'
      )
      WHEN 'IFRS_SME' THEN jsonb_build_object(
        'financial_position', 'Statement of Financial Position',
        'financial_performance', 'Statement of Comprehensive Income',
        'cash_flows', 'Statement of Cash Flows',
        'changes_in_equity', 'Statement of Changes in Equity',
        'assets', 'Assets',
        'liabilities', 'Liabilities',
        'equity', 'Equity',
        'revenue', 'Revenue',
        'expenses', 'Expenses',
        'surplus', 'Profit / (Loss) for the period',
        'net_assets', 'Equity',
        'equity_movements', 'Total changes in equity'
      )
      WHEN 'GRAP' THEN jsonb_build_object(
        'financial_position', 'Statement of Financial Position',
        'financial_performance', 'Statement of Financial Performance',
        'cash_flows', 'Cash Flow Statement',
        'changes_in_equity', 'Statement of Changes in Net Assets',
        'assets', 'Assets',
        'liabilities', 'Liabilities',
        'equity', 'Net Assets',
        'revenue', 'Revenue',
        'expenses', 'Expenses',
        'surplus', 'Surplus / (Deficit) for the period',
        'net_assets', 'Net Assets',
        'equity_movements', 'Total changes in net assets'
      )
      WHEN 'MCS' THEN jsonb_build_object(
        'financial_position', 'Statement of Financial Position',
        'financial_performance', 'Statement of Financial Performance',
        'cash_flows', 'Cash Flow Statement',
        'changes_in_equity', 'Statement of Changes in Net Assets',
        'assets', 'Assets',
        'liabilities', 'Liabilities',
        'equity', 'Net Assets',
        'revenue', 'Receipts / Revenue',
        'expenses', 'Payments / Expenditure',
        'surplus', 'Net surplus / (deficit) for the period',
        'net_assets', 'Net Assets',
        'equity_movements', 'Total changes in net assets'
      )
      ELSE jsonb_build_object(
        'financial_position', 'Statement of Financial Position',
        'financial_performance', 'Statement of Financial Performance',
        'cash_flows', 'Cash Flow Statement',
        'changes_in_equity', 'Statement of Changes in Net Assets/Equity',
        'assets', 'Assets',
        'liabilities', 'Liabilities',
        'equity', 'Net Assets / Equity',
        'revenue', 'Revenue',
        'expenses', 'Expenses',
        'surplus', 'Surplus / (Deficit) for the period',
        'net_assets', 'Net Assets / Equity',
        'equity_movements', 'Total changes in net assets/equity'
      )
    END;

    INSERT INTO efs_statement_definitions (framework_pack_id, statement_type, title, sort_order)
    VALUES
      (pack.id, 'financial_position', labels->>'financial_position', 10),
      (pack.id, 'financial_performance', labels->>'financial_performance', 20),
      (pack.id, 'cash_flows', labels->>'cash_flows', 30),
      (pack.id, 'changes_in_equity', labels->>'changes_in_equity', 40)
    ON CONFLICT (framework_pack_id, statement_type) DO UPDATE
      SET title = EXCLUDED.title;

    INSERT INTO efs_taxonomy_lines (framework_pack_id, line_code, label, statement_type, section, sort_order, amount_basis, is_total) VALUES
      (pack.id, 'sfp.assets', labels->>'assets', 'financial_position', 'assets', 10, 'balance', false),
      (pack.id, 'sfp.total_assets', 'Total ' || (labels->>'assets'), 'financial_position', 'assets', 20, 'derived', true),
      (pack.id, 'sfp.liabilities', labels->>'liabilities', 'financial_position', 'liabilities', 30, 'balance', false),
      (pack.id, 'sfp.total_liabilities', 'Total ' || (labels->>'liabilities'), 'financial_position', 'liabilities', 40, 'derived', true),
      (pack.id, 'sfp.equity', labels->>'equity', 'financial_position', 'equity', 50, 'balance', false),
      (pack.id, 'sfp.current_period_result', labels->>'surplus', 'financial_position', 'equity', 55, 'derived', false),
      (pack.id, 'sfp.total_equity', 'Total ' || (labels->>'net_assets'), 'financial_position', 'equity', 60, 'derived', true),
      (pack.id, 'sfp.total_liabilities_and_equity', 'Total ' || (labels->>'liabilities') || ' and ' || (labels->>'net_assets'), 'financial_position', 'totals', 70, 'derived', true),
      (pack.id, 'perf.revenue', labels->>'revenue', 'financial_performance', 'revenue', 10, 'activity', false),
      (pack.id, 'perf.total_revenue', 'Total ' || (labels->>'revenue'), 'financial_performance', 'revenue', 20, 'derived', true),
      (pack.id, 'perf.expenses', labels->>'expenses', 'financial_performance', 'expenses', 30, 'activity', false),
      (pack.id, 'perf.total_expenses', 'Total ' || (labels->>'expenses'), 'financial_performance', 'expenses', 40, 'derived', true),
      (pack.id, 'perf.result', labels->>'surplus', 'financial_performance', 'result', 50, 'derived', true),
      (pack.id, 'cf.operating', 'Operating activities', 'cash_flows', 'operating', 10, 'cash_flow', false),
      (pack.id, 'cf.investing', 'Investing activities', 'cash_flows', 'investing', 20, 'cash_flow', false),
      (pack.id, 'cf.financing', 'Financing activities', 'cash_flows', 'financing', 30, 'cash_flow', false),
      (pack.id, 'cf.net_change', 'Net increase / (decrease) in cash', 'cash_flows', 'totals', 40, 'derived', true),
      (pack.id, 'eq.opening', 'Opening ' || (labels->>'net_assets'), 'changes_in_equity', 'opening', 10, 'balance', true),
      (pack.id, 'eq.period_result', labels->>'surplus', 'changes_in_equity', 'movements', 20, 'derived', false),
      (pack.id, 'eq.other_movements', labels->>'equity_movements', 'changes_in_equity', 'movements', 30, 'activity', false),
      (pack.id, 'eq.closing', 'Closing ' || (labels->>'net_assets'), 'changes_in_equity', 'closing', 40, 'derived', true)
    ON CONFLICT (framework_pack_id, line_code) DO UPDATE
      SET label = EXCLUDED.label, section = EXCLUDED.section, sort_order = EXCLUDED.sort_order;

    INSERT INTO efs_default_type_maps (framework_pack_id, account_type, taxonomy_line_code) VALUES
      (pack.id, 'Asset', 'sfp.assets'),
      (pack.id, 'Liability', 'sfp.liabilities'),
      (pack.id, 'Equity', 'sfp.equity'),
      (pack.id, 'Income', 'perf.revenue'),
      (pack.id, 'Expense', 'perf.expenses')
    ON CONFLICT (framework_pack_id, account_type, taxonomy_line_code) DO NOTHING;
  END LOOP;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efs_chart_mapping_sets',
    'efs_mapping_lines',
    'efs_statement_instances'
  ]
  LOOP
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

ALTER TABLE efs_statement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_taxonomy_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_default_type_maps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS efs_statement_definitions_select ON efs_statement_definitions;
CREATE POLICY efs_statement_definitions_select ON efs_statement_definitions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_taxonomy_lines_select ON efs_taxonomy_lines;
CREATE POLICY efs_taxonomy_lines_select ON efs_taxonomy_lines FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_default_type_maps_select ON efs_default_type_maps;
CREATE POLICY efs_default_type_maps_select ON efs_default_type_maps FOR SELECT TO authenticated USING (true);
