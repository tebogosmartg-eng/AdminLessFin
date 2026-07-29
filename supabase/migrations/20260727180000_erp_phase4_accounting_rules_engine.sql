-- AdminLess Fin — ERP Phase 4: Enterprise Accounting Rules Engine
-- Business modules describe events. Rules Engine generates accounting events.
-- Posting Engine remains the sole GL writer. Policy Engine validates before commit.

-- ── Rule catalog ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.accounting_rule_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  business_event text NOT NULL,
  module text NOT NULL,
  trigger_event text NOT NULL DEFAULT 'on_finalize',
  rule_type text NOT NULL CHECK (rule_type IN ('system', 'company', 'industry')),
  version integer NOT NULL DEFAULT 1,
  is_mandatory boolean NOT NULL DEFAULT false,
  industry_template text,
  narration_template text,
  generation_hook text NOT NULL,
  line_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  vat_treatment text,
  dimension_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency_behaviour text NOT NULL DEFAULT 'company_default',
  period_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  cloned_from_id uuid REFERENCES public.accounting_rule_definitions(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_rule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.accounting_rule_definitions(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  severity_override text,
  account_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, rule_id)
);

CREATE TABLE IF NOT EXISTS public.accounting_rule_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.accounting_rule_definitions(id) ON DELETE RESTRICT,
  rule_code text NOT NULL,
  rule_name text NOT NULL,
  rule_version integer NOT NULL,
  business_event text NOT NULL,
  module text NOT NULL,
  result text NOT NULL CHECK (result IN ('preview', 'validated', 'committed', 'blocked', 'error')),
  narration text,
  generated_by uuid REFERENCES auth.users(id),
  posting_request_id uuid REFERENCES public.posting_requests(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  total_debit numeric,
  total_credit numeric,
  line_count integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_rule_executions_company_created
  ON public.accounting_rule_executions (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_rule_executions_rule
  ON public.accounting_rule_executions (company_id, rule_code, created_at DESC);

-- ── Audit columns on posting + journal ───────────────────────────────────────

ALTER TABLE public.posting_requests
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.accounting_rule_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_version integer,
  ADD COLUMN IF NOT EXISTS business_event text,
  ADD COLUMN IF NOT EXISTS generated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.accounting_rule_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_version integer,
  ADD COLUMN IF NOT EXISTS business_event text,
  ADD COLUMN IF NOT EXISTS generated_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;

ALTER TABLE public.accounting_rule_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_rule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_rule_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_rule_definitions_select ON public.accounting_rule_definitions
  FOR SELECT TO authenticated USING (
    company_id IS NULL
    OR company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid())
  );

CREATE POLICY accounting_rule_settings_select ON public.accounting_rule_settings
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY accounting_rule_settings_mutate ON public.accounting_rule_settings
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM public.company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ))
  WITH CHECK (company_id IN (
    SELECT cu.company_id FROM public.company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ));

CREATE POLICY accounting_rule_executions_select ON public.accounting_rule_executions
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- ── Seed system rules (all supported business events) ────────────────────────

INSERT INTO public.accounting_rule_definitions
  (code, name, description, business_event, module, trigger_event, rule_type, is_mandatory, generation_hook, narration_template)
VALUES
  ('sys.sales_invoice', 'Sales Invoice Posting', 'Dr Trade Debtors, Cr Revenue, Cr Output VAT', 'sales_invoice', 'sales_invoice', 'on_finalize', 'system', true, 'sales_invoice', 'Sales Invoice {reference}'),
  ('sys.customer_receipt', 'Customer Receipt', 'Dr Bank, Cr Trade Debtors', 'customer_receipt', 'banking', 'on_finalize', 'system', true, 'customer_receipt', 'Customer Receipt {reference}'),
  ('sys.supplier_invoice', 'Supplier Invoice', 'Dr Expense, Dr VAT Input, Cr Trade Creditors', 'supplier_invoice', 'accounts_payable', 'on_finalize', 'system', true, 'supplier_invoice', 'Supplier Invoice {reference}'),
  ('sys.supplier_payment', 'Supplier Payment', 'Dr Trade Creditors, Cr Bank', 'supplier_payment', 'banking', 'on_finalize', 'system', true, 'supplier_payment', 'Supplier Payment {reference}'),
  ('sys.bank_deposit', 'Bank Deposit', 'Dr Bank, Cr Contra', 'bank_deposit', 'banking', 'on_finalize', 'system', true, 'bank_deposit', 'Bank Deposit {reference}'),
  ('sys.bank_withdrawal', 'Bank Withdrawal', 'Dr Contra, Cr Bank', 'bank_withdrawal', 'banking', 'on_finalize', 'system', true, 'bank_withdrawal', 'Bank Withdrawal {reference}'),
  ('sys.journal_entry', 'Manual Journal Entry', 'User-defined balanced journal lines', 'journal_entry', 'manual_journal', 'on_submit', 'system', true, 'journal_entry', 'Journal Entry {reference}'),
  ('sys.inventory_purchase', 'Inventory Purchase', 'Dr Inventory Asset, Cr Trade Creditors', 'inventory_purchase', 'inventory_receipt', 'on_finalize', 'system', true, 'inventory_purchase', 'Inventory Purchase {reference}'),
  ('sys.inventory_sale', 'Inventory Sale (COGS)', 'Dr COGS, Cr Inventory Asset', 'inventory_sale', 'inventory_issue', 'on_finalize', 'system', true, 'inventory_sale', 'Inventory Issue {reference}'),
  ('sys.inventory_adjustment', 'Inventory Adjustment', 'Dr/Cr Inventory variance', 'inventory_adjustment', 'inventory_issue', 'on_finalize', 'system', true, 'inventory_adjustment', 'Inventory Adjustment {reference}'),
  ('sys.payroll_run', 'Payroll Run', 'Dr Wages, Cr Bank, Cr Payroll Liabilities', 'payroll_run', 'payroll', 'on_finalize', 'system', true, 'payroll_run', 'Payroll Run {reference}'),
  ('sys.payroll_payment', 'Payroll Payment', 'Dr Payroll Liability, Cr Bank', 'payroll_payment', 'banking', 'on_finalize', 'system', true, 'payroll_payment', 'Payroll Payment {reference}'),
  ('sys.depreciation', 'Depreciation', 'Dr Depreciation Expense, Cr Accumulated Depreciation', 'depreciation', 'fixed_assets', 'on_finalize', 'system', true, 'depreciation', 'Depreciation {reference}'),
  ('sys.asset_acquisition', 'Asset Acquisition', 'Dr Fixed Asset, Cr Bank/AP', 'asset_acquisition', 'fixed_assets', 'on_finalize', 'system', true, 'asset_acquisition', 'Asset Acquisition {reference}'),
  ('sys.asset_disposal', 'Asset Disposal', 'Cr Asset, Dr Accum Dep, Dr Cash, Cr/Dr Gain/Loss', 'asset_disposal', 'fixed_assets', 'on_finalize', 'system', true, 'asset_disposal', 'Asset Disposal {reference}'),
  ('sys.vat_return', 'VAT Return', 'Settle VAT control accounts', 'vat_return', 'manual_journal', 'on_finalize', 'system', true, 'vat_return', 'VAT Return {reference}'),
  ('sys.interest', 'Interest', 'Dr/Cr Bank and interest account', 'interest', 'banking', 'on_finalize', 'system', true, 'interest', 'Interest {reference}'),
  ('sys.loan', 'Loan Transaction', 'Dr/Cr Bank and loan account', 'loan', 'banking', 'on_finalize', 'system', true, 'loan', 'Loan {reference}'),
  ('sys.opening_balances', 'Opening Balances', 'Balanced opening balance journal', 'opening_balances', 'manual_journal', 'on_finalize', 'system', true, 'opening_balances', 'Opening Balances {reference}'),
  ('sys.recurring_journal', 'Recurring Journal', 'Template-driven recurring entry', 'recurring_journal', 'manual_journal', 'on_schedule', 'system', true, 'recurring_journal', 'Recurring Journal {reference}'),
  ('sys.accrual', 'Accrual', 'Period-end accrual entry', 'accrual', 'manual_journal', 'on_finalize', 'system', true, 'accrual', 'Accrual {reference}'),
  ('sys.prepayment', 'Prepayment', 'Prepaid expense amortisation', 'prepayment', 'manual_journal', 'on_finalize', 'system', true, 'prepayment', 'Prepayment {reference}'),
  ('sys.reversal', 'Reversal', 'Reverse a prior journal entry', 'reversal', 'manual_journal', 'on_finalize', 'system', true, 'reversal', 'Reversal {reference}')
ON CONFLICT (code) DO NOTHING;

-- Industry template rules (cloneable, not mandatory)
INSERT INTO public.accounting_rule_definitions
  (code, name, description, business_event, module, trigger_event, rule_type, is_mandatory, industry_template, generation_hook, narration_template)
VALUES
  ('ind.retail.sales_invoice', 'Retail Sales Invoice', 'Retail revenue recognition with VAT', 'sales_invoice', 'sales_invoice', 'on_finalize', 'industry', false, 'retail', 'sales_invoice', 'Retail Sale {reference}'),
  ('ind.manufacturing.inventory_purchase', 'Manufacturing Raw Materials', 'Raw materials to inventory', 'inventory_purchase', 'inventory_receipt', 'on_finalize', 'industry', false, 'manufacturing', 'inventory_purchase', 'Raw Materials {reference}'),
  ('ind.agriculture.inventory_sale', 'Agriculture Produce Sale', 'Produce COGS recognition', 'inventory_sale', 'inventory_issue', 'on_finalize', 'industry', false, 'agriculture', 'inventory_sale', 'Produce Sale {reference}'),
  ('ind.construction.accrual', 'Construction WIP Accrual', 'Work-in-progress accrual', 'accrual', 'manual_journal', 'on_finalize', 'industry', false, 'construction', 'accrual', 'WIP Accrual {reference}'),
  ('ind.medical.supplier_invoice', 'Medical Supplies Invoice', 'Medical consumables expense', 'supplier_invoice', 'accounts_payable', 'on_finalize', 'industry', false, 'medical', 'supplier_invoice', 'Medical Supplies {reference}'),
  ('ind.municipality.payroll_run', 'Municipality Payroll', 'Municipal payroll posting', 'payroll_run', 'payroll', 'on_finalize', 'industry', false, 'municipality', 'payroll_run', 'Municipal Payroll {reference}'),
  ('ind.npo.journal_entry', 'NPO Grant Recognition', 'Grant income recognition', 'journal_entry', 'manual_journal', 'on_submit', 'industry', false, 'npo', 'journal_entry', 'Grant Income {reference}'),
  ('ind.professional_services.sales_invoice', 'Professional Services Invoice', 'Fee income with VAT', 'sales_invoice', 'sales_invoice', 'on_finalize', 'industry', false, 'professional_services', 'sales_invoice', 'Professional Fees {reference}')
ON CONFLICT (code) DO NOTHING;

-- ── Rule resolution + execution logging ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accounting_rules_resolve(
  p_company_id uuid,
  p_business_event text
)
RETURNS public.accounting_rule_definitions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.accounting_rule_definitions;
BEGIN
  -- Company-specific rule (enabled) takes precedence
  SELECT d.* INTO v_rule
  FROM accounting_rule_definitions d
  JOIN accounting_rule_settings s ON s.rule_id = d.id AND s.company_id = p_company_id
  WHERE d.business_event = p_business_event
    AND d.rule_type = 'company'
    AND d.company_id = p_company_id
    AND s.enabled = true
  ORDER BY d.version DESC
  LIMIT 1;

  IF FOUND THEN RETURN v_rule; END IF;

  -- System mandatory rule
  SELECT * INTO v_rule
  FROM accounting_rule_definitions
  WHERE business_event = p_business_event
    AND rule_type = 'system'
    AND is_mandatory = true
  ORDER BY version DESC
  LIMIT 1;

  IF FOUND THEN RETURN v_rule; END IF;

  RAISE EXCEPTION 'accounting_rules_resolve: no rule found for business event %', p_business_event
    USING ERRCODE = '22023';
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_rules_log_execution(
  p_company_id uuid,
  p_rule_id uuid,
  p_rule_code text,
  p_rule_name text,
  p_rule_version integer,
  p_business_event text,
  p_module text,
  p_result text,
  p_narration text,
  p_generated_by uuid,
  p_posting_request_id uuid,
  p_journal_entry_id uuid,
  p_total_debit numeric,
  p_total_credit numeric,
  p_line_count integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO accounting_rule_executions (
    company_id, rule_id, rule_code, rule_name, rule_version, business_event, module,
    result, narration, generated_by, posting_request_id, journal_entry_id,
    total_debit, total_credit, line_count, metadata
  ) VALUES (
    p_company_id, p_rule_id, p_rule_code, p_rule_name, p_rule_version, p_business_event, p_module,
    p_result, p_narration, p_generated_by, p_posting_request_id, p_journal_entry_id,
    p_total_debit, p_total_credit, p_line_count, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.accounting_rules_resolve IS
  'ERP Phase 4: resolve the effective accounting rule for a business event (company override > system).';

COMMENT ON FUNCTION public.accounting_rules_log_execution IS
  'ERP Phase 4: audit trail for every rules engine execution (preview, validate, commit).';

-- ── Patch posting_engine_submit: store rule audit metadata on commit ───────────
-- Surgical addition only — does not change posting validation logic.

CREATE OR REPLACE FUNCTION public.posting_engine_submit(p_request jsonb, p_mode text DEFAULT 'commit')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_posting_date date;
  v_module text;
  v_document_type text;
  v_document_id uuid;
  v_reference text;
  v_description text;
  v_currency text;
  v_exchange_rate numeric;
  v_source text;
  v_created_by uuid;
  v_idempotency_key text;
  v_lines jsonb;
  v_line jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_debit numeric;
  v_credit numeric;
  v_warnings jsonb := '[]'::jsonb;
  v_policy jsonb;
  v_policy_item jsonb;
  v_erp jsonb;
  v_fy_id uuid;
  v_ap_id uuid;
  v_existing record;
  v_je_id uuid;
  v_journal_number text;
  v_account record;
  v_request_id uuid;
  v_line_item_id uuid;
  v_has_dimension boolean;
  v_rule_id uuid;
  v_rule_version integer;
  v_business_event text;
  v_generated_by uuid;
BEGIN
  IF p_mode NOT IN ('preview', 'validate', 'commit') THEN
    RAISE EXCEPTION 'posting_engine_submit: mode must be preview, validate, or commit (got %). Use posting_engine_rollback() to reverse a committed posting.', p_mode
      USING ERRCODE = '22023';
  END IF;

  v_company_id := NULLIF(p_request->>'company_id', '')::uuid;
  v_posting_date := NULLIF(p_request->>'posting_date', '')::date;
  v_module := p_request->>'module';
  v_document_type := p_request->>'document_type';
  v_document_id := NULLIF(p_request->>'document_id', '')::uuid;
  v_reference := p_request->>'reference';
  v_description := p_request->>'description';
  v_currency := UPPER(COALESCE(NULLIF(p_request->>'currency', ''), 'ZAR'));
  v_exchange_rate := COALESCE((p_request->>'exchange_rate')::numeric, 1);
  v_source := p_request->>'source';
  v_created_by := NULLIF(p_request->>'created_by', '')::uuid;
  v_lines := COALESCE(p_request->'lines', '[]'::jsonb);
  v_rule_id := NULLIF(p_request->>'rule_id', '')::uuid;
  v_rule_version := NULLIF(p_request->>'rule_version', '')::integer;
  v_business_event := NULLIF(p_request->>'business_event', '');
  v_generated_by := COALESCE(NULLIF(p_request->>'generated_by', '')::uuid, v_created_by);

  v_idempotency_key := NULLIF(p_request->>'idempotency_key', '');
  IF v_idempotency_key IS NULL THEN
    IF v_document_id IS NOT NULL THEN
      v_idempotency_key := COALESCE(v_module, 'unknown') || ':' || COALESCE(v_document_type, 'doc') || ':' || v_document_id::text;
    ELSE
      v_idempotency_key := COALESCE(v_module, 'unknown') || ':adhoc:' || gen_random_uuid()::text;
    END IF;
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'posting_engine_submit: company_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_posting_date IS NULL THEN
    RAISE EXCEPTION 'posting_engine_submit: posting_date is required' USING ERRCODE = '22023';
  END IF;
  IF v_module IS NULL OR v_module NOT IN (
    'sales_invoice', 'inventory_receipt', 'inventory_issue', 'manual_journal',
    'accounts_payable', 'fixed_assets', 'banking', 'payroll'
  ) THEN
    RAISE EXCEPTION 'posting_engine_submit: unsupported module %', v_module USING ERRCODE = '22023';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'posting_engine_submit: invalid currency code %', v_currency USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'posting_engine_submit: at least one posting line is required' USING ERRCODE = '22023';
  END IF;

  IF v_created_by IS NOT NULL THEN
    v_erp := public.resolve_erp_context(v_created_by, v_company_id);
    v_fy_id := NULLIF(v_erp->'financial_year'->>'id', '')::uuid;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM companies WHERE id = v_company_id) THEN
      RAISE EXCEPTION 'posting_engine_submit: company not found' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_fy_id FROM financial_years
      WHERE company_id = v_company_id AND status IN ('open', 'draft')
      ORDER BY start_date DESC LIMIT 1;
  END IF;

  IF p_mode = 'commit' THEN
    SELECT * INTO v_existing FROM posting_requests
      WHERE company_id = v_company_id AND idempotency_key = v_idempotency_key;

    IF FOUND THEN
      IF v_existing.status = 'committed' THEN
        RETURN jsonb_build_object(
          'journal_id', v_existing.journal_entry_id, 'journal_number', v_existing.journal_number,
          'posting_status', 'duplicate', 'financial_year_id', v_existing.financial_year_id,
          'accounting_period_id', v_existing.accounting_period_id, 'timestamp', v_existing.committed_at,
          'warnings', jsonb_build_array('Idempotent replay: existing posting returned, no new journal created.'),
          'posting_request_id', v_existing.id
        );
      END IF;
      RAISE EXCEPTION 'A posting for this idempotency key is already being committed. Retry shortly.'
        USING ERRCODE = '55006';
    ELSE
      INSERT INTO posting_requests (
        company_id, idempotency_key, module, document_type, document_id, reference, description,
        currency, exchange_rate, source, created_by, status,
        rule_id, rule_version, business_event, generated_by, generated_at
      ) VALUES (
        v_company_id, v_idempotency_key, v_module, v_document_type, v_document_id, v_reference, v_description,
        v_currency, v_exchange_rate, v_source, v_created_by, 'pending',
        v_rule_id, v_rule_version, v_business_event, v_generated_by,
        CASE WHEN v_rule_id IS NOT NULL THEN now() ELSE NULL END
      )
      ON CONFLICT (company_id, idempotency_key) DO NOTHING
      RETURNING id INTO v_request_id;

      IF v_request_id IS NULL THEN
        SELECT * INTO v_existing FROM posting_requests WHERE company_id = v_company_id AND idempotency_key = v_idempotency_key;
        IF v_existing.status = 'committed' THEN
          RETURN jsonb_build_object(
            'journal_id', v_existing.journal_entry_id, 'journal_number', v_existing.journal_number,
            'posting_status', 'duplicate', 'financial_year_id', v_existing.financial_year_id,
            'accounting_period_id', v_existing.accounting_period_id, 'timestamp', v_existing.committed_at,
            'warnings', jsonb_build_array('Idempotent replay (concurrent): existing posting returned.'),
            'posting_request_id', v_existing.id
          );
        END IF;
        RAISE EXCEPTION 'A posting for this idempotency key is already in progress. Retry shortly.'
          USING ERRCODE = '55006';
      END IF;
    END IF;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);

    IF (v_line->>'account_id') IS NULL THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array('Missing account on a posting line.');
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: every line requires account_id' USING ERRCODE = '22023';
    END IF;

    SELECT id, is_active, posting_blocked, control_account, allow_manual_posting, requires_dimension, name
      INTO v_account FROM chart_of_accounts
      WHERE id = (v_line->>'account_id')::uuid AND company_id = v_company_id;

    IF v_account.id IS NULL THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s not found for this company.', v_line->>'account_id'));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % not found for this company', v_line->>'account_id' USING ERRCODE = '22023';
    END IF;

    IF NOT v_account.is_active THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s is inactive.', v_account.name));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % is inactive and cannot be posted to', v_account.name USING ERRCODE = '22023';
    END IF;

    IF v_account.posting_blocked THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s is blocked for posting.', v_account.name));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % is blocked for posting', v_account.name USING ERRCODE = '22023';
    END IF;

    IF v_account.control_account AND NOT v_account.allow_manual_posting AND v_module = 'manual_journal' THEN
      IF p_mode = 'preview' THEN
        v_warnings := v_warnings || jsonb_build_array(format('Account %s is a control account and does not accept manual postings.', v_account.name));
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'posting_engine_submit: account % is a control account and does not accept manual postings', v_account.name
        USING ERRCODE = '22023';
    END IF;

    IF v_account.requires_dimension THEN
      v_has_dimension := (v_line->>'project_id') IS NOT NULL
        OR (v_line ? 'dimensions' AND jsonb_typeof(v_line->'dimensions') = 'object' AND v_line->'dimensions' <> '{}'::jsonb);
      IF NOT v_has_dimension THEN
        IF p_mode = 'preview' THEN
          v_warnings := v_warnings || jsonb_build_array(format('Account %s requires a dimension (project, cost centre, etc.) but none was given.', v_account.name));
          CONTINUE;
        END IF;
        RAISE EXCEPTION 'posting_engine_submit: account % requires a dimension but none was given', v_account.name USING ERRCODE = '22023';
      END IF;
    END IF;

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    IF p_mode = 'preview' THEN
      v_warnings := v_warnings || jsonb_build_array(format('Debits (%s) do not equal credits (%s).', v_total_debit, v_total_credit));
    ELSE
      RAISE EXCEPTION 'posting_engine_submit: debits (%) do not equal credits (%)', v_total_debit, v_total_credit
        USING ERRCODE = '22000';
    END IF;
  END IF;

  IF p_mode = 'preview' THEN
    BEGIN
      PERFORM public.assert_period_open(v_company_id, v_posting_date);
    EXCEPTION WHEN OTHERS THEN
      v_warnings := v_warnings || jsonb_build_array(SQLERRM);
    END;
  ELSE
    PERFORM public.assert_period_open(v_company_id, v_posting_date);
  END IF;

  v_policy := public.accounting_policy_evaluate_posting(
    v_company_id, v_module, v_lines, p_mode,
    NULLIF(p_request->>'policy_override_reason', ''),
    COALESCE(p_request->'policy_override_codes', '[]'::jsonb),
    v_created_by, v_request_id, v_description
  );

  IF (v_policy->>'blocking')::boolean AND p_mode IN ('validate', 'commit') THEN
    IF p_mode = 'commit' AND v_request_id IS NOT NULL THEN
      DELETE FROM posting_requests WHERE id = v_request_id AND status = 'pending';
    END IF;
    RAISE EXCEPTION 'Accounting policy violation: %',
      (SELECT string_agg(x->>'message', '; ') FROM jsonb_array_elements(v_policy->'violations') x)
      USING ERRCODE = '22023';
  END IF;

  FOR v_policy_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_policy->'warnings', '[]'::jsonb))
  LOOP
    v_warnings := v_warnings || jsonb_build_array(
      format('[Policy %s] %s', v_policy_item->>'code', v_policy_item->>'message')
    );
  END LOOP;

  IF p_mode = 'preview' THEN
    RETURN jsonb_build_object(
      'journal_id', NULL, 'journal_number', NULL, 'posting_status', 'previewed',
      'financial_year_id', v_fy_id, 'total_debit', v_total_debit, 'total_credit', v_total_credit,
      'timestamp', now(), 'warnings', v_warnings, 'policy_results', v_policy,
      'rule_id', v_rule_id, 'rule_version', v_rule_version, 'business_event', v_business_event
    );
  END IF;
  IF p_mode = 'validate' THEN
    RETURN jsonb_build_object(
      'journal_id', NULL, 'journal_number', NULL, 'posting_status', 'validated',
      'financial_year_id', v_fy_id, 'total_debit', v_total_debit, 'total_credit', v_total_credit,
      'timestamp', now(), 'warnings', v_warnings, 'policy_results', v_policy,
      'rule_id', v_rule_id, 'rule_version', v_rule_version, 'business_event', v_business_event
    );
  END IF;

  v_journal_number := public.posting_engine_next_journal_number(v_company_id);

  INSERT INTO journal_entries (
    company_id, entry_date, description, invoice_id, vendor_id, customer_id,
    journal_number, attachment_url, bill_id,
    rule_id, rule_version, business_event, generated_by, generated_at
  )
  VALUES (
    v_company_id, v_posting_date, COALESCE(v_description, v_reference, initcap(replace(v_module, '_', ' ')) || ' posting'),
    CASE WHEN v_document_type = 'invoice' THEN v_document_id END,
    NULLIF(p_request->>'vendor_id', '')::uuid,
    NULLIF(p_request->>'customer_id', '')::uuid,
    v_journal_number,
    NULLIF(p_request->>'attachment_url', ''),
    CASE WHEN v_document_type = 'bill' THEN v_document_id END,
    v_rule_id, v_rule_version, v_business_event, v_generated_by,
    CASE WHEN v_rule_id IS NOT NULL THEN now() ELSE NULL END
  )
  RETURNING id INTO v_je_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
  LOOP
    v_debit := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit := COALESCE((v_line->>'credit')::numeric, 0);
    IF v_debit <= 0 AND v_credit <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO journal_entry_items (journal_entry_id, account_id, type, amount, project_id, dimensions)
    VALUES (
      v_je_id, (v_line->>'account_id')::uuid,
      CASE WHEN v_debit > 0 THEN 'debit' ELSE 'credit' END,
      GREATEST(v_debit, v_credit),
      NULLIF(v_line->>'project_id', '')::uuid,
      COALESCE(v_line->'dimensions', '{}'::jsonb)
    )
    RETURNING id INTO v_line_item_id;

    IF (v_line->>'tax_rate_id') IS NOT NULL THEN
      INSERT INTO journal_entry_item_tax_rates (journal_entry_item_id, tax_rate_id)
      VALUES (v_line_item_id, (v_line->>'tax_rate_id')::uuid);
    END IF;
  END LOOP;

  SELECT financial_year_id, accounting_period_id INTO v_fy_id, v_ap_id FROM journal_entries WHERE id = v_je_id;

  UPDATE posting_requests SET
    status = 'committed', journal_entry_id = v_je_id, journal_number = v_journal_number,
    financial_year_id = v_fy_id, accounting_period_id = v_ap_id, warnings = v_warnings, committed_at = now(),
    rule_id = v_rule_id, rule_version = v_rule_version, business_event = v_business_event,
    generated_by = v_generated_by, generated_at = CASE WHEN v_rule_id IS NOT NULL THEN now() ELSE generated_at END
  WHERE id = v_request_id;

  RETURN jsonb_build_object(
    'journal_id', v_je_id, 'journal_number', v_journal_number, 'posting_status', 'committed',
    'financial_year_id', v_fy_id, 'accounting_period_id', v_ap_id, 'timestamp', now(),
    'warnings', v_warnings, 'posting_request_id', v_request_id, 'policy_results', v_policy,
    'rule_id', v_rule_id, 'rule_version', v_rule_version, 'business_event', v_business_event
  );
END;
$$;

COMMENT ON FUNCTION public.posting_engine_submit IS
  'ERP Phase 4: posting gateway with Policy Engine validation and Rules Engine audit metadata. Modules unchanged.';
