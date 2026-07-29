-- AdminLess Fin V16.6 — Atomic acquisition + company-scoped dispose
-- Preserves dispose journal structure and acquisition JE (Dr asset / Cr payment).
-- Additive: optional p_company_id on dispose; new acquire_fixed_asset_atomic RPC.

DROP FUNCTION IF EXISTS public.dispose_asset(uuid, date, numeric, uuid, uuid);
DROP FUNCTION IF EXISTS public.dispose_asset(uuid, date, numeric, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.dispose_asset(
  p_asset_id uuid,
  p_disposal_date date,
  p_proceeds numeric,
  p_cash_account_id uuid,
  p_gain_loss_account_id uuid,
  p_company_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset record;
  v_new_je_id uuid;
  v_net_book_value numeric;
  v_gain_or_loss numeric;
  v_company_id uuid;
BEGIN
  IF p_company_id IS NOT NULL THEN
    v_company_id := p_company_id;
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.company_id = v_company_id
    ) THEN
      RAISE EXCEPTION 'Asset not found or permission denied.';
    END IF;
  ELSE
    SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company found.';
  END IF;

  SELECT * INTO v_asset
  FROM public.fixed_assets
  WHERE id = p_asset_id AND company_id = v_company_id;

  IF v_asset IS NULL THEN RAISE EXCEPTION 'Asset not found or permission denied.'; END IF;
  IF v_asset.status = 'disposed' THEN RAISE EXCEPTION 'Asset has already been disposed.'; END IF;

  v_net_book_value := v_asset.purchase_cost - v_asset.accumulated_depreciation;
  v_gain_or_loss := p_proceeds - v_net_book_value;

  INSERT INTO public.journal_entries (company_id, entry_date, description)
  VALUES (v_company_id, p_disposal_date, 'Disposal of asset: ' || v_asset.description)
  RETURNING id INTO v_new_je_id;

  INSERT INTO public.journal_entry_items (journal_entry_id, account_id, type, amount)
  VALUES (v_new_je_id, v_asset.asset_account_id, 'credit', v_asset.purchase_cost);

  IF v_asset.accumulated_depreciation > 0 THEN
    INSERT INTO public.journal_entry_items (journal_entry_id, account_id, type, amount)
    VALUES (v_new_je_id, v_asset.accumulated_depreciation_account_id, 'debit', v_asset.accumulated_depreciation);
  END IF;

  IF p_proceeds > 0 THEN
    INSERT INTO public.journal_entry_items (journal_entry_id, account_id, type, amount)
    VALUES (v_new_je_id, p_cash_account_id, 'debit', p_proceeds);
  END IF;

  IF v_gain_or_loss > 0 THEN
    INSERT INTO public.journal_entry_items (journal_entry_id, account_id, type, amount)
    VALUES (v_new_je_id, p_gain_loss_account_id, 'credit', v_gain_or_loss);
  ELSIF v_gain_or_loss < 0 THEN
    INSERT INTO public.journal_entry_items (journal_entry_id, account_id, type, amount)
    VALUES (v_new_je_id, p_gain_loss_account_id, 'debit', -v_gain_or_loss);
  END IF;

  UPDATE public.fixed_assets
  SET status = 'disposed'
  WHERE id = p_asset_id;
END;
$$;

COMMENT ON FUNCTION public.dispose_asset(uuid, date, numeric, uuid, uuid, uuid) IS
  'V16.6: Disposal JE unchanged; optional p_company_id avoids profile guessing.';

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
  v_entry_id uuid;
  v_asset_code text;
  v_description text;
  v_purchase_date date;
  v_purchase_cost numeric;
  v_asset_account_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_payment_account_id IS NULL OR p_asset IS NULL THEN
    RAISE EXCEPTION 'acquire_fixed_asset_atomic: company, payment account, and asset payload are required'
      USING ERRCODE = '22023';
  END IF;

  IF p_actor_user_id IS NOT NULL THEN
    BEGIN
      PERFORM public.ensure_auth_user_in_public_users(p_actor_user_id);
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
      WHEN OTHERS THEN
        NULL;
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
    RAISE EXCEPTION 'acquire_fixed_asset_atomic: asset_account_id is required'
      USING ERRCODE = '22023';
  END IF;
  IF v_purchase_cost <= 0 THEN
    RAISE EXCEPTION 'acquire_fixed_asset_atomic: purchase_cost must be positive'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.fixed_assets (
    company_id,
    asset_code,
    description,
    category_id,
    purchase_date,
    purchase_cost,
    location,
    department,
    custodian_name,
    asset_account_id,
    depreciation_method,
    useful_life_years,
    residual_value,
    accumulated_depreciation_account_id,
    depreciation_expense_account_id,
    vendor_id,
    asset_tag,
    qr_code,
    barcode,
    verification_status,
    lifecycle_stage,
    serial_number,
    assigned_to_employee_id,
    parent_asset_id,
    is_component
  )
  VALUES (
    p_company_id,
    v_asset_code,
    v_description,
    NULLIF(p_asset->>'category_id', '')::uuid,
    v_purchase_date,
    v_purchase_cost,
    NULLIF(p_asset->>'location', ''),
    NULLIF(p_asset->>'department', ''),
    NULLIF(p_asset->>'custodian_name', ''),
    v_asset_account_id,
    COALESCE(NULLIF(p_asset->>'depreciation_method', ''), 'straight-line'),
    COALESCE(NULLIF(p_asset->>'useful_life_years', '')::integer, 5),
    COALESCE(NULLIF(p_asset->>'residual_value', '')::numeric, 0),
    COALESCE(NULLIF(p_asset->>'accumulated_depreciation_account_id', '')::uuid, v_asset_account_id),
    NULLIF(p_asset->>'depreciation_expense_account_id', '')::uuid,
    NULLIF(p_asset->>'vendor_id', '')::uuid,
    COALESCE(NULLIF(p_asset->>'asset_tag', ''), v_asset_code),
    COALESCE(NULLIF(p_asset->>'qr_code', ''), 'QR-' || v_asset_code),
    COALESCE(NULLIF(p_asset->>'barcode', ''), 'BC-' || v_asset_code),
    COALESCE(NULLIF(p_asset->>'verification_status', ''), 'unverified'),
    COALESCE(NULLIF(p_asset->>'lifecycle_stage', ''), 'in_service'),
    NULLIF(p_asset->>'serial_number', ''),
    NULLIF(p_asset->>'assigned_to_employee_id', '')::uuid,
    NULLIF(p_asset->>'parent_asset_id', '')::uuid,
    COALESCE((p_asset->>'is_component')::boolean, false)
  )
  RETURNING id INTO v_asset_id;

  INSERT INTO public.journal_entries (company_id, entry_date, description, vendor_id)
  VALUES (
    p_company_id,
    v_purchase_date,
    'Acquisition of asset: ' || v_description,
    NULLIF(p_asset->>'vendor_id', '')::uuid
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO public.journal_entry_items (journal_entry_id, account_id, type, amount)
  VALUES
    (v_entry_id, v_asset_account_id, 'debit', v_purchase_cost),
    (v_entry_id, p_payment_account_id, 'credit', v_purchase_cost);

  RETURN v_asset_id;
END;
$$;

COMMENT ON FUNCTION public.acquire_fixed_asset_atomic IS
  'V16.6: Single-transaction asset acquisition with balanced Dr/Cr journal.';

GRANT EXECUTE ON FUNCTION public.acquire_fixed_asset_atomic(uuid, jsonb, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dispose_asset(uuid, date, numeric, uuid, uuid, uuid) TO authenticated, service_role;
