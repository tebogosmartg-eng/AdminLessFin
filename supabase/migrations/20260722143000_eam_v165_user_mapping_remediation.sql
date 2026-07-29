-- AdminLess Fin V16.5 — EAM certification user mapping (additive, security-preserving)
-- Legacy fixed_assets triggers reference public.users for company owner / creator FKs.
-- Mirror auth.users into public.users without weakening RLS on fixed_assets.

CREATE OR REPLACE FUNCTION public.ensure_auth_user_in_public_users(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  email_val text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'users'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RETURN;
  END IF;

  SELECT au.email INTO email_val FROM auth.users au WHERE au.id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
  ) THEN
    INSERT INTO public.users (id, email)
    VALUES (p_user_id, email_val)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.users (id)
    VALUES (p_user_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.ensure_auth_user_in_public_users IS
  'V16.5: Ensures legacy public.users row exists for auth identity (fixed_assets_user_id_fkey).';

DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'users'
  ) THEN
    RAISE NOTICE 'public.users not present — skip EAM user backfill';
    RETURN;
  END IF;

  FOR r IN SELECT id FROM auth.users LOOP
    PERFORM public.ensure_auth_user_in_public_users(r.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_auth_user_to_public_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.ensure_auth_user_in_public_users(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_auth_user_to_public_users ON auth.users;
CREATE TRIGGER sync_auth_user_to_public_users
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_auth_user_to_public_users();
