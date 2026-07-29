-- Statutory Returns module (V3.6)
-- Persistence for government declarations generated from finalized payroll only.
-- Does not alter payroll_runs, payslips, journals, or legislation tables.

CREATE TABLE IF NOT EXISTS statutory_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  country text NOT NULL DEFAULT 'ZA',
  return_type text NOT NULL,
  tax_year text NOT NULL,
  payroll_run_id uuid REFERENCES payroll_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id),
  source_payroll_runs uuid[] NOT NULL DEFAULT '{}',
  validation_result jsonb NOT NULL DEFAULT '{"ok":false,"issues":[],"validatedAt":null}'::jsonb,
  declaration_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  submission_reference text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT statutory_returns_status_check CHECK (
    status IN ('draft', 'validated', 'ready', 'submitted', 'accepted', 'rejected', 'superseded')
  )
);

CREATE INDEX IF NOT EXISTS idx_statutory_returns_company
  ON statutory_returns(company_id, tax_year, return_type);

CREATE INDEX IF NOT EXISTS idx_statutory_returns_status
  ON statutory_returns(company_id, status, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_statutory_returns_run
  ON statutory_returns(payroll_run_id)
  WHERE payroll_run_id IS NOT NULL;

ALTER TABLE statutory_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statutory_returns_select ON statutory_returns;
CREATE POLICY statutory_returns_select ON statutory_returns
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS statutory_returns_insert ON statutory_returns;
CREATE POLICY statutory_returns_insert ON statutory_returns
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS statutory_returns_update ON statutory_returns;
CREATE POLICY statutory_returns_update ON statutory_returns
  FOR UPDATE USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );
