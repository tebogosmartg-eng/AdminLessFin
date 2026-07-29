-- Certification fix: remove the mis-defined foreign key that makes fixed asset
-- capitalisation impossible for every new company.
--
-- fixed_assets carries a constraint named fixed_assets_user_id_fkey which is
-- actually defined on the company_id column and references public.users(id). A
-- company id is never a user id, so acquire_fixed_asset_atomic fails for any
-- company whose id has not been mirrored into public.users by hand.
--
-- Certification evidence: capitalising an asset on a brand-new company fails with
--   insert or update on table "fixed_assets" violates foreign key constraint
--   "fixed_assets_user_id_fkey"
--   Key (company_id)=(...) is not present in table "users"
-- while all 14 pre-existing fixed_assets rows belong to the single tenant whose
-- company id had been inserted into public.users as a workaround. V16.5
-- (eam_v165_user_mapping_remediation) attempted to paper over this by mirroring
-- auth users into public.users, which cannot satisfy a company_id reference.
--
-- company_id is already correctly constrained to companies(id) elsewhere, so the
-- users reference is redundant as well as wrong. The drop is guarded so it only
-- ever removes a constraint that genuinely points company_id at users: if the
-- constraint has been corrected by other means, this migration does nothing.

DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class ref ON ref.oid = c.confrelid
    JOIN pg_namespace refn ON refn.oid = ref.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'fixed_assets'
      AND c.contype = 'f'
      AND refn.nspname = 'public'
      AND ref.relname = 'users'
      -- Only a constraint whose sole column is company_id.
      AND c.conkey = ARRAY[
        (SELECT a.attnum
         FROM pg_attribute a
         WHERE a.attrelid = t.oid AND a.attname = 'company_id' AND NOT a.attisdropped)
      ]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.fixed_assets DROP CONSTRAINT %I', con.conname);
    RAISE NOTICE 'Dropped mis-defined constraint %s on fixed_assets.company_id', con.conname;
  END LOOP;
END;
$$;

-- Guarantee company_id is constrained to the table it actually refers to.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_class ref ON ref.oid = c.confrelid
    WHERE n.nspname = 'public'
      AND t.relname = 'fixed_assets'
      AND c.contype = 'f'
      AND ref.relname = 'companies'
  ) THEN
    ALTER TABLE public.fixed_assets
      ADD CONSTRAINT fixed_assets_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END;
$$;
