-- V6.6.1 Engagement General Information (additive only)
-- Experience-layer storage for Annual Financial Statements engagement metadata.
-- Does NOT redesign Statement Engine, Snapshots, Validation, Review, or Publication.

CREATE TABLE IF NOT EXISTS efs_engagement_general_information (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  registered_name text,
  trading_name text,
  registration_number text,
  vat_number text,
  income_tax_number text,
  financial_year_end text,
  business_address text,
  postal_address text,
  contact_information text,
  nature_of_business text,
  reporting_currency text DEFAULT 'ZAR',
  reporting_framework text,
  auditor text,
  prepared_by text,
  reviewed_by text,
  approved_by text,
  directors jsonb NOT NULL DEFAULT '[]'::jsonb,
  company_secretary text,
  registered_office text,
  share_information jsonb NOT NULL DEFAULT '{}'::jsonb,
  principal_bankers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id),
  UNIQUE (company_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_efs_engagement_gi_company
  ON efs_engagement_general_information (company_id);

ALTER TABLE efs_engagement_general_information ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efs_engagement_general_information_select ON efs_engagement_general_information;
CREATE POLICY efs_engagement_general_information_select
  ON efs_engagement_general_information
  FOR SELECT
  USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS efs_engagement_general_information_mutate ON efs_engagement_general_information;
CREATE POLICY efs_engagement_general_information_mutate
  ON efs_engagement_general_information
  FOR ALL
  USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()
    )
  );
