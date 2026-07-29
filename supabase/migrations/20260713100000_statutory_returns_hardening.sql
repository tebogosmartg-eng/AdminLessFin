-- Statutory Returns hardening (V3.6.1)
-- Immutable snapshots + append-only submission ledger.
-- Does not alter payroll, journals, or legislation tables.

ALTER TABLE statutory_returns
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS immutable boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS statutory_submission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  statutory_return_id uuid NOT NULL REFERENCES statutory_returns(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  content_hash text,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT statutory_submission_ledger_event_type_check CHECK (
    event_type IN (
      'generated',
      'validated',
      'exported',
      'submitted',
      'accepted',
      'rejected',
      'superseded',
      'regeneration_blocked'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_statutory_submission_ledger_return
  ON statutory_submission_ledger(statutory_return_id, created_at);

CREATE INDEX IF NOT EXISTS idx_statutory_submission_ledger_company
  ON statutory_submission_ledger(company_id, created_at DESC);

ALTER TABLE statutory_submission_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statutory_submission_ledger_select ON statutory_submission_ledger;
CREATE POLICY statutory_submission_ledger_select ON statutory_submission_ledger
  FOR SELECT USING (
    company_id IS NULL OR company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

-- Append-only: INSERT permitted; no UPDATE/DELETE policies for authenticated roles.
DROP POLICY IF EXISTS statutory_submission_ledger_insert ON statutory_submission_ledger;
CREATE POLICY statutory_submission_ledger_insert ON statutory_submission_ledger
  FOR INSERT WITH CHECK (
    company_id IS NULL OR company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

CREATE OR REPLACE FUNCTION prevent_immutable_statutory_return_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.immutable IS TRUE OR OLD.status IN ('submitted', 'accepted') THEN
    IF NEW.declaration_data IS DISTINCT FROM OLD.declaration_data
       OR NEW.source_payroll_runs IS DISTINCT FROM OLD.source_payroll_runs
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR (NEW.immutable IS DISTINCT FROM OLD.immutable AND NEW.immutable IS FALSE)
    THEN
      RAISE EXCEPTION 'STATUTORY_RETURN_IMMUTABLE: submitted/immutable statutory returns cannot be mutated or regenerated';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_immutable_statutory_return_mutation ON statutory_returns;
CREATE TRIGGER trg_prevent_immutable_statutory_return_mutation
  BEFORE UPDATE ON statutory_returns
  FOR EACH ROW
  EXECUTE FUNCTION prevent_immutable_statutory_return_mutation();
