-- =============================================================================
-- EFS FRP — Reject duplicate account codes within a single TB import
--
-- Scope: (import_id, lower(source_account_code)) where code is non-empty.
-- Reasoning: uniqueness belongs to the import batch, not company-wide or
-- Canonical TB — the same ledger code may appear in different periods/imports.
-- Application-layer assertUniqueAccountCodes rejects before insert; this index
-- is the database backstop.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_efs_tb_import_lines_import_account_code
  ON efs_tb_import_lines (import_id, lower(btrim(source_account_code)))
  WHERE source_account_code IS NOT NULL AND btrim(source_account_code) <> '';
