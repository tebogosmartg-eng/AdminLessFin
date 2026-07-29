-- EWM V4.1 — Enterprise Work Management (additive; frozen modules untouched)
-- Implements V4.0 hierarchy/time/capacity/costing + V4.1 resource registry + clocking

-- ── Resource type catalogue ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewm_resource_types (
  id text PRIMARY KEY,
  label text NOT NULL,
  cost_behaviour text NOT NULL,
  approval_workflow text NOT NULL,
  integration_target text NOT NULL,
  billing_behaviour text NOT NULL,
  payroll_eligible boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 100
);

INSERT INTO ewm_resource_types (id, label, cost_behaviour, approval_workflow, integration_target, billing_behaviour, payroll_eligible, sort_order) VALUES
  ('permanent_employee', 'Permanent Employee', 'labour_salary_allocation', 'time_approval', 'payroll_facts', 'billable_or_non_billable', true, 10),
  ('contract_employee', 'Contract Employee', 'labour_cost_fact', 'time_approval', 'payroll_facts', 'billable_or_non_billable', true, 20),
  ('casual_labour', 'Casual Labour', 'wage_input_fact', 'supervisor_approval', 'payroll_wage_input', 'cost_only', true, 30),
  ('temporary_labour', 'Temporary Labour', 'wage_input_fact', 'supervisor_approval', 'payroll_wage_input', 'cost_only', true, 40),
  ('subcontractor', 'Subcontractor', 'commitment_certified', 'commercial_approval', 'accounts_payable', 'pass_through_or_markup', false, 50),
  ('consultant', 'Consultant', 'commitment_certified', 'commercial_approval', 'accounts_payable', 'pass_through_or_markup', false, 60),
  ('equipment', 'Equipment', 'hire_or_ownership_burn', 'ops_approval', 'assets', 'recharge', false, 70),
  ('vehicle', 'Vehicle', 'hire_or_ownership_burn', 'ops_approval', 'assets', 'recharge', false, 80),
  ('plant', 'Plant', 'hire_or_ownership_burn', 'ops_approval', 'assets', 'recharge', false, 90),
  ('tools', 'Tools', 'hire_or_ownership_burn', 'ops_approval', 'assets', 'recharge', false, 100),
  ('rental_equipment', 'Rental Equipment', 'hire_burn', 'ops_approval', 'purchases', 'recharge', false, 110),
  ('materials', 'Materials', 'issue_cost', 'stores_approval', 'inventory', 'markup_optional', false, 120),
  ('accommodation', 'Accommodation', 'claim_or_po_cost', 'policy_approval', 'expenses_purchases', 'recoverable', false, 130),
  ('travel', 'Travel', 'claim_cost', 'policy_approval', 'expenses', 'recoverable', false, 140),
  ('fuel', 'Fuel', 'claim_or_po_cost', 'policy_approval', 'expenses_purchases', 'recoverable', false, 150),
  ('other_operational', 'Other Operational', 'tagged_cost', 'policy_approval', 'expenses_purchases', 'configured', false, 160)
ON CONFLICT (id) DO NOTHING;

-- ── Hierarchy ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewm_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  workspace_type text NOT NULL DEFAULT 'general',
  department_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES ewm_workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner_user_id uuid,
  strategic_theme text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES ewm_portfolios(id) ON DELETE SET NULL,
  project_id uuid, -- link to legacy billable projects table (engagement SoT)
  name text NOT NULL,
  client_id uuid,
  project_manager_id uuid,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pipeline', 'active', 'on_hold', 'completed', 'archived')),
  contract_value numeric(18,2) DEFAULT 0,
  award_date date,
  start_date date,
  expected_completion date,
  overall_progress numeric(5,2) DEFAULT 0,
  operational_budget numeric(18,2) DEFAULT 0,
  currency text DEFAULT 'ZAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  sequence_no int NOT NULL DEFAULT 1,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES ewm_phases(id) ON DELETE SET NULL,
  legacy_milestone_id uuid,
  name text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'missed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES ewm_phases(id) ON DELETE SET NULL,
  milestone_id uuid REFERENCES ewm_milestones(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES ewm_tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  assignee_employee_id uuid,
  estimate_hours numeric(12,2) DEFAULT 0,
  remaining_hours numeric(12,2) DEFAULT 0,
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  billable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Time engine ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewm_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE RESTRICT,
  task_id uuid REFERENCES ewm_tasks(id) ON DELETE SET NULL,
  employee_id uuid,
  work_resource_id uuid,
  entry_date date NOT NULL,
  start_at timestamptz,
  finish_at timestamptz,
  break_minutes numeric(8,2) NOT NULL DEFAULT 0,
  hours numeric(12,4) NOT NULL DEFAULT 0,
  billable boolean NOT NULL DEFAULT true,
  is_overtime boolean NOT NULL DEFAULT false,
  is_internal boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'locked', 'historical')),
  notes text,
  operational_rate numeric(18,4) DEFAULT 0,
  labour_cost numeric(18,4) DEFAULT 0,
  billable_rate numeric(18,4) DEFAULT 0,
  billable_value numeric(18,4) DEFAULT 0,
  -- denormalized context snapshot
  workspace_id uuid,
  portfolio_id uuid,
  client_id uuid,
  payroll_period_id uuid,
  financial_period_id uuid,
  capture_channel text NOT NULL DEFAULT 'manual'
    CHECK (capture_channel IN ('manual', 'clock', 'import', 'system')),
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  photo_ref text,
  qr_ref text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  locked_at timestamptz,
  timesheet_id uuid, -- billing bridge projection
  payroll_cost_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_time_entry_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  original_entry_id uuid NOT NULL REFERENCES ewm_time_entries(id) ON DELETE RESTRICT,
  compensating_entry_id uuid NOT NULL REFERENCES ewm_time_entries(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Capacity / allocations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewm_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES ewm_tasks(id) ON DELETE SET NULL,
  employee_id uuid,
  work_resource_id uuid,
  allocation_type text NOT NULL DEFAULT 'hard'
    CHECK (allocation_type IN ('hard', 'soft', 'named', 'role_based', 'bench')),
  role_name text,
  window_start date NOT NULL,
  window_end date NOT NULL,
  effort_hours numeric(12,2),
  effort_percent numeric(5,2),
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'confirmed', 'active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_capacity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid,
  work_resource_id uuid,
  period_start date NOT NULL,
  period_end date NOT NULL,
  available_hours numeric(12,2) NOT NULL DEFAULT 0,
  booked_hours numeric(12,2) NOT NULL DEFAULT 0,
  actual_hours numeric(12,2) NOT NULL DEFAULT 0,
  utilisation_pct numeric(8,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Operational costing ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewm_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  role_name text,
  employee_id uuid,
  ewm_project_id uuid REFERENCES ewm_projects(id) ON DELETE CASCADE,
  operational_cost_rate numeric(18,4) NOT NULL DEFAULT 0,
  billable_rate numeric(18,4) NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_project_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE CASCADE,
  cost_category text NOT NULL DEFAULT 'total',
  budget_amount numeric(18,2) NOT NULL DEFAULT 0,
  alert_threshold_pct numeric(5,2) NOT NULL DEFAULT 90,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ewm_project_id, cost_category)
);

CREATE TABLE IF NOT EXISTS ewm_cost_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE RESTRICT,
  time_entry_id uuid REFERENCES ewm_time_entries(id) ON DELETE SET NULL,
  consumption_id uuid,
  cost_category text NOT NULL DEFAULT 'labour',
  amount numeric(18,4) NOT NULL DEFAULT 0,
  currency text DEFAULT 'ZAR',
  fact_date date NOT NULL,
  source text NOT NULL DEFAULT 'time_lock'
    CHECK (source IN ('time_lock', 'resource_consumption', 'expense_tag', 'manual', 'correction')),
  is_locked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_cost_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE CASCADE,
  cost_category text NOT NULL,
  period_month date NOT NULL,
  amount numeric(18,4) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ewm_project_id, cost_category, period_month)
);

CREATE TABLE IF NOT EXISTS ewm_budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  message text NOT NULL,
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Work resources (V4.1) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewm_work_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resource_type_id text NOT NULL REFERENCES ewm_resource_types(id),
  name text NOT NULL,
  employee_id uuid,
  vendor_id uuid,
  asset_id uuid,
  product_id uuid,
  default_cost_rate numeric(18,4) DEFAULT 0,
  default_billable_rate numeric(18,4) DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ewm_time_entries
  DROP CONSTRAINT IF EXISTS ewm_time_entries_work_resource_id_fkey;
ALTER TABLE ewm_time_entries
  ADD CONSTRAINT ewm_time_entries_work_resource_id_fkey
  FOREIGN KEY (work_resource_id) REFERENCES ewm_work_resources(id) ON DELETE SET NULL;

ALTER TABLE ewm_allocations
  DROP CONSTRAINT IF EXISTS ewm_allocations_work_resource_id_fkey;
ALTER TABLE ewm_allocations
  ADD CONSTRAINT ewm_allocations_work_resource_id_fkey
  FOREIGN KEY (work_resource_id) REFERENCES ewm_work_resources(id) ON DELETE SET NULL;

ALTER TABLE ewm_capacity_snapshots
  DROP CONSTRAINT IF EXISTS ewm_capacity_snapshots_work_resource_id_fkey;
ALTER TABLE ewm_capacity_snapshots
  ADD CONSTRAINT ewm_capacity_snapshots_work_resource_id_fkey
  FOREIGN KEY (work_resource_id) REFERENCES ewm_work_resources(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS ewm_resource_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ewm_project_id uuid NOT NULL REFERENCES ewm_projects(id) ON DELETE RESTRICT,
  work_resource_id uuid NOT NULL REFERENCES ewm_work_resources(id) ON DELETE RESTRICT,
  cost_category text NOT NULL,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  amount numeric(18,4) NOT NULL DEFAULT 0,
  consumption_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'approved', 'locked')),
  external_ref text,
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ewm_cost_facts
  DROP CONSTRAINT IF EXISTS ewm_cost_facts_consumption_id_fkey;
ALTER TABLE ewm_cost_facts
  ADD CONSTRAINT ewm_cost_facts_consumption_id_fkey
  FOREIGN KEY (consumption_id) REFERENCES ewm_resource_consumptions(id) ON DELETE SET NULL;

-- ── Clocking (V4.1 Time Capture) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewm_clock_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid,
  work_resource_id uuid REFERENCES ewm_work_resources(id) ON DELETE SET NULL,
  ewm_project_id uuid REFERENCES ewm_projects(id) ON DELETE SET NULL,
  task_id uuid REFERENCES ewm_tasks(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'on_break', 'closed', 'cancelled')),
  clocked_in_at timestamptz NOT NULL DEFAULT now(),
  clocked_out_at timestamptz,
  break_minutes numeric(8,2) NOT NULL DEFAULT 0,
  time_entry_id uuid REFERENCES ewm_time_entries(id) ON DELETE SET NULL,
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  photo_ref text,
  qr_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_clock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES ewm_clock_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  event_at timestamptz NOT NULL DEFAULT now(),
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  photo_ref text,
  qr_ref text,
  offline_captured boolean NOT NULL DEFAULT false,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Audit / analytics ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ewm_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_user_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ewm_analytics_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  grain text NOT NULL,
  grain_key text NOT NULL,
  period_start date NOT NULL,
  measures jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, grain, grain_key, period_start)
);

CREATE TABLE IF NOT EXISTS ewm_payroll_input_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  work_resource_id uuid REFERENCES ewm_work_resources(id) ON DELETE SET NULL,
  time_entry_id uuid NOT NULL REFERENCES ewm_time_entries(id) ON DELETE RESTRICT,
  ewm_project_id uuid REFERENCES ewm_projects(id) ON DELETE SET NULL,
  entry_date date NOT NULL,
  hours numeric(12,4) NOT NULL,
  is_overtime boolean NOT NULL DEFAULT false,
  wage_input boolean NOT NULL DEFAULT false,
  payroll_period_id uuid,
  status text NOT NULL DEFAULT 'ready'
    CHECK (status IN ('ready', 'consumed', 'excluded')),
  exclusion_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (time_entry_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ewm_workspaces_company ON ewm_workspaces(company_id);
CREATE INDEX IF NOT EXISTS idx_ewm_portfolios_company ON ewm_portfolios(company_id);
CREATE INDEX IF NOT EXISTS idx_ewm_projects_company ON ewm_projects(company_id);
CREATE INDEX IF NOT EXISTS idx_ewm_projects_legacy ON ewm_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_ewm_tasks_project ON ewm_tasks(ewm_project_id);
CREATE INDEX IF NOT EXISTS idx_ewm_time_entries_company ON ewm_time_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_ewm_time_entries_status ON ewm_time_entries(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ewm_time_entries_project ON ewm_time_entries(ewm_project_id);
CREATE INDEX IF NOT EXISTS idx_ewm_cost_facts_project ON ewm_cost_facts(ewm_project_id);
CREATE INDEX IF NOT EXISTS idx_ewm_allocations_project ON ewm_allocations(ewm_project_id);
CREATE INDEX IF NOT EXISTS idx_ewm_work_resources_company ON ewm_work_resources(company_id);
CREATE INDEX IF NOT EXISTS idx_ewm_clock_sessions_company ON ewm_clock_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_ewm_payroll_input_company ON ewm_payroll_input_facts(company_id, status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ewm_workspaces','ewm_portfolios','ewm_projects','ewm_phases','ewm_milestones','ewm_tasks',
    'ewm_time_entries','ewm_time_entry_corrections','ewm_allocations','ewm_capacity_snapshots',
    'ewm_rate_cards','ewm_project_budgets','ewm_cost_facts','ewm_cost_rollups','ewm_budget_alerts',
    'ewm_work_resources','ewm_resource_consumptions','ewm_clock_sessions','ewm_clock_events',
    'ewm_audit_events','ewm_analytics_facts','ewm_payroll_input_facts'
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

-- Resource types are global catalogue (read-only for authenticated)
ALTER TABLE ewm_resource_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ewm_resource_types_select ON ewm_resource_types;
CREATE POLICY ewm_resource_types_select ON ewm_resource_types FOR SELECT TO authenticated USING (true);
