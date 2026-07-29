-- Employee Identity Platform — Phase 3 Enterprise Identity Maturity
-- Extends existing Employee Number Engine; does not modify assigned numbers.

-- ---------------------------------------------------------------------------
-- Optional employee identity fields
-- ---------------------------------------------------------------------------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'terminated', 'archived'));

CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees (manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees (company_id, branch) WHERE branch IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_employment_status ON employees (company_id, employment_status);

-- ---------------------------------------------------------------------------
-- Identity display settings (future employees only for numbering; display affects presentation)
-- ---------------------------------------------------------------------------
ALTER TABLE company_employee_number_settings
  ADD COLUMN IF NOT EXISTS qr_style text NOT NULL DEFAULT 'standard'
    CHECK (qr_style IN ('standard', 'minimal', 'branded')),
  ADD COLUMN IF NOT EXISTS barcode_style text NOT NULL DEFAULT 'code128'
    CHECK (barcode_style IN ('code128', 'code39')),
  ADD COLUMN IF NOT EXISTS display_format text NOT NULL DEFAULT 'stacked'
    CHECK (display_format IN ('stacked', 'inline', 'compact', 'number_first'));

COMMENT ON COLUMN company_employee_number_settings.qr_style IS 'QR code rendering style for employee numbers';
COMMENT ON COLUMN company_employee_number_settings.barcode_style IS 'Barcode symbology for employee numbers';
COMMENT ON COLUMN company_employee_number_settings.display_format IS 'Default EmployeeIdentity component layout';

-- ---------------------------------------------------------------------------
-- Immutable employee timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employee_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_number text NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_label text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}',
  command_id uuid,
  correlation_id text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_timeline_employee
  ON employee_timeline_events (employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_timeline_company
  ON employee_timeline_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_timeline_number
  ON employee_timeline_events (company_id, employee_number);

COMMENT ON TABLE employee_timeline_events IS
  'Immutable audit trail of significant employee business events. Insert-only.';

-- Prevent updates/deletes on timeline (immutable)
CREATE OR REPLACE FUNCTION prevent_employee_timeline_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'employee_timeline_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_timeline_immutable ON employee_timeline_events;
CREATE TRIGGER trg_employee_timeline_immutable
  BEFORE UPDATE OR DELETE ON employee_timeline_events
  FOR EACH ROW EXECUTE FUNCTION prevent_employee_timeline_mutation();

-- RLS
ALTER TABLE employee_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_timeline_select ON employee_timeline_events;
CREATE POLICY employee_timeline_select ON employee_timeline_events
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS employee_timeline_insert ON employee_timeline_events;
CREATE POLICY employee_timeline_insert ON employee_timeline_events
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

-- Service role bypass for edge functions
DROP POLICY IF EXISTS employee_timeline_service ON employee_timeline_events;
CREATE POLICY employee_timeline_service ON employee_timeline_events
  FOR ALL USING (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Full-text search helper index on employees
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_employees_identity_search
  ON employees USING gin (
    to_tsvector('simple',
      coalesce(employee_number, '') || ' ' ||
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(id_number, '') || ' ' ||
      coalesce(department, '') || ' ' ||
      coalesce(branch, '') || ' ' ||
      coalesce(position, '')
    )
  );
