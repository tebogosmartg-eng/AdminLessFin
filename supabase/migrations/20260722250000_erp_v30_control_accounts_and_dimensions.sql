-- AdminLess Fin — ERP Blueprint V3.0, Phase 3: Control Accounts & Dimensions
-- Additive, opt-in, zero behavior change until explicitly configured per
-- account: every new column defaults to the permissive value (no manual-
-- posting restriction, no dimension requirement) so no existing company's
-- workflow changes the moment this migration applies. The capability is
-- enforced by the Posting Engine (next migration); designating which of a
-- given company's actual accounts ARE control accounts is a follow-up
-- configuration/UI task, not a blind auto-tag this migration performs.

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS allow_manual_posting boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS control_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normal_balance text CHECK (normal_balance IN ('debit', 'credit')),
  ADD COLUMN IF NOT EXISTS posting_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_dimension boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chart_of_accounts.control_account IS
  'ERP V3.0: if true, module=manual_journal postings are rejected unless allow_manual_posting is also true. Systematic postings from owning modules (sales_invoice -> AR, accounts_payable -> AP, etc.) are never restricted by this flag.';
COMMENT ON COLUMN public.chart_of_accounts.posting_blocked IS
  'ERP V3.0: if true, blocks ALL postings to this account regardless of module (e.g. a deprecated/closed account).';
COMMENT ON COLUMN public.chart_of_accounts.requires_dimension IS
  'ERP V3.0: if true, every posting line against this account must carry at least one dimension (project_id or a non-empty dimensions object).';

-- ── Dimensions ────────────────────────────────────────────────────────────
-- Project already exists as a first-class entity (projects table,
-- journal_entry_items.project_id) — reused as-is, not duplicated. The other
-- enterprise dimensions (cost centre, department, business unit, grant,
-- fund, location) are new; modeled as one flexible jsonb bag rather than six
-- new FK columns, since not every company will use most of them and a rigid
-- column-per-dimension schema would force unused NULLs everywhere.

ALTER TABLE public.journal_entry_items
  ADD COLUMN IF NOT EXISTS dimensions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.journal_entry_items.dimensions IS
  'ERP V3.0: enterprise accounting dimensions beyond project_id — cost_centre, department, business_unit, grant, fund, location. Free-form jsonb; presence/absence is what requires_dimension validates, not fixed keys.';

CREATE TABLE IF NOT EXISTS public.accounting_dimension_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  dimension_type text NOT NULL CHECK (dimension_type IN ('cost_centre', 'department', 'business_unit', 'grant', 'fund', 'location')),
  code text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, dimension_type, code)
);

ALTER TABLE public.accounting_dimension_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounting_dimension_values_select ON public.accounting_dimension_values;
DROP POLICY IF EXISTS accounting_dimension_values_all ON public.accounting_dimension_values;
CREATE POLICY accounting_dimension_values_select ON public.accounting_dimension_values FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY accounting_dimension_values_all ON public.accounting_dimension_values FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

COMMENT ON TABLE public.accounting_dimension_values IS
  'ERP V3.0: reference values for the six new enterprise dimensions (project reuses the existing projects table instead). Not yet populated for any company — the Posting Engine validates presence on required-dimension accounts, not membership in this table, so this ships ahead of any UI to manage it.';
