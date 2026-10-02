-- Service-only RPCs. A failed statement rolls back its journal AND source update.
-- Deploy this migration before the shared edge wrapper (which fails closed).
BEGIN;

CREATE TABLE public.edge_request_quotas (
  bucket text PRIMARY KEY CHECK (length(bucket) BETWEEN 1 AND 200),
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);
ALTER TABLE public.edge_request_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_request_quotas FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_edge_request_quota(p_bucket text, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window timestamptz := date_trunc('minute', v_now);
  v_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied: service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_bucket IS NULL OR length(p_bucket) NOT BETWEEN 1 AND 200
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Invalid request quota.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.edge_request_quotas AS q (bucket, window_start, request_count)
    VALUES (p_bucket, v_window, 1)
  ON CONFLICT (bucket) DO UPDATE SET
    window_start = GREATEST(q.window_start, EXCLUDED.window_start),
    request_count = CASE WHEN q.window_start < EXCLUDED.window_start THEN 1
                        ELSE LEAST(q.request_count + 1, p_limit + 1) END
  RETURNING request_count INTO v_count;
  RETURN jsonb_build_object('allowed', v_count <= p_limit,
    'retry_after_seconds', GREATEST(1, ceil(extract(epoch FROM v_window + interval '1 minute' - v_now))::integer));
END;
$$;
REVOKE ALL ON FUNCTION public.consume_edge_request_quota(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_request_quota(text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.process_recurring_journal_atomic(p_entry_id uuid, p_scheduled_for date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry public.recurring_journal_entries%ROWTYPE;
  v_lines jsonb;
  v_next date;
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied: service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_scheduled_for IS NULL THEN
    RAISE EXCEPTION 'Scheduled date is required.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_entry FROM public.recurring_journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_entry.next_run_date <> p_scheduled_for OR p_scheduled_for > CURRENT_DATE THEN
    RETURN jsonb_build_object('posting_status', 'skipped', 'reason', 'not due or already processed');
  END IF;
  IF p_scheduled_for < v_entry.start_date THEN
    RAISE EXCEPTION 'Recurring journal is before its start date.' USING ERRCODE = '22023';
  END IF;
  IF v_entry.end_date IS NOT NULL AND p_scheduled_for > v_entry.end_date THEN
    DELETE FROM public.recurring_journal_entries WHERE id = v_entry.id;
    RETURN jsonb_build_object('posting_status', 'skipped', 'reason', 'schedule expired');
  END IF;
  v_next := CASE v_entry.frequency
    WHEN 'daily' THEN p_scheduled_for + 1
    WHEN 'weekly' THEN p_scheduled_for + 7
    WHEN 'monthly' THEN (p_scheduled_for + interval '1 month')::date
    WHEN 'yearly' THEN (p_scheduled_for + interval '1 year')::date
    ELSE NULL END;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Unsupported recurring journal frequency.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.recurring_journal_entry_items
    WHERE recurring_journal_entry_id = v_entry.id AND (type NOT IN ('debit', 'credit') OR amount <= 0)) THEN
    RAISE EXCEPTION 'Invalid recurring journal lines.' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_agg(jsonb_build_object('account_id', account_id,
    'debit', CASE WHEN type = 'debit' THEN amount ELSE 0 END,
    'credit', CASE WHEN type = 'credit' THEN amount ELSE 0 END) ORDER BY id)
    INTO v_lines FROM public.recurring_journal_entry_items WHERE recurring_journal_entry_id = v_entry.id;
  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', v_entry.company_id, 'posting_date', p_scheduled_for,
    'module', 'manual_journal', 'document_type', 'recurring_journal', 'document_id', v_entry.id,
    'idempotency_key', 'recurring_journal:' || v_entry.id || ':' || p_scheduled_for,
    'description', '(Recurring) ' || v_entry.description, 'source', 'scheduled',
    'lines', COALESCE(v_lines, '[]'::jsonb)), 'commit');
  IF v_entry.end_date IS NOT NULL AND v_next > v_entry.end_date THEN
    DELETE FROM public.recurring_journal_entries WHERE id = v_entry.id;
  ELSE
    UPDATE public.recurring_journal_entries SET next_run_date = v_next WHERE id = v_entry.id;
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.process_recurring_journal_atomic(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_recurring_journal_atomic(uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.depreciate_fixed_asset_atomic(
  p_asset_id uuid, p_as_of date, p_company_id uuid DEFAULT NULL, p_actor_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_asset public.fixed_assets%ROWTYPE;
  v_first_month date;
  v_last_month date;
  v_months integer;
  v_monthly numeric;
  v_depreciable numeric;
  v_amount numeric;
  v_accumulated numeric;
  v_year integer;
  v_result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Permission denied: service role required.' USING ERRCODE = '42501';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'Depreciation date is required.' USING ERRCODE = '22023';
  END IF;
  -- Interactive callers are checked again inside the same transaction.
  IF p_actor_user_id IS NOT NULL AND (p_company_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.company_users WHERE company_id = p_company_id
      AND user_id = p_actor_user_id AND role IN ('owner', 'admin'))) THEN
    RAISE EXCEPTION 'Permission denied: admin required to run depreciation.' USING ERRCODE = '42501';
  END IF;
  IF p_actor_user_id IS NULL AND p_as_of > CURRENT_DATE THEN
    RAISE EXCEPTION 'Scheduled depreciation cannot use a future date.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id
    AND (p_company_id IS NULL OR company_id = p_company_id) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset not found or permission denied.' USING ERRCODE = '42501';
  END IF;
  IF v_asset.status <> 'active' OR v_asset.depreciation_method IS DISTINCT FROM 'straight-line' THEN
    RETURN jsonb_build_object('posting_status', 'skipped', 'reason', 'asset inactive or method unsupported');
  END IF;
  IF v_asset.useful_life_years IS NULL OR v_asset.useful_life_years <= 0
     OR v_asset.depreciation_expense_account_id IS NULL OR v_asset.accumulated_depreciation_account_id IS NULL THEN
    RAISE EXCEPTION 'Invalid depreciation configuration.' USING ERRCODE = '22023';
  END IF;
  v_first_month := date_trunc('month', COALESCE(v_asset.last_depreciation_date, v_asset.purchase_date))::date;
  IF v_asset.last_depreciation_date IS NOT NULL THEN
    v_first_month := (v_first_month + interval '1 month')::date;
  END IF;
  v_last_month := date_trunc('month', p_as_of)::date;
  IF p_as_of < (v_last_month + interval '1 month - 1 day')::date THEN
    v_last_month := (v_last_month - interval '1 month')::date;
  END IF;
  v_months := (extract(year FROM v_last_month)::integer - extract(year FROM v_first_month)::integer) * 12
    + extract(month FROM v_last_month)::integer - extract(month FROM v_first_month)::integer + 1;
  IF v_months <= 0 THEN
    RETURN jsonb_build_object('posting_status', 'skipped', 'reason', 'no month owing');
  END IF;
  v_depreciable := v_asset.purchase_cost - COALESCE(v_asset.residual_value, 0);
  v_accumulated := COALESCE(v_asset.accumulated_depreciation, 0);
  -- Round the complete charge once, matching the existing interactive formula.
  v_monthly := v_depreciable / (v_asset.useful_life_years * 12);
  v_amount := round(LEAST(v_monthly * v_months, GREATEST(v_depreciable - v_accumulated, 0)), 2);
  IF v_amount <= 0 THEN
    IF v_accumulated >= v_depreciable THEN
      UPDATE public.fixed_assets SET status = 'fully-depreciated' WHERE id = v_asset.id;
    END IF;
    RETURN jsonb_build_object('posting_status', 'skipped', 'reason', 'nothing depreciable');
  END IF;
  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', v_asset.company_id, 'posting_date', p_as_of, 'module', 'fixed_assets',
    'document_type', 'depreciation_run', 'document_id', v_asset.id,
    'idempotency_key', 'fixed_assets:depreciation:' || v_asset.id || ':' || (v_last_month + interval '1 month - 1 day')::date,
    'description', 'Depreciation on ' || v_asset.description || ' (' || v_asset.asset_code || ') to ' || p_as_of,
    'created_by', p_actor_user_id, 'source', CASE WHEN p_actor_user_id IS NULL THEN 'scheduled' ELSE 'interactive' END,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', v_asset.depreciation_expense_account_id, 'debit', v_amount),
      jsonb_build_object('account_id', v_asset.accumulated_depreciation_account_id, 'credit', v_amount))), 'commit');
  -- A duplicate with an unadvanced register signals an OLD partial write. Do
  -- not guess its amount; leave both records untouched for reconciliation.
  IF v_result->>'posting_status' = 'duplicate' THEN
    RAISE EXCEPTION 'Depreciation journal already exists but register needs reconciliation.' USING ERRCODE = '22023';
  END IF;
  v_year := extract(year FROM p_as_of)::integer;
  UPDATE public.fixed_assets SET
    accumulated_depreciation = v_accumulated + v_amount,
    last_depreciation_date = (v_last_month + interval '1 month - 1 day')::date,
    depreciation_ytd = CASE WHEN depreciation_ytd_year = v_year THEN COALESCE(depreciation_ytd, 0) ELSE 0 END + v_amount,
    depreciation_ytd_year = v_year,
    status = CASE WHEN v_accumulated + v_amount >= v_depreciable THEN 'fully-depreciated' ELSE 'active' END,
    updated_at = now()
  WHERE id = v_asset.id;
  RETURN v_result || jsonb_build_object('amount', v_amount, 'months', v_months);
END;
$$;
REVOKE ALL ON FUNCTION public.depreciate_fixed_asset_atomic(uuid, date, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.depreciate_fixed_asset_atomic(uuid, date, uuid, uuid) TO service_role;

COMMIT;
