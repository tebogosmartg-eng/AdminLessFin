-- RT-004: drop the remaining mis-defined company_id FK on fixed_assets.
--
-- Migration 20260728100000 was applied, but its DROP filter only matched
-- REFERENCES public.users. The live constraint is:
--   fixed_assets_user_id_fkey
--   FOREIGN KEY (company_id) REFERENCES auth.users(id) ON DELETE CASCADE
-- so the bad FK survived. company_id correctly already references companies(id)
-- via fixed_assets_company_id_fkey; this migration removes only the auth.users
-- (or public.users) reference on company_id.

DO $$
DECLARE
  con record;
  company_attnum smallint;
BEGIN
  SELECT a.attnum INTO company_attnum
  FROM pg_attribute a
  JOIN pg_class t ON t.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'fixed_assets'
    AND a.attname = 'company_id'
    AND NOT a.attisdropped;

  IF company_attnum IS NULL THEN
    RAISE NOTICE 'fixed_assets.company_id not found — nothing to do';
    RETURN;
  END IF;

  FOR con IN
    SELECT c.conname, refn.nspname AS ref_schema, ref.relname AS ref_table
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class ref ON ref.oid = c.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'fixed_assets'
      AND c.contype = 'f'
      AND c.conkey = ARRAY[company_attnum]::smallint[]
      AND ref.relname = 'users'
      AND refn.nspname IN ('auth', 'public')
  LOOP
    EXECUTE format('ALTER TABLE public.fixed_assets DROP CONSTRAINT %I', con.conname);
    RAISE NOTICE 'RT-004: dropped % (company_id → %.%)', con.conname, con.ref_schema, con.ref_table;
  END LOOP;
END;
$$;

-- Guarantee company_id still references companies (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class ref ON ref.oid = c.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'fixed_assets'
      AND c.contype = 'f'
      AND refn.nspname = 'public'
      AND ref.relname = 'companies'
  ) THEN
    ALTER TABLE public.fixed_assets
      ADD CONSTRAINT fixed_assets_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END;
$$;
