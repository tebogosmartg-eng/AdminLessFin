-- Payroll Phase 2a: employer details for SARS (EMP201 and the EMP501 reconciliation).
--
-- One row per company, holding the employer record of the SARS reconciliation file
-- (codes 2010–2083 in SARS_PAYE_BRS - PAYE Employer Reconciliation V25.3.0). The full
-- SARS validation (check digits, matching reference numbers, SIC7 list, contact and
-- address rules) runs in the payroll function; the checks below guard the formats.
--
-- Owners and admins can read it; it is changed only through the payroll function.

CREATE TABLE IF NOT EXISTS public.company_payroll_employer_profile (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  trading_name text NOT NULL CHECK (length(btrim(trading_name)) BETWEEN 1 AND 90),
  paye_reference text NOT NULL CHECK (paye_reference ~ '^[0-9]{10}$'),
  sdl_reference text CHECK (sdl_reference IS NULL OR sdl_reference ~ '^L[0-9]{9}$'),
  uif_reference text CHECK (uif_reference IS NULL OR uif_reference ~ '^U[0-9]{9}$'),
  contact_first_name text NOT NULL CHECK (length(btrim(contact_first_name)) BETWEEN 1 AND 50),
  contact_surname text NOT NULL CHECK (length(btrim(contact_surname)) BETWEEN 1 AND 50),
  contact_position text CHECK (contact_position IS NULL OR length(contact_position) <= 50),
  contact_business_phone text CHECK (contact_business_phone IS NULL OR contact_business_phone ~ '^0[0-9]{9,14}$'),
  contact_cell_phone text CHECK (contact_cell_phone IS NULL OR contact_cell_phone ~ '^0[0-9]{9,14}$'),
  contact_fax text CHECK (contact_fax IS NULL OR contact_fax ~ '^0[0-9]{9,14}$'),
  contact_email text CHECK (contact_email IS NULL OR length(contact_email) <= 70),
  diplomatic_indemnity boolean NOT NULL DEFAULT false,
  sic7_code text NOT NULL CHECK (sic7_code ~ '^[0-9]{5}$'),
  address_unit_number text CHECK (address_unit_number IS NULL OR length(address_unit_number) <= 8),
  address_complex text CHECK (address_complex IS NULL OR length(address_complex) <= 26),
  address_street_number text CHECK (address_street_number IS NULL OR length(address_street_number) <= 8),
  address_street_name text NOT NULL CHECK (length(btrim(address_street_name)) BETWEEN 1 AND 26),
  address_suburb text CHECK (address_suburb IS NULL OR length(address_suburb) <= 33),
  address_city text CHECK (address_city IS NULL OR length(address_city) <= 21),
  address_postal_code text NOT NULL CHECK (address_postal_code ~ '^[0-9]{4}$' AND address_postal_code <> '0000'),
  address_country text NOT NULL DEFAULT 'ZA' CHECK (address_country ~ '^[A-Z]{2}$'),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (contact_business_phone IS NOT NULL OR contact_cell_phone IS NOT NULL),
  CHECK (address_suburb IS NOT NULL OR address_city IS NOT NULL)
);

COMMENT ON TABLE public.company_payroll_employer_profile IS
  'Employer record for SARS payroll returns (EMP201, EMP501). Changed through the payroll function only.';

ALTER TABLE public.company_payroll_employer_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_payroll_employer_profile_read ON public.company_payroll_employer_profile;
CREATE POLICY company_payroll_employer_profile_read ON public.company_payroll_employer_profile
  FOR SELECT USING (public.is_admin_of(company_id));
REVOKE ALL ON TABLE public.company_payroll_employer_profile FROM anon, public, authenticated;
GRANT SELECT ON TABLE public.company_payroll_employer_profile TO authenticated;
GRANT ALL ON TABLE public.company_payroll_employer_profile TO service_role;

DROP TRIGGER IF EXISTS audit_company_payroll_employer_profile ON public.company_payroll_employer_profile;
CREATE TRIGGER audit_company_payroll_employer_profile
  AFTER INSERT OR UPDATE OR DELETE ON public.company_payroll_employer_profile
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
