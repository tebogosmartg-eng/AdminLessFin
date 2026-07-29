-- AdminLess Fin — Enterprise Chart of Accounts Engine, Phase 1: Metadata layer
--
-- Additive and backward-compatible by construction. Every new column is
-- NULLABLE with no NOT NULL/DEFAULT that would rewrite existing rows' meaning,
-- so the certified Posting Engine, canonical Trial Balance, and FRP financial-
-- statement mapping keep working untouched. This layer ENRICHES the Chart of
-- Accounts (hierarchy, statement classification, cash-flow classification,
-- presentation order, tax treatment, provenance) so the generator and future
-- reporting can consume account metadata directly — it never replaces the
-- existing classification the certified modules already rely on.

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS account_code text,
  ADD COLUMN IF NOT EXISTS parent_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS financial_statement text,
  ADD COLUMN IF NOT EXISTS cash_flow_classification text,
  ADD COLUMN IF NOT EXISTS presentation_order integer,
  ADD COLUMN IF NOT EXISTS tax_treatment text,
  ADD COLUMN IF NOT EXISTS template_key text,
  ADD COLUMN IF NOT EXISTS source text;

-- Constrain the classification vocabularies, but only for NON-NULL values, so
-- every existing row (all NULL until backfilled below) satisfies the check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_financial_statement_check'
  ) THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_financial_statement_check
      CHECK (financial_statement IS NULL OR financial_statement IN (
        'Statement of Financial Position',
        'Profit or Loss',
        'Statement of Cash Flows',
        'Statement of Changes in Equity'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_cash_flow_classification_check'
  ) THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_cash_flow_classification_check
      CHECK (cash_flow_classification IS NULL OR cash_flow_classification IN (
        'operating', 'investing', 'financing', 'none'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.chart_of_accounts.account_code IS
  'COA Engine: human-facing string code (e.g. "1000"), distinct from the numeric account_number. Nullable; populated by the generator/import, optional for manual accounts.';
COMMENT ON COLUMN public.chart_of_accounts.parent_account_id IS
  'COA Engine: optional self-reference for roll-up/hierarchy (a detail account under a header/control account). NULL = top level.';
COMMENT ON COLUMN public.chart_of_accounts.category IS
  'COA Engine: finer classification under the 5-value type enum (e.g. Current Assets, Cost of Sales, Other Income) — captures the full 8-way presentation without altering the certified account_type enum.';
COMMENT ON COLUMN public.chart_of_accounts.financial_statement IS
  'COA Engine: which primary statement this account presents on. Enrichment only — the certified FRP mapping remains the source of truth for statement production.';
COMMENT ON COLUMN public.chart_of_accounts.cash_flow_classification IS
  'COA Engine: operating/investing/financing/none. Enrichment for cash-flow presentation; NULL for legacy accounts that have not been classified.';
COMMENT ON COLUMN public.chart_of_accounts.source IS
  'COA Engine: provenance of the account — "generator", "import", "manual", or "legacy" for rows that predate this engine.';

-- ── Backfill for existing companies (deterministic, non-breaking) ───────────
-- Only fills values that are unambiguously derivable from the existing `type`.
-- normal_balance and financial_statement are deterministic; cash_flow_
-- classification is genuinely account-specific and is deliberately left NULL
-- for legacy rows rather than asserting a guess.

UPDATE public.chart_of_accounts
SET normal_balance = CASE WHEN type IN ('Asset', 'Expense') THEN 'debit' ELSE 'credit' END
WHERE normal_balance IS NULL;

UPDATE public.chart_of_accounts
SET financial_statement = CASE
      WHEN type IN ('Asset', 'Liability', 'Equity') THEN 'Statement of Financial Position'
      ELSE 'Profit or Loss'
    END
WHERE financial_statement IS NULL;

UPDATE public.chart_of_accounts
SET category = type::text
WHERE category IS NULL;

UPDATE public.chart_of_accounts
SET source = 'legacy'
WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent
  ON public.chart_of_accounts (parent_account_id);
