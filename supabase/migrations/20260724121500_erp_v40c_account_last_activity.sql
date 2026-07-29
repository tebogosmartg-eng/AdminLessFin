-- AdminLess Fin — ERP Blueprint V4.0, Phase 4C: Enterprise Accounting Intelligence
-- Follow-up to 20260724120000: a fifth small read-model RPC, split into its
-- own migration because it was designed after the first four were already
-- being pushed. Server-side replacement for a company-wide "last posting
-- date per account" scan, backing Dashboard Intelligence's dormant/inactive
-- account detection. Read-only, additive, no posting/journal changes.

CREATE OR REPLACE FUNCTION public.get_account_last_activity(
  p_company_id uuid
)
RETURNS TABLE (
  account_id uuid,
  last_entry_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.company_id = p_company_id AND cu.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of company %', p_company_id;
  END IF;

  RETURN QUERY
  SELECT jei.account_id, MAX(je.entry_date) AS last_entry_date
  FROM public.journal_entry_items jei
  JOIN public.journal_entries je ON je.id = jei.journal_entry_id
  WHERE je.company_id = p_company_id
  GROUP BY jei.account_id;
END;
$$;

COMMENT ON FUNCTION public.get_account_last_activity IS
  'ERP V4.0 Phase 4C: server-side GROUP BY MAX(entry_date) per account,
   company-wide. Backs Dashboard Intelligence dormant/inactive detection —
   replaces an N-row heuristic scan with an exact aggregate.';

GRANT EXECUTE ON FUNCTION public.get_account_last_activity(uuid) TO authenticated, service_role;
