-- AdminLess Fin — Chart of Accounts: account_role vocabulary expansion
--
-- Additive and backward-compatible. The existing account_role set (15 control/
-- system roles) is preserved; this migration WIDENS the CHECK to add the
-- remaining canonical roles an enterprise ledger resolves by identity rather
-- than display name: bank / cash / sales, plus the roles required for a
-- complete close and multi-currency readiness (current_year_earnings,
-- payroll_control, rounding, exchange_gain_loss).
--
-- Widening a CHECK constraint can never invalidate an existing row (every row
-- already satisfies the narrower set), and the new roles have no rows yet, so
-- recreating the singleton index cannot fail. No data is rewritten and no
-- posting behaviour changes — this only makes the additional roles ASSIGNABLE.

-- ── 1. Widen the role CHECK ──────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_account_role_check'
  ) THEN
    ALTER TABLE public.chart_of_accounts
      DROP CONSTRAINT chart_of_accounts_account_role_check;
  END IF;

  ALTER TABLE public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_account_role_check
    CHECK (
      account_role IS NULL OR account_role IN (
        -- Subledger control accounts
        'trade_receivable',
        'trade_payable',
        -- Tax
        'output_vat',
        'input_vat',
        'vat_control',
        -- Inventory / cost
        'inventory_asset',
        'cogs',
        -- Equity / close
        'retained_earnings',
        'current_year_earnings',   -- NEW: current-year profit before appropriation
        -- Utility / integrity
        'suspense',
        'rounding',                -- NEW: rounding differences (name-independent)
        'exchange_gain_loss',      -- NEW: FX gain/loss — multi-currency readiness
        -- Fixed assets
        'accumulated_depreciation',
        'depreciation_expense',
        'fixed_asset',
        'gain_on_disposal',
        'loss_on_disposal',
        -- Payroll
        'payroll_clearing',
        'payroll_control',         -- NEW: statutory/net-pay control (PAYE/UIF/SDL clearing)
        -- Cash / revenue
        'bank',                    -- NEW: operational bank GL (1:1 with a bank_account)
        'cash',                    -- NEW: cash/petty-cash on hand
        'sales'                    -- NEW: primary revenue account
      )
    );
END $$;

-- ── 2. Widen the singleton index ─────────────────────────────────────────────
-- Roles that must be unique per company. bank / cash / sales / depreciation /
-- fixed_asset / gain/loss / exchange_gain_loss / payroll_* remain non-singleton
-- (a company legitimately holds several).
DROP INDEX IF EXISTS public.idx_chart_of_accounts_singleton_role;
CREATE UNIQUE INDEX idx_chart_of_accounts_singleton_role
  ON public.chart_of_accounts (company_id, account_role)
  WHERE account_role IN (
    'trade_receivable',
    'trade_payable',
    'output_vat',
    'input_vat',
    'vat_control',
    'inventory_asset',
    'retained_earnings',
    'current_year_earnings',
    'suspense',
    'rounding'
  );

COMMENT ON COLUMN public.chart_of_accounts.account_role IS
  'Canonical control/system role for deterministic account resolution across all modules (posting engine, VAT, payroll, assets, inventory, banking, AR/AP, reporting). Display name must never be used for accounting identity. Singleton roles are enforced one-per-company by idx_chart_of_accounts_singleton_role.';
