-- AdminLess Fin — ERP Blueprint V3.0, Phase 3D: Payroll Posting Engine integration.
-- Payroll becomes an Accounting Event Producer. Journal writing is delegated
-- exclusively to posting_engine_submit(module='payroll'). Calculations,
-- statutory rules, and the locked consolidated wages/bank/liability model are
-- preserved — only the write path changes.

-- ── Traceability on payroll_runs ──────────────────────────────────────────
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS posting_request_id uuid REFERENCES public.posting_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_posting_request_id
  ON public.payroll_runs(posting_request_id);

COMMENT ON COLUMN public.payroll_runs.posting_request_id IS
  'ERP V3.0 Phase 3D: Posting Engine request that produced the payroll journal. No orphan journals — every finalized run links to a posting_request.';

-- ── Enterprise payroll control-account configuration (no hardcoded IDs) ───
CREATE TABLE IF NOT EXISTS public.payroll_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_role text NOT NULL CHECK (account_role IN (
    'salary_expense',
    'bank',
    'payroll_liability',
    'paye_control',
    'uif_control',
    'sdl_control',
    'medical_aid_control',
    'retirement_fund_control',
    'leave_provision',
    'bonus_provision',
    'commission_provision',
    'employer_contributions',
    'employee_deductions'
  )),
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, account_role)
);

ALTER TABLE public.payroll_account_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_account_mappings_select ON public.payroll_account_mappings;
DROP POLICY IF EXISTS payroll_account_mappings_all ON public.payroll_account_mappings;
CREATE POLICY payroll_account_mappings_select ON public.payroll_account_mappings
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY payroll_account_mappings_all ON public.payroll_account_mappings
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ))
  WITH CHECK (company_id IN (
    SELECT cu.company_id FROM company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ));

COMMENT ON TABLE public.payroll_account_mappings IS
  'ERP V3.0 Phase 3D: company-level payroll control-account map. Account UUIDs are never hardcoded — resolved here or via finalize overrides from the UI.';

-- ── Resolve a payroll control account role ────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_payroll_control_account(
  p_company_id uuid,
  p_account_role text,
  p_override_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF p_override_account_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE id = p_override_account_id AND company_id = p_company_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'payroll control account override % is invalid for this company', p_override_account_id
        USING ERRCODE = '22023';
    END IF;
    RETURN p_override_account_id;
  END IF;

  SELECT pam.account_id INTO v_account_id
  FROM public.payroll_account_mappings pam
  WHERE pam.company_id = p_company_id
    AND pam.account_role = p_account_role
    AND pam.is_active = true;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'payroll control account role "%" is not configured for this company', p_account_role
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.chart_of_accounts
    WHERE id = v_account_id AND company_id = p_company_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'mapped payroll control account for role "%" is inactive or cross-company', p_account_role
      USING ERRCODE = '22023';
  END IF;

  RETURN v_account_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_payroll_control_account IS
  'ERP V3.0 Phase 3D: resolve payroll CoA by role via payroll_account_mappings, with optional per-run override. Never hardcodes account IDs.';

-- ── Atomic finalize → Posting Engine ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_payroll_run_atomic(
  p_company_id uuid,
  p_run_id uuid,
  p_wage_account_id uuid DEFAULT NULL,
  p_bank_account_id uuid DEFAULT NULL,
  p_liability_account_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_require_approval boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_total_wages numeric := 0;
  v_total_net numeric := 0;
  v_total_deductions numeric := 0;
  v_total_employer numeric := 0;
  v_payslip_count integer := 0;
  v_departments text[];
  v_wage_account uuid;
  v_bank_account uuid;
  v_liability_account uuid;
  v_paye_account uuid;
  v_uif_account uuid;
  v_sdl_account uuid;
  v_medical_account uuid;
  v_retirement_account uuid;
  v_employer_account uuid;
  v_employee_deduction_account uuid;
  v_dimensions jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_result jsonb;
  v_je_id uuid;
  v_pr_id uuid;
  v_description text;
  v_processed_at timestamptz := now();
  v_output_metadata jsonb;
  v_use_granular boolean := false;
  v_paye numeric := 0;
  v_uif numeric := 0;
  v_sdl numeric := 0;
  v_medical numeric := 0;
  v_retirement numeric := 0;
  v_other_deductions numeric := 0;
  v_liability_remainder numeric := 0;
  r record;
BEGIN
  IF p_company_id IS NULL OR p_run_id IS NULL THEN
    RAISE EXCEPTION 'company_id and run_id are required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_run
  FROM public.payroll_runs
  WHERE id = p_run_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found for this company' USING ERRCODE = '22023';
  END IF;

  IF v_run.status IN ('finalized', 'paid') THEN
    IF v_run.posting_request_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'journal_id', pr.journal_entry_id,
        'journal_number', pr.journal_number,
        'posting_status', 'duplicate',
        'posting_request_id', pr.id,
        'run_id', v_run.id,
        'recovered', true
      )
      INTO v_result
      FROM public.posting_requests pr
      WHERE pr.id = v_run.posting_request_id;
      RETURN v_result;
    END IF;
    RAISE EXCEPTION 'This payroll run has already been finalized.' USING ERRCODE = 'P0001';
  END IF;

  IF p_require_approval AND v_run.approved_at IS NULL THEN
    RAISE EXCEPTION 'Payroll run must be approved before posting.' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    COUNT(*)::int,
    COALESCE(SUM(p.total_earnings), 0),
    COALESCE(SUM(p.net_pay), 0),
    COALESCE(SUM(p.total_deductions), 0),
    COALESCE(SUM(COALESCE((p.calculation_snapshot->>'total_employer_contributions')::numeric, 0)), 0),
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(e.department, '')), NULL)
  INTO v_payslip_count, v_total_wages, v_total_net, v_total_deductions, v_total_employer, v_departments
  FROM public.payslips p
  LEFT JOIN public.employees e ON e.id = p.employee_id
  WHERE p.payroll_run_id = p_run_id AND p.company_id = p_company_id;

  IF v_payslip_count = 0 THEN
    RAISE EXCEPTION 'Generate payslips before finalizing the payroll run.' USING ERRCODE = 'P0001';
  END IF;

  -- Round to 2dp for GL balance safety (matches payslip money semantics)
  v_total_wages := ROUND(v_total_wages::numeric, 2);
  v_total_net := ROUND(v_total_net::numeric, 2);
  v_total_deductions := ROUND(v_total_deductions::numeric, 2);
  v_total_employer := ROUND(v_total_employer::numeric, 2);

  v_wage_account := public.resolve_payroll_control_account(p_company_id, 'salary_expense', p_wage_account_id);
  v_bank_account := public.resolve_payroll_control_account(p_company_id, 'bank', p_bank_account_id);

  IF p_liability_account_id IS NOT NULL THEN
    v_liability_account := public.resolve_payroll_control_account(p_company_id, 'payroll_liability', p_liability_account_id);
  ELSE
    BEGIN
      v_liability_account := public.resolve_payroll_control_account(p_company_id, 'payroll_liability', NULL);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        v_liability_account := public.resolve_payroll_control_account(p_company_id, 'employee_deductions', NULL);
      EXCEPTION WHEN OTHERS THEN
        v_liability_account := NULL;
      END;
    END;
  END IF;

  IF (v_total_deductions > 0 OR v_total_employer > 0) AND v_liability_account IS NULL THEN
    RAISE EXCEPTION 'Select or configure a payroll liability control account for deductions.' USING ERRCODE = 'P0001';
  END IF;

  -- Optional granular statutory control accounts (additive; fall back to bucket)
  BEGIN v_paye_account := public.resolve_payroll_control_account(p_company_id, 'paye_control', NULL); EXCEPTION WHEN OTHERS THEN v_paye_account := NULL; END;
  BEGIN v_uif_account := public.resolve_payroll_control_account(p_company_id, 'uif_control', NULL); EXCEPTION WHEN OTHERS THEN v_uif_account := NULL; END;
  BEGIN v_sdl_account := public.resolve_payroll_control_account(p_company_id, 'sdl_control', NULL); EXCEPTION WHEN OTHERS THEN v_sdl_account := NULL; END;
  BEGIN v_medical_account := public.resolve_payroll_control_account(p_company_id, 'medical_aid_control', NULL); EXCEPTION WHEN OTHERS THEN v_medical_account := NULL; END;
  BEGIN v_retirement_account := public.resolve_payroll_control_account(p_company_id, 'retirement_fund_control', NULL); EXCEPTION WHEN OTHERS THEN v_retirement_account := NULL; END;
  BEGIN v_employer_account := public.resolve_payroll_control_account(p_company_id, 'employer_contributions', NULL); EXCEPTION WHEN OTHERS THEN v_employer_account := v_liability_account; END;
  BEGIN v_employee_deduction_account := public.resolve_payroll_control_account(p_company_id, 'employee_deductions', NULL); EXCEPTION WHEN OTHERS THEN v_employee_deduction_account := v_liability_account; END;

  IF v_paye_account IS NOT NULL OR v_uif_account IS NOT NULL OR v_sdl_account IS NOT NULL
     OR v_medical_account IS NOT NULL OR v_retirement_account IS NOT NULL THEN
    v_use_granular := true;
    FOR r IN
      SELECT lower(COALESCE(pi.description, '')) AS descr, COALESCE(SUM(pi.amount), 0) AS amt
      FROM public.payslip_items pi
      JOIN public.payslips p ON p.id = pi.payslip_id
      WHERE p.payroll_run_id = p_run_id AND p.company_id = p_company_id AND pi.type = 'deduction'
      GROUP BY 1
    LOOP
      IF r.descr ~* 'paye|paye tax|employees tax|pay as you earn' THEN
        v_paye := v_paye + r.amt;
      ELSIF r.descr ~* '(^|[^a-z])uif([^a-z]|$)|unemployment' THEN
        v_uif := v_uif + r.amt;
      ELSIF r.descr ~* 'sdl|skills development' THEN
        v_sdl := v_sdl + r.amt;
      ELSIF r.descr ~* 'medical' THEN
        v_medical := v_medical + r.amt;
      ELSIF r.descr ~* 'pension|provident|retirement' THEN
        v_retirement := v_retirement + r.amt;
      ELSE
        v_other_deductions := v_other_deductions + r.amt;
      END IF;
    END LOOP;
    v_paye := ROUND(v_paye, 2);
    v_uif := ROUND(v_uif, 2);
    v_sdl := ROUND(v_sdl, 2);
    v_medical := ROUND(v_medical, 2);
    v_retirement := ROUND(v_retirement, 2);
    v_other_deductions := ROUND(v_other_deductions, 2);
    IF ROUND(v_paye + v_uif + v_sdl + v_medical + v_retirement + v_other_deductions, 2) <> v_total_deductions THEN
      -- Snapshot / item mismatch → keep locked consolidated liability model
      v_use_granular := false;
    END IF;
  END IF;

  UPDATE public.payroll_runs
  SET status = 'processing'
  WHERE id = p_run_id AND company_id = p_company_id AND status = 'draft';

  v_description := 'Payroll for period ' || v_run.pay_period_start::text || ' to ' || v_run.pay_period_end::text;
  v_dimensions := jsonb_strip_nulls(jsonb_build_object(
    'payroll_run_id', p_run_id,
    'department', CASE WHEN array_length(v_departments, 1) = 1 THEN v_departments[1] ELSE NULL END,
    'departments', to_jsonb(v_departments),
    'employee_count', v_payslip_count,
    'cost_centre', NULL,
    'project', NULL
  ));

  -- Locked consolidated model: DR wages (gross), CR bank (net), CR liabilities (deductions)
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', v_wage_account, 'debit', v_total_wages, 'credit', 0,
    'dimensions', v_dimensions || jsonb_build_object('account_role', 'salary_expense')
  ));
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', v_bank_account, 'debit', 0, 'credit', v_total_net,
    'dimensions', v_dimensions || jsonb_build_object('account_role', 'bank')
  ));

  IF v_total_deductions > 0 THEN
    IF v_use_granular THEN
      IF v_paye > 0 AND v_paye_account IS NOT NULL THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'account_id', v_paye_account, 'debit', 0, 'credit', v_paye,
          'dimensions', v_dimensions || jsonb_build_object('account_role', 'paye_control')
        ));
      ELSIF v_paye > 0 THEN
        v_liability_remainder := v_liability_remainder + v_paye;
      END IF;
      IF v_uif > 0 AND v_uif_account IS NOT NULL THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'account_id', v_uif_account, 'debit', 0, 'credit', v_uif,
          'dimensions', v_dimensions || jsonb_build_object('account_role', 'uif_control')
        ));
      ELSIF v_uif > 0 THEN
        v_liability_remainder := v_liability_remainder + v_uif;
      END IF;
      IF v_sdl > 0 AND v_sdl_account IS NOT NULL THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'account_id', v_sdl_account, 'debit', 0, 'credit', v_sdl,
          'dimensions', v_dimensions || jsonb_build_object('account_role', 'sdl_control')
        ));
      ELSIF v_sdl > 0 THEN
        v_liability_remainder := v_liability_remainder + v_sdl;
      END IF;
      IF v_medical > 0 AND v_medical_account IS NOT NULL THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'account_id', v_medical_account, 'debit', 0, 'credit', v_medical,
          'dimensions', v_dimensions || jsonb_build_object('account_role', 'medical_aid_control')
        ));
      ELSIF v_medical > 0 THEN
        v_liability_remainder := v_liability_remainder + v_medical;
      END IF;
      IF v_retirement > 0 AND v_retirement_account IS NOT NULL THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'account_id', v_retirement_account, 'debit', 0, 'credit', v_retirement,
          'dimensions', v_dimensions || jsonb_build_object('account_role', 'retirement_fund_control')
        ));
      ELSIF v_retirement > 0 THEN
        v_liability_remainder := v_liability_remainder + v_retirement;
      END IF;
      v_liability_remainder := ROUND(v_liability_remainder + v_other_deductions, 2);
      IF v_liability_remainder > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'account_id', COALESCE(v_employee_deduction_account, v_liability_account), 'debit', 0, 'credit', v_liability_remainder,
          'dimensions', v_dimensions || jsonb_build_object('account_role', 'employee_deductions')
        ));
      END IF;
    ELSE
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_liability_account, 'debit', 0, 'credit', v_total_deductions,
        'dimensions', v_dimensions || jsonb_build_object('account_role', 'payroll_liability')
      ));
    END IF;
  END IF;

  IF v_total_employer > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_wage_account, 'debit', v_total_employer, 'credit', 0,
      'dimensions', v_dimensions || jsonb_build_object('account_role', 'employer_expense')
    ));
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', COALESCE(v_employer_account, v_liability_account), 'debit', 0, 'credit', v_total_employer,
      'dimensions', v_dimensions || jsonb_build_object('account_role', 'employer_contributions')
    ));
  END IF;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id,
    'posting_date', v_run.pay_date,
    'module', 'payroll',
    'document_type', 'payroll_run',
    'document_id', p_run_id,
    'reference', 'PR-' || p_run_id::text,
    'description', v_description,
    'currency', 'ZAR',
    'source', 'payroll_finalize',
    'created_by', p_actor_user_id,
    'idempotency_key', 'payroll:payroll_run:' || p_run_id::text,
    'lines', v_lines
  ), 'commit');

  v_je_id := (v_result->>'journal_id')::uuid;
  v_pr_id := (v_result->>'posting_request_id')::uuid;

  v_output_metadata := jsonb_build_object(
    'payslips_generated', v_payslip_count,
    'reports_generated', true,
    'register_generated', true,
    'summary_generated', true,
    'journal_posted', true,
    'posting_engine', true,
    'posting_request_id', v_pr_id,
    'emails_sent', 0,
    'email_failures', '[]'::jsonb,
    'processed_at', v_processed_at,
    'summary', jsonb_build_object(
      'employees_paid', v_payslip_count,
      'total_gross', v_total_wages,
      'total_net', v_total_net,
      'total_deductions', v_total_deductions,
      'employer_contributions', v_total_employer,
      'payroll_cost', ROUND(v_total_wages + v_total_employer, 2),
      'pay_period', v_run.pay_period_start::text || ' to ' || v_run.pay_period_end::text
    ),
    'recovered', COALESCE(v_result->>'posting_status', '') = 'duplicate'
  );

  UPDATE public.payroll_runs
  SET
    status = 'finalized',
    journal_entry_id = v_je_id,
    posting_request_id = v_pr_id,
    processed_by = p_actor_user_id,
    processed_at = v_processed_at,
    output_metadata = COALESCE(output_metadata, '{}'::jsonb) || v_output_metadata
  WHERE id = p_run_id AND company_id = p_company_id;

  UPDATE public.payslips
  SET payment_status = 'paid'
  WHERE payroll_run_id = p_run_id AND company_id = p_company_id;

  INSERT INTO public.payroll_audit_events (
    company_id, payroll_run_id, event_type, event_data, created_by
  ) VALUES (
    p_company_id, p_run_id, 'run_processed',
    jsonb_build_object(
      'journal_entry_id', v_je_id,
      'posting_request_id', v_pr_id,
      'employee_count', v_payslip_count,
      'total_net', v_total_net,
      'total_gross', v_total_wages,
      'total_employer_contributions', v_total_employer,
      'posting_engine', true,
      'granular_control_accounts', v_use_granular
    ),
    p_actor_user_id
  );

  RETURN v_result || jsonb_build_object(
    'run_id', p_run_id,
    'journal_entry_id', v_je_id,
    'employee_count', v_payslip_count,
    'total_gross', v_total_wages,
    'total_net', v_total_net,
    'total_deductions', v_total_deductions,
    'total_employer_contributions', v_total_employer,
    'processed_at', v_processed_at
  );
EXCEPTION WHEN OTHERS THEN
  -- Atomic: any failure rolls back the whole finalize (including posting claim).
  -- Revert processing status only if we are still inside a savepoint-less
  -- failure before commit — the outer transaction rollback handles cleanup.
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.finalize_payroll_run_atomic IS
  'ERP V3.0 Phase 3D: atomic payroll finalize. Builds locked consolidated (or optionally granular control-account) lines and posts exclusively via posting_engine_submit(module=payroll).';

-- ── Payroll reversal via Posting Engine rollback ──────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_payroll_run_atomic(
  p_company_id uuid,
  p_run_id uuid,
  p_reason text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL,
  p_reopen boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_result jsonb;
  v_idempotency_key text;
BEGIN
  SELECT * INTO v_run
  FROM public.payroll_runs
  WHERE id = p_run_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found for this company' USING ERRCODE = '22023';
  END IF;

  IF v_run.status NOT IN ('finalized', 'paid') THEN
    RAISE EXCEPTION 'Only finalized/paid payroll runs can be reversed.' USING ERRCODE = 'P0001';
  END IF;

  IF v_run.posting_request_id IS NULL AND v_run.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'Payroll run has no posting to reverse.' USING ERRCODE = 'P0001';
  END IF;

  v_idempotency_key := 'payroll:payroll_run:' || p_run_id::text;

  -- Prefer Posting Engine rollback when a posting_request exists; legacy
  -- finalized runs without posting_request_id cannot use the engine path.
  IF v_run.posting_request_id IS NOT NULL THEN
    v_result := public.posting_engine_rollback(
      v_idempotency_key,
      p_company_id,
      COALESCE(p_reason, 'Payroll reversal'),
      p_actor_user_id
    );
  ELSE
    RAISE EXCEPTION 'Legacy payroll journal (pre-Posting Engine) cannot be reversed via the engine. Create a manual correcting journal.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payslips
  SET payment_status = 'pending'
  WHERE payroll_run_id = p_run_id AND company_id = p_company_id;

  IF p_reopen THEN
    UPDATE public.payroll_runs
    SET
      status = 'draft',
      journal_entry_id = NULL,
      posting_request_id = NULL,
      processed_at = NULL,
      processed_by = NULL,
      output_metadata = COALESCE(output_metadata, '{}'::jsonb) || jsonb_build_object(
        'reversed_at', now(),
        'reversal_posting_request_id', v_result->>'posting_request_id',
        'reopened', true,
        'journal_posted', false
      )
    WHERE id = p_run_id AND company_id = p_company_id;
  ELSE
    UPDATE public.payroll_runs
    SET output_metadata = COALESCE(output_metadata, '{}'::jsonb) || jsonb_build_object(
      'reversed_at', now(),
      'reversal_posting_request_id', v_result->>'posting_request_id',
      'cancelled', true,
      'journal_posted', false
    )
    WHERE id = p_run_id AND company_id = p_company_id;
  END IF;

  INSERT INTO public.payroll_audit_events (
    company_id, payroll_run_id, event_type, event_data, created_by
  ) VALUES (
    p_company_id, p_run_id,
    CASE WHEN p_reopen THEN 'run_reopened' ELSE 'run_reversed' END,
    jsonb_build_object(
      'reason', p_reason,
      'reversal_posting_request_id', v_result->>'posting_request_id',
      'reverses_journal_id', v_result->>'reverses_journal_id',
      'reopened', p_reopen
    ),
    p_actor_user_id
  );

  RETURN v_result || jsonb_build_object('run_id', p_run_id, 'reopened', p_reopen);
END;
$$;

COMMENT ON FUNCTION public.reverse_payroll_run_atomic IS
  'ERP V3.0 Phase 3D: reverse a Posting Engine payroll posting via posting_engine_rollback. Optionally reopen the run to draft for correction.';

-- ── Payroll adjustment / correction journal via Posting Engine ────────────
CREATE OR REPLACE FUNCTION public.post_payroll_adjustment_atomic(
  p_company_id uuid,
  p_run_id uuid,
  p_posting_date date,
  p_description text,
  p_lines jsonb,
  p_actor_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_result jsonb;
  v_key text;
BEGIN
  SELECT * INTO v_run
  FROM public.payroll_runs
  WHERE id = p_run_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found for this company' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Adjustment lines are required' USING ERRCODE = '22023';
  END IF;

  v_key := COALESCE(
    p_idempotency_key,
    'payroll:payroll_adjustment:' || p_run_id::text || ':' || COALESCE(p_posting_date::text, CURRENT_DATE::text) || ':' || md5(p_lines::text)
  );

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id,
    'posting_date', COALESCE(p_posting_date, CURRENT_DATE),
    'module', 'payroll',
    'document_type', 'payroll_adjustment',
    'document_id', p_run_id,
    'reference', 'PR-ADJ-' || p_run_id::text,
    'description', COALESCE(p_description, 'Payroll adjustment for run ' || p_run_id::text),
    'currency', 'ZAR',
    'source', 'payroll_adjustment',
    'created_by', p_actor_user_id,
    'idempotency_key', v_key,
    'lines', p_lines
  ), 'commit');

  INSERT INTO public.payroll_audit_events (
    company_id, payroll_run_id, event_type, event_data, created_by
  ) VALUES (
    p_company_id, p_run_id, 'payroll_adjustment_posted',
    jsonb_build_object(
      'posting_request_id', v_result->>'posting_request_id',
      'journal_entry_id', v_result->>'journal_id',
      'description', p_description
    ),
    p_actor_user_id
  );

  RETURN v_result || jsonb_build_object('run_id', p_run_id, 'document_type', 'payroll_adjustment');
END;
$$;

COMMENT ON FUNCTION public.post_payroll_adjustment_atomic IS
  'ERP V3.0 Phase 3D: correction/adjustment journals for a payroll run, posted only via posting_engine_submit(module=payroll).';

GRANT EXECUTE ON FUNCTION public.resolve_payroll_control_account(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_payroll_run_atomic(uuid, uuid, uuid, uuid, uuid, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_payroll_run_atomic(uuid, uuid, text, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_payroll_adjustment_atomic(uuid, uuid, date, text, jsonb, uuid, text) TO authenticated, service_role;
