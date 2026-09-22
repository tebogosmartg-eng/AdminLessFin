-- The company, financial year and period a user works in have one source each,
-- and none of them can be pointed at another tenant.
--
-- Proved against production before this was written:
--
--   1. profiles.active_company_id could name ANY company. The row policy only
--      checks the row is the user's own, and settings UPDATE_PROFILE wrote the
--      request body with the service role. Fifteen SECURITY DEFINER functions
--      fall back to that column when no company is passed; close_financial_year
--      and reopen_financial_year use nothing else.
--   2. Any member could DELETE a financial year or an accounting period, or
--      rewrite its status, through the REST API (policy FOR ALL, membership
--      only). Deleting a locked period removes the lock: assert_period_open
--      finds no period and lets the posting through.
--   3. "The current year" had three rules: financial_year_current(),
--      resolve_erp_context (latest open/draft by start date), and the posting
--      engine's fallback. "The current period" had two more in the accounting
--      edge function.
--
-- Nothing here changes a posted journal, a balance, or how posting is checked.

-- --------------------------------------------------------------------------
-- 1. The saved company is always a company the user belongs to.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_active_company_is_a_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_users cu
    WHERE cu.user_id = NEW.id AND cu.company_id = NEW.active_company_id
  ) THEN
    RAISE EXCEPTION 'The active company must be a company this user belongs to.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_active_company_is_a_membership ON public.profiles;
CREATE TRIGGER profiles_active_company_is_a_membership
  BEFORE INSERT OR UPDATE OF active_company_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_active_company_is_a_membership();

-- Leaving a company (or being removed from it) must not leave it saved as the
-- active one. Move to another membership, or to none.
CREATE OR REPLACE FUNCTION public.company_users_leaving_clears_active_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles p
  SET active_company_id = (
    SELECT cu.company_id FROM public.company_users cu
    WHERE cu.user_id = OLD.user_id AND cu.company_id <> OLD.company_id
    ORDER BY cu.company_id
    LIMIT 1
  )
  WHERE p.id = OLD.user_id AND p.active_company_id = OLD.company_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS company_users_leaving_clears_active_company ON public.company_users;
CREATE TRIGGER company_users_leaving_clears_active_company
  AFTER DELETE ON public.company_users
  FOR EACH ROW EXECUTE FUNCTION public.company_users_leaving_clears_active_company();

REVOKE EXECUTE ON FUNCTION public.profiles_active_company_is_a_membership() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.company_users_leaving_clears_active_company() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 2. The legacy year close/reopen act on the SAVED company, not the one the
--    screen shows, and reopen deletes the closing journal. Their only callers
--    (financial-year, year-end-close) use the service role. A signed-in user
--    must not call them directly.
-- --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.close_financial_year(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_financial_year(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_financial_year(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.reopen_financial_year(uuid) TO service_role;

-- --------------------------------------------------------------------------
-- 3. Years and periods: members read; owners and admins may add a new open
--    year; nothing else is written from the browser. Status changes, closing
--    and deleting belong to the server, which checks what it is doing.
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS financial_years_all ON public.financial_years;
DROP POLICY IF EXISTS financial_years_insert_by_admin ON public.financial_years;
CREATE POLICY financial_years_insert_by_admin ON public.financial_years
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_of(company_id) AND status IN ('open', 'draft'));

DROP POLICY IF EXISTS accounting_periods_all ON public.accounting_periods;

-- The SELECT policies (financial_years_select, accounting_periods_select) are
-- unchanged: any member may read the company's calendar.

-- --------------------------------------------------------------------------
-- 4. One rule for the current period, beside the one rule for the current year.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_period_current(p_company_id uuid)
RETURNS public.accounting_periods
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- The period of the current year that contains today. If today falls
  -- outside that year, the nearest of its periods: the last if the year has
  -- ended, the first if it has not begun.
  SELECT ap.*
  FROM public.financial_year_current(p_company_id) fy
  JOIN public.accounting_periods ap ON ap.financial_year_id = fy.id
  ORDER BY
    (CURRENT_DATE BETWEEN ap.start_date AND ap.end_date) DESC,
    CASE WHEN CURRENT_DATE > fy.end_date THEN ap.start_date END DESC NULLS LAST,
    ap.start_date ASC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.accounting_period_current(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_period_current(uuid) TO service_role;

-- resolve_erp_context used a rule of its own (latest open/draft year by start
-- date). It now asks the same two functions everything else asks.
CREATE OR REPLACE FUNCTION public.resolve_erp_context(p_user_id uuid, p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_company record;
  v_fy public.financial_years;
  v_ap public.accounting_periods;
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

  v_fy := public.financial_year_current(p_company_id);
  v_ap := public.accounting_period_current(p_company_id);

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
    'currency', NULL,
    'country', NULL,
    'tax_configuration', NULL,
    'reporting_basis', 'accrual',
    'audit_context', jsonb_build_object('correlation_id', 'erp:' || gen_random_uuid()::text, 'resolved_at', now()),
    'resolved_at', now()
  );
END;
$$;

-- --------------------------------------------------------------------------
-- 5. Invitations are recorded by the server. Until now the only record of an
--    invitation was the new user's own metadata, which a public sign-up can
--    set: naming any company and any role made the new user a member of it.
--    The table exists first so the invite function can start writing to it;
--    handle_new_user starts requiring it in the next migration.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.company_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.company_role NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  claimed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz
);

CREATE INDEX IF NOT EXISTS company_invitations_open_idx
  ON public.company_invitations (company_id, lower(email))
  WHERE claimed_at IS NULL;

ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_invitations_select_by_admin ON public.company_invitations;
CREATE POLICY company_invitations_select_by_admin ON public.company_invitations
  FOR SELECT TO authenticated
  USING (public.is_admin_of(company_id));

-- Writes are service role only (the invite-user edge function).
REVOKE INSERT, UPDATE, DELETE ON public.company_invitations FROM anon, authenticated;

COMMENT ON TABLE public.company_invitations IS
  'Server-side record of an invitation. handle_new_user honours invited_to_company_id only when an unclaimed, unexpired row exists for that company and the new user''s email, and takes the role from here, never from user metadata.';
