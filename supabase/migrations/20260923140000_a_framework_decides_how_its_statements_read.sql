-- A framework decides how its statements read.
--
-- The statements are now presented from the chart of accounts' own
-- classification rather than from five account-type buckets. What differs
-- between frameworks is the WORDING and the presentation choices — a private
-- entity has Equity and a Profit for the year, a public-sector entity has Net
-- Assets and a Surplus, and the Modified Cash Standard reports Receipts and
-- Payments. That belongs in the framework pack as data, not in the statement
-- engine as a branch per framework.
--
-- Additive: the column is nullable and the engine falls back to the private
-- entity defaults when it is absent, so existing packs keep working.

ALTER TABLE public.efs_framework_packs
  ADD COLUMN IF NOT EXISTS presentation jsonb;

COMMENT ON COLUMN public.efs_framework_packs.presentation IS
  'Presentation profile consumed by the EFS statement engine: section wording and presentation choices for this framework. Null = private-entity defaults.';

-- Private-sector accrual frameworks.
UPDATE public.efs_framework_packs SET presentation = jsonb_build_object(
  'equity_label', 'Equity',
  'equity_section_label', 'Equity',
  'result_label', 'Profit / (loss) for the year',
  'revenue_label', 'Revenue',
  'retained_earnings_label', 'Retained earnings',
  'total_assets_label', 'Total Assets',
  'total_liabilities_label', 'Total Liabilities',
  'total_equity_and_liabilities_label', 'Total Equity and Liabilities',
  'split_current_non_current', true
) WHERE framework_key IN ('IFRS', 'IFRS_SME');

-- Public-sector accrual frameworks: net assets, surplus/deficit.
UPDATE public.efs_framework_packs SET presentation = jsonb_build_object(
  'equity_label', 'Net Assets',
  'equity_section_label', 'Net Assets',
  'result_label', 'Surplus / (deficit) for the period',
  'revenue_label', 'Revenue',
  'retained_earnings_label', 'Accumulated surplus / (deficit)',
  'total_assets_label', 'Total Assets',
  'total_liabilities_label', 'Total Liabilities',
  'total_equity_and_liabilities_label', 'Total Liabilities and Net Assets',
  'split_current_non_current', true
) WHERE framework_key IN ('GRAP', 'IPSAS');

-- Modified Cash Standard: receipts and payments, net assets.
UPDATE public.efs_framework_packs SET presentation = jsonb_build_object(
  'equity_label', 'Net Assets',
  'equity_section_label', 'Net Assets',
  'result_label', 'Surplus / (deficit) for the period',
  'revenue_label', 'Receipts',
  'retained_earnings_label', 'Accumulated surplus / (deficit)',
  'total_assets_label', 'Total Assets',
  'total_liabilities_label', 'Total Liabilities',
  'total_equity_and_liabilities_label', 'Total Liabilities and Net Assets',
  'split_current_non_current', true
) WHERE framework_key = 'MCS';
