-- How a set of financial statements is presented belongs to the engagement,
-- not to one person's browser.
--
-- Which notes are shown, the order they appear in and any renamed heading were
-- kept in localStorage under "efs.docws.v1.<workspace>". That made them private
-- to one browser profile on one machine: a reviewer opening the same engagement
-- saw the default document, and the PDF they generated was not the PDF the
-- preparer had been looking at. For a document that gets signed, two readers
-- disagreeing about what it says is not a preference, it is a defect.
--
-- One row per workspace holding the presentation choices, so every member of
-- the engagement reads the same document and the change is attributable.

CREATE TABLE IF NOT EXISTS efs_document_presentation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES efs_reporting_workspaces(id) ON DELETE CASCADE,
  -- { hidden: {nodeId: bool}, order: {nodeId: int}, titleOverrides: {nodeId: text} }
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_efs_document_presentation_company
  ON efs_document_presentation (company_id);

ALTER TABLE efs_document_presentation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS efs_document_presentation_select ON efs_document_presentation;
CREATE POLICY efs_document_presentation_select
  ON efs_document_presentation
  FOR SELECT
  USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS efs_document_presentation_mutate ON efs_document_presentation;
CREATE POLICY efs_document_presentation_mutate
  ON efs_document_presentation
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
