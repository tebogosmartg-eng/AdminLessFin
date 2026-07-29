-- P0 follow-up: least-privilege grants (authenticated SELECT only on catalogues/sequences)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.asset_code_sequences FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payroll_rule_catalog FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payroll_tax_year_config FROM authenticated;
GRANT SELECT ON TABLE public.asset_code_sequences TO authenticated;
GRANT SELECT ON TABLE public.payroll_rule_catalog TO authenticated;
GRANT SELECT ON TABLE public.payroll_tax_year_config TO authenticated;
