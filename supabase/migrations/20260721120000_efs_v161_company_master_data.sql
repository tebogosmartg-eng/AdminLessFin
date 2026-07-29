-- V16.1 Enterprise Corporate Information — Company Master Data (additive only)
-- Single source of truth for corporate master data modules.
-- Engagement general information remains the engagement snapshot; master data is composed on read.

CREATE TABLE IF NOT EXISTS efs_company_master_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  addresses jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_registrations jsonb NOT NULL DEFAULT '{}'::jsonb,
  directors jsonb NOT NULL DEFAULT '[]'::jsonb,
  governance jsonb NOT NULL DEFAULT '{}'::jsonb,
  officers jsonb NOT NULL DEFAULT '[]'::jsonb,
  principal_bankers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_efs_company_master_data_company
  ON efs_company_master_data (company_id);

ALTER TABLE efs_company_master_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efs_company_master_data_select ON efs_company_master_data;
CREATE POLICY efs_company_master_data_select
  ON efs_company_master_data
  FOR SELECT
  USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS efs_company_master_data_mutate ON efs_company_master_data;
CREATE POLICY efs_company_master_data_mutate
  ON efs_company_master_data
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

-- Extended engagement fields for V16.1 corporate information engine
ALTER TABLE efs_engagement_general_information
  ADD COLUMN IF NOT EXISTS physical_address text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telephone text,
  ADD COLUMN IF NOT EXISTS engagement_type text,
  ADD COLUMN IF NOT EXISTS independent_reviewer text,
  ADD COLUMN IF NOT EXISTS accounting_officer text,
  ADD COLUMN IF NOT EXISTS partner text,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS country_of_incorporation text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS paye_number text,
  ADD COLUMN IF NOT EXISTS sdl_number text,
  ADD COLUMN IF NOT EXISTS uif_number text,
  ADD COLUMN IF NOT EXISTS custom_tax_registrations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compilation_engagement boolean DEFAULT false;
