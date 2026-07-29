-- =============================================================================
-- EFS V6.4.4 Phase C3 — Enterprise Disclosure Platform
-- Notes · Accounting Policies · Disclosure Templates · Cross References ·
-- Framework Disclosure Mapping
--
-- Owner of disclosure content ONLY. Does NOT implement Validation, Review
-- Workflow, Publication, XBRL, or AI generation.
--
-- Attachment: Structure Nodes (+ optional Disclosure scaffold nodes) via
-- efs_attachment_points. Never Statement Instance / Snapshot / GL / Journal.
-- Optional Working Paper linkage (reference, not attachment parent).
-- Additive. Accounting / Reports / Statement Engine untouched.
-- Idempotent: IF NOT EXISTS / ON CONFLICT / DROP TRIGGER IF EXISTS.
-- =============================================================================

-- ── Disclosure Templates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_disclosure_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE, -- null = platform
  template_code text NOT NULL,
  name text NOT NULL,
  disclosure_kind text NOT NULL DEFAULT 'note'
    CHECK (disclosure_kind IN (
      'note', 'accounting_policy', 'table', 'narrative', 'other'
    )),
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deprecated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_disclosure_templates_platform_code
  ON efs_disclosure_templates (template_code) WHERE company_id IS NULL;

CREATE TABLE IF NOT EXISTS efs_disclosure_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES efs_disclosure_templates(id) ON DELETE CASCADE,
  section_code text NOT NULL,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  required_flag boolean NOT NULL DEFAULT false,
  UNIQUE (template_id, section_code)
);

-- ── Framework Disclosure Mapping (pack → required disclosures) ───────────────
CREATE TABLE IF NOT EXISTS efs_framework_disclosure_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES efs_disclosure_templates(id) ON DELETE RESTRICT,
  disclosure_code text NOT NULL,
  requirement_level text NOT NULL DEFAULT 'required'
    CHECK (requirement_level IN ('required', 'conditional', 'optional')),
  sort_order int NOT NULL DEFAULT 100,
  structure_node_code text, -- preferred Statement Structure attachment (node_code)
  disclosure_node_code text, -- optional C1 scaffold disclosure_code
  guidance_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_pack_id, disclosure_code)
);

CREATE INDEX IF NOT EXISTS idx_efs_fw_disc_map_pack
  ON efs_framework_disclosure_mappings (framework_pack_id, sort_order);

-- ── Accounting Policy Platform ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_accounting_policy_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id) ON DELETE RESTRICT,
  title text NOT NULL DEFAULT 'Accounting Policies',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'superseded')),
  version_no int NOT NULL DEFAULT 1,
  prepared_by uuid,
  prepared_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_policy_sets_workspace
  ON efs_accounting_policy_sets (workspace_id, status);

CREATE TABLE IF NOT EXISTS efs_accounting_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_set_id uuid NOT NULL REFERENCES efs_accounting_policy_sets(id) ON DELETE CASCADE,
  policy_code text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 100,
  -- Optional link to disclosure instance / template (presentation only)
  disclosure_template_id uuid REFERENCES efs_disclosure_templates(id) ON DELETE SET NULL,
  structure_node_id uuid REFERENCES efs_structure_nodes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_set_id, policy_code)
);

-- ── Disclosure Instances (content owner) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_disclosure_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  template_id uuid REFERENCES efs_disclosure_templates(id) ON DELETE SET NULL,
  framework_pack_id uuid REFERENCES efs_framework_packs(id) ON DELETE RESTRICT,
  framework_mapping_id uuid REFERENCES efs_framework_disclosure_mappings(id) ON DELETE SET NULL,
  disclosure_code text NOT NULL,
  title text NOT NULL,
  disclosure_kind text NOT NULL DEFAULT 'note'
    CHECK (disclosure_kind IN (
      'note', 'accounting_policy', 'table', 'narrative', 'other'
    )),
  -- REQUIRED: certified Statement Structure attachment
  attachment_point_id uuid NOT NULL REFERENCES efs_attachment_points(id) ON DELETE RESTRICT,
  structure_node_id uuid NOT NULL REFERENCES efs_structure_nodes(id) ON DELETE RESTRICT,
  -- Optional C1 disclosure scaffold node
  disclosure_node_id uuid REFERENCES efs_disclosure_nodes(id) ON DELETE SET NULL,
  -- Optional WP linkage (reference — not attachment parent)
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE SET NULL,
  -- Optional policy set linkage
  accounting_policy_set_id uuid REFERENCES efs_accounting_policy_sets(id) ON DELETE SET NULL,
  requirement_level text NOT NULL DEFAULT 'required'
    CHECK (requirement_level IN ('required', 'conditional', 'optional', 'na')),
  -- Disclosure Status (content lifecycle — NOT formal review workflow)
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'complete', 'superseded')),
  note_number text,
  sort_order int NOT NULL DEFAULT 100,
  content_hash text,
  prepared_by uuid,
  prepared_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, disclosure_code)
);

CREATE INDEX IF NOT EXISTS idx_efs_disc_inst_workspace
  ON efs_disclosure_instances (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_efs_disc_inst_structure
  ON efs_disclosure_instances (structure_node_id);
CREATE INDEX IF NOT EXISTS idx_efs_disc_inst_attachment
  ON efs_disclosure_instances (attachment_point_id);
CREATE INDEX IF NOT EXISTS idx_efs_disc_inst_wp
  ON efs_disclosure_instances (working_paper_id)
  WHERE working_paper_id IS NOT NULL;

-- Disclosure Sections
CREATE TABLE IF NOT EXISTS efs_disclosure_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  disclosure_instance_id uuid NOT NULL REFERENCES efs_disclosure_instances(id) ON DELETE CASCADE,
  section_code text NOT NULL,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  body text NOT NULL DEFAULT '',
  UNIQUE (disclosure_instance_id, section_code)
);

-- Disclosure Paragraphs
CREATE TABLE IF NOT EXISTS efs_disclosure_paragraphs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  disclosure_instance_id uuid NOT NULL REFERENCES efs_disclosure_instances(id) ON DELETE CASCADE,
  section_id uuid REFERENCES efs_disclosure_sections(id) ON DELETE CASCADE,
  paragraph_code text NOT NULL,
  body text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 100,
  UNIQUE (disclosure_instance_id, paragraph_code)
);

-- Disclosure Tables (presentation metadata — no calculation engine)
CREATE TABLE IF NOT EXISTS efs_disclosure_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  disclosure_instance_id uuid NOT NULL REFERENCES efs_disclosure_instances(id) ON DELETE CASCADE,
  section_id uuid REFERENCES efs_disclosure_sections(id) ON DELETE SET NULL,
  table_code text NOT NULL,
  title text NOT NULL,
  columns_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  rows_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Optional sealed snapshot reference for provenance (NOT attachment parent)
  snapshot_version_id uuid REFERENCES efs_snapshot_versions(id) ON DELETE RESTRICT,
  sort_order int NOT NULL DEFAULT 100,
  UNIQUE (disclosure_instance_id, table_code)
);

-- Disclosure Reference (instance → structure / disclosure scaffold / WP)
CREATE TABLE IF NOT EXISTS efs_disclosure_content_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  disclosure_instance_id uuid NOT NULL REFERENCES efs_disclosure_instances(id) ON DELETE CASCADE,
  structure_node_id uuid REFERENCES efs_structure_nodes(id) ON DELETE CASCADE,
  disclosure_node_id uuid REFERENCES efs_disclosure_nodes(id) ON DELETE CASCADE,
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE CASCADE,
  reference_role text NOT NULL DEFAULT 'supports'
    CHECK (reference_role IN (
      'supports', 'explains', 'reconciles_to', 'discloses', 'other'
    )),
  reference_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_disc_content_ref_target_chk CHECK (
    structure_node_id IS NOT NULL
    OR disclosure_node_id IS NOT NULL
    OR working_paper_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_disc_content_ref_structure
  ON efs_disclosure_content_references (disclosure_instance_id, structure_node_id, reference_role)
  WHERE structure_node_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_disc_content_ref_wp
  ON efs_disclosure_content_references (disclosure_instance_id, working_paper_id, reference_role)
  WHERE working_paper_id IS NOT NULL;

-- Cross Reference Platform (bidirectional navigation graph — no validation)
CREATE TABLE IF NOT EXISTS efs_cross_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  -- Source
  source_kind text NOT NULL
    CHECK (source_kind IN (
      'disclosure_instance', 'disclosure_paragraph', 'disclosure_section',
      'disclosure_table', 'accounting_policy', 'structure_node', 'working_paper'
    )),
  source_id uuid NOT NULL,
  -- Target
  target_kind text NOT NULL
    CHECK (target_kind IN (
      'disclosure_instance', 'disclosure_paragraph', 'disclosure_section',
      'disclosure_table', 'accounting_policy', 'structure_node', 'working_paper'
    )),
  target_id uuid NOT NULL,
  -- Optional certified attachment point when either side is structure-bound
  attachment_point_id uuid REFERENCES efs_attachment_points(id) ON DELETE SET NULL,
  label text,
  bidirectional boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_xref_no_self CHECK (NOT (source_kind = target_kind AND source_id = target_id))
);

CREATE INDEX IF NOT EXISTS idx_efs_xref_workspace
  ON efs_cross_references (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_efs_xref_source
  ON efs_cross_references (source_kind, source_id);
CREATE INDEX IF NOT EXISTS idx_efs_xref_target
  ON efs_cross_references (target_kind, target_id);

-- ── Attachment integrity ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION efs_assert_disclosure_attachment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ap record;
BEGIN
  SELECT * INTO ap FROM efs_attachment_points WHERE id = NEW.attachment_point_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EFS_DISC_ATTACHMENT: attachment_point_id % not found', NEW.attachment_point_id;
  END IF;
  IF ap.kind_code <> 'note_placeholder' THEN
    RAISE EXCEPTION 'EFS_DISC_ATTACHMENT: disclosure instance requires kind note_placeholder';
  END IF;
  IF ap.structure_node_id IS NULL THEN
    RAISE EXCEPTION 'EFS_DISC_ATTACHMENT: disclosure must attach to certified Statement Structure node';
  END IF;
  IF NEW.structure_node_id IS DISTINCT FROM ap.structure_node_id THEN
    RAISE EXCEPTION 'EFS_DISC_ATTACHMENT: structure_node_id must match attachment point target';
  END IF;
  IF NEW.disclosure_node_id IS NOT NULL
     AND ap.disclosure_node_id IS NOT NULL
     AND NEW.disclosure_node_id IS DISTINCT FROM ap.disclosure_node_id THEN
    RAISE EXCEPTION 'EFS_DISC_ATTACHMENT: disclosure_node_id must match attachment point when both set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_disclosure_attachment ON efs_disclosure_instances;
CREATE TRIGGER trg_efs_disclosure_attachment
  BEFORE INSERT OR UPDATE OF attachment_point_id, structure_node_id, disclosure_node_id
  ON efs_disclosure_instances
  FOR EACH ROW EXECUTE FUNCTION efs_assert_disclosure_attachment();

CREATE OR REPLACE FUNCTION efs_deny_superseded_disclosure_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'superseded' THEN
      RAISE EXCEPTION 'EFS_DISC_IMMUTABLE: cannot delete superseded disclosure %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'superseded' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.structure_node_id IS DISTINCT FROM OLD.structure_node_id
       OR NEW.attachment_point_id IS DISTINCT FROM OLD.attachment_point_id
       OR NEW.title IS DISTINCT FROM OLD.title
    THEN
      RAISE EXCEPTION 'EFS_DISC_IMMUTABLE: superseded disclosure % cannot change', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_disclosure_immutable ON efs_disclosure_instances;
CREATE TRIGGER trg_efs_disclosure_immutable
  BEFORE UPDATE OR DELETE ON efs_disclosure_instances
  FOR EACH ROW EXECUTE FUNCTION efs_deny_superseded_disclosure_mutation();

CREATE OR REPLACE FUNCTION efs_assert_xref_attachment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ap record;
BEGIN
  IF NEW.attachment_point_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO ap FROM efs_attachment_points WHERE id = NEW.attachment_point_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EFS_XREF_ATTACHMENT: attachment_point_id % not found', NEW.attachment_point_id;
  END IF;
  IF ap.kind_code <> 'cross_reference' THEN
    RAISE EXCEPTION 'EFS_XREF_ATTACHMENT: cross reference attachment must be kind cross_reference';
  END IF;
  IF ap.structure_node_id IS NULL AND ap.disclosure_node_id IS NULL THEN
    RAISE EXCEPTION 'EFS_XREF_ATTACHMENT: cross reference requires structure or disclosure node';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_xref_attachment ON efs_cross_references;
CREATE TRIGGER trg_efs_xref_attachment
  BEFORE INSERT OR UPDATE OF attachment_point_id ON efs_cross_references
  FOR EACH ROW EXECUTE FUNCTION efs_assert_xref_attachment();

-- ── Seed platform disclosure templates ───────────────────────────────────────
INSERT INTO efs_disclosure_templates (company_id, template_code, name, disclosure_kind, description)
VALUES
  (NULL, 'NOTE.BASIS', 'Basis of preparation', 'note', 'Framework basis of preparation note'),
  (NULL, 'NOTE.POLICIES', 'Significant accounting policies', 'accounting_policy', 'Accounting policy disclosure note'),
  (NULL, 'NOTE.REVENUE', 'Revenue', 'note', 'Revenue recognition / disaggregation'),
  (NULL, 'NOTE.PPE', 'Property, plant and equipment', 'table', 'PPE rollforward / disclosures'),
  (NULL, 'NOTE.RELATED', 'Related parties', 'narrative', 'Related party disclosures'),
  (NULL, 'NOTE.EVENTS', 'Events after the reporting period', 'narrative', 'Subsequent events'),
  (NULL, 'NOTE.CONTINGENT', 'Contingencies and commitments', 'narrative', 'Contingencies / commitments')
ON CONFLICT DO NOTHING;

INSERT INTO efs_disclosure_template_sections (template_id, section_code, title, sort_order, required_flag)
SELECT t.id, v.code, v.title, v.sort_order, v.req
FROM efs_disclosure_templates t
JOIN (VALUES
  ('NOTE.BASIS', 'basis', 'Basis of preparation', 10, true),
  ('NOTE.BASIS', 'judgments', 'Critical judgments', 20, false),
  ('NOTE.POLICIES', 'overview', 'Policy overview', 10, true),
  ('NOTE.POLICIES', 'detail', 'Significant policies', 20, true),
  ('NOTE.REVENUE', 'policy', 'Recognition policy', 10, true),
  ('NOTE.REVENUE', 'disaggregation', 'Disaggregation', 20, false),
  ('NOTE.PPE', 'policy', 'Measurement policy', 10, true),
  ('NOTE.PPE', 'rollforward', 'Rollforward table', 20, true),
  ('NOTE.RELATED', 'identity', 'Related party identity', 10, true),
  ('NOTE.RELATED', 'transactions', 'Transactions', 20, true),
  ('NOTE.EVENTS', 'events', 'Events after reporting date', 10, true),
  ('NOTE.CONTINGENT', 'contingencies', 'Contingencies', 10, true),
  ('NOTE.CONTINGENT', 'commitments', 'Commitments', 20, false)
) AS v(tcode, code, title, sort_order, req)
  ON t.template_code = v.tcode AND t.company_id IS NULL
ON CONFLICT (template_id, section_code) DO NOTHING;

-- Map every published framework pack to the core disclosure catalogue
INSERT INTO efs_framework_disclosure_mappings (
  framework_pack_id, template_id, disclosure_code, requirement_level, sort_order,
  structure_node_code, disclosure_node_code, guidance_ref
)
SELECT
  p.id,
  t.id,
  v.dcode,
  v.req,
  v.sort_order,
  v.sncode,
  v.dncode,
  v.gref
FROM efs_framework_packs p
CROSS JOIN (VALUES
  ('NOTE.BASIS', 'DISC.BASIS', 'required', 10, 'NODE.STMT.SFP', 'DISC.ACCOUNTING_POLICIES', 'Framework basis'),
  ('NOTE.POLICIES', 'DISC.POLICIES', 'required', 20, 'NODE.STMT.SFP', 'DISC.ACCOUNTING_POLICIES', 'Significant policies'),
  ('NOTE.REVENUE', 'DISC.REVENUE', 'required', 30, 'NODE.LI.PERF.REVENUE', 'DISC.NOTES_INDEX', 'Revenue'),
  ('NOTE.PPE', 'DISC.PPE', 'conditional', 40, 'NODE.LI.SFP.ASSETS', 'DISC.NOTES_INDEX', 'PPE'),
  ('NOTE.RELATED', 'DISC.RELATED', 'required', 50, 'NODE.STMT.SFP', 'DISC.OTHER', 'Related parties'),
  ('NOTE.EVENTS', 'DISC.EVENTS', 'optional', 60, 'NODE.STMT.SFP', 'DISC.OTHER', 'Subsequent events'),
  ('NOTE.CONTINGENT', 'DISC.CONTINGENT', 'conditional', 70, 'NODE.STMT.SFP', 'DISC.OTHER', 'Contingencies')
) AS v(tcode, dcode, req, sort_order, sncode, dncode, gref)
JOIN efs_disclosure_templates t ON t.template_code = v.tcode AND t.company_id IS NULL
WHERE p.status IN ('published', 'active')
ON CONFLICT (framework_pack_id, disclosure_code) DO UPDATE
SET requirement_level = EXCLUDED.requirement_level,
    sort_order = EXCLUDED.sort_order,
    structure_node_code = EXCLUDED.structure_node_code,
    disclosure_node_code = EXCLUDED.disclosure_node_code,
    guidance_ref = EXCLUDED.guidance_ref,
    template_id = EXCLUDED.template_id;

-- Ensure note_placeholder attachment points exist on primary structure nodes used by mappings
INSERT INTO efs_attachment_points (kind_code, structure_node_id, status)
SELECT 'note_placeholder', sn.id, 'open'
FROM efs_structure_nodes sn
WHERE sn.node_code IN ('NODE.STMT.SFP', 'NODE.LI.PERF.REVENUE', 'NODE.LI.SFP.ASSETS')
  AND NOT EXISTS (
    SELECT 1 FROM efs_attachment_points ap
    WHERE ap.structure_node_id = sn.id
      AND ap.kind_code = 'note_placeholder'
      AND ap.reserved_artefact_ref IS NULL
      AND ap.status = 'open'
  );

INSERT INTO efs_attachment_points (kind_code, structure_node_id, status)
SELECT 'cross_reference', sn.id, 'open'
FROM efs_structure_nodes sn
WHERE sn.node_code IN ('NODE.STMT.SFP', 'NODE.LI.PERF.REVENUE', 'NODE.LI.SFP.ASSETS')
  AND NOT EXISTS (
    SELECT 1 FROM efs_attachment_points ap
    WHERE ap.structure_node_id = sn.id
      AND ap.kind_code = 'cross_reference'
      AND ap.reserved_artefact_ref IS NULL
      AND ap.status = 'open'
  );

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efs_disclosure_instances',
    'efs_disclosure_sections',
    'efs_disclosure_paragraphs',
    'efs_disclosure_tables',
    'efs_disclosure_content_references',
    'efs_cross_references',
    'efs_accounting_policy_sets',
    'efs_accounting_policies'
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

ALTER TABLE efs_disclosure_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_disclosure_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_framework_disclosure_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efs_disclosure_templates_select ON efs_disclosure_templates;
CREATE POLICY efs_disclosure_templates_select ON efs_disclosure_templates FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
DROP POLICY IF EXISTS efs_disclosure_template_sections_select ON efs_disclosure_template_sections;
CREATE POLICY efs_disclosure_template_sections_select ON efs_disclosure_template_sections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_framework_disclosure_mappings_select ON efs_framework_disclosure_mappings;
CREATE POLICY efs_framework_disclosure_mappings_select ON efs_framework_disclosure_mappings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS efs_disclosure_templates_mutate ON efs_disclosure_templates;
CREATE POLICY efs_disclosure_templates_mutate ON efs_disclosure_templates FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
