-- =============================================================================
-- EFS V6.4.5 Phase D1 — Enterprise Validation Platform
-- Technical Validation · Framework Validation · Validation Results
--
-- Validation certifies readiness for review by identifying defects.
-- Validation does NOT approve statements.
-- Validation NEVER mutates financial data (statements, facts, snapshots, GL).
-- Reads Reporting Snapshots only (never live GL).
-- Consumes Statement Structure, Disclosure Platform, Working Papers.
--
-- Does NOT implement: Manager Review, Partner Review, Publication, XBRL, AI.
-- Additive. Accounting / Statement Engine / Navigation untouched.
-- Idempotent: IF NOT EXISTS / ON CONFLICT / DROP TRIGGER IF EXISTS.
-- =============================================================================

-- ── Rule catalogue (Technical + Framework) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  engine_scope text NOT NULL
    CHECK (engine_scope IN ('technical', 'framework')),
  category text NOT NULL
    CHECK (category IN (
      'structural',
      'cross_reference',
      'working_paper_completeness',
      'missing_attachments',
      'missing_evidence',
      'snapshot_integrity',
      'statement_consistency',
      'framework_disclosure',
      'framework_policy',
      'framework_presentation'
    )),
  default_severity text NOT NULL DEFAULT 'advisory'
    CHECK (default_severity IN ('blocking', 'significant', 'advisory')),
  recommendation_template text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deprecated')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Framework packs define which validation rules apply (and severity overrides)
CREATE TABLE IF NOT EXISTS efs_framework_validation_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES efs_validation_rules(id) ON DELETE CASCADE,
  severity_override text
    CHECK (severity_override IS NULL OR severity_override IN ('blocking', 'significant', 'advisory')),
  enabled boolean NOT NULL DEFAULT true,
  guidance_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_pack_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_efs_fw_val_map_pack
  ON efs_framework_validation_mappings (framework_pack_id) WHERE enabled = true;

-- ── Validation Runs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  framework_pack_id uuid REFERENCES efs_framework_packs(id) ON DELETE RESTRICT,
  -- Snapshot is a READ source / provenance ref — never attachment parent / never mutated
  snapshot_version_id uuid REFERENCES efs_snapshot_versions(id) ON DELETE RESTRICT,
  run_type text NOT NULL DEFAULT 'full'
    CHECK (run_type IN ('full', 'technical_only', 'framework_only')),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'passed', 'failed', 'passed_with_advisories', 'cancelled')),
  blocking_count int NOT NULL DEFAULT 0,
  significant_count int NOT NULL DEFAULT 0,
  advisory_count int NOT NULL DEFAULT 0,
  total_issues int NOT NULL DEFAULT 0,
  -- Readiness for review (NOT approval)
  ready_for_review boolean NOT NULL DEFAULT false,
  engine_version text NOT NULL DEFAULT '6.4.5',
  mutates_financial_data boolean NOT NULL DEFAULT false CHECK (mutates_financial_data = false),
  live_gl_read boolean NOT NULL DEFAULT false CHECK (live_gl_read = false),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  started_by uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_val_runs_workspace
  ON efs_validation_runs (workspace_id, started_at DESC);

-- ── Validation Issues (Result Model) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_validation_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  validation_run_id uuid NOT NULL REFERENCES efs_validation_runs(id) ON DELETE CASCADE,
  rule_id uuid REFERENCES efs_validation_rules(id) ON DELETE SET NULL,
  rule_code text NOT NULL,
  issue_code text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL
    CHECK (severity IN ('blocking', 'significant', 'advisory')),
  recommendation text,
  -- Affected artefacts (optional)
  structure_node_id uuid REFERENCES efs_structure_nodes(id) ON DELETE SET NULL,
  disclosure_instance_id uuid REFERENCES efs_disclosure_instances(id) ON DELETE SET NULL,
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE SET NULL,
  statement_instance_id uuid REFERENCES efs_statement_instances(id) ON DELETE SET NULL,
  -- Optional attachment point of kind validation_result (finding socket — never mutates finance)
  attachment_point_id uuid REFERENCES efs_attachment_points(id) ON DELETE SET NULL,
  -- Resolution Status — defect triage only (NOT Manager/Partner approval)
  resolution_status text NOT NULL DEFAULT 'open'
    CHECK (resolution_status IN ('open', 'acknowledged', 'remediated', 'waived')),
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_val_issues_run
  ON efs_validation_issues (validation_run_id, severity);
CREATE INDEX IF NOT EXISTS idx_efs_val_issues_status
  ON efs_validation_issues (validation_run_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_efs_val_issues_structure
  ON efs_validation_issues (structure_node_id) WHERE structure_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_efs_val_issues_disclosure
  ON efs_validation_issues (disclosure_instance_id) WHERE disclosure_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_efs_val_issues_wp
  ON efs_validation_issues (working_paper_id) WHERE working_paper_id IS NOT NULL;

-- Completed runs are append-only for issues belonging to passed/failed seals
CREATE OR REPLACE FUNCTION efs_deny_completed_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('passed', 'failed', 'passed_with_advisories') THEN
      RAISE EXCEPTION 'EFS_VALIDATION_IMMUTABLE: cannot delete completed validation run %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('passed', 'failed', 'passed_with_advisories') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.blocking_count IS DISTINCT FROM OLD.blocking_count
       OR NEW.significant_count IS DISTINCT FROM OLD.significant_count
       OR NEW.advisory_count IS DISTINCT FROM OLD.advisory_count
       OR NEW.ready_for_review IS DISTINCT FROM OLD.ready_for_review
       OR NEW.mutates_financial_data IS DISTINCT FROM false
       OR NEW.live_gl_read IS DISTINCT FROM false
    THEN
      RAISE EXCEPTION 'EFS_VALIDATION_IMMUTABLE: completed validation run % cannot change', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_validation_runs_immutable ON efs_validation_runs;
CREATE TRIGGER trg_efs_validation_runs_immutable
  BEFORE UPDATE OR DELETE ON efs_validation_runs
  FOR EACH ROW EXECUTE FUNCTION efs_deny_completed_run_mutation();

-- Issues on completed runs: only resolution_status fields may change
CREATE OR REPLACE FUNCTION efs_guard_validation_issue_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_status text;
BEGIN
  SELECT status INTO run_status FROM efs_validation_runs WHERE id = COALESCE(NEW.validation_run_id, OLD.validation_run_id);
  IF TG_OP = 'DELETE' THEN
    IF run_status IN ('passed', 'failed', 'passed_with_advisories') THEN
      RAISE EXCEPTION 'EFS_VALIDATION_IMMUTABLE: cannot delete issue on completed run';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND run_status IN ('passed', 'failed', 'passed_with_advisories') THEN
    IF NEW.rule_code IS DISTINCT FROM OLD.rule_code
       OR NEW.severity IS DISTINCT FROM OLD.severity
       OR NEW.message IS DISTINCT FROM OLD.message
       OR NEW.structure_node_id IS DISTINCT FROM OLD.structure_node_id
       OR NEW.disclosure_instance_id IS DISTINCT FROM OLD.disclosure_instance_id
       OR NEW.working_paper_id IS DISTINCT FROM OLD.working_paper_id
       OR NEW.statement_instance_id IS DISTINCT FROM OLD.statement_instance_id
       OR NEW.title IS DISTINCT FROM OLD.title
    THEN
      RAISE EXCEPTION 'EFS_VALIDATION_IMMUTABLE: only resolution fields may change on completed-run issues';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_validation_issues_guard ON efs_validation_issues;
CREATE TRIGGER trg_efs_validation_issues_guard
  BEFORE UPDATE OR DELETE ON efs_validation_issues
  FOR EACH ROW EXECUTE FUNCTION efs_guard_validation_issue_mutation();

-- ── Seed Technical rules ─────────────────────────────────────────────────────
INSERT INTO efs_validation_rules (rule_code, name, description, engine_scope, category, default_severity, recommendation_template) VALUES
  ('TECH.STRUCTURAL', 'Structural Validation', 'Statement structure and generated primary statements presence', 'technical', 'structural', 'blocking',
   'Generate missing primary statements from a certified Reporting Snapshot Version.'),
  ('TECH.CROSS_REF', 'Cross Reference Validation', 'Cross-reference integrity across disclosures / structure / WPs', 'technical', 'cross_reference', 'significant',
   'Repair or remove dangling cross-references.'),
  ('TECH.WP_COMPLETENESS', 'Working Paper Completeness', 'Working papers not finalized where expected for close evidence', 'technical', 'working_paper_completeness', 'significant',
   'Complete and finalize Working Papers attached to material structure nodes.'),
  ('TECH.MISSING_ATTACHMENTS', 'Missing Attachments', 'Required attachment sockets missing on structure / disclosure nodes', 'technical', 'missing_attachments', 'advisory',
   'Ensure attachment points remain open for WP / note / evidence / validation_result kinds.'),
  ('TECH.MISSING_EVIDENCE', 'Missing Evidence', 'Finalized WPs or disclosures lacking supporting evidence linkage', 'technical', 'missing_evidence', 'significant',
   'Attach Supporting Evidence and evidence references to finalized Working Papers.'),
  ('TECH.SNAPSHOT_INTEGRITY', 'Snapshot Integrity', 'Reporting Snapshot Version certification / seal / hash integrity', 'technical', 'snapshot_integrity', 'blocking',
   'Certify (and preferably freeze) the Reporting Snapshot Version used for statements. Never use live GL.'),
  ('TECH.STATEMENT_CONSISTENCY', 'Statement Consistency', 'Articulation of primary statement totals from sealed statement instances', 'technical', 'statement_consistency', 'blocking',
   'Re-generate statements from the certified snapshot; do not adjust GL via Validation.')
ON CONFLICT (rule_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_severity = EXCLUDED.default_severity,
  recommendation_template = EXCLUDED.recommendation_template,
  status = 'active';

-- Framework rule templates (applicability via mappings; packs define rules only)
INSERT INTO efs_validation_rules (rule_code, name, description, engine_scope, category, default_severity, recommendation_template) VALUES
  ('FW.REQUIRED_DISCLOSURES', 'Required Disclosures Present', 'Framework-required disclosure instances assembled and not superseded', 'framework', 'framework_disclosure', 'blocking',
   'Assemble required disclosures from the bound Framework Pack mapping.'),
  ('FW.ACCOUNTING_POLICIES', 'Accounting Policies Present', 'Accounting policy set exists for the framework pack', 'framework', 'framework_policy', 'blocking',
   'Create and complete an Accounting Policy Set for the reporting period.'),
  ('FW.DISCLOSURE_COMPLETE', 'Disclosure Content Progress', 'Required disclosures advanced beyond draft', 'framework', 'framework_disclosure', 'significant',
   'Move required disclosure instances to in_progress or complete.'),
  ('FW.IFRS.BASIS', 'IFRS Basis of Preparation', 'IFRS pack expects basis-of-preparation disclosure', 'framework', 'framework_presentation', 'blocking',
   'Ensure DISC.BASIS (or NOTE.BASIS) disclosure instance exists.'),
  ('FW.IFRS_SME.SIMPLIFIED', 'IFRS for SMEs Simplified Disclosures', 'SME pack expects core policy + related party coverage', 'framework', 'framework_presentation', 'significant',
   'Ensure accounting policies and related-party disclosures exist under IFRS for SMEs.'),
  ('FW.GRAP.PUBLIC', 'GRAP Public Sector Presentation', 'GRAP pack expects policies and contingency disclosures', 'framework', 'framework_presentation', 'significant',
   'Complete GRAP accounting policies and contingent liability disclosures.'),
  ('FW.MCS.CASH', 'Modified Cash Standard Focus', 'MCS pack expects cash-flow oriented presentation disclosures', 'framework', 'framework_presentation', 'significant',
   'Ensure cash flow statement and MCS policy disclosures are present.'),
  ('FW.IPSAS.PUBLIC', 'IPSAS Public Sector Disclosures', 'IPSAS pack expects policy and related-party style disclosures', 'framework', 'framework_presentation', 'significant',
   'Assemble IPSAS required accounting policies and related disclosures.')
ON CONFLICT (rule_code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_severity = EXCLUDED.default_severity,
  recommendation_template = EXCLUDED.recommendation_template,
  status = 'active';

-- Bind technical rules to every active/published pack
INSERT INTO efs_framework_validation_mappings (framework_pack_id, rule_id, enabled, guidance_ref)
SELECT p.id, r.id, true, 'TECH/' || r.rule_code
FROM efs_framework_packs p
CROSS JOIN efs_validation_rules r
WHERE p.status IN ('published', 'active')
  AND r.engine_scope = 'technical'
  AND r.status = 'active'
ON CONFLICT (framework_pack_id, rule_id) DO NOTHING;

-- Bind shared framework rules to every pack
INSERT INTO efs_framework_validation_mappings (framework_pack_id, rule_id, enabled, guidance_ref)
SELECT p.id, r.id, true, 'FW/COMMON/' || r.rule_code
FROM efs_framework_packs p
CROSS JOIN efs_validation_rules r
WHERE p.status IN ('published', 'active')
  AND r.rule_code IN ('FW.REQUIRED_DISCLOSURES', 'FW.ACCOUNTING_POLICIES', 'FW.DISCLOSURE_COMPLETE')
ON CONFLICT (framework_pack_id, rule_id) DO NOTHING;

-- Framework-specific rules
INSERT INTO efs_framework_validation_mappings (framework_pack_id, rule_id, severity_override, enabled, guidance_ref)
SELECT p.id, r.id, NULL, true, 'FW/' || p.framework_key || '/' || r.rule_code
FROM efs_framework_packs p
JOIN efs_validation_rules r ON (
  (p.framework_key = 'IFRS' AND r.rule_code = 'FW.IFRS.BASIS')
  OR (p.framework_key = 'IFRS_SME' AND r.rule_code = 'FW.IFRS_SME.SIMPLIFIED')
  OR (p.framework_key = 'GRAP' AND r.rule_code = 'FW.GRAP.PUBLIC')
  OR (p.framework_key = 'MCS' AND r.rule_code = 'FW.MCS.CASH')
  OR (p.framework_key = 'IPSAS' AND r.rule_code = 'FW.IPSAS.PUBLIC')
)
WHERE p.status IN ('published', 'active')
ON CONFLICT (framework_pack_id, rule_id) DO NOTHING;

-- Ensure validation_result sockets on line items remain available (C1 seeded; re-ensure)
INSERT INTO efs_attachment_points (kind_code, structure_node_id, status)
SELECT 'validation_result', sn.id, 'open'
FROM efs_structure_nodes sn
WHERE sn.node_kind = 'line_item'
  AND NOT EXISTS (
    SELECT 1 FROM efs_attachment_points ap
    WHERE ap.structure_node_id = sn.id
      AND ap.kind_code = 'validation_result'
      AND ap.reserved_artefact_ref IS NULL
      AND ap.status = 'open'
  );

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efs_validation_runs',
    'efs_validation_issues'
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

ALTER TABLE efs_validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_framework_validation_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efs_validation_rules_select ON efs_validation_rules;
CREATE POLICY efs_validation_rules_select ON efs_validation_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_framework_validation_mappings_select ON efs_framework_validation_mappings;
CREATE POLICY efs_framework_validation_mappings_select ON efs_framework_validation_mappings FOR SELECT TO authenticated USING (true);
