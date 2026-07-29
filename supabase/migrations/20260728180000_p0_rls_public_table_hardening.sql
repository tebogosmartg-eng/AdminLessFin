-- P0 Security: eliminate Supabase "RLS Disabled in Public" / table publicly accessible
-- Target: public.asset_code_sequences (ERROR: rls_disabled_in_public)
-- Also harden payroll platform catalogues that used USING (true) without role restriction
-- (anon could SELECT all rows via PostgREST).

-- ---------------------------------------------------------------------------
-- 1) asset_code_sequences — company-scoped, read for members; no direct writes
--    Mutations occur only via SECURITY DEFINER allocate_asset_code().
-- ---------------------------------------------------------------------------
ALTER TABLE public.asset_code_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_code_sequences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_code_sequences_select ON public.asset_code_sequences;
DROP POLICY IF EXISTS asset_code_sequences_all ON public.asset_code_sequences;

CREATE POLICY asset_code_sequences_select ON public.asset_code_sequences
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id
      FROM public.company_users cu
      WHERE cu.user_id = auth.uid()
    )
  );

-- Defense in depth: anon must not hold table privileges on this tenant table.
-- Authenticated may SELECT only; mutations go through SECURITY DEFINER RPCs.
REVOKE ALL ON TABLE public.asset_code_sequences FROM anon;
REVOKE ALL ON TABLE public.asset_code_sequences FROM authenticated;
GRANT SELECT ON TABLE public.asset_code_sequences TO authenticated;
GRANT ALL ON TABLE public.asset_code_sequences TO service_role;

-- ---------------------------------------------------------------------------
-- 2) payroll_rule_catalog / payroll_tax_year_config — intentional platform
--    catalogues for authenticated users only (not publicly readable by anon).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS payroll_rule_catalog_select ON public.payroll_rule_catalog;
DROP POLICY IF EXISTS payroll_tax_year_config_select ON public.payroll_tax_year_config;

CREATE POLICY payroll_rule_catalog_select ON public.payroll_rule_catalog
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY payroll_tax_year_config_select ON public.payroll_tax_year_config
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.payroll_rule_catalog FROM anon;
REVOKE ALL ON TABLE public.payroll_tax_year_config FROM anon;
REVOKE ALL ON TABLE public.payroll_rule_catalog FROM authenticated;
REVOKE ALL ON TABLE public.payroll_tax_year_config FROM authenticated;
GRANT SELECT ON TABLE public.payroll_rule_catalog TO authenticated;
GRANT SELECT ON TABLE public.payroll_tax_year_config TO authenticated;
GRANT ALL ON TABLE public.payroll_rule_catalog TO service_role;
GRANT ALL ON TABLE public.payroll_tax_year_config TO service_role;
