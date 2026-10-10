-- Payroll posts to the accounts the financial statements need (ADR-0009).
--
-- 1. payroll_account_mappings gains the employer expense roles (UIF employer,
--    SDL, other employer contributions), and is written only by the payroll
--    function (owners and admins still read it).
-- 2. payroll_run_posting_lines(company, run, overrides): the journal lines for a
--    run, one function used both to preview and to finalise, so what the user
--    sees is what posts. Each deduction and employer contribution is split by
--    its IRP5 code (the description for payslips made before codes were
--    stored): PAYE 4102, UIF 4141, SDL 4142, retirement funds 4001/4003/4006,
--    medical aid 4005, and the rest. Each goes to its mapped account, falling
--    back to the liability (or wages) account when a role is not mapped, so a
--    company that maps nothing posts exactly as before.
-- 3. finalize_payroll_run_atomic posts those lines through the posting engine.

-- ── 1. Roles and write access ───────────────────────────────────────────────
ALTER TABLE public.payroll_account_mappings DROP CONSTRAINT IF EXISTS payroll_account_mappings_account_role_check;
ALTER TABLE public.payroll_account_mappings ADD CONSTRAINT payroll_account_mappings_account_role_check
  CHECK (account_role IN (
    'salary_expense', 'employer_expense', 'uif_employer_expense', 'sdl_expense',
    'bank', 'payroll_liability',
    'paye_control', 'uif_control', 'sdl_control', 'medical_aid_control', 'retirement_fund_control',
    'leave_provision', 'bonus_provision', 'commission_provision',
    'employer_contributions', 'employee_deductions'
  ));

DROP POLICY IF EXISTS payroll_account_mappings_all ON public.payroll_account_mappings;
DROP POLICY IF EXISTS payroll_account_mappings_select ON public.payroll_account_mappings;
CREATE POLICY payroll_account_mappings_select ON public.payroll_account_mappings
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM public.company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payroll_account_mappings FROM authenticated, anon;
GRANT SELECT ON TABLE public.payroll_account_mappings TO authenticated;
GRANT ALL ON TABLE public.payroll_account_mappings TO service_role;

DROP TRIGGER IF EXISTS audit_payroll_account_mappings ON public.payroll_account_mappings;
CREATE TRIGGER audit_payroll_account_mappings
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_account_mappings
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- ── 2. The journal lines for a run ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payroll_run_posting_lines(
  p_company_id uuid,
  p_run_id uuid,
  p_wage_account_id uuid DEFAULT NULL,
  p_bank_account_id uuid DEFAULT NULL,
  p_liability_account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run record;
  v_count integer := 0;
  v_gross numeric := 0;
  v_net numeric := 0;
  v_deductions numeric := 0;
  v_employer numeric := 0;
  v_departments text[];
  v_wage uuid;
  v_bank uuid;
  v_liability uuid;
  v_dims jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_split jsonb := '{}'::jsonb;
  v_items_deductions numeric := 0;
  v_items_employer numeric := 0;
  v_granular boolean := true;
  r record;
  v_account uuid;
  v_expense uuid;

BEGIN
  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found for this company' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)::int,
         COALESCE(SUM(p.total_earnings), 0),
         COALESCE(SUM(p.net_pay), 0),
         COALESCE(SUM(p.total_deductions), 0),
         COALESCE(SUM(COALESCE((p.calculation_snapshot->>'total_employer_contributions')::numeric, 0)), 0),
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(e.department, '')), NULL)
    INTO v_count, v_gross, v_net, v_deductions, v_employer, v_departments
  FROM public.payslips p
  LEFT JOIN public.employees e ON e.id = p.employee_id
  WHERE p.payroll_run_id = p_run_id AND p.company_id = p_company_id;

  v_gross := ROUND(v_gross, 2);
  v_net := ROUND(v_net, 2);
  v_deductions := ROUND(v_deductions, 2);
  v_employer := ROUND(v_employer, 2);

  v_wage := public.resolve_payroll_control_account(p_company_id, 'salary_expense', p_wage_account_id);
  v_bank := public.resolve_payroll_control_account(p_company_id, 'bank', p_bank_account_id);
  IF p_liability_account_id IS NOT NULL THEN
    v_liability := public.resolve_payroll_control_account(p_company_id, 'payroll_liability', p_liability_account_id);
  ELSE
    BEGIN
      v_liability := public.resolve_payroll_control_account(p_company_id, 'payroll_liability', NULL);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        v_liability := public.resolve_payroll_control_account(p_company_id, 'employee_deductions', NULL);
      EXCEPTION WHEN OTHERS THEN v_liability := NULL;
      END;
    END;
  END IF;

  v_dims := jsonb_strip_nulls(jsonb_build_object(
    'payroll_run_id', p_run_id,
    'department', CASE WHEN array_length(v_departments, 1) = 1 THEN v_departments[1] ELSE NULL END,
    'departments', to_jsonb(v_departments),
    'employee_count', v_count
  ));

  -- Deductions and employer contributions by bucket, from the payslip items.
  FOR r IN
    SELECT
      pi.type,
      CASE
        WHEN pi.irp5_code = '4102' OR (pi.irp5_code IS NULL AND pi.description ~* 'paye|employees.? tax|pay as you earn') THEN 'paye'
        WHEN pi.irp5_code = '4141' OR (pi.irp5_code IS NULL AND pi.description ~* '(^|[^a-z])uif([^a-z]|$)|unemployment') THEN 'uif'
        WHEN pi.irp5_code = '4142' OR (pi.irp5_code IS NULL AND pi.description ~* 'sdl|skills development') THEN 'sdl'
        WHEN pi.irp5_code IN ('4001', '4003', '4006') OR (pi.irp5_code IS NULL AND pi.description ~* 'pension|provident|retirement') THEN 'retirement'
        WHEN pi.irp5_code = '4005' OR (pi.irp5_code IS NULL AND pi.description ~* 'medical') THEN 'medical'
        ELSE 'other'
      END AS bucket,
      ROUND(SUM(pi.amount), 2) AS amount
    FROM public.payslip_items pi
    JOIN public.payslips p ON p.id = pi.payslip_id
    WHERE p.payroll_run_id = p_run_id AND p.company_id = p_company_id
      AND pi.type IN ('deduction', 'employer_contribution')
    GROUP BY 1, 2
  LOOP
    v_split := v_split || jsonb_build_object(r.type || ':' || r.bucket, r.amount);
    IF r.type = 'deduction' THEN v_items_deductions := v_items_deductions + r.amount;
    ELSE v_items_employer := v_items_employer + r.amount;
    END IF;
  END LOOP;

  -- The items must make up the payslip totals; otherwise post the totals as one.
  IF ROUND(v_items_deductions, 2) <> v_deductions OR ROUND(v_items_employer, 2) <> v_employer THEN
    v_granular := false;
  END IF;

  IF (v_deductions > 0 OR v_employer > 0) AND v_liability IS NULL AND NOT (
       v_granular AND NOT EXISTS (
         -- every bucket with an amount has an account of its own
         SELECT 1 FROM jsonb_each_text(v_split) s
         WHERE (s.value)::numeric <> 0 AND NOT EXISTS (
           SELECT 1 FROM public.payroll_account_mappings m
           WHERE m.company_id = p_company_id AND m.is_active
             AND m.account_role = CASE split_part(s.key, ':', 2)
               WHEN 'paye' THEN 'paye_control' WHEN 'uif' THEN 'uif_control' WHEN 'sdl' THEN 'sdl_control'
               WHEN 'retirement' THEN 'retirement_fund_control' WHEN 'medical' THEN 'medical_aid_control'
               ELSE CASE WHEN split_part(s.key, ':', 1) = 'deduction' THEN 'employee_deductions' ELSE 'employer_contributions' END
             END)))
  THEN
    RAISE EXCEPTION 'Select or configure a payroll liability control account for deductions.' USING ERRCODE = 'P0001';
  END IF;

  -- Gross pay and net pay.
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('account_id', v_wage, 'debit', v_gross, 'credit', 0, 'description', 'Gross pay',
      'dimensions', v_dims || jsonb_build_object('account_role', 'salary_expense')),
    jsonb_build_object('account_id', v_bank, 'debit', 0, 'credit', v_net, 'description', 'Net pay',
      'dimensions', v_dims || jsonb_build_object('account_role', 'bank')));

  IF NOT v_granular THEN
    IF v_deductions > 0 THEN
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_liability, 'debit', 0, 'credit', v_deductions,
        'description', 'Employee deductions', 'dimensions', v_dims || jsonb_build_object('account_role', 'payroll_liability')));
    END IF;
    IF v_employer > 0 THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_wage, 'debit', v_employer, 'credit', 0, 'description', 'Employer contributions',
          'dimensions', v_dims || jsonb_build_object('account_role', 'employer_expense')),
        jsonb_build_object('account_id', v_liability, 'debit', 0, 'credit', v_employer, 'description', 'Employer contributions',
          'dimensions', v_dims || jsonb_build_object('account_role', 'employer_contributions')));
    END IF;
  ELSE
    FOR r IN SELECT key, (value)::numeric AS amount FROM jsonb_each_text(v_split) WHERE (value)::numeric <> 0 ORDER BY key LOOP
      DECLARE
        v_type text := split_part(r.key, ':', 1);
        v_bucket text := split_part(r.key, ':', 2);
        v_credit_role text;
        v_expense_role text;
        v_label text;
      BEGIN
        v_credit_role := CASE v_bucket
          WHEN 'paye' THEN 'paye_control' WHEN 'uif' THEN 'uif_control' WHEN 'sdl' THEN 'sdl_control'
          WHEN 'retirement' THEN 'retirement_fund_control' WHEN 'medical' THEN 'medical_aid_control'
          ELSE CASE WHEN v_type = 'deduction' THEN 'employee_deductions' ELSE 'employer_contributions' END
        END;
        v_label := CASE v_bucket
          WHEN 'paye' THEN 'PAYE' WHEN 'uif' THEN 'UIF' WHEN 'sdl' THEN 'SDL'
          WHEN 'retirement' THEN 'Retirement funding' WHEN 'medical' THEN 'Medical aid'
          ELSE 'Other' END
          || CASE WHEN v_type = 'deduction' THEN ' (employees)' ELSE ' (employer)' END;
        BEGIN
          v_account := public.resolve_payroll_control_account(p_company_id, v_credit_role, NULL);
        EXCEPTION WHEN OTHERS THEN
          BEGIN
            -- Employer contributions were credited to their own mapped account before roles were split.
            IF v_type = 'employer_contribution' AND v_credit_role <> 'employer_contributions' THEN
              v_account := public.resolve_payroll_control_account(p_company_id, 'employer_contributions', NULL);
            ELSIF v_type = 'deduction' AND v_credit_role <> 'employee_deductions' THEN
              v_account := public.resolve_payroll_control_account(p_company_id, 'employee_deductions', NULL);
            ELSE
              v_account := v_liability;
            END IF;
          EXCEPTION WHEN OTHERS THEN v_account := v_liability;
          END;
        END;
        IF v_account IS NULL THEN v_account := v_liability; END IF;

        IF v_type = 'employer_contribution' THEN
          v_expense_role := CASE v_bucket WHEN 'uif' THEN 'uif_employer_expense' WHEN 'sdl' THEN 'sdl_expense' ELSE 'employer_expense' END;
          BEGIN
            v_expense := public.resolve_payroll_control_account(p_company_id, v_expense_role, NULL);
          EXCEPTION WHEN OTHERS THEN
            BEGIN
              v_expense := public.resolve_payroll_control_account(p_company_id, 'employer_expense', NULL);
            EXCEPTION WHEN OTHERS THEN v_expense := v_wage;
            END;
          END;
          v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_expense, 'debit', r.amount, 'credit', 0,
            'description', v_label, 'dimensions', v_dims || jsonb_build_object('account_role', v_expense_role)));
        END IF;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_account, 'debit', 0, 'credit', r.amount,
          'description', v_label, 'dimensions', v_dims || jsonb_build_object('account_role', v_credit_role)));
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'lines', v_lines,
    'granular', v_granular,
    'payslips', v_count,
    'total_gross', v_gross,
    'total_net', v_net,
    'total_deductions', v_deductions,
    'total_employer_contributions', v_employer,
    'departments', to_jsonb(v_departments)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_run_posting_lines(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_run_posting_lines(uuid, uuid, uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.payroll_run_posting_lines IS
  'The journal lines for a payroll run, split by statutory account (ADR-0009). Used by the finalise preview and by finalize_payroll_run_atomic, so both agree.';

-- ── 3. Finalise posts those lines ───────────────────────────────────────────
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
  v_posting jsonb;
  v_result jsonb;
  v_je_id uuid;
  v_pr_id uuid;
  v_description text;
  v_processed_at timestamptz := now();
  v_output_metadata jsonb;
  v_count integer;
  v_gross numeric;
  v_net numeric;
  v_deductions numeric;
  v_employer numeric;
BEGIN
  IF p_company_id IS NULL OR p_run_id IS NULL THEN
    RAISE EXCEPTION 'company_id and run_id are required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found for this company' USING ERRCODE = '22023';
  END IF;

  IF v_run.status IN ('finalized', 'paid') THEN
    IF v_run.posting_request_id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'journal_id', pr.journal_entry_id, 'journal_number', pr.journal_number, 'posting_status', 'duplicate',
        'posting_request_id', pr.id, 'run_id', v_run.id, 'recovered', true)
      INTO v_result FROM public.posting_requests pr WHERE pr.id = v_run.posting_request_id;
      RETURN v_result;
    END IF;
    RAISE EXCEPTION 'This payroll run has already been finalized.' USING ERRCODE = 'P0001';
  END IF;

  IF p_require_approval AND v_run.approved_at IS NULL THEN
    RAISE EXCEPTION 'Payroll run must be approved before posting.' USING ERRCODE = 'P0001';
  END IF;

  v_posting := public.payroll_run_posting_lines(p_company_id, p_run_id, p_wage_account_id, p_bank_account_id, p_liability_account_id);
  v_count := (v_posting->>'payslips')::int;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Generate payslips before finalizing the payroll run.' USING ERRCODE = 'P0001';
  END IF;
  v_gross := (v_posting->>'total_gross')::numeric;
  v_net := (v_posting->>'total_net')::numeric;
  v_deductions := (v_posting->>'total_deductions')::numeric;
  v_employer := (v_posting->>'total_employer_contributions')::numeric;

  UPDATE public.payroll_runs SET status = 'processing'
  WHERE id = p_run_id AND company_id = p_company_id AND status = 'draft';

  v_description := 'Payroll for period ' || v_run.pay_period_start::text || ' to ' || v_run.pay_period_end::text;

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
    'lines', v_posting->'lines'
  ), 'commit');

  v_je_id := (v_result->>'journal_id')::uuid;
  v_pr_id := (v_result->>'posting_request_id')::uuid;

  v_output_metadata := jsonb_build_object(
    'payslips_generated', v_count,
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
      'employees_paid', v_count,
      'total_gross', v_gross,
      'total_net', v_net,
      'total_deductions', v_deductions,
      'employer_contributions', v_employer,
      'payroll_cost', ROUND(v_gross + v_employer, 2),
      'pay_period', v_run.pay_period_start::text || ' to ' || v_run.pay_period_end::text
    ),
    'recovered', COALESCE(v_result->>'posting_status', '') = 'duplicate'
  );

  UPDATE public.payroll_runs
  SET status = 'finalized', journal_entry_id = v_je_id, posting_request_id = v_pr_id,
      processed_by = p_actor_user_id, processed_at = v_processed_at,
      output_metadata = COALESCE(output_metadata, '{}'::jsonb) || v_output_metadata
  WHERE id = p_run_id AND company_id = p_company_id;

  UPDATE public.payslips SET payment_status = 'paid'
  WHERE payroll_run_id = p_run_id AND company_id = p_company_id;

  INSERT INTO public.payroll_audit_events (company_id, payroll_run_id, event_type, event_data, created_by)
  VALUES (p_company_id, p_run_id, 'run_processed', jsonb_build_object(
    'journal_entry_id', v_je_id, 'posting_request_id', v_pr_id, 'employee_count', v_count,
    'total_net', v_net, 'total_gross', v_gross, 'total_employer_contributions', v_employer,
    'posting_engine', true, 'granular_control_accounts', (v_posting->>'granular')::boolean
  ), p_actor_user_id);

  RETURN v_result || jsonb_build_object(
    'run_id', p_run_id, 'journal_entry_id', v_je_id, 'employee_count', v_count,
    'total_gross', v_gross, 'total_net', v_net, 'total_deductions', v_deductions,
    'total_employer_contributions', v_employer, 'processed_at', v_processed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_payroll_run_atomic(uuid, uuid, uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payroll_run_atomic(uuid, uuid, uuid, uuid, uuid, uuid, boolean) TO service_role;
