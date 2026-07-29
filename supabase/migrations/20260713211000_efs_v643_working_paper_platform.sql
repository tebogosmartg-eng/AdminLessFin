-- =============================================================================
-- EFS V6.4.3 Phase C2 — Working Paper Platform
-- WP / Templates / Sections / Lead Schedules / Evidence / Review Notes
-- Attach ONLY via efs_attachment_points → structure nodes (never Statement Instance,
-- Snapshot, GL, or Journal as attachment parent).
-- Additive. Accounting / Reports / Statement Engine / Facts Adapter untouched.
-- Idempotent: IF NOT EXISTS / ON CONFLICT.
-- =============================================================================

-- ── Templates ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_wp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE, -- null = platform template
  template_code text NOT NULL,
  name text NOT NULL,
  wp_type text NOT NULL DEFAULT 'procedure'
    CHECK (wp_type IN (
      'procedure', 'balance', 'judgment', 'tie_out', 'adjustment', 'disclosure', 'other'
    )),
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deprecated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_wp_templates_platform_code
  ON efs_wp_templates (template_code) WHERE company_id IS NULL;

CREATE TABLE IF NOT EXISTS efs_wp_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES efs_wp_templates(id) ON DELETE CASCADE,
  section_code text NOT NULL,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 100,
  required_flag boolean NOT NULL DEFAULT false,
  UNIQUE (template_id, section_code)
);

-- ── Working Papers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_working_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  template_id uuid REFERENCES efs_wp_templates(id) ON DELETE SET NULL,
  -- REQUIRED: attachment point of kind working_paper with structure_node_id
  attachment_point_id uuid NOT NULL REFERENCES efs_attachment_points(id) ON DELETE RESTRICT,
  structure_node_id uuid NOT NULL REFERENCES efs_structure_nodes(id) ON DELETE RESTRICT,
  title text NOT NULL,
  wp_type text NOT NULL DEFAULT 'procedure'
    CHECK (wp_type IN (
      'procedure', 'balance', 'judgment', 'tie_out', 'adjustment', 'disclosure', 'other'
    )),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'reviewed', 'finalized', 'superseded')),
  assertion text,
  -- Optional reference only (NOT attachment parent) — set when finalized against snapshot figures
  snapshot_version_id uuid REFERENCES efs_snapshot_versions(id) ON DELETE RESTRICT,
  prepared_by uuid,
  prepared_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  current_version_no int NOT NULL DEFAULT 1,
  content_hash text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_wp_workspace ON efs_working_papers (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_efs_wp_structure_node ON efs_working_papers (structure_node_id);
CREATE INDEX IF NOT EXISTS idx_efs_wp_attachment ON efs_working_papers (attachment_point_id);

CREATE TABLE IF NOT EXISTS efs_working_paper_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  working_paper_id uuid NOT NULL REFERENCES efs_working_papers(id) ON DELETE CASCADE,
  section_code text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 100,
  UNIQUE (working_paper_id, section_code)
);

CREATE TABLE IF NOT EXISTS efs_working_paper_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  working_paper_id uuid NOT NULL REFERENCES efs_working_papers(id) ON DELETE CASCADE,
  version_no int NOT NULL,
  status text NOT NULL
    CHECK (status IN ('draft', 'submitted', 'reviewed', 'finalized', 'superseded')),
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  author_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (working_paper_id, version_no)
);

-- ── Lead Schedules ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_lead_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  attachment_point_id uuid NOT NULL REFERENCES efs_attachment_points(id) ON DELETE RESTRICT,
  structure_node_id uuid NOT NULL REFERENCES efs_structure_nodes(id) ON DELETE RESTRICT,
  title text NOT NULL,
  schedule_type text NOT NULL DEFAULT 'rollforward'
    CHECK (schedule_type IN ('rollforward', 'composition', 'aging_support', 'other')),
  control_account_ref text,
  currency text NOT NULL DEFAULT 'ZAR',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  closing_balance numeric(18,2) NOT NULL DEFAULT 0,
  variance_to_gl numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'prepared', 'reviewed', 'locked_to_snapshot', 'superseded')),
  snapshot_version_id uuid REFERENCES efs_snapshot_versions(id) ON DELETE RESTRICT,
  prepared_by uuid,
  prepared_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  content_hash text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_lead_workspace ON efs_lead_schedules (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_efs_lead_structure_node ON efs_lead_schedules (structure_node_id);

CREATE TABLE IF NOT EXISTS efs_lead_schedule_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_schedule_id uuid NOT NULL REFERENCES efs_lead_schedules(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  description text NOT NULL,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  movement_type text NOT NULL DEFAULT 'movement'
    CHECK (movement_type IN ('opening', 'movement', 'closing', 'other')),
  -- Traceability ref (journal id text / WP id / external) — NOT a FK to live GL as parent
  source_ref text,
  taxonomy_hint text,
  UNIQUE (lead_schedule_id, line_no)
);

-- ── Supporting Evidence ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_supporting_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  attachment_point_id uuid NOT NULL REFERENCES efs_attachment_points(id) ON DELETE RESTRICT,
  structure_node_id uuid REFERENCES efs_structure_nodes(id) ON DELETE RESTRICT,
  disclosure_node_id uuid REFERENCES efs_disclosure_nodes(id) ON DELETE RESTRICT,
  title text NOT NULL,
  evidence_type text NOT NULL DEFAULT 'document'
    CHECK (evidence_type IN ('document', 'confirmation', 'spreadsheet', 'screenshot', 'other')),
  storage_ref text,
  content_hash text,
  prepared_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_evidence_node_chk CHECK (
    structure_node_id IS NOT NULL OR disclosure_node_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS efs_evidence_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES efs_supporting_evidence(id) ON DELETE CASCADE,
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE CASCADE,
  lead_schedule_id uuid REFERENCES efs_lead_schedules(id) ON DELETE CASCADE,
  reference_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_evidence_ref_target_chk CHECK (
    working_paper_id IS NOT NULL OR lead_schedule_id IS NOT NULL
  )
);

-- ── Review platform (artefact-level notes — NOT full Manager/Partner workflow) ─
CREATE TABLE IF NOT EXISTS efs_tick_mark_catalogue (
  tick_code text PRIMARY KEY,
  label text NOT NULL,
  description text
);

INSERT INTO efs_tick_mark_catalogue (tick_code, label, description) VALUES
  ('F', 'Footed', 'Cast checked'),
  ('TB', 'Tied to TB', 'Agrees to trial balance / fact seal'),
  ('GL', 'Tied to GL', 'Agrees to general ledger extract (reference only)'),
  ('C', 'Confirmed', 'External confirmation obtained'),
  ('R', 'Recalculated', 'Independently recalculated'),
  ('N/A', 'Not applicable', 'Procedure not applicable')
ON CONFLICT (tick_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS efs_reviewer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE CASCADE,
  lead_schedule_id uuid REFERENCES efs_lead_schedules(id) ON DELETE CASCADE,
  assignee_user_id uuid NOT NULL,
  role_label text NOT NULL DEFAULT 'reviewer'
    CHECK (role_label IN ('preparer', 'reviewer', 'manager', 'partner')),
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'accepted', 'completed', 'reassigned')),
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_reviewer_assignment_target_chk CHECK (
    working_paper_id IS NOT NULL OR lead_schedule_id IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS efs_review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE CASCADE,
  lead_schedule_id uuid REFERENCES efs_lead_schedules(id) ON DELETE CASCADE,
  structure_node_id uuid REFERENCES efs_structure_nodes(id) ON DELETE SET NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'cleared', 'waived')),
  tick_code text REFERENCES efs_tick_mark_catalogue(tick_code),
  author_user_id uuid,
  cleared_by uuid,
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_review_note_target_chk CHECK (
    working_paper_id IS NOT NULL OR lead_schedule_id IS NOT NULL
  )
);

-- Immutable review history append-only
CREATE TABLE IF NOT EXISTS efs_review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE CASCADE,
  lead_schedule_id uuid REFERENCES efs_lead_schedules(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid,
  from_status text,
  to_status text,
  tick_code text,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_review_history_wp ON efs_review_history (working_paper_id, created_at);
CREATE INDEX IF NOT EXISTS idx_efs_review_history_lead ON efs_review_history (lead_schedule_id, created_at);

-- ── Attachment integrity triggers ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION efs_assert_wp_attachment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ap record;
BEGIN
  SELECT * INTO ap FROM efs_attachment_points WHERE id = NEW.attachment_point_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EFS_WP_ATTACHMENT: attachment_point_id % not found', NEW.attachment_point_id;
  END IF;
  IF ap.kind_code <> 'working_paper' THEN
    RAISE EXCEPTION 'EFS_WP_ATTACHMENT: attachment point must be kind working_paper';
  END IF;
  IF ap.structure_node_id IS NULL THEN
    RAISE EXCEPTION 'EFS_WP_ATTACHMENT: Working Papers must attach to Statement Structure nodes only';
  END IF;
  IF NEW.structure_node_id IS DISTINCT FROM ap.structure_node_id THEN
    RAISE EXCEPTION 'EFS_WP_ATTACHMENT: structure_node_id must match attachment point target';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_wp_attachment ON efs_working_papers;
CREATE TRIGGER trg_efs_wp_attachment
  BEFORE INSERT OR UPDATE OF attachment_point_id, structure_node_id ON efs_working_papers
  FOR EACH ROW EXECUTE FUNCTION efs_assert_wp_attachment();

CREATE OR REPLACE FUNCTION efs_assert_lead_attachment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ap record;
BEGIN
  SELECT * INTO ap FROM efs_attachment_points WHERE id = NEW.attachment_point_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EFS_LEAD_ATTACHMENT: attachment_point_id % not found', NEW.attachment_point_id;
  END IF;
  IF ap.kind_code <> 'lead_schedule' THEN
    RAISE EXCEPTION 'EFS_LEAD_ATTACHMENT: attachment point must be kind lead_schedule';
  END IF;
  IF ap.structure_node_id IS NULL THEN
    RAISE EXCEPTION 'EFS_LEAD_ATTACHMENT: Lead Schedules must attach to certified Structure nodes only';
  END IF;
  IF NEW.structure_node_id IS DISTINCT FROM ap.structure_node_id THEN
    RAISE EXCEPTION 'EFS_LEAD_ATTACHMENT: structure_node_id must match attachment point target';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_lead_attachment ON efs_lead_schedules;
CREATE TRIGGER trg_efs_lead_attachment
  BEFORE INSERT OR UPDATE OF attachment_point_id, structure_node_id ON efs_lead_schedules
  FOR EACH ROW EXECUTE FUNCTION efs_assert_lead_attachment();

CREATE OR REPLACE FUNCTION efs_assert_evidence_attachment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ap record;
BEGIN
  SELECT * INTO ap FROM efs_attachment_points WHERE id = NEW.attachment_point_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EFS_EVIDENCE_ATTACHMENT: attachment_point_id % not found', NEW.attachment_point_id;
  END IF;
  IF ap.kind_code <> 'supporting_evidence' THEN
    RAISE EXCEPTION 'EFS_EVIDENCE_ATTACHMENT: attachment point must be kind supporting_evidence';
  END IF;
  IF ap.structure_node_id IS NULL AND ap.disclosure_node_id IS NULL THEN
    RAISE EXCEPTION 'EFS_EVIDENCE_ATTACHMENT: evidence requires structure or disclosure node';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_evidence_attachment ON efs_supporting_evidence;
CREATE TRIGGER trg_efs_evidence_attachment
  BEFORE INSERT OR UPDATE OF attachment_point_id ON efs_supporting_evidence
  FOR EACH ROW EXECUTE FUNCTION efs_assert_evidence_attachment();

-- Finalized WP versions + review history are immutable
CREATE OR REPLACE FUNCTION efs_deny_finalized_wp_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('finalized', 'superseded') THEN
      RAISE EXCEPTION 'EFS_WP_IMMUTABLE: cannot delete finalized/superseded WP version %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('finalized', 'superseded') THEN
    RAISE EXCEPTION 'EFS_WP_IMMUTABLE: cannot mutate finalized/superseded WP version %', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_wp_versions_immutable ON efs_working_paper_versions;
CREATE TRIGGER trg_efs_wp_versions_immutable
  BEFORE UPDATE OR DELETE ON efs_working_paper_versions
  FOR EACH ROW EXECUTE FUNCTION efs_deny_finalized_wp_version_mutation();

CREATE OR REPLACE FUNCTION efs_deny_review_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'EFS_REVIEW_HISTORY_IMMUTABLE: review history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_review_history_immutable ON efs_review_history;
CREATE TRIGGER trg_efs_review_history_immutable
  BEFORE UPDATE OR DELETE ON efs_review_history
  FOR EACH ROW EXECUTE FUNCTION efs_deny_review_history_mutation();

CREATE OR REPLACE FUNCTION efs_deny_locked_lead_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('locked_to_snapshot', 'superseded') THEN
      RAISE EXCEPTION 'EFS_LEAD_IMMUTABLE: cannot delete locked/superseded lead %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'locked_to_snapshot' THEN
    IF NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
       OR NEW.closing_balance IS DISTINCT FROM OLD.closing_balance
       OR NEW.structure_node_id IS DISTINCT FROM OLD.structure_node_id
       OR NEW.attachment_point_id IS DISTINCT FROM OLD.attachment_point_id
    THEN
      RAISE EXCEPTION 'EFS_LEAD_IMMUTABLE: locked lead % content cannot change', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_lead_immutable ON efs_lead_schedules;
CREATE TRIGGER trg_efs_lead_immutable
  BEFORE UPDATE OR DELETE ON efs_lead_schedules
  FOR EACH ROW EXECUTE FUNCTION efs_deny_locked_lead_mutation();

-- ── Seed platform WP templates ───────────────────────────────────────────────
INSERT INTO efs_wp_templates (company_id, template_code, name, wp_type, description)
VALUES
  (NULL, 'WP.BALANCE', 'Balance Working Paper', 'balance', 'Supports statement line balances'),
  (NULL, 'WP.PROCEDURE', 'Procedure Working Paper', 'procedure', 'Documents close procedures'),
  (NULL, 'WP.TIEOUT', 'Tie-out Working Paper', 'tie_out', 'Ties statement line to lead / facts'),
  (NULL, 'WP.JUDGMENT', 'Judgment Working Paper', 'judgment', 'Significant estimates and judgments')
ON CONFLICT DO NOTHING;

INSERT INTO efs_wp_template_sections (template_id, section_code, title, sort_order, required_flag)
SELECT t.id, v.code, v.title, v.sort_order, v.req
FROM efs_wp_templates t
JOIN (VALUES
  ('WP.BALANCE', 'purpose', 'Purpose', 10, true),
  ('WP.BALANCE', 'work_performed', 'Work performed', 20, true),
  ('WP.BALANCE', 'conclusion', 'Conclusion', 30, true),
  ('WP.PROCEDURE', 'purpose', 'Purpose', 10, true),
  ('WP.PROCEDURE', 'work_performed', 'Work performed', 20, true),
  ('WP.PROCEDURE', 'conclusion', 'Conclusion', 30, true),
  ('WP.TIEOUT', 'purpose', 'Purpose', 10, true),
  ('WP.TIEOUT', 'tie_out', 'Tie-out schedule', 20, true),
  ('WP.TIEOUT', 'conclusion', 'Conclusion', 30, true),
  ('WP.JUDGMENT', 'purpose', 'Purpose', 10, true),
  ('WP.JUDGMENT', 'judgment', 'Judgment & rationale', 20, true),
  ('WP.JUDGMENT', 'conclusion', 'Conclusion', 30, true)
) AS v(tcode, code, title, sort_order, req) ON t.template_code = v.tcode AND t.company_id IS NULL
ON CONFLICT (template_id, section_code) DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efs_working_papers',
    'efs_working_paper_sections',
    'efs_working_paper_versions',
    'efs_lead_schedules',
    'efs_lead_schedule_lines',
    'efs_supporting_evidence',
    'efs_evidence_references',
    'efs_reviewer_assignments',
    'efs_review_notes',
    'efs_review_history'
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

ALTER TABLE efs_wp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_wp_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_tick_mark_catalogue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efs_wp_templates_select ON efs_wp_templates;
CREATE POLICY efs_wp_templates_select ON efs_wp_templates FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
DROP POLICY IF EXISTS efs_wp_template_sections_select ON efs_wp_template_sections;
CREATE POLICY efs_wp_template_sections_select ON efs_wp_template_sections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_tick_mark_catalogue_select ON efs_tick_mark_catalogue;
CREATE POLICY efs_tick_mark_catalogue_select ON efs_tick_mark_catalogue FOR SELECT TO authenticated USING (true);

-- Tenant may insert company-scoped templates
DROP POLICY IF EXISTS efs_wp_templates_mutate ON efs_wp_templates;
CREATE POLICY efs_wp_templates_mutate ON efs_wp_templates FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
