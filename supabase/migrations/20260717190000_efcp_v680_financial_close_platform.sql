-- =============================================================================
-- EFCP V6.8.0 — Enterprise Financial Close Platform (additive only)
-- Close workspaces / checklist items / approvals / activity (close history).
-- Does NOT alter General Ledger, Journal Engine, EFS, Validation, Review,
-- Publication, or any existing table. Orchestration state only — no financial
-- facts are stored or recalculated here.
-- =============================================================================

-- ── Close Workspace (one per accounting period being closed) ─────────────────
CREATE TABLE IF NOT EXISTS efcp_close_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  close_type text NOT NULL DEFAULT 'month_end'
    CHECK (close_type IN ('month_end', 'quarter_end', 'year_end')),
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  -- Accounting period lock ladder (only Accounting controls this)
  period_status text NOT NULL DEFAULT 'open'
    CHECK (period_status IN (
      'open',
      'soft_closed',
      'manager_approved',
      'partner_approved',
      'locked'
    )),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, start_date, end_date, close_type)
);

CREATE INDEX IF NOT EXISTS idx_efcp_close_workspaces_company
  ON efcp_close_workspaces (company_id, end_date DESC);

-- ── Close Checklist Items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efcp_close_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  close_workspace_id uuid NOT NULL REFERENCES efcp_close_workspaces(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'review'
    CHECK (category IN ('reconciliation', 'review', 'evidence')),
  mandatory boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'in_progress', 'outstanding', 'overdue', 'completed')),
  prepared_by text,
  reviewed_by text,
  completed_at timestamptz,
  due_date date,
  outstanding_issues text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (close_workspace_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_efcp_close_items_workspace
  ON efcp_close_items (close_workspace_id, sort_order);

-- ── Close Approvals ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS efcp_close_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  close_workspace_id uuid NOT NULL REFERENCES efcp_close_workspaces(id) ON DELETE CASCADE,
  approval_role text NOT NULL CHECK (approval_role IN ('manager', 'partner')),
  decision text NOT NULL DEFAULT 'approved'
    CHECK (decision IN ('approved', 'rejected')),
  decided_by uuid,
  decided_by_name text,
  note text,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efcp_close_approvals_workspace
  ON efcp_close_approvals (close_workspace_id, decided_at DESC);

-- ── Close Activity (immutable Close History) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS efcp_close_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  close_workspace_id uuid NOT NULL REFERENCES efcp_close_workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efcp_close_activity_workspace
  ON efcp_close_activity (close_workspace_id, created_at DESC);

-- ── RLS (same tenant pattern as EFS foundation) ───────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'efcp_close_workspaces',
    'efcp_close_items',
    'efcp_close_approvals',
    'efcp_close_activity'
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
