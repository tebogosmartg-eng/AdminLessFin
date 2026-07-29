-- =============================================================================
-- EFS V6.4.6 Phase D2 — Enterprise Review Workflow
-- Manager Review · Partner Review · Assignments · Queries · Decisions ·
-- Digital Sign-off · Immutable Review History
--
-- Review determines whether the reporting engagement is acceptable for
-- publication. Review NEVER changes accounting balances / GL / statement amounts.
-- Consumes Validation Results · Working Papers · Disclosures · Statement Instances.
--
-- Does NOT implement: Publication · XBRL · AI
-- Additive. Accounting / Statement Engine / Navigation untouched.
-- Distinct from C2 artefact-level efs_review_notes / efs_reviewer_assignments.
-- Idempotent: IF NOT EXISTS / ON CONFLICT / DROP TRIGGER IF EXISTS.
-- =============================================================================

-- ── Review Workflow Case (engagement) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_pack_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  -- Provenance refs (READ only — never attachment parents / never mutated by review)
  validation_run_id uuid REFERENCES efs_validation_runs(id) ON DELETE RESTRICT,
  snapshot_version_id uuid REFERENCES efs_snapshot_versions(id) ON DELETE RESTRICT,
  framework_pack_id uuid REFERENCES efs_framework_packs(id) ON DELETE RESTRICT,
  -- Review Stage (controlled workflow)
  stage text NOT NULL DEFAULT 'draft'
    CHECK (stage IN (
      'draft',
      'validation_complete',
      'manager_review',
      'corrections',
      'manager_approved',
      'partner_review',
      'partner_approved',
      'publication_ready',
      'rejected'
    )),
  -- When in corrections, where to return after preparer resubmits
  return_to_stage text
    CHECK (return_to_stage IS NULL OR return_to_stage IN ('manager_review', 'partner_review')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'superseded')),
  pack_fingerprint text, -- hashed presentation seal refs (not balances rewrite)
  escalated boolean NOT NULL DEFAULT false,
  mutates_accounting boolean NOT NULL DEFAULT false CHECK (mutates_accounting = false),
  publication_executed boolean NOT NULL DEFAULT false CHECK (publication_executed = false),
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_pack_reviews_open_workspace
  ON efs_pack_reviews (workspace_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_efs_pack_reviews_company
  ON efs_pack_reviews (company_id, stage);
CREATE INDEX IF NOT EXISTS idx_efs_pack_reviews_validation
  ON efs_pack_reviews (validation_run_id) WHERE validation_run_id IS NOT NULL;

-- ── Review Assignment / Reviewer ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_pack_review_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_review_id uuid NOT NULL REFERENCES efs_pack_reviews(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL,
  role_code text NOT NULL
    CHECK (role_code IN ('preparer', 'manager', 'partner', 'observer')),
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'accepted', 'completed', 'reassigned', 'revoked')),
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (pack_review_id, reviewer_user_id, role_code)
);

CREATE INDEX IF NOT EXISTS idx_efs_pack_review_assign_reviewer
  ON efs_pack_review_assignments (reviewer_user_id, status);

-- ── Review Notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_pack_review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_review_id uuid NOT NULL REFERENCES efs_pack_reviews(id) ON DELETE CASCADE,
  author_user_id uuid,
  stage_at_create text NOT NULL,
  body text NOT NULL,
  -- Optional consumption refs (read linkage only)
  structure_node_id uuid REFERENCES efs_structure_nodes(id) ON DELETE SET NULL,
  disclosure_instance_id uuid REFERENCES efs_disclosure_instances(id) ON DELETE SET NULL,
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE SET NULL,
  statement_instance_id uuid REFERENCES efs_statement_instances(id) ON DELETE SET NULL,
  validation_issue_id uuid REFERENCES efs_validation_issues(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'addressed', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Review Queries + Responses ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_pack_review_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_review_id uuid NOT NULL REFERENCES efs_pack_reviews(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL,
  raised_role text NOT NULL
    CHECK (raised_role IN ('manager', 'partner', 'preparer', 'observer')),
  subject text NOT NULL,
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'blocking')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'closed', 'escalated')),
  structure_node_id uuid REFERENCES efs_structure_nodes(id) ON DELETE SET NULL,
  disclosure_instance_id uuid REFERENCES efs_disclosure_instances(id) ON DELETE SET NULL,
  working_paper_id uuid REFERENCES efs_working_papers(id) ON DELETE SET NULL,
  statement_instance_id uuid REFERENCES efs_statement_instances(id) ON DELETE SET NULL,
  validation_issue_id uuid REFERENCES efs_validation_issues(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS efs_pack_review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  query_id uuid NOT NULL REFERENCES efs_pack_review_queries(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_pack_review_queries_case
  ON efs_pack_review_queries (pack_review_id, status);

-- ── Review Decisions (Approve / Reject / Request Changes / Escalation) ───────
CREATE TABLE IF NOT EXISTS efs_pack_review_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_review_id uuid NOT NULL REFERENCES efs_pack_reviews(id) ON DELETE CASCADE,
  decision_code text NOT NULL
    CHECK (decision_code IN ('approve', 'reject', 'request_changes', 'escalate')),
  decision_stage text NOT NULL
    CHECK (decision_stage IN (
      'manager_review', 'partner_review', 'corrections', 'validation_complete', 'manager_approved'
    )),
  from_stage text NOT NULL,
  to_stage text NOT NULL,
  actor_user_id uuid NOT NULL,
  actor_role text NOT NULL
    CHECK (actor_role IN ('manager', 'partner', 'preparer', 'system')),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_pack_review_decisions_case
  ON efs_pack_review_decisions (pack_review_id, created_at);

-- ── Digital Sign-off ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_pack_review_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_review_id uuid NOT NULL REFERENCES efs_pack_reviews(id) ON DELETE CASCADE,
  decision_id uuid REFERENCES efs_pack_review_decisions(id) ON DELETE RESTRICT,
  signer_user_id uuid NOT NULL,
  signer_role text NOT NULL
    CHECK (signer_role IN ('manager', 'partner')),
  stage text NOT NULL,
  meaning text NOT NULL DEFAULT 'engagement_acceptability'
    CHECK (meaning IN ('engagement_acceptability', 'manager_approval', 'partner_approval')),
  -- Cryptographic attestation over review decision + pack fingerprint (NOT GL mutation)
  signature_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_hash text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pack_review_id, signer_role, stage, signature_hash)
);

CREATE INDEX IF NOT EXISTS idx_efs_pack_review_signoffs_case
  ON efs_pack_review_signoffs (pack_review_id, signed_at);

-- ── Immutable Review History ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efs_pack_review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pack_review_id uuid NOT NULL REFERENCES efs_pack_reviews(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid,
  from_stage text,
  to_stage text,
  decision_code text,
  message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efs_pack_review_history_case
  ON efs_pack_review_history (pack_review_id, created_at);

CREATE OR REPLACE FUNCTION efs_deny_pack_review_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'EFS_PACK_REVIEW_HISTORY_IMMUTABLE: review history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_pack_review_history_immutable ON efs_pack_review_history;
CREATE TRIGGER trg_efs_pack_review_history_immutable
  BEFORE UPDATE OR DELETE ON efs_pack_review_history
  FOR EACH ROW EXECUTE FUNCTION efs_deny_pack_review_history_mutation();

CREATE OR REPLACE FUNCTION efs_deny_pack_review_signoff_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'EFS_PACK_REVIEW_SIGNOFF_IMMUTABLE: digital sign-offs cannot be altered';
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_pack_review_signoffs_immutable ON efs_pack_review_signoffs;
CREATE TRIGGER trg_efs_pack_review_signoffs_immutable
  BEFORE UPDATE OR DELETE ON efs_pack_review_signoffs
  FOR EACH ROW EXECUTE FUNCTION efs_deny_pack_review_signoff_mutation();

CREATE OR REPLACE FUNCTION efs_assert_pack_review_no_accounting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mutates_accounting IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'EFS_PACK_REVIEW: mutates_accounting must remain false';
  END IF;
  IF NEW.publication_executed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'EFS_PACK_REVIEW: publication_executed must remain false (Publication not implemented)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_efs_pack_review_no_accounting ON efs_pack_reviews;
CREATE TRIGGER trg_efs_pack_review_no_accounting
  BEFORE INSERT OR UPDATE ON efs_pack_reviews
  FOR EACH ROW EXECUTE FUNCTION efs_assert_pack_review_no_accounting();

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efs_pack_reviews',
    'efs_pack_review_assignments',
    'efs_pack_review_notes',
    'efs_pack_review_queries',
    'efs_pack_review_responses',
    'efs_pack_review_decisions',
    'efs_pack_review_signoffs',
    'efs_pack_review_history'
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
