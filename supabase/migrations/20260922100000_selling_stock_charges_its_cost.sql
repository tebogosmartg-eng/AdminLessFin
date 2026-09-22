-- ============================================================================
-- AdminLess Fin — selling stock charges its cost.
--
-- WHAT WAS WRONG
-- post_sales_invoice_atomic has always done the right thing for a stock line:
-- it consumes the stock, debits cost of sales, credits the inventory asset,
-- and writes the movement to inventory_transactions. It submits that journal
-- under module 'sales_invoice'.
--
-- The accounting policy 'inventory.inventory_module_only' only ever allowed
-- stock and COGS accounts to be posted from 'inventory_receipt' or
-- 'inventory_issue'. So the policy refused the whole invoice:
--
--     Accounting policy violation: Inventory account Cost of Goods Sold may
--     only be posted from the Inventory module.
--
-- Not a warning -- the policy is mandatory and blocking, so no company could
-- switch it off. A stock item could not be sold on an invoice at all, and
-- production bears that out: of every journal touching a stock or COGS
-- account, none came from the sales module.
--
-- WHAT THE CONTROL IS ACTUALLY FOR
-- Stock and cost of sales are sub-ledger controlled: their general ledger
-- balance has to tie back to the stock records. So they may only be written
-- by routines that move stock in the sub-ledger at the same time, and never
-- by hand. That is the rule worth keeping. "Only the Inventory module" was a
-- stand-in for it that stopped being true once selling was built.
--
-- WHAT THIS DOES
-- Names the rule properly and lets the sales invoice through, because the
-- sales invoice does move stock. Nothing else is loosened:
--
--   * manual_journal is still refused -- nobody adjusts stock by hand.
--   * accounts_payable, banking, payroll and fixed_assets are still refused.
--   * the policy stays mandatory and blocking.
--
-- 'sales_invoice' is shared with credit notes, which post through
-- post_credit_note_atomic. That function already refuses any line account
-- that is not an Income account, and any tax account that is not a Liability,
-- so a credit note cannot reach a stock or COGS account through this opening.
-- When stock returns are built they must move the sub-ledger the way the
-- invoice does before they post to these accounts.
--
-- The allow-list moves out of the evaluator body and into a function, so the
-- next module that legitimately moves stock is a one-line change rather than
-- a 200-line re-declaration of the policy engine.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accounting_subledger_modules(p_domain text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- The posting-engine modules that own each sub-ledger. A module belongs here
  -- only if its posting routine writes the sub-ledger in the same transaction
  -- as the journal, so the ledger and the sub-ledger cannot drift apart.
  SELECT CASE p_domain
    WHEN 'inventory' THEN ARRAY['inventory_receipt', 'inventory_issue', 'sales_invoice']
    WHEN 'fixed_assets' THEN ARRAY['fixed_assets']
    ELSE ARRAY[]::text[]
  END;
$$;

COMMENT ON FUNCTION public.accounting_subledger_modules(text) IS
  'Which posting-engine modules may write each sub-ledger-controlled set of accounts. Read by accounting_policy_evaluate_posting.';

CREATE OR REPLACE FUNCTION public.accounting_policy_evaluate_posting(p_company_id uuid, p_module text, p_lines jsonb, p_mode text DEFAULT 'validate'::text, p_override_reason text DEFAULT NULL::text, p_override_codes jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_posting_request_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_inventory_modules text[] := public.accounting_subledger_modules('inventory');
  v_asset_modules text[] := public.accounting_subledger_modules('fixed_assets');
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
          v_message := format('Stock account %s is written only where stock actually moves, so it cannot be posted from %s.', v_account.name, p_module);
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
$function$;

COMMENT ON FUNCTION public.accounting_policy_evaluate_posting(uuid, text, jsonb, text, text, jsonb, uuid, uuid, text) IS
  'Accounting Policy Engine evaluator. The sub-ledger module allow-lists now come from accounting_subledger_modules() rather than being declared inline.';

-- The policy said "must come from the Inventory module", which was never the
-- rule it was there to enforce and is no longer what it does.
UPDATE public.accounting_policy_definitions
SET name = 'Stock and cost of sales are sub-ledger controlled',
    description = 'Stock asset and cost of sales accounts may only be posted by a routine that moves stock in the sub-ledger at the same time, and never by manual journal.'
WHERE evaluation_hook = 'inventory_module_only';
