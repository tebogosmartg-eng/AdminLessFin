-- AdminLess Fin V16.3 — Enterprise Asset Lifecycle Management
-- Additive only. Does NOT alter depreciation formulas, dispose_asset RPC, or acquisition JE structure.

-- ── Parent / component flags on fixed_assets ─────────────────────────────────
ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS parent_asset_id uuid REFERENCES fixed_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_component boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'in_service'
    CHECK (lifecycle_stage IN (
      'draft', 'purchased', 'received', 'capitalised', 'in_service',
      'transferred', 'impaired', 'disposed', 'restored'
    )),
  ADD COLUMN IF NOT EXISTS health_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS health_risk text,
  ADD COLUMN IF NOT EXISTS revaluation_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_revaluation_date date;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_parent ON fixed_assets(parent_asset_id);

-- ── Acquisition workbench ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_acquisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'purchased', 'received', 'pending_capitalisation',
      'capitalised', 'cancelled'
    )),
  supplier_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  invoice_number text,
  purchase_order_ref text,
  receipt_date date,
  capitalisation_date date,
  capitalisation_approved boolean NOT NULL DEFAULT false,
  capitalisation_approved_by uuid,
  capitalisation_approved_by_name text,
  capitalisation_approved_at timestamptz,
  description text NOT NULL,
  asset_code text,
  category_id uuid REFERENCES asset_categories(id) ON DELETE SET NULL,
  purchase_cost numeric(18,2) NOT NULL DEFAULT 0,
  purchase_date date,
  location text,
  department text,
  custodian_name text,
  serial_number text,
  asset_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  payment_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  depreciation_method text,
  useful_life_years integer,
  residual_value numeric(18,2) DEFAULT 0,
  accumulated_depreciation_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  depreciation_expense_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  generated_asset_id uuid REFERENCES fixed_assets(id) ON DELETE SET NULL,
  journal_entry_id uuid,
  notes text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_acquisitions_company ON asset_acquisitions(company_id);
CREATE INDEX IF NOT EXISTS idx_asset_acquisitions_status ON asset_acquisitions(company_id, status);

-- ── Component accounting (memo depreciation; parent engine unchanged) ────────
CREATE TABLE IF NOT EXISTS asset_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  component_code text NOT NULL,
  description text NOT NULL,
  cost numeric(18,2) NOT NULL DEFAULT 0,
  useful_life_years integer,
  residual_value numeric(18,2) NOT NULL DEFAULT 0,
  depreciation_method text DEFAULT 'straight-line',
  accumulated_depreciation numeric(18,2) NOT NULL DEFAULT 0,
  last_depreciation_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'replaced', 'disposed')),
  replaced_by_component_id uuid REFERENCES asset_components(id) ON DELETE SET NULL,
  replacement_notes text,
  replacement_date date,
  linked_asset_id uuid REFERENCES fixed_assets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_components_parent ON asset_components(parent_asset_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_components_code
  ON asset_components(company_id, parent_asset_id, component_code);

-- ── Lifecycle timeline ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'created', 'purchased', 'capitalised', 'transferred', 'maintained',
      'verified', 'depreciated', 'revalued', 'impaired', 'disposed',
      'restored', 'component_added', 'component_replaced', 'relationship_linked',
      'document_uploaded', 'label_generated', 'bulk_action', 'acquisition_received'
    )),
  event_date timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_name text,
  reason text,
  reference text,
  attachment_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_lifecycle_asset ON asset_lifecycle_events(asset_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_asset_lifecycle_company ON asset_lifecycle_events(company_id);

-- ── Relationships (parent/child/dependency) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  parent_asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  child_asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'parent_child'
    CHECK (relationship_type IN (
      'parent_child', 'component', 'dependency', 'trailer', 'related'
    )),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_relationships_no_self CHECK (parent_asset_id <> child_asset_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_relationships_unique
  ON asset_relationships(company_id, parent_asset_id, child_asset_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_parent ON asset_relationships(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_relationships_child ON asset_relationships(child_asset_id);

-- ── Bulk operation audit ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_bulk_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  operation_type text NOT NULL
    CHECK (operation_type IN (
      'transfer', 'verification', 'disposal_preview', 'category_update',
      'custodian_update', 'location_update', 'maintenance_schedule', 'label_generation'
    )),
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('previewed', 'validated', 'confirmed', 'failed')),
  asset_ids uuid[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_bulk_ops_company ON asset_bulk_operations(company_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'asset_acquisitions',
    'asset_components',
    'asset_lifecycle_events',
    'asset_relationships',
    'asset_bulk_operations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))',
      t || '_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid())) WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))',
      t || '_all', t
    );
  END LOOP;
END $$;

COMMENT ON TABLE asset_acquisitions IS 'V16.3 acquisition workbench — capitalisation invokes existing POST JE path.';
COMMENT ON TABLE asset_components IS 'V16.3 component accounting — memo depreciation; system run-depreciation unchanged.';
COMMENT ON TABLE asset_lifecycle_events IS 'V16.3 chronological asset timeline.';
COMMENT ON TABLE asset_relationships IS 'V16.3 parent/child/dependency graph.';
COMMENT ON TABLE asset_bulk_operations IS 'V16.3 bulk action audit trail.';
