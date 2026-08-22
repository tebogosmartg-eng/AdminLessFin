-- AdminLess Fin — Chart of Accounts as the authoritative source of account
-- classification.
--
-- No new column. `chart_of_accounts.category` already carries the presentation
-- classification (the CoA generator templates, the control-account mapping and
-- canonicalFinancialAggregation all read it). This migration makes that column
-- authoritative:
--
--   1. Repairs the legacy backfill from 20260727120000, which set
--      category = type::text ('Asset', 'Liability', ...). Those are account
--      TYPES, not presentation classes, and they satisfy no consumer.
--   2. Normalises known casing drift onto the canonical vocabulary.
--   3. Backfills a classification ONLY where existing authoritative metadata
--      (account_role / subcategory / an unambiguous type) determines it.
--      Anything genuinely ambiguous is left NULL and surfaces in the Chart of
--      Accounts as "Classification Required" — the system does not guess the
--      customer's current vs non-current decision.
--   4. Constrains category to the canonical vocabulary per type.
--
-- SAFETY: this migration touches one presentation column. It creates no
-- account, deletes no account, and changes no id, code, name, balance,
-- journal entry, journal line, debit, or credit. It is idempotent and
-- re-runnable, and it is tenant-agnostic (no company_id predicate), so RLS and
-- tenant isolation are unaffected.

-- ── 1. Drop the constraint first so the repair steps below can run ──────────
-- (Re-added at the end. Guarded so a re-run is a no-op.)
ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_category_classification_check;

-- ── 2. Clear the legacy `category = type::text` backfill ────────────────────
-- 'Equity' is BOTH a type name and a valid Equity classification, so it is
-- deliberately excluded here and handled by the deterministic rule in step 4.
UPDATE public.chart_of_accounts
SET category = NULL
WHERE category IN ('Asset', 'Liability', 'Income', 'Expense');

-- ── 3. Normalise casing/spelling drift onto the canonical vocabulary ────────
UPDATE public.chart_of_accounts
SET category = CASE lower(btrim(category))
      WHEN 'current assets'          THEN 'Current Assets'
      WHEN 'current asset'           THEN 'Current Assets'
      WHEN 'non-current assets'      THEN 'Non-Current Assets'
      WHEN 'non-current asset'       THEN 'Non-Current Assets'
      WHEN 'noncurrent assets'       THEN 'Non-Current Assets'
      WHEN 'fixed assets'            THEN 'Non-Current Assets'
      WHEN 'current liabilities'     THEN 'Current Liabilities'
      WHEN 'current liability'       THEN 'Current Liabilities'
      WHEN 'non-current liabilities' THEN 'Non-Current Liabilities'
      WHEN 'non-current liability'   THEN 'Non-Current Liabilities'
      WHEN 'noncurrent liabilities'  THEN 'Non-Current Liabilities'
      WHEN 'long-term liabilities'   THEN 'Non-Current Liabilities'
      WHEN 'equity'                  THEN 'Equity'
      WHEN 'revenue'                 THEN 'Revenue'
      WHEN 'income'                  THEN 'Revenue'
      WHEN 'sales'                   THEN 'Revenue'
      WHEN 'other income'            THEN 'Other Income'
      WHEN 'cost of sales'           THEN 'Cost of Sales'
      WHEN 'direct costs'            THEN 'Cost of Sales'
      WHEN 'operating expenses'      THEN 'Operating Expenses'
      WHEN 'operating expense'       THEN 'Operating Expenses'
      WHEN 'finance costs'           THEN 'Finance Costs'
      WHEN 'finance cost'            THEN 'Finance Costs'
      WHEN 'taxation'                THEN 'Taxation'
      WHEN 'income tax'              THEN 'Taxation'
      WHEN 'tax expense'             THEN 'Taxation'
      WHEN 'other expenses'          THEN 'Other Expenses'
      WHEN 'other expense'           THEN 'Other Expenses'
      ELSE category
    END
WHERE category IS NOT NULL;

-- ── 4. Deterministic backfill from existing authoritative metadata ──────────
-- 4a. account_role is an explicit operator/system mapping — highest authority.
UPDATE public.chart_of_accounts
SET category = CASE account_role
      WHEN 'trade_receivable'        THEN 'Current Assets'
      WHEN 'input_vat'               THEN 'Current Assets'
      WHEN 'inventory_asset'         THEN 'Current Assets'
      WHEN 'bank'                    THEN 'Current Assets'
      WHEN 'cash'                    THEN 'Current Assets'
      WHEN 'fixed_asset'             THEN 'Non-Current Assets'
      WHEN 'accumulated_depreciation' THEN 'Non-Current Assets'
      WHEN 'trade_payable'           THEN 'Current Liabilities'
      WHEN 'output_vat'              THEN 'Current Liabilities'
      WHEN 'vat_control'             THEN 'Current Liabilities'
      WHEN 'payroll_clearing'        THEN 'Current Liabilities'
      WHEN 'payroll_control'         THEN 'Current Liabilities'
      WHEN 'retained_earnings'       THEN 'Equity'
      WHEN 'current_year_earnings'   THEN 'Equity'
      WHEN 'sales'                   THEN 'Revenue'
      WHEN 'gain_on_disposal'        THEN 'Other Income'
      WHEN 'cogs'                    THEN 'Cost of Sales'
      WHEN 'depreciation_expense'    THEN 'Operating Expenses'
      WHEN 'loss_on_disposal'        THEN 'Other Expenses'
      ELSE NULL
    END
WHERE category IS NULL
  AND account_role IS NOT NULL
  AND account_role IN (
    'trade_receivable', 'input_vat', 'inventory_asset', 'bank', 'cash',
    'fixed_asset', 'accumulated_depreciation', 'trade_payable', 'output_vat',
    'vat_control', 'payroll_clearing', 'payroll_control', 'retained_earnings',
    'current_year_earnings', 'sales', 'gain_on_disposal', 'cogs',
    'depreciation_expense', 'loss_on_disposal'
  );

-- 4b. subcategory — the statement line the generator/import already asserted.
-- 'Interest-bearing Borrowings', 'Related-party Payables' and 'Provisions' are
-- deliberately absent: each can be current OR non-current, and that is exactly
-- the decision the customer must make.
UPDATE public.chart_of_accounts
SET category = CASE subcategory
      WHEN 'Cash and Cash Equivalents'      THEN 'Current Assets'
      WHEN 'Trade and Other Receivables'    THEN 'Current Assets'
      WHEN 'Inventory'                      THEN 'Current Assets'
      WHEN 'Property, Plant and Equipment'  THEN 'Non-Current Assets'
      WHEN 'Intangible Assets'              THEN 'Non-Current Assets'
      WHEN 'Trade and Other Payables'       THEN 'Current Liabilities'
      WHEN 'Statutory Payables'             THEN 'Current Liabilities'
      WHEN 'Issued Capital'                 THEN 'Equity'
      WHEN 'Reserves'                       THEN 'Equity'
      WHEN 'Distributions'                  THEN 'Equity'
      WHEN 'Employee Costs'                 THEN 'Operating Expenses'
      ELSE NULL
    END
WHERE category IS NULL
  AND subcategory IN (
    'Cash and Cash Equivalents', 'Trade and Other Receivables', 'Inventory',
    'Property, Plant and Equipment', 'Intangible Assets',
    'Trade and Other Payables', 'Statutory Payables',
    'Issued Capital', 'Reserves', 'Distributions', 'Employee Costs'
  );

-- 4c. Types with a single presentation class, or whose default the reporting
-- engine already applies today. Equity has exactly one class. Income without a
-- category is already aggregated as Revenue, and Expense without a category is
-- already aggregated as Operating Expenses, by canonicalFinancialAggregation —
-- so writing those values changes no reported figure, it only records what the
-- system already presents.
UPDATE public.chart_of_accounts
SET category = CASE type::text
      WHEN 'Equity'  THEN 'Equity'
      WHEN 'Income'  THEN 'Revenue'
      WHEN 'Expense' THEN 'Operating Expenses'
      ELSE NULL
    END
WHERE category IS NULL
  AND type::text IN ('Equity', 'Income', 'Expense');

-- 4d. Anything still carrying a value outside the canonical vocabulary, or a
-- value that disagrees with its type, is reset to NULL so the customer is asked
-- for the decision rather than the report silently mis-presenting the account.
UPDATE public.chart_of_accounts
SET category = NULL
WHERE category IS NOT NULL
  AND NOT (
    (type::text = 'Asset'     AND category IN ('Current Assets', 'Non-Current Assets')) OR
    (type::text = 'Liability' AND category IN ('Current Liabilities', 'Non-Current Liabilities')) OR
    (type::text = 'Equity'    AND category = 'Equity') OR
    (type::text = 'Income'    AND category IN ('Revenue', 'Other Income')) OR
    (type::text = 'Expense'   AND category IN (
      'Cost of Sales', 'Operating Expenses', 'Finance Costs', 'Taxation', 'Other Expenses'))
  );

-- Asset and Liability rows that reached this point without an authoritative
-- signal keep category = NULL. They surface as "Classification Required" in the
-- Chart of Accounts and group under that heading in the Trial Balance.

-- ── 5. Constrain the vocabulary, per type ──────────────────────────────────
-- NULL stays permitted: "not yet classified" is a legitimate, visible state.
-- NOT VALID is deliberately NOT used — step 4 guarantees every existing row
-- already satisfies this, so the constraint is validated on creation.
ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_category_classification_check
  CHECK (
    category IS NULL OR (
      (type::text = 'Asset'     AND category IN ('Current Assets', 'Non-Current Assets')) OR
      (type::text = 'Liability' AND category IN ('Current Liabilities', 'Non-Current Liabilities')) OR
      (type::text = 'Equity'    AND category = 'Equity') OR
      (type::text = 'Income'    AND category IN ('Revenue', 'Other Income')) OR
      (type::text = 'Expense'   AND category IN (
        'Cost of Sales', 'Operating Expenses', 'Finance Costs', 'Taxation', 'Other Expenses'))
    )
  );

COMMENT ON COLUMN public.chart_of_accounts.category IS
  'AUTHORITATIVE account classification. The Chart of Accounts owns it and every '
  'accounting report (Trial Balance, Statement of Financial Position, Profit or '
  'Loss, Account Activity, General Ledger) consumes it — no report may infer '
  'classification from account name, code, number, balance, or journal activity. '
  'Vocabulary per type: Asset = Current Assets | Non-Current Assets; '
  'Liability = Current Liabilities | Non-Current Liabilities; Equity = Equity; '
  'Income = Revenue | Other Income; Expense = Cost of Sales | Operating Expenses '
  '| Finance Costs | Taxation | Other Expenses. NULL means the customer has not '
  'made the decision yet and the account presents as "Classification Required". '
  'Presentation metadata only — never affects a posted debit, credit, or balance.';

COMMENT ON COLUMN public.chart_of_accounts.subcategory IS
  'Statement line item under `category` (e.g. Cash and Cash Equivalents under '
  'Current Assets). Optional refinement — an account is fully classified with '
  '`category` alone.';

-- ── 6. Index for the "requires classification" lookups in Accounting Setup ──
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company_category
  ON public.chart_of_accounts (company_id, category);
