-- V6.6.2 Engagement minimum information (additive only)
-- Adds accountant-supplied minimum fields to the experience-layer engagement table.
-- Does NOT alter Statement Engine, Snapshots, Validation, Review, or Publication.

ALTER TABLE efs_engagement_general_information
  ADD COLUMN IF NOT EXISTS comparative_period text,
  ADD COLUMN IF NOT EXISTS functional_currency text,
  ADD COLUMN IF NOT EXISTS approval_date date,
  ADD COLUMN IF NOT EXISTS authorisation_date date;
