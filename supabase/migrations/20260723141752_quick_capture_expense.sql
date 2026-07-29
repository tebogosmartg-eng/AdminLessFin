-- Quick Capture Expense — additive schema + owner-paid posting RPC.
-- Does NOT modify record_bank_transaction_atomic, posting_engine_submit,
-- or any existing Banking/Purchases RPC bodies.

-- ── Gap 1: nullable attachment on bank transactions (backward-compatible) ──
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS attachment_url text;

COMMENT ON COLUMN public.bank_transactions.attachment_url IS
  'Quick Capture: optional receipt/photo URL. Additive; existing rows remain NULL.';

-- ── Phase 2: plain-language category → expense CoA map (per company) ───────
CREATE TABLE IF NOT EXISTS public.quick_expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  expense_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, label)
);

CREATE INDEX IF NOT EXISTS quick_expense_categories_company_idx
  ON public.quick_expense_categories (company_id);

ALTER TABLE public.quick_expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quick_expense_categories_select ON public.quick_expense_categories;
DROP POLICY IF EXISTS quick_expense_categories_all ON public.quick_expense_categories;
CREATE POLICY quick_expense_categories_select ON public.quick_expense_categories
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY quick_expense_categories_all ON public.quick_expense_categories
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT cu.company_id FROM company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ))
  WITH CHECK (company_id IN (
    SELECT cu.company_id FROM company_users cu
    WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
  ));

COMMENT ON TABLE public.quick_expense_categories IS
  'Quick Capture: business-facing expense category labels mapped to real Expense CoA accounts. Additive; does not alter chart_of_accounts.';

-- ── Unified capture metadata (bank path + owner-paid path) ────────────────
CREATE TABLE IF NOT EXISTS public.quick_expense_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_source_kind text NOT NULL CHECK (payment_source_kind IN ('bank_account', 'owner_paid')),
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  posting_request_id uuid REFERENCES public.posting_requests(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.quick_expense_categories(id) ON DELETE SET NULL,
  expense_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL,
  description text,
  vendor_name text,
  attachment_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quick_expense_captures_company_idx
  ON public.quick_expense_captures (company_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS quick_expense_captures_vendor_idx
  ON public.quick_expense_captures (company_id, vendor_name);

ALTER TABLE public.quick_expense_captures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quick_expense_captures_select ON public.quick_expense_captures;
DROP POLICY IF EXISTS quick_expense_captures_all ON public.quick_expense_captures;
CREATE POLICY quick_expense_captures_select ON public.quick_expense_captures
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
CREATE POLICY quick_expense_captures_all ON public.quick_expense_captures
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));

COMMENT ON TABLE public.quick_expense_captures IS
  'Quick Capture: audit/metadata for ad-hoc expenses. Owner-paid rows have no bank_transaction_id; bank-paid rows link to bank_transactions.';

-- ── Gap 2: ensure Due-to-Owner Liability CoA (data helper, not CoA UI) ─────
CREATE OR REPLACE FUNCTION public.ensure_due_to_owner_account(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_next_number int;
BEGIN
  SELECT id INTO v_account_id
  FROM public.chart_of_accounts
  WHERE company_id = p_company_id
    AND type = 'Liability'
    AND lower(name) = lower('Due to Owner')
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  -- Convention: MAX(account_number)+1, type + normal_balance
  -- (same numbering pattern as create_bank_account_atomic; Liability uses credit).
  SELECT COALESCE(MAX(account_number), 0) + 1 INTO v_next_number
  FROM public.chart_of_accounts
  WHERE company_id = p_company_id;

  INSERT INTO public.chart_of_accounts (
    company_id, account_number, name, type, normal_balance, description, is_active
  ) VALUES (
    p_company_id, v_next_number, 'Due to Owner', 'Liability', 'credit',
    'Amounts owed to the business owner for personal payments made on behalf of the company.',
    true
  )
  RETURNING id INTO v_account_id;

  RETURN v_account_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_due_to_owner_account IS
  'Quick Capture: find-or-create Due to Owner Liability CoA for a company. Additive data helper; does not alter CoA UI.';

GRANT EXECUTE ON FUNCTION public.ensure_due_to_owner_account(uuid) TO authenticated, service_role;

-- ── Resolve/create Expense CoA by preferred name (for category seeding) ───
CREATE OR REPLACE FUNCTION public.ensure_expense_account_by_name(
  p_company_id uuid,
  p_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_next_number int;
BEGIN
  SELECT id INTO v_account_id
  FROM public.chart_of_accounts
  WHERE company_id = p_company_id
    AND type = 'Expense'
    AND lower(name) = lower(p_name)
    AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_account_id IS NOT NULL THEN
    RETURN v_account_id;
  END IF;

  SELECT COALESCE(MAX(account_number), 0) + 1 INTO v_next_number
  FROM public.chart_of_accounts
  WHERE company_id = p_company_id;

  INSERT INTO public.chart_of_accounts (
    company_id, account_number, name, type, normal_balance, is_active
  ) VALUES (
    p_company_id, v_next_number, p_name, 'Expense', 'debit', true
  )
  RETURNING id INTO v_account_id;

  RETURN v_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_expense_account_by_name(uuid, text) TO authenticated, service_role;

-- ── Seed starter categories for a company ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_quick_expense_categories(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_labels text[] := ARRAY[
    'Fuel',
    'Vehicle maintenance',
    'Wages',
    'Uniforms',
    'Equipment',
    'Rent',
    'Other'
  ];
  v_label text;
  v_account_id uuid;
  v_sort int := 0;
  v_results jsonb := '[]'::jsonb;
  v_cat_id uuid;
BEGIN
  FOREACH v_label IN ARRAY v_labels
  LOOP
    v_sort := v_sort + 1;
    v_account_id := public.ensure_expense_account_by_name(p_company_id, v_label);

    INSERT INTO public.quick_expense_categories (
      company_id, label, expense_account_id, sort_order, is_active
    ) VALUES (
      p_company_id, v_label, v_account_id, v_sort, true
    )
    ON CONFLICT (company_id, label) DO UPDATE
      SET expense_account_id = EXCLUDED.expense_account_id,
          sort_order = EXCLUDED.sort_order,
          is_active = true,
          updated_at = now()
    RETURNING id INTO v_cat_id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'category_id', v_cat_id,
      'label', v_label,
      'expense_account_id', v_account_id
    ));
  END LOOP;

  -- Ensure Due-to-Owner exists as part of company quick-capture setup
  PERFORM public.ensure_due_to_owner_account(p_company_id);

  RETURN v_results;
END;
$$;

COMMENT ON FUNCTION public.seed_quick_expense_categories IS
  'Quick Capture: seed starter plain-language categories mapped to Expense CoA (create Expense accounts if missing).';

GRANT EXECUTE ON FUNCTION public.seed_quick_expense_categories(uuid) TO authenticated, service_role;

-- ── Gap 2: owner-paid expense via posting_engine_submit (manual_journal) ──
CREATE OR REPLACE FUNCTION public.record_owner_paid_expense_atomic(
  p_company_id uuid,
  p_expense_account_id uuid,
  p_amount numeric,
  p_expense_date date,
  p_description text DEFAULT NULL,
  p_vendor_name text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_attachment_url text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capture_id uuid;
  v_due_to_owner_id uuid;
  v_result jsonb;
  v_expense record;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_expense_date IS NULL THEN
    RAISE EXCEPTION 'p_expense_date is required' USING ERRCODE = '22023';
  END IF;

  SELECT id, type, is_active, posting_blocked INTO v_expense
  FROM public.chart_of_accounts
  WHERE id = p_expense_account_id AND company_id = p_company_id;

  IF v_expense.id IS NULL THEN
    RAISE EXCEPTION 'expense account not found for this company' USING ERRCODE = '22023';
  END IF;
  IF v_expense.type <> 'Expense' THEN
    RAISE EXCEPTION 'expense account must be type Expense' USING ERRCODE = '22023';
  END IF;
  IF NOT v_expense.is_active THEN
    RAISE EXCEPTION 'expense account is inactive' USING ERRCODE = '22023';
  END IF;
  IF v_expense.posting_blocked THEN
    RAISE EXCEPTION 'expense account is blocked for posting' USING ERRCODE = '22023';
  END IF;

  IF p_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.quick_expense_categories
      WHERE id = p_category_id AND company_id = p_company_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'category not found for this company' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Does NOT touch bank_accounts or bank_transactions.
  INSERT INTO public.quick_expense_captures (
    company_id, payment_source_kind, category_id, expense_account_id,
    amount, expense_date, description, vendor_name, attachment_url, created_by
  ) VALUES (
    p_company_id, 'owner_paid', p_category_id, p_expense_account_id,
    p_amount, p_expense_date, p_description, p_vendor_name, p_attachment_url, p_actor_user_id
  )
  RETURNING id INTO v_capture_id;

  v_due_to_owner_id := public.ensure_due_to_owner_account(p_company_id);

  -- Same calling convention as record_bank_transaction_atomic / loan disbursement:
  -- insert document, then posting_engine_submit with document_id.
  -- module = manual_journal (existing whitelist; no engine edit).
  v_result := public.posting_engine_submit(jsonb_build_object(
    'company_id', p_company_id,
    'posting_date', p_expense_date,
    'module', 'manual_journal',
    'document_type', 'owner_paid_expense',
    'document_id', v_capture_id,
    'description', COALESCE(
      NULLIF(p_description, ''),
      'Owner-paid expense' || CASE WHEN p_vendor_name IS NOT NULL THEN ' — ' || p_vendor_name ELSE '' END
    ),
    'created_by', p_actor_user_id,
    'idempotency_key', 'manual_journal:owner_paid_expense:' || v_capture_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_id', p_expense_account_id, 'debit', p_amount),
      jsonb_build_object('account_id', v_due_to_owner_id, 'credit', p_amount)
    )
  ), 'commit');

  UPDATE public.quick_expense_captures
  SET journal_entry_id = (v_result->>'journal_id')::uuid,
      posting_request_id = (v_result->>'posting_request_id')::uuid
  WHERE id = v_capture_id;

  RETURN jsonb_build_object(
    'capture_id', v_capture_id,
    'due_to_owner_account_id', v_due_to_owner_id
  ) || v_result;
END;
$$;

COMMENT ON FUNCTION public.record_owner_paid_expense_atomic IS
  'Quick Capture: owner-paid expense. Writes quick_expense_captures + posting_engine_submit(module=manual_journal). Does not touch bank_accounts/bank_transactions.';

GRANT EXECUTE ON FUNCTION public.record_owner_paid_expense_atomic(uuid, uuid, numeric, date, text, text, uuid, text, uuid)
  TO authenticated, service_role;

-- ── Record bank-paid quick capture metadata after withdrawal RPC ─────────
CREATE OR REPLACE FUNCTION public.record_bank_paid_quick_capture(
  p_company_id uuid,
  p_bank_account_id uuid,
  p_bank_transaction_id uuid,
  p_expense_account_id uuid,
  p_amount numeric,
  p_expense_date date,
  p_description text DEFAULT NULL,
  p_vendor_name text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_attachment_url text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capture_id uuid;
  v_txn record;
BEGIN
  SELECT id, journal_entry_id, posting_request_id INTO v_txn
  FROM public.bank_transactions
  WHERE id = p_bank_transaction_id AND company_id = p_company_id;

  IF v_txn.id IS NULL THEN
    RAISE EXCEPTION 'bank transaction not found' USING ERRCODE = '22023';
  END IF;

  IF p_attachment_url IS NOT NULL THEN
    UPDATE public.bank_transactions
    SET attachment_url = p_attachment_url
    WHERE id = p_bank_transaction_id AND company_id = p_company_id;
  END IF;

  INSERT INTO public.quick_expense_captures (
    company_id, payment_source_kind, bank_account_id, bank_transaction_id,
    journal_entry_id, posting_request_id, category_id, expense_account_id,
    amount, expense_date, description, vendor_name, attachment_url, created_by
  ) VALUES (
    p_company_id, 'bank_account', p_bank_account_id, p_bank_transaction_id,
    v_txn.journal_entry_id, v_txn.posting_request_id, p_category_id, p_expense_account_id,
    p_amount, p_expense_date, p_description, p_vendor_name, p_attachment_url, p_actor_user_id
  )
  RETURNING id INTO v_capture_id;

  RETURN jsonb_build_object(
    'capture_id', v_capture_id,
    'bank_transaction_id', p_bank_transaction_id,
    'journal_entry_id', v_txn.journal_entry_id,
    'attachment_url', p_attachment_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_bank_paid_quick_capture(uuid, uuid, uuid, uuid, numeric, date, text, text, uuid, text, uuid)
  TO authenticated, service_role;

-- ── Frequency-based category suggestion (Phase 5) ─────────────────────────
CREATE OR REPLACE FUNCTION public.suggest_quick_expense_category(
  p_company_id uuid,
  p_vendor_name text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_needle text;
  v_result jsonb;
BEGIN
  v_needle := lower(trim(COALESCE(NULLIF(p_vendor_name, ''), NULLIF(p_description, ''), '')));
  IF v_needle = '' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'category_id', c.category_id,
    'label', q.label,
    'expense_account_id', q.expense_account_id,
    'match_count', c.cnt
  )
  INTO v_result
  FROM (
    SELECT category_id, COUNT(*)::int AS cnt
    FROM public.quick_expense_captures
    WHERE company_id = p_company_id
      AND category_id IS NOT NULL
      AND (
        (vendor_name IS NOT NULL AND lower(vendor_name) LIKE '%' || v_needle || '%')
        OR (vendor_name IS NOT NULL AND v_needle LIKE '%' || lower(vendor_name) || '%')
        OR (description IS NOT NULL AND lower(description) LIKE '%' || v_needle || '%')
      )
    GROUP BY category_id
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ) c
  JOIN public.quick_expense_categories q ON q.id = c.category_id AND q.company_id = p_company_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_quick_expense_category(uuid, text, text)
  TO authenticated, service_role;
