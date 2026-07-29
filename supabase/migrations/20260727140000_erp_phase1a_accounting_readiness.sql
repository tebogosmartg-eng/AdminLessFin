-- AdminLess Fin — ERP Phase 1A: Enterprise Accounting Setup / Accounting Readiness
-- Orchestration only: companies cannot perform operational accounting until the
-- foundation is complete. Existing companies are backfilled as READY.

CREATE TABLE IF NOT EXISTS public.accounting_readiness (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'READY', 'LOCKED')),
  accounting_ready boolean NOT NULL DEFAULT false,
  current_step text NOT NULL DEFAULT 'financial_calendar'
    CHECK (current_step IN (
      'financial_calendar',
      'chart_of_accounts',
      'tax_configuration',
      'bank_accounts',
      'opening_balances',
      'validation'
    )),
  financial_calendar_complete boolean NOT NULL DEFAULT false,
  chart_of_accounts_complete boolean NOT NULL DEFAULT false,
  tax_configuration_complete boolean NOT NULL DEFAULT false,
  bank_accounts_complete boolean NOT NULL DEFAULT false,
  opening_balances_complete boolean NOT NULL DEFAULT false,
  validation_complete boolean NOT NULL DEFAULT false,
  bank_accounts_skipped boolean NOT NULL DEFAULT false,
  opening_balances_zero_intentional boolean NOT NULL DEFAULT false,
  inventory_enabled boolean NOT NULL DEFAULT false,
  fixed_assets_enabled boolean NOT NULL DEFAULT false,
  payroll_enabled boolean NOT NULL DEFAULT false,
  last_validated_at timestamptz,
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_readiness_status
  ON public.accounting_readiness (status);

COMMENT ON TABLE public.accounting_readiness IS
  'ERP Phase 1A: Accounting Readiness lifecycle (NOT_STARTED → IN_PROGRESS → READY → LOCKED). Orchestrates onboarding only — does not replace posting engine, GL, TB, or FS.';

ALTER TABLE public.accounting_readiness ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounting_readiness_select ON public.accounting_readiness;
DROP POLICY IF EXISTS accounting_readiness_all ON public.accounting_readiness;

CREATE POLICY accounting_readiness_select ON public.accounting_readiness
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()
    )
  );

CREATE POLICY accounting_readiness_all ON public.accounting_readiness
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

-- ── Backfill: every existing company is READY (backward compatibility) ───────
INSERT INTO public.accounting_readiness (
  company_id,
  status,
  accounting_ready,
  current_step,
  financial_calendar_complete,
  chart_of_accounts_complete,
  tax_configuration_complete,
  bank_accounts_complete,
  opening_balances_complete,
  validation_complete,
  bank_accounts_skipped,
  inventory_enabled,
  fixed_assets_enabled,
  payroll_enabled,
  last_validated_at
)
SELECT
  c.id,
  'READY',
  true,
  'validation',
  EXISTS (
    SELECT 1 FROM public.financial_years fy
    WHERE fy.company_id = c.id AND fy.status IN ('open', 'draft')
  ),
  EXISTS (SELECT 1 FROM public.chart_of_accounts coa WHERE coa.company_id = c.id),
  EXISTS (SELECT 1 FROM public.tax_rates tr WHERE tr.company_id = c.id),
  EXISTS (SELECT 1 FROM public.bank_accounts ba WHERE ba.company_id = c.id)
    OR NOT EXISTS (SELECT 1 FROM public.bank_accounts ba2 WHERE ba2.company_id = c.id),
  true,
  true,
  NOT EXISTS (SELECT 1 FROM public.bank_accounts ba3 WHERE ba3.company_id = c.id),
  EXISTS (
    SELECT 1 FROM public.inv_warehouses iw WHERE iw.company_id = c.id
  ) OR EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.company_id = c.id AND p.inventory_asset_account_id IS NOT NULL
  ),
  EXISTS (SELECT 1 FROM public.fixed_assets fa WHERE fa.company_id = c.id),
  EXISTS (SELECT 1 FROM public.employees e WHERE e.company_id = c.id)
    OR EXISTS (SELECT 1 FROM public.payroll_runs pr WHERE pr.company_id = c.id),
  now()
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;
