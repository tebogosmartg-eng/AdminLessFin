-- Security hardening (post-P0): defense-in-depth for public schema exposure
-- 1) Revoke default anon table/sequence/view privileges (RLS remains; removes GraphQL discoverability + grant surface)
-- 2) Pin search_path on public functions missing an explicit setting (SECURITY DEFINER priority)
-- 3) Revoke anon EXECUTE on SECURITY DEFINER routines (authenticated + service_role retain access)

-- ---------------------------------------------------------------------------
-- 1) Anon table / view / sequence privileges
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Views are included in ALL TABLES for privilege purposes in Postgres.
-- Best-effort: prevent future default grants to anon for roles we can control.
-- (supabase_admin defaults may require platform owner privileges — skip on denial.)
DO $$
DECLARE
  owner_role text;
BEGIN
  FOREACH owner_role IN ARRAY ARRAY['postgres', 'supabase_admin']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = owner_role) THEN
      BEGIN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon',
          owner_role
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon',
          owner_role
        );
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon',
          owner_role
        );
      EXCEPTION
        WHEN insufficient_privilege THEN
          RAISE NOTICE 'skip ALTER DEFAULT PRIVILEGES for role % (insufficient privilege)', owner_role;
      END;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Explicit search_path on public functions missing it
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
          WHERE cfg LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path TO public',
      r.schema_name,
      r.func_name,
      r.args
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Anon must not execute SECURITY DEFINER routines
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.prokind IN ('f', 'p')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM anon',
      r.schema_name,
      r.func_name,
      r.args
    );
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS
  'AdminLess Fin public schema. Anon has no table/sequence privileges; access is via authenticated JWT + RLS (and service_role for Edge).';
