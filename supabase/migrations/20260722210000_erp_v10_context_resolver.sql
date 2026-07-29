-- AdminLess Fin — ERP Blueprint V1.0, Phase 1: ERP Context resolver
-- One function every Edge Function calls instead of independently resolving
-- membership, financial year, and period. Wired into
-- supabase/functions/_shared/enterpriseEdgePlatform.ts's bootstrapTenantRequest.

CREATE OR REPLACE FUNCTION public.resolve_erp_context(p_user_id uuid, p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_company record;
  v_fy record;
  v_ap record;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'resolve_erp_context: user and company are required' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_role FROM company_users WHERE user_id = p_user_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permission denied: user is not a member of this company.' USING ERRCODE = '42501';
  END IF;

  SELECT id, name, tax_id INTO v_company FROM companies WHERE id = p_company_id;
  IF v_company.id IS NULL THEN
    RAISE EXCEPTION 'Company not found.' USING ERRCODE = '22023';
  END IF;

  SELECT id, year_code, start_date, end_date, status INTO v_fy
    FROM financial_years
    WHERE company_id = p_company_id AND status IN ('open', 'draft')
    ORDER BY start_date DESC
    LIMIT 1;

  IF v_fy.id IS NOT NULL THEN
    SELECT id, period_number, start_date, end_date, status INTO v_ap
      FROM accounting_periods
      WHERE financial_year_id = v_fy.id AND CURRENT_DATE BETWEEN start_date AND end_date
      LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'company_id', p_company_id,
    'company', jsonb_build_object('id', v_company.id, 'name', v_company.name, 'tax_id', v_company.tax_id),
    'role', v_role,
    'financial_year', CASE WHEN v_fy.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_fy.id, 'year_code', v_fy.year_code,
      'start_date', v_fy.start_date, 'end_date', v_fy.end_date, 'status', v_fy.status
    ) END,
    'accounting_period', CASE WHEN v_ap.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_ap.id, 'period_number', v_ap.period_number,
      'start_date', v_ap.start_date, 'end_date', v_ap.end_date, 'status', v_ap.status
    ) END,
    -- Currency / country / tax configuration are not yet modeled as columns
    -- anywhere in the schema (confirmed absent from `companies` in the V2.0
    -- review) — returned as explicit nulls rather than fabricated, pending a
    -- company-settings data model this phase does not introduce.
    'currency', NULL,
    'country', NULL,
    'tax_configuration', NULL,
    'reporting_basis', 'accrual',
    'audit_context', jsonb_build_object('correlation_id', 'erp:' || gen_random_uuid()::text, 'resolved_at', now()),
    'resolved_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_erp_context IS
  'ERP V1.0 Phase 1: single ERP Context resolver — membership, financial year, accounting period. Every Edge Function should consume this via bootstrapTenantRequest() instead of resolving these independently.';

GRANT EXECUTE ON FUNCTION public.resolve_erp_context(uuid, uuid) TO authenticated, service_role;
