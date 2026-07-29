-- =============================================================================
-- EFS V6.5.3 Phase E — Enterprise Publication Platform
-- Publication Pack · Version · Metadata · Fingerprint · Seal · History ·
-- Record · Archive · Download (PDF / Word / Excel)
--
-- Consumes publication_ready engagements ONLY. Never reads live GL.
-- Never recalculates balances. Immutable publication artefacts.
--
-- Does NOT implement: XBRL · AI
-- Additive. Accounting / Reports / Navigation untouched.
-- Idempotent: IF NOT EXISTS / ON CONFLICT / DROP TRIGGER IF EXISTS.
-- =============================================================================

-- ── Publication Pack (immutable assembled engagement) ───────────────────────
CREATE TABLE IF NOT EXISTS efs_publication_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  pack_review_id uuid NOT NULL REFERENCES efs_pack_reviews(id) ON DELETE RESTRICT,
  snapshot_version_id uuid NOT NULL REFERENCES efs_snapshot_versions(id) ON DELETE RESTRICT,
  validation_run_id uuid REFERENCES efs_validation_runs(id) ON DELETE RESTRICT,
  version_no integer NOT NULL DEFAULT 1,
  -- Review attestation fingerprint (from D2) at seal time
  pack_fingerprint text NOT NULL,
  -- Full publication pack content hash (dataset canonical JSON)
  publication_fingerprint text NOT NULL,
  publication_seal_hash text NOT NULL,
  content_hash text NOT NULL,
  dataset jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'sealed'
    CHECK (status IN ('assembled', 'sealed', 'archived')),
  mutates_accounting boolean NOT NULL DEFAULT false CHECK (mutates_accounting = false),
  sealed_by uuid,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_review_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_efs_publication_packs_workspace
  ON efs_publication_packs (workspace_id, company_id);
CREATE INDEX IF NOT EXISTS idx_efs_publication_packs_fingerprint
  ON efs_publication_packs (publication_fingerprint);

-- ── Publication Record (execution of publication pipeline) ───────────────────
CREATE TABLE IF NOT EXISTS efs_publication_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  pack_review_id uuid NOT NULL REFERENCES efs_pack_reviews(id) ON DELETE RESTRICT,
  publication_pack_id uuid NOT NULL REFERENCES efs_publication_packs(id) ON DELETE RESTRICT,
  publication_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed')),
  executed_by uuid,
  executed_at timestamptz NOT NULL DEFAULT now(),
  mutates_accounting boolean NOT NULL DEFAULT false CHECK (mutates_accounting = false),
  archive_status text NOT NULL DEFAULT 'archived'
    CHECK (archive_status IN ('pending', 'archived')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_publication_records_pack_review
  ON efs_publication_records (pack_review_id) WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_efs_publication_records_workspace
  ON efs_publication_records (workspace_id, company_id);

-- ── Publication Artifacts (immutable PDF / DOCX / XLSX) ──────────────────────
CREATE TABLE IF NOT EXISTS efs_publication_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  publication_record_id uuid NOT NULL REFERENCES efs_publication_records(id) ON DELETE RESTRICT,
  publication_pack_id uuid NOT NULL REFERENCES efs_publication_packs(id) ON DELETE RESTRICT,
  format text NOT NULL CHECK (format IN ('pdf', 'docx', 'xlsx')),
  content_hash text NOT NULL,
  byte_size integer NOT NULL DEFAULT 0,
  content_base64 text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_record_id, format)
);

CREATE INDEX IF NOT EXISTS idx_efs_publication_artifacts_pack
  ON efs_publication_artifacts (publication_pack_id, format);

-- ── Publication History (immutable audit trail) ───────────────────────────────
CREATE TABLE IF NOT EXISTS efs_publication_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  publication_record_id uuid REFERENCES efs_publication_records(id) ON DELETE SET NULL,
  publication_pack_id uuid REFERENCES efs_publication_packs(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_user_id uuid,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_publication_history_workspace
  ON efs_publication_history (workspace_id, created_at DESC);

CREATE OR REPLACE FUNCTION efs_deny_publication_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'EFS_PUBLICATION_HISTORY_IMMUTABLE: publication history cannot be altered';
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_publication_history_immutable ON efs_publication_history;
CREATE TRIGGER trg_efs_publication_history_immutable
  BEFORE UPDATE OR DELETE ON efs_publication_history
  FOR EACH ROW EXECUTE FUNCTION efs_deny_publication_history_mutation();

CREATE OR REPLACE FUNCTION efs_deny_publication_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'EFS_PUBLICATION_ARTIFACT_IMMUTABLE: publication artefacts cannot be altered';
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_publication_artifacts_immutable ON efs_publication_artifacts;
CREATE TRIGGER trg_efs_publication_artifacts_immutable
  BEFORE UPDATE OR DELETE ON efs_publication_artifacts
  FOR EACH ROW EXECUTE FUNCTION efs_deny_publication_artifact_mutation();

CREATE OR REPLACE FUNCTION efs_deny_publication_pack_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.dataset IS DISTINCT FROM OLD.dataset
      OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
      OR NEW.publication_fingerprint IS DISTINCT FROM OLD.publication_fingerprint
      OR NEW.publication_seal_hash IS DISTINCT FROM OLD.publication_seal_hash
      OR NEW.pack_fingerprint IS DISTINCT FROM OLD.pack_fingerprint THEN
      RAISE EXCEPTION 'EFS_PUBLICATION_PACK_IMMUTABLE: sealed pack content cannot be altered';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EFS_PUBLICATION_PACK_IMMUTABLE: publication packs cannot be deleted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_publication_packs_immutable ON efs_publication_packs;
CREATE TRIGGER trg_efs_publication_packs_immutable
  BEFORE UPDATE OR DELETE ON efs_publication_packs
  FOR EACH ROW EXECUTE FUNCTION efs_deny_publication_pack_mutation();

-- ── Release publication_executed guard (Phase E) ────────────────────────────
ALTER TABLE efs_pack_reviews DROP CONSTRAINT IF EXISTS efs_pack_reviews_publication_executed_check;

CREATE OR REPLACE FUNCTION efs_assert_pack_review_no_accounting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mutates_accounting IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'EFS_PACK_REVIEW: mutates_accounting must remain false';
  END IF;
  RETURN NEW;
END;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efs_publication_packs',
    'efs_publication_records',
    'efs_publication_artifacts',
    'efs_publication_history'
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
