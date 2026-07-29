-- Soft-archive FY2026 / FY2027 development/test Financial Statements workspaces.
-- Standalone data cleanup only. Never DELETE production rows; status → archived only.
-- Do not hardcode these years in runtime Edge Function / API code.

UPDATE efs_reporting_workspaces AS w
SET
  status = 'archived',
  closed_at = COALESCE(w.closed_at, now()),
  updated_at = now()
FROM efs_reporting_periods AS p
WHERE w.reporting_period_id = p.id
  AND w.company_id = p.company_id
  AND w.status IS DISTINCT FROM 'archived'
  AND (
    upper(coalesce(p.period_key, '') || ' ' || coalesce(p.label, '')) ~ '\mFY2026\M'
    OR upper(coalesce(p.period_key, '') || ' ' || coalesce(p.label, '')) ~ '\mFY2027\M'
    OR upper(coalesce(p.period_key, '') || ' ' || coalesce(p.label, '')) LIKE '%FINANCIAL YEAR 2026%'
    OR upper(coalesce(p.period_key, '') || ' ' || coalesce(p.label, '')) LIKE '%FINANCIAL YEAR 2027%'
  );
