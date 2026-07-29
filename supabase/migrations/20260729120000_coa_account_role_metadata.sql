-- AdminLess Fin — Chart of Accounts account_role metadata
-- Deterministic control-account identity. Runtime posting/forms must resolve
-- accounts by account_role / tax_treatment / subcategory / account_code — never
-- by display name. Name heuristics below are ONE-TIME legacy backfill only.

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS account_role text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_account_role_check'
  ) THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_account_role_check
      CHECK (
        account_role IS NULL OR account_role IN (
          'trade_receivable',
          'trade_payable',
          'output_vat',
          'input_vat',
          'vat_control',
          'inventory_asset',
          'cogs',
          'retained_earnings',
          'suspense',
          'accumulated_depreciation',
          'depreciation_expense',
          'fixed_asset',
          'payroll_clearing',
          'gain_on_disposal',
          'loss_on_disposal'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.chart_of_accounts.account_role IS
  'Canonical control/system role for deterministic account resolution. Display name must never be used for accounting identity.';

-- Singleton roles: at most one per company.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chart_of_accounts_singleton_role
  ON public.chart_of_accounts (company_id, account_role)
  WHERE account_role IN (
    'trade_receivable',
    'trade_payable',
    'output_vat',
    'input_vat',
    'vat_control',
    'inventory_asset',
    'retained_earnings',
    'suspense'
  );

-- ── 1. account_code map (template standard ZA) ───────────────────────────────
UPDATE public.chart_of_accounts c
SET account_role = m.role
FROM (VALUES
  ('1220', 'trade_receivable'),
  ('2110', 'trade_payable'),
  ('1210', 'inventory_asset'),
  ('2120', 'output_vat'),
  ('1240', 'input_vat'),
  ('2125', 'vat_control'),
  ('3020', 'retained_earnings'),
  ('1190', 'accumulated_depreciation'),
  ('6060', 'depreciation_expense'),
  ('4530', 'gain_on_disposal'),
  ('8020', 'loss_on_disposal')
) AS m(code, role)
WHERE c.account_role IS NULL
  AND c.account_code = m.code
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts x
    WHERE x.company_id = c.company_id AND x.account_role = m.role
  );

-- ── 2. tax_treatment ─────────────────────────────────────────────────────────
UPDATE public.chart_of_accounts
SET account_role = 'output_vat'
WHERE account_role IS NULL
  AND tax_treatment = 'vat_output'
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts x
    WHERE x.company_id = chart_of_accounts.company_id AND x.account_role = 'output_vat'
  );

UPDATE public.chart_of_accounts
SET account_role = 'input_vat'
WHERE account_role IS NULL
  AND tax_treatment = 'vat_input'
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts x
    WHERE x.company_id = chart_of_accounts.company_id AND x.account_role = 'input_vat'
  );

UPDATE public.chart_of_accounts
SET account_role = 'vat_control'
WHERE account_role IS NULL
  AND tax_treatment = 'vat_control'
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts x
    WHERE x.company_id = chart_of_accounts.company_id AND x.account_role = 'vat_control'
  );

-- ── 3. system_account + Equity → retained_earnings ───────────────────────────
UPDATE public.chart_of_accounts
SET account_role = 'retained_earnings'
WHERE account_role IS NULL
  AND system_account = true
  AND type = 'Equity'
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts x
    WHERE x.company_id = chart_of_accounts.company_id AND x.account_role = 'retained_earnings'
  );

-- ── 4. subcategory (unambiguous) ─────────────────────────────────────────────
UPDATE public.chart_of_accounts
SET account_role = 'inventory_asset'
WHERE account_role IS NULL
  AND type = 'Asset'
  AND control_account = true
  AND subcategory = 'Inventory'
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts x
    WHERE x.company_id = chart_of_accounts.company_id AND x.account_role = 'inventory_asset'
  );

UPDATE public.chart_of_accounts c
SET account_role = 'trade_receivable'
WHERE c.account_role IS NULL
  AND c.type = 'Asset'
  AND c.control_account = true
  AND c.subcategory = 'Trade and Other Receivables'
  AND c.tax_treatment IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts x
    WHERE x.company_id = c.company_id AND x.account_role = 'trade_receivable'
  );

UPDATE public.chart_of_accounts c
SET account_role = 'trade_payable'
WHERE c.account_role IS NULL
  AND c.type = 'Liability'
  AND c.control_account = true
  AND c.subcategory = 'Trade and Other Payables'
  AND c.tax_treatment IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts x
    WHERE x.company_id = c.company_id AND x.account_role = 'trade_payable'
  );

UPDATE public.chart_of_accounts
SET account_role = 'cogs'
WHERE account_role IS NULL
  AND type = 'Expense'
  AND category = 'Cost of Sales'
  AND account_code IN ('5000', '5020');

UPDATE public.chart_of_accounts
SET account_role = 'fixed_asset'
WHERE account_role IS NULL
  AND type = 'Asset'
  AND subcategory = 'Property, Plant and Equipment'
  AND COALESCE(control_account, false) = false
  AND account_code IN ('1110', '1120', '1130', '1140', '1150');

-- ── 5. ONE-TIME legacy name heuristics (only where still NULL) ───────────────
-- Prefer one row per company via DISTINCT ON for singleton roles.

WITH ranked AS (
  SELECT id, company_id,
    CASE
      WHEN type = 'Asset' AND lower(trim(name)) IN ('ar', 'a/r', 'a.r.') THEN 'trade_receivable'
      WHEN type = 'Asset' AND name ~* 'receivable|debtor' AND name !~* 'vat|tax|doubtful' THEN 'trade_receivable'
      WHEN type = 'Liability' AND lower(trim(name)) IN ('ap', 'a/p', 'a.p.') THEN 'trade_payable'
      WHEN type = 'Liability' AND name ~* 'accounts?\s*payable|trade\s*creditor' THEN 'trade_payable'
      WHEN type = 'Liability' AND name ~* 'vat\s*output|output\s*vat|tax\s*payable|sales\s*tax' AND name !~* 'input|paye|uif|sdl' THEN 'output_vat'
      WHEN type = 'Asset' AND name ~* 'vat\s*input|input\s*vat|vat\s*receivable' THEN 'input_vat'
      WHEN type = 'Liability' AND name ~* 'vat\s*control' THEN 'vat_control'
      WHEN type = 'Asset' AND (lower(trim(name)) = 'inventory' OR name ~* 'inventory\s*asset|stock\s*on\s*hand|stock\s*asset') THEN 'inventory_asset'
      WHEN type = 'Equity' AND name ~* 'retained\s*earnings' THEN 'retained_earnings'
      WHEN name ~* 'suspense|clearing' AND name !~* 'payroll' THEN 'suspense'
      WHEN type = 'Asset' AND name ~* 'accumulated\s*depreciation' THEN 'accumulated_depreciation'
      WHEN type = 'Expense' AND name ~* '^depreciation$|depreciation\s*expense' THEN 'depreciation_expense'
      WHEN type = 'Expense' AND name ~* 'cost\s*of\s*goods|\bcogs\b|inventory\s*shrinkage' THEN 'cogs'
      ELSE NULL
    END AS inferred_role
  FROM public.chart_of_accounts
  WHERE account_role IS NULL
),
picked AS (
  SELECT DISTINCT ON (company_id, inferred_role) id, inferred_role
  FROM ranked
  WHERE inferred_role IS NOT NULL
  ORDER BY company_id, inferred_role, id
)
UPDATE public.chart_of_accounts c
SET account_role = p.inferred_role
FROM picked p
WHERE c.id = p.id
  AND c.account_role IS NULL
  AND (
    p.inferred_role NOT IN (
      'trade_receivable', 'trade_payable', 'output_vat', 'input_vat',
      'vat_control', 'inventory_asset', 'retained_earnings', 'suspense'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts x
      WHERE x.company_id = c.company_id AND x.account_role = p.inferred_role
    )
  );

-- Non-singleton cogs / depreciation / fixed_asset may still be open from name pass above via picked.

-- ── Policy evaluator: remove display-name ILIKE branches ─────────────────────
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
          OR v_account.account_role = 'retained_earnings'
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
          OR v_account.account_role = 'vat_control'
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
        IF FOUND AND v_account.account_role IN ('depreciation_expense', 'accumulated_depreciation') THEN
          v_message := format('Depreciation account %s may only be posted from the Fixed Assets module.', v_account.name);
          EXIT;
        END IF;
      END LOOP;

    ELSIF v_policy.evaluation_hook = 'inventory_module_only' AND NOT (p_module = ANY(v_inventory_modules)) THEN
      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
      LOOP
        SELECT * INTO v_account FROM chart_of_accounts
        WHERE id = (v_line->>'account_id')::uuid AND company_id = p_company_id;
        IF FOUND AND v_account.account_role IN ('inventory_asset', 'cogs') THEN
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
          -- Cash equivalents identified by subcategory metadata, not display name.
          IF FOUND AND v_account.subcategory = 'Cash and Cash Equivalents' THEN
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
  'ERP Phase 3: evaluates configurable accounting policies. Identity uses account_role/tax_treatment/subcategory — never display name.';
