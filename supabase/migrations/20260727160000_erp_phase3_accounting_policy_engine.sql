-- AdminLess Fin — ERP Phase 3: Enterprise Accounting Policy Engine
-- Health detects. Policy prevents. Injected into posting_engine_submit without redesign.

-- ── Policy catalog ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.accounting_policy_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  domain text NOT NULL CHECK (domain IN (
    'chart_of_accounts', 'general_ledger', 'journal_entries', 'banking',
    'tax', 'payroll', 'assets', 'inventory', 'financial_statements'
  )),
  policy_type text NOT NULL CHECK (policy_type IN ('system', 'company', 'industry')),
  default_severity text NOT NULL CHECK (default_severity IN ('information', 'warning', 'error', 'blocking')),
  is_mandatory boolean NOT NULL DEFAULT false,
  industry_template text,
  evaluation_hook text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_policy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.accounting_policy_definitions(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  severity_override text CHECK (severity_override IS NULL OR severity_override IN ('information', 'warning', 'error', 'blocking')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, policy_id)
);

CREATE TABLE IF NOT EXISTS public.accounting_policy_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  policy_code text NOT NULL,
  policy_name text NOT NULL,
  result text NOT NULL CHECK (result IN ('passed', 'violation', 'override')),
  severity text,
  message text,
  user_id uuid REFERENCES auth.users(id),
  posting_request_id uuid REFERENCES public.posting_requests(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  module text,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_policy_audit_company_created
  ON public.accounting_policy_audit_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_policy_settings_company
  ON public.accounting_policy_settings (company_id);

ALTER TABLE public.accounting_policy_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_policy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_policy_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounting_policy_definitions_select ON public.accounting_policy_definitions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY accounting_policy_settings_select ON public.accounting_policy_settings
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE POLICY accounting_policy_settings_mutate ON public.accounting_policy_settings
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM public.company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ))
  WITH CHECK (company_id IN (
    SELECT cu.company_id FROM public.company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ));

CREATE POLICY accounting_policy_audit_select ON public.accounting_policy_audit_log
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- ── Seed system + industry policy catalog ────────────────────────────────────

INSERT INTO public.accounting_policy_definitions
  (code, name, description, domain, policy_type, default_severity, is_mandatory, industry_template, evaluation_hook)
VALUES
  ('coa.header_no_posting', 'Header accounts cannot receive postings',
   'Parent/header accounts are structural only and must not accept journal lines.',
   'chart_of_accounts', 'system', 'blocking', true, NULL, 'header_no_posting'),
  ('gl.control_no_manual', 'Control accounts cannot accept manual journals',
   'Sub-ledger control accounts must be updated by their originating module, not manual journals.',
   'general_ledger', 'system', 'blocking', true, NULL, 'control_no_manual'),
  ('gl.retained_earnings_system', 'Retained earnings is system controlled',
   'Retained earnings may only be adjusted by year-end close or system processes.',
   'general_ledger', 'system', 'blocking', true, NULL, 'retained_earnings_system'),
  ('gl.suspense_zero_close', 'Suspense account must be zero before period close',
   'Suspense/clearing accounts must be cleared before accounting period close.',
   'general_ledger', 'company', 'error', false, NULL, 'suspense_zero_close'),
  ('tax.vat_control_no_manual', 'VAT control cannot be manually adjusted',
   'VAT control accounts must be updated through tax-compliant sub-ledgers only.',
   'tax', 'system', 'blocking', true, NULL, 'vat_control_no_manual'),
  ('banking.bank_gl_one_to_one', 'Bank GL must be linked to one bank account',
   'Each bank GL account should map to exactly one operational bank account.',
   'banking', 'company', 'warning', false, NULL, 'bank_gl_one_to_one'),
  ('assets.depreciation_module_only', 'Depreciation journals originate only from Asset module',
   'Depreciation expense and accumulated depreciation postings must come from Fixed Assets.',
   'assets', 'system', 'blocking', true, NULL, 'depreciation_module_only'),
  ('inventory.inventory_module_only', 'Inventory journals originate only from Inventory module',
   'Inventory asset and COGS postings must come from the Inventory module.',
   'inventory', 'system', 'blocking', true, NULL, 'inventory_module_only'),
  ('journal.manual_requires_description', 'Manual journals require a description',
   'Manual journal entries must include a meaningful description for audit trail.',
   'journal_entries', 'company', 'warning', false, NULL, 'manual_requires_description'),
  ('financial_statements.control_balance_integrity', 'Control account balances must reconcile',
   'Control accounts with activity should have non-zero balances only when sub-ledgers exist.',
   'financial_statements', 'industry', 'information', false, 'generic', 'control_balance_integrity')
ON CONFLICT (code) DO NOTHING;

-- ── Policy evaluation helpers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accounting_policy_effective_severity(
  p_default_severity text,
  p_is_mandatory boolean,
  p_enabled boolean,
  p_severity_override text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN NOT p_enabled AND NOT p_is_mandatory THEN NULL
    WHEN p_is_mandatory THEN p_default_severity
    ELSE COALESCE(p_severity_override, p_default_severity)
  END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_policy_log_result(
  p_company_id uuid,
  p_policy_code text,
  p_policy_name text,
  p_result text,
  p_severity text,
  p_message text,
  p_user_id uuid,
  p_posting_request_id uuid,
  p_module text,
  p_reason text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO accounting_policy_audit_log (
    company_id, policy_code, policy_name, result, severity, message,
    user_id, posting_request_id, module, reason, metadata
  ) VALUES (
    p_company_id, p_policy_code, p_policy_name, p_result, p_severity, p_message,
    p_user_id, p_posting_request_id, p_module, p_reason, COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_policy_evaluate_posting(
  p_company_id uuid,
  p_module text,
  p_lines jsonb,
  p_mode text DEFAULT 'validate',
  p_override_reason text DEFAULT NULL,
  p_override_codes jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL,
  p_posting_request_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line jsonb;
  v_account record;
  v_child_parent_ids uuid[];
  v_bank_gl_counts jsonb;
  v_violations jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_passed jsonb := '[]'::jsonb;
  v_blocking boolean := false;
  v_policy record;
  v_severity text;
  v_message text;
  v_overridden boolean;
  v_inventory_modules text[] := ARRAY['inventory_receipt', 'inventory_issue'];
  v_asset_modules text[] := ARRAY['fixed_assets'];
BEGIN
  SELECT ARRAY_AGG(DISTINCT parent_account_id) INTO v_child_parent_ids
  FROM chart_of_accounts
  WHERE company_id = p_company_id AND parent_account_id IS NOT NULL;

  FOR v_policy IN
    SELECT d.*,
      COALESCE(s.enabled, true) AS company_enabled,
      s.severity_override
    FROM accounting_policy_definitions d
    LEFT JOIN accounting_policy_settings s
      ON s.policy_id = d.id AND s.company_id = p_company_id
    WHERE d.policy_type IN ('system', 'company')
       OR (d.policy_type = 'industry' AND d.industry_template = 'generic')
  LOOP
    v_severity := public.accounting_policy_effective_severity(
      v_policy.default_severity, v_policy.is_mandatory, v_policy.company_enabled, v_policy.severity_override
    );
    IF v_severity IS NULL THEN
      CONTINUE;
    END IF;

    v_message := NULL;
    v_overridden := p_override_reason IS NOT NULL
      AND p_override_codes ? v_policy.code
      AND v_severity IN ('information', 'warning', 'error')
      AND NOT v_policy.is_mandatory;

    -- Evaluate each hook
    IF v_policy.evaluation_hook = 'header_no_posting' THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
      LOOP
        SELECT * INTO v_account FROM chart_of_accounts
        WHERE id = (v_line->>'account_id')::uuid AND company_id = p_company_id;
        IF FOUND AND (v_account.posting_blocked OR v_account.id = ANY(COALESCE(v_child_parent_ids, ARRAY[]::uuid[]))) THEN
          v_message := format('Account %s is a header account and cannot receive postings.', v_account.name);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_policy.evaluation_hook = 'control_no_manual' AND p_module = 'manual_journal' THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
      LOOP
        SELECT * INTO v_account FROM chart_of_accounts
        WHERE id = (v_line->>'account_id')::uuid AND company_id = p_company_id;
        IF FOUND AND v_account.control_account AND COALESCE(v_account.allow_manual_posting, false) = false THEN
          v_message := format('Control account %s does not accept manual journal postings.', v_account.name);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_policy.evaluation_hook = 'retained_earnings_system' AND p_module = 'manual_journal' THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
      LOOP
        SELECT * INTO v_account FROM chart_of_accounts
        WHERE id = (v_line->>'account_id')::uuid AND company_id = p_company_id;
        IF FOUND AND (
          v_account.system_account = true
          OR v_account.name ILIKE '%retained earnings%'
          OR v_account.account_code = '3020'
        ) THEN
          v_message := format('Retained earnings account %s is system controlled.', v_account.name);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_policy.evaluation_hook = 'vat_control_no_manual' AND p_module = 'manual_journal' THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
      LOOP
        SELECT * INTO v_account FROM chart_of_accounts
        WHERE id = (v_line->>'account_id')::uuid AND company_id = p_company_id;
        IF FOUND AND (
          v_account.tax_treatment = 'vat_control'
          OR v_account.name ILIKE '%vat control%'
        ) THEN
          v_message := format('VAT control account %s cannot be manually adjusted.', v_account.name);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_policy.evaluation_hook = 'depreciation_module_only' AND NOT (p_module = ANY(v_asset_modules)) THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
      LOOP
        SELECT * INTO v_account FROM chart_of_accounts
        WHERE id = (v_line->>'account_id')::uuid AND company_id = p_company_id;
        IF FOUND AND (
          v_account.name ILIKE '%depreciation%'
          OR v_account.name ILIKE '%accumulated depreciation%'
        ) THEN
          v_message := format('Depreciation account %s may only be posted from the Fixed Assets module.', v_account.name);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_policy.evaluation_hook = 'inventory_module_only' AND NOT (p_module = ANY(v_inventory_modules)) THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
      LOOP
        SELECT * INTO v_account FROM chart_of_accounts
        WHERE id = (v_line->>'account_id')::uuid AND company_id = p_company_id;
        IF FOUND AND (
          v_account.name ILIKE '%inventory%'
          OR v_account.name ILIKE '%stock on hand%'
          OR v_account.name ILIKE '%cost of goods%'
        ) THEN
          v_message := format('Inventory account %s may only be posted from the Inventory module.', v_account.name);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_policy.evaluation_hook = 'bank_gl_one_to_one' THEN
      SELECT jsonb_object_agg(chart_of_account_id::text, cnt) INTO v_bank_gl_counts
      FROM (
        SELECT chart_of_account_id, COUNT(*) AS cnt
        FROM bank_accounts
        WHERE company_id = p_company_id AND chart_of_account_id IS NOT NULL
        GROUP BY chart_of_account_id
        HAVING COUNT(*) > 1
      ) dup;
      IF v_bank_gl_counts IS NOT NULL THEN
        v_message := 'One or more bank GL accounts are linked to multiple bank accounts.';
      ELSE
        FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
        LOOP
          SELECT * INTO v_account FROM chart_of_accounts
          WHERE id = (v_line->>'account_id')::uuid AND company_id = p_company_id;
          IF FOUND AND v_account.name ILIKE '%bank%' THEN
            IF NOT EXISTS (
              SELECT 1 FROM bank_accounts WHERE company_id = p_company_id AND chart_of_account_id = v_account.id
            ) THEN
              v_message := format('Bank GL account %s has no linked operational bank account.', v_account.name);
              EXIT;
            END IF;
          END IF;
        END LOOP;
      END IF;

    ELSIF v_policy.evaluation_hook = 'manual_requires_description' AND p_module = 'manual_journal' THEN
      IF COALESCE(NULLIF(trim(p_description), ''), NULL) IS NULL THEN
        v_message := 'Manual journal postings should include a description.';
      END IF;

    ELSIF v_policy.evaluation_hook = 'suspense_zero_close' THEN
      -- Evaluated at posting time as advisory; period-close RPCs can call separately.
      NULL;
    END IF;

    IF v_message IS NULL THEN
      v_passed := v_passed || jsonb_build_object(
        'code', v_policy.code, 'name', v_policy.name, 'domain', v_policy.domain, 'severity', v_severity
      );
      IF p_mode = 'commit' THEN
        PERFORM public.accounting_policy_log_result(
          p_company_id, v_policy.code, v_policy.name, 'passed', v_severity, NULL,
          p_user_id, p_posting_request_id, p_module, NULL, '{}'::jsonb
        );
      END IF;
      CONTINUE;
    END IF;

    IF v_overridden THEN
      v_passed := v_passed || jsonb_build_object(
        'code', v_policy.code, 'name', v_policy.name, 'domain', v_policy.domain,
        'severity', v_severity, 'overridden', true
      );
      IF p_mode IN ('validate', 'commit') THEN
        PERFORM public.accounting_policy_log_result(
          p_company_id, v_policy.code, v_policy.name, 'override', v_severity, v_message,
          p_user_id, p_posting_request_id, p_module, p_override_reason, '{}'::jsonb
        );
      END IF;
      CONTINUE;
    END IF;

    IF v_severity = 'blocking' THEN
      v_blocking := true;
      v_violations := v_violations || jsonb_build_object(
        'code', v_policy.code, 'name', v_policy.name, 'domain', v_policy.domain,
        'severity', v_severity, 'message', v_message
      );
    ELSIF v_severity IN ('error', 'warning', 'information') THEN
      v_warnings := v_warnings || jsonb_build_object(
        'code', v_policy.code, 'name', v_policy.name, 'domain', v_policy.domain,
        'severity', v_severity, 'message', v_message
      );
      IF v_severity = 'error' AND p_mode IN ('validate', 'commit') THEN
        v_blocking := true;
        v_violations := v_violations || jsonb_build_object(
          'code', v_policy.code, 'name', v_policy.name, 'domain', v_policy.domain,
          'severity', v_severity, 'message', v_message
        );
      END IF;
    END IF;

    IF p_mode IN ('validate', 'commit') AND NOT v_overridden THEN
      PERFORM public.accounting_policy_log_result(
        p_company_id, v_policy.code, v_policy.name, 'violation', v_severity, v_message,
        p_user_id, p_posting_request_id, p_module, NULL, '{}'::jsonb
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'passed', v_passed,
    'violations', v_violations,
    'warnings', v_warnings,
    'blocking', v_blocking,
    'evaluated_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.accounting_policy_evaluate_posting IS
  'ERP Phase 3: evaluates configurable accounting policies for a posting request. Called by posting_engine_submit.';

-- ── Inject policy evaluation into posting_engine_submit ────────────────────────
-- Surgical patch: after period validation, before preview/validate return.

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
        currency, exchange_rate, source, created_by, status
      ) VALUES (
        v_company_id, v_idempotency_key, v_module, v_document_type, v_document_id, v_reference, v_description,
        v_currency, v_exchange_rate, v_source, v_created_by, 'pending'
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

  -- ── Phase 3: Accounting Policy Engine (injected validation) ───────────────
  v_policy := public.accounting_policy_evaluate_posting(
    v_company_id,
    v_module,
    v_lines,
    p_mode,
    NULLIF(p_request->>'policy_override_reason', ''),
    COALESCE(p_request->'policy_override_codes', '[]'::jsonb),
    v_created_by,
    v_request_id,
    v_description
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
      'timestamp', now(), 'warnings', v_warnings, 'policy_results', v_policy
    );
  END IF;
  IF p_mode = 'validate' THEN
    RETURN jsonb_build_object(
      'journal_id', NULL, 'journal_number', NULL, 'posting_status', 'validated',
      'financial_year_id', v_fy_id, 'total_debit', v_total_debit, 'total_credit', v_total_credit,
      'timestamp', now(), 'warnings', v_warnings, 'policy_results', v_policy
    );
  END IF;

  v_journal_number := public.posting_engine_next_journal_number(v_company_id);

  INSERT INTO journal_entries (company_id, entry_date, description, invoice_id, vendor_id, customer_id, journal_number, attachment_url, bill_id)
  VALUES (
    v_company_id, v_posting_date, COALESCE(v_description, v_reference, initcap(replace(v_module, '_', ' ')) || ' posting'),
    CASE WHEN v_document_type = 'invoice' THEN v_document_id END,
    NULLIF(p_request->>'vendor_id', '')::uuid,
    NULLIF(p_request->>'customer_id', '')::uuid,
    v_journal_number,
    NULLIF(p_request->>'attachment_url', ''),
    CASE WHEN v_document_type = 'bill' THEN v_document_id END
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
    financial_year_id = v_fy_id, accounting_period_id = v_ap_id, warnings = v_warnings, committed_at = now()
  WHERE id = v_request_id;

  RETURN jsonb_build_object(
    'journal_id', v_je_id, 'journal_number', v_journal_number, 'posting_status', 'committed',
    'financial_year_id', v_fy_id, 'accounting_period_id', v_ap_id, 'timestamp', now(),
    'warnings', v_warnings, 'posting_request_id', v_request_id, 'policy_results', v_policy
  );
END;
$$;

COMMENT ON FUNCTION public.posting_engine_submit IS
  'ERP Phase 3: posting gateway with injected Accounting Policy Engine validation. Modules: sales_invoice, inventory_receipt, inventory_issue, manual_journal, accounts_payable, fixed_assets, banking, payroll.';
