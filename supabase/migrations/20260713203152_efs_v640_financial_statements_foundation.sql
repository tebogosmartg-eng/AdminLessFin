-- =============================================================================
-- EFS V6.4.0 Phase A — Financial Statements Foundation
-- Reporting Workspace / Period / Framework / Snapshot / Snapshot Version
-- Additive only. Does not alter Accounting, Reports, Payroll, or Assets schemas.
-- =============================================================================

-- ── Platform framework catalogue (cross-tenant) ──────────────────────────────
CREATE TABLE IF NOT EXISTS efs_frameworks (
  framework_key text PRIMARY KEY,
  name text NOT NULL,
  jurisdiction_scope text NOT NULL DEFAULT 'multi',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deprecated', 'draft')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS efs_framework_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_key text NOT NULL REFERENCES efs_frameworks(framework_key),
  version_id text NOT NULL,
  label text NOT NULL,
  effective_from date,
  effective_to date,
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'active', 'deprecated')),
  content_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_key, version_id)
);

INSERT INTO efs_frameworks (framework_key, name, jurisdiction_scope, status) VALUES
  ('IFRS', 'IFRS', 'global', 'active'),
  ('IFRS_SME', 'IFRS for SMEs', 'global', 'active'),
  ('GRAP', 'GRAP (South Africa)', 'ZA', 'active'),
  ('MCS', 'Modified Cash Standard', 'ZA', 'active'),
  ('IPSAS', 'IPSAS', 'global', 'active')
ON CONFLICT (framework_key) DO NOTHING;

INSERT INTO efs_framework_packs (framework_key, version_id, label, effective_from, status, content_ref) VALUES
  ('IFRS', '2026.1', 'IFRS Pack 2026.1', '2026-01-01', 'active', 'platform://frameworks/IFRS/2026.1'),
  ('IFRS_SME', '2026.1', 'IFRS for SMEs Pack 2026.1', '2026-01-01', 'active', 'platform://frameworks/IFRS_SME/2026.1'),
  ('GRAP', '2026.1', 'GRAP Pack 2026.1', '2026-01-01', 'active', 'platform://frameworks/GRAP/2026.1'),
  ('MCS', '2026.1', 'MCS Pack 2026.1', '2026-01-01', 'active', 'platform://frameworks/MCS/2026.1'),
  ('IPSAS', '2026.1', 'IPSAS Pack 2026.1', '2026-01-01', 'active', 'platform://frameworks/IPSAS/2026.1')
ON CONFLICT (framework_key, version_id) DO NOTHING;

-- ── Reporting Entity (tenant; default 1:1 with company) ──────────────────────
CREATE TABLE IF NOT EXISTS efs_reporting_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'company'
    CHECK (entity_type IN ('company', 'group_parent_reserved')),
  parent_ref uuid,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_reporting_entities_default
  ON efs_reporting_entities (company_id)
  WHERE is_default = true;

-- ── Reporting Period ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_reporting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reporting_entity_id uuid NOT NULL REFERENCES efs_reporting_entities(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN (
      'planned',
      'open_for_reporting',
      'facts_extractable',
      'frozen',
      'closed_for_reporting'
    )),
  opened_by uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efs_reporting_periods_bounds CHECK (end_date >= start_date),
  UNIQUE (company_id, reporting_entity_id, period_key)
);

-- ── Framework Binding ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_framework_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reporting_entity_id uuid NOT NULL REFERENCES efs_reporting_entities(id) ON DELETE CASCADE,
  framework_pack_id uuid NOT NULL REFERENCES efs_framework_packs(id),
  reporting_period_id uuid REFERENCES efs_reporting_periods(id) ON DELETE SET NULL,
  period_from date,
  period_to date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded')),
  bound_by uuid,
  bound_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_framework_bindings_entity
  ON efs_framework_bindings (company_id, reporting_entity_id);

-- ── Reporting Workspace (engagement container) ───────────────────────────────
CREATE TABLE IF NOT EXISTS efs_reporting_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reporting_entity_id uuid NOT NULL REFERENCES efs_reporting_entities(id) ON DELETE CASCADE,
  reporting_period_id uuid NOT NULL REFERENCES efs_reporting_periods(id) ON DELETE RESTRICT,
  framework_binding_id uuid REFERENCES efs_framework_bindings(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'opened'
    CHECK (status IN (
      'opened',
      'facts_sealed',
      'content_assembled',
      'validated',
      'in_review',
      'approved',
      'published',
      'archived'
    )),
  progress_pct numeric(5,2) NOT NULL DEFAULT 0,
  opened_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, reporting_entity_id, reporting_period_id)
);

CREATE INDEX IF NOT EXISTS idx_efs_reporting_workspaces_company
  ON efs_reporting_workspaces (company_id, status);

-- ── Reporting Snapshot lineage ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_reporting_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  reporting_period_id uuid NOT NULL REFERENCES efs_reporting_periods(id) ON DELETE RESTRICT,
  reporting_entity_id uuid NOT NULL REFERENCES efs_reporting_entities(id) ON DELETE CASCADE,
  lineage_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'certified',
      'frozen',
      'published_reference',
      'superseded'
    )),
  current_version_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, lineage_key)
);

-- ── Snapshot Version (immutable after certify for content) ───────────────────
CREATE TABLE IF NOT EXISTS efs_snapshot_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES efs_reporting_snapshots(id) ON DELETE CASCADE,
  version_no int NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'created',
      'draft',
      'certified',
      'frozen',
      'publication_bound',
      'superseded'
    )),
  content_hash text,
  predecessor_id uuid REFERENCES efs_snapshot_versions(id),
  extract_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_rpc_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  certified_by uuid,
  certified_at timestamptz,
  frozen_by uuid,
  frozen_at timestamptz,
  supersession_rationale text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, version_no)
);

ALTER TABLE efs_reporting_snapshots
  DROP CONSTRAINT IF EXISTS efs_reporting_snapshots_current_version_id_fkey;
ALTER TABLE efs_reporting_snapshots
  ADD CONSTRAINT efs_reporting_snapshots_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES efs_snapshot_versions(id);

-- ── Fact Snapshot (sealed Accounting extract — immutable after seal) ─────────
CREATE TABLE IF NOT EXISTS efs_fact_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_version_id uuid NOT NULL UNIQUE REFERENCES efs_snapshot_versions(id) ON DELETE CASCADE,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  sealed_by uuid,
  content_hash text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  prior_as_of date,
  source_rpc_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  dataset jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Comparative Snapshot binding (version-pinned) ────────────────────────────
CREATE TABLE IF NOT EXISTS efs_comparative_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_version_id uuid NOT NULL REFERENCES efs_snapshot_versions(id) ON DELETE CASCADE,
  prior_snapshot_version_id uuid NOT NULL REFERENCES efs_snapshot_versions(id) ON DELETE RESTRICT,
  label text NOT NULL DEFAULT 'prior_period',
  bound_at timestamptz NOT NULL DEFAULT now(),
  bound_by uuid,
  UNIQUE (snapshot_version_id, label)
);

-- ── Workspace activity (dashboard recent activity) ───────────────────────────
CREATE TABLE IF NOT EXISTS efs_workspace_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  actor_user_id uuid,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_workspace_activity_ws
  ON efs_workspace_activity (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS efs_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor_user_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Immutability: sealed fact snapshots cannot be updated/deleted ────────────
CREATE OR REPLACE FUNCTION efs_deny_fact_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'EFS_IMMUTABLE: Fact Snapshot % cannot be mutated after seal', OLD.id
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_fact_snapshots_immutable ON efs_fact_snapshots;
CREATE TRIGGER trg_efs_fact_snapshots_immutable
  BEFORE UPDATE OR DELETE ON efs_fact_snapshots
  FOR EACH ROW EXECUTE FUNCTION efs_deny_fact_snapshot_mutation();

-- Certified / frozen / publication_bound / superseded versions: block content rewrite
CREATE OR REPLACE FUNCTION efs_protect_snapshot_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('certified', 'frozen', 'publication_bound', 'superseded') THEN
      RAISE EXCEPTION 'EFS_IMMUTABLE: Snapshot Version % in status % cannot be deleted', OLD.id, OLD.status
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('certified', 'frozen', 'publication_bound', 'superseded') THEN
    -- Allow only status progression / supersession metadata; never rewrite extract payload or hash
    IF NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.extract_summary IS DISTINCT FROM OLD.extract_summary
       OR NEW.source_rpc_refs IS DISTINCT FROM OLD.source_rpc_refs
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
    THEN
      RAISE EXCEPTION 'EFS_IMMUTABLE: Snapshot Version % content is immutable in status %', OLD.id, OLD.status
        USING ERRCODE = 'P0001';
    END IF;

    -- Disallow regressing status (e.g. frozen → draft)
    IF OLD.status = 'frozen' AND NEW.status NOT IN ('frozen', 'publication_bound', 'superseded') THEN
      RAISE EXCEPTION 'EFS_IMMUTABLE: cannot unfreeze Snapshot Version % in place; create successor', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    IF OLD.status = 'certified' AND NEW.status NOT IN ('certified', 'frozen', 'publication_bound', 'superseded') THEN
      RAISE EXCEPTION 'EFS_IMMUTABLE: cannot regress Snapshot Version % from certified', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_snapshot_versions_protect ON efs_snapshot_versions;
CREATE TRIGGER trg_efs_snapshot_versions_protect
  BEFORE UPDATE OR DELETE ON efs_snapshot_versions
  FOR EACH ROW EXECUTE FUNCTION efs_protect_snapshot_version();

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_efs_reporting_periods_company
  ON efs_reporting_periods (company_id, status);
CREATE INDEX IF NOT EXISTS idx_efs_reporting_snapshots_ws
  ON efs_reporting_snapshots (workspace_id);
CREATE INDEX IF NOT EXISTS idx_efs_snapshot_versions_snapshot
  ON efs_snapshot_versions (snapshot_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_efs_fact_snapshots_company
  ON efs_fact_snapshots (company_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efs_reporting_entities',
    'efs_reporting_periods',
    'efs_framework_bindings',
    'efs_reporting_workspaces',
    'efs_reporting_snapshots',
    'efs_snapshot_versions',
    'efs_fact_snapshots',
    'efs_comparative_bindings',
    'efs_workspace_activity',
    'efs_audit_events'
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

-- Platform framework tables: read for authenticated; writes via service role / migrations only
ALTER TABLE efs_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE efs_framework_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS efs_frameworks_select ON efs_frameworks;
CREATE POLICY efs_frameworks_select ON efs_frameworks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS efs_framework_packs_select ON efs_framework_packs;
CREATE POLICY efs_framework_packs_select ON efs_framework_packs FOR SELECT TO authenticated USING (true);
