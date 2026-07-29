-- AdminLess Fin — ERP Blueprint V3.0, Phase 3: Fixed Assets integration
-- Refactors acquire_fixed_asset_atomic / dispose_asset (V16.6) to delegate
-- journal writing to posting_engine_submit(). External signatures UNCHANGED.
--
-- Asset Impairment, Reversal, and Write-off are named in the Phase 3 module
-- list but do not exist as distinct features anywhere in this codebase today
-- (confirmed absent in the V2.0 architecture review and again here) — there
-- is no impairment RPC, table, or UI to migrate. Building them would be new
-- functionality, not a migration of existing accounting logic to the engine,
-- so they are intentionally not implemented here; see the final report.

CREATE OR REPLACE FUNCTION public.acquire_fixed_asset_atomic(
  p_company_id uuid,
  p_asset jsonb,
  p_payment_account_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset_id uuid;
  v_asset_code text;
  v_description text;
  v_purchase_date date;
  v_purchase_cost numeric;
  v_asset_account_id uuid;
  v_result jsonb;
BEGIN
  IF p_company_id IS NULL OR p_payment_account_id IS NULL OR p_asset IS NULL THEN
    RAISE EXCEPTION 'acquire_fixed_asset_atomic: company, payment account, and asset payload are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_user_id IS NOT NULL THEN
    BEGIN
      PERFORM public.ensure_auth_user_in_public_users(p_actor_user_id);
    EXCEPTION
      WHEN undefined_function THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END IF;

  v_asset_code := NULLIF(trim(COALESCE(p_asset->>'asset_code', '')), '');
  IF v_asset_code IS NULL THEN
    v_asset_code := public.allocate_asset_code(p_company_id);
  END IF;

  v_description := COALESCE(NULLIF(trim(p_asset->>'description'), ''), 'Fixed asset');
  v_purchase_date := COALESCE((p_asset->>'purchase_date')::date, CURRENT_DATE);
  v_purchase_cost := COALESCE((p_asset->>'purchase_cost')::numeric, 0);
  v_asset_account_id := (p_asset->>'asset_account_id')::uuid;

  IF v_asset_account_id IS NULL THEN
    RAISE EXCEPTION 'acquire_fixed_asset_atomic: asset_account_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_purchase_cost <= 0 THEN
    RAISE EXCEPTION 'acquire_fixed_asset_atomic: purchase_cost must be positive' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fixed_assets (
    company_id, asset_code, description, category_id, purchase_date, purchase_cost, location, department,
    custodian_name, asset_account_id, depreciation_method, useful_life_years, residual_value,
    accumulated_depreciation_account_id, depreciation_expense_account_id, vendor_id, asset_tag, qr_code,
    barcode, verification_status, lifecycle_stage, serial_number, assigned_to_employee_id, parent_asset_id, is_component
  )
  VALUES (
    p_company_id, v_asset_code, v_description,
    NULLIF(p_asset->>'category_id', '')::uuid, v_purchase_date, v_purchase_cost,
    NULLIF(p_asset->>'location', ''), NULLIF(p_asset->>'department', ''), NULLIF(p_asset->>'custodian_name', ''),
    v_asset_account_id, COALESCE(NULLIF(p_asset->>'depreciation_method', ''), 'straight-line'),
    COALESCE(NULLIF(p_asset->>'useful_life_years', '')::integer, 5), COALESCE(NULLIF(p_asset->>'residual_value', '')::numeric, 0),
    COALESCE(NULLIF(p_asset->>'accumulated_depreciation_account_id', '')::uuid, v_asset_account_id),
    NULLIF(p_asset->>'depreciation_expense_account_id', '')::uuid, NULLIF(p_asset->>'vendor_id', '')::uuid,
    COALESCE(NULLIF(p_asset->>'asset_tag', ''), v_asset_code), COALESCE(NULLIF(p_asset->>'qr_code', ''), 'QR-' || v_asset_code),
    COALESCE(NULLIF(p_asset->>'barcode', ''), 'BC-' || v_asset_code), COALESCE(NULLIF(p_asset->>'verification_status', ''), 'unverified'),
    COALESCE(NULLIF(p_asset->>'lifecycle_stage', ''), 'in_service'), NULLIF(p_asset->>'serial_number', ''),
    NULLIF(p_asset->>'assigned_to_employee_id', '')::uuid, NULLIF(p_asset->>'parent_asset_id', '')::uuid,
    COALESCE((p_asset->>'is_component')::boolean, false)
  )
  RETURNING id INTO v_asset_id;

  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id, 'posting_date', v_purchase_date, 'module', 'fixed_assets',
    'document_type', 'asset_acquisition', 'document_id', v_asset_id, 'reference', v_asset_code,
    'description', 'Acquisition of asset: ' || v_description,
    'vendor_id', NULLIF(p_asset->>'vendor_id', ''), 'created_by', p_actor_user_id,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', v_asset_account_id, 'debit', v_purchase_cost),
      jsonb_build_object('account_id', p_payment_account_id, 'credit', v_purchase_cost)
    )
  ), 'commit');

  RETURN v_asset_id;
END;
$$;

COMMENT ON FUNCTION public.acquire_fixed_asset_atomic IS
  'V3.0 Phase 3: unchanged external contract; journal writing delegated to posting_engine_submit().';

DROP FUNCTION IF EXISTS public.dispose_asset(uuid, date, numeric, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.dispose_asset(
  p_asset_id uuid,
  p_disposal_date date,
  p_proceeds numeric,
  p_cash_account_id uuid,
  p_gain_loss_account_id uuid,
  p_company_id uuid DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset record;
  v_net_book_value numeric;
  v_gain_or_loss numeric;
  v_company_id uuid;
  v_lines jsonb := '[]'::jsonb;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.company_id = v_company_id
    ) THEN
      RAISE EXCEPTION 'Asset not found or permission denied.';
    END IF;
  ELSE
    SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company found.';
  END IF;

  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id AND company_id = v_company_id;

  IF v_asset IS NULL THEN RAISE EXCEPTION 'Asset not found or permission denied.'; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset has already been disposed.'; END IF;

  v_net_book_value := v_asset.purchase_cost - v_asset.accumulated_depreciation;
  v_gain_or_loss := p_proceeds - v_net_book_value;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_asset.asset_account_id, 'credit', v_asset.purchase_cost));

  IF v_asset.accumulated_depreciation > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', v_asset.accumulated_depreciation_account_id, 'debit', v_asset.accumulated_depreciation));
  END IF;

  IF p_proceeds > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', p_cash_account_id, 'debit', p_proceeds));
  END IF;

  IF v_gain_or_loss > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', p_gain_loss_account_id, 'credit', v_gain_or_loss));
  ELSIF v_gain_or_loss < 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', p_gain_loss_account_id, 'debit', -v_gain_or_loss));
  END IF;

  PERFORM public.posting_engine_submit(jsonb_build_object(
    'company_id', v_company_id, 'posting_date', p_disposal_date, 'module', 'fixed_assets',
    'document_type', 'asset_disposal', 'document_id', p_asset_id, 'reference', v_asset.asset_code,
    'description', 'Disposal of asset: ' || v_asset.description, 'created_by', p_actor_user_id,
    'lines', v_lines
  ), 'commit');

  UPDATE public.fixed_assets SET status = 'disposed' WHERE id = p_asset_id;
END;
$$;

COMMENT ON FUNCTION public.dispose_asset(uuid, date, numeric, uuid, uuid, uuid, uuid) IS
  'V3.0 Phase 3: unchanged disposal journal structure; journal writing delegated to posting_engine_submit(). p_actor_user_id added as a new trailing optional parameter.';

GRANT EXECUTE ON FUNCTION public.acquire_fixed_asset_atomic(uuid, jsonb, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispose_asset(uuid, date, numeric, uuid, uuid, uuid, uuid) TO authenticated, service_role;
