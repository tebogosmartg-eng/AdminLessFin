-- Payroll Output Engine: additive schema only (preserves existing payroll calculations)
-- Links payroll runs to journal entries, tracks workflow/audit, enables distribution status

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS output_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_payroll_runs_journal_entry_id ON payroll_runs(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee_id ON payslips(employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_payroll_run_id ON payslips(payroll_run_id);

CREATE TABLE IF NOT EXISTS payroll_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_run_id uuid REFERENCES payroll_runs(id) ON DELETE CASCADE,
  payslip_id uuid REFERENCES payslips(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_events_run ON payroll_audit_events(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_events_company ON payroll_audit_events(company_id, created_at DESC);

ALTER TABLE payroll_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY payroll_audit_events_select ON payroll_audit_events
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

CREATE POLICY payroll_audit_events_insert ON payroll_audit_events
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );
