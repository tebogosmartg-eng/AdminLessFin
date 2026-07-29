-- AdminLess Fin V16.2 — Enterprise Asset Management (EAM)
-- Additive only. Existing fixed_assets / asset_categories / depreciation / dispose_asset unchanged in behaviour.

-- ── Category intelligence (defaults for existing rows) ───────────────────────
ALTER TABLE asset_categories
  ADD COLUMN IF NOT EXISTS useful_life_years integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS residual_value_pct numeric(8,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_method text DEFAULT 'straight-line',
  ADD COLUMN IF NOT EXISTS gl_asset_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accumulated_depreciation_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depreciation_expense_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposal_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revaluation_reserve_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS impairment_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capitalisation_threshold numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS component_accounting_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_verification_frequency_months integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE asset_categories
SET
  useful_life_years = COALESCE(useful_life_years, 5),
  residual_value_pct = COALESCE(residual_value_pct, 0),
  depreciation_method = COALESCE(depreciation_method, 'straight-line'),
  capitalisation_threshold = COALESCE(capitalisation_threshold, 0),
  component_accounting_enabled = COALESCE(component_accounting_enabled, false),
  default_verification_frequency_months = COALESCE(default_verification_frequency_months, 12)
WHERE true;

-- ── Fixed asset register extensions (verification + enterprise metadata) ─────
ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS custodian_name text,
  ADD COLUMN IF NOT EXISTS impairment_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_ytd numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_ytd_year integer,
  ADD COLUMN IF NOT EXISTS qr_code text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS asset_tag text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_verification_due date,
  ADD COLUMN IF NOT EXISTS verified_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS verified_by_name text,
  ADD COLUMN IF NOT EXISTS disposal_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revaluation_reserve_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS impairment_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fixed_assets_verification_status_check'
  ) THEN
    ALTER TABLE fixed_assets ADD CONSTRAINT fixed_assets_verification_status_check
      CHECK (verification_status IN ('unverified', 'verified', 'overdue', 'in_progress', 'disputed'));
  END IF;
END $$;

-- Seed asset_tag / qr / barcode from existing asset_code where blank (non-destructive)
UPDATE fixed_assets
SET
  asset_tag = COALESCE(NULLIF(asset_tag, ''), asset_code),
  qr_code = COALESCE(NULLIF(qr_code, ''), 'QR-' || asset_code),
  barcode = COALESCE(NULLIF(barcode, ''), 'BC-' || asset_code)
WHERE asset_tag IS NULL OR qr_code IS NULL OR barcode IS NULL;

-- ── Document management ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type IN (
      'image', 'invoice', 'warranty', 'insurance', 'manual',
      'inspection_report', 'certificate', 'attachment'
    )),
  file_name text NOT NULL,
  file_url text,
  mime_type text,
  file_size_bytes bigint,
  notes text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_documents_asset ON asset_documents(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_documents_company ON asset_documents(company_id);

-- ── Verification history ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_verification_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  verifier_user_id uuid,
  verifier_name text,
  verification_method text NOT NULL DEFAULT 'manual'
    CHECK (verification_method IN ('manual', 'qr', 'barcode', 'asset_tag', 'physical')),
  status text NOT NULL DEFAULT 'verified'
    CHECK (status IN ('verified', 'disputed', 'missing', 'damaged')),
  location_confirmed text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_verification_asset ON asset_verification_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_verification_company ON asset_verification_history(company_id);

-- ── Maintenance (non-posting — no journal entries) ───────────────────────────
CREATE TABLE IF NOT EXISTS asset_maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  title text NOT NULL,
  frequency_months integer NOT NULL DEFAULT 12,
  last_service_date date,
  next_service_date date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES asset_maintenance_schedules(id) ON DELETE SET NULL,
  record_type text NOT NULL DEFAULT 'service'
    CHECK (record_type IN ('service', 'repair', 'inspection', 'other')),
  service_date date NOT NULL,
  description text NOT NULL,
  cost numeric(18,2) NOT NULL DEFAULT 0,
  downtime_hours numeric(12,2) NOT NULL DEFAULT 0,
  vendor_name text,
  performed_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_maint_sched_asset ON asset_maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_maint_rec_asset ON asset_maintenance_records(asset_id);

-- ── RLS (company membership) ─────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'asset_documents',
    'asset_verification_history',
    'asset_maintenance_schedules',
    'asset_maintenance_records'
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

COMMENT ON TABLE asset_documents IS 'V16.2 EAM document vault — optional attachments; assets work without rows.';
COMMENT ON TABLE asset_verification_history IS 'V16.2 EAM verification ledger — architecture ready for mobile QR/barcode.';
COMMENT ON TABLE asset_maintenance_schedules IS 'V16.2 EAM maintenance schedules — does NOT post accounting journals.';
COMMENT ON TABLE asset_maintenance_records IS 'V16.2 EAM maintenance history — operational cost tracking only.';
