-- V16.1 — Canonical master data migration marker (additive only)
-- Tracks one-time legacy engagement → company master data hydration.

ALTER TABLE efs_company_master_data
  ADD COLUMN IF NOT EXISTS legacy_migration_completed_at timestamptz;

COMMENT ON COLUMN efs_company_master_data.legacy_migration_completed_at IS
  'Set when legacy engagement general information was hydrated into company master data. Idempotent guard.';
