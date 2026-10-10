-- Payroll Phase 5: UIF declarations, COIDA return of earnings, bank payment files.
--
-- 1. company_payroll_employer_profile: the employer's UIF reference number with the
--    Department of Employment and Labour (e.g. 1234567/8, not the SARS U-number), and COIDA
--    registration number, assessment rate and domestic-employer flag.
-- 2. employees.termination_reason: why employment ended (UIF employment status codes).
-- 3. company_bank_payment_profiles: the paying account and bank file format(s) for salary
--    payment files, with the ACB generation numbers. Written only by the payroll function.
-- 4. statutory_returns: UIF declarations are kept as returns (file sequence, totals).

-- ── 1. Employer registrations ───────────────────────────────────────────────
ALTER TABLE public.company_payroll_employer_profile
  ADD COLUMN IF NOT EXISTS uif_dol_reference text,
  ADD COLUMN IF NOT EXISTS coida_registration_number text,
  ADD COLUMN IF NOT EXISTS coida_rate_percent numeric(6,3),
  ADD COLUMN IF NOT EXISTS coida_domestic_employer boolean NOT NULL DEFAULT false;

ALTER TABLE public.company_payroll_employer_profile DROP CONSTRAINT IF EXISTS employer_profile_uif_dol_reference_format;
ALTER TABLE public.company_payroll_employer_profile ADD CONSTRAINT employer_profile_uif_dol_reference_format
  CHECK (uif_dol_reference IS NULL OR uif_dol_reference ~ '^[0-9]{7,8}$');
ALTER TABLE public.company_payroll_employer_profile DROP CONSTRAINT IF EXISTS employer_profile_coida_rate_valid;
ALTER TABLE public.company_payroll_employer_profile ADD CONSTRAINT employer_profile_coida_rate_valid
  CHECK (coida_rate_percent IS NULL OR (coida_rate_percent >= 0 AND coida_rate_percent <= 100));

COMMENT ON COLUMN public.company_payroll_employer_profile.uif_dol_reference IS
  'UIF reference number issued by the Department of Employment and Labour (digits, check digit last), for the E03 declaration file.';

-- ── 2. Why employment ended ─────────────────────────────────────────────────
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS termination_reason text;
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_termination_reason_valid;
ALTER TABLE public.employees ADD CONSTRAINT employees_termination_reason_valid
  CHECK (termination_reason IS NULL OR termination_reason IN (
    'deceased', 'retired', 'dismissed', 'contract_expired', 'resigned', 'constructive_dismissal',
    'insolvency', 'retrenched', 'transferred', 'absconded', 'business_closed'
  ));

-- ── 3. Bank payment profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_bank_payment_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 60),
  kind text NOT NULL CHECK (kind IN ('acb', 'fnb_obe_acb', 'fnb_obe_csv', 'absa_bio_csv', 'capitec_csv', 'mapped_csv')),
  paying_account_number text NOT NULL CHECK (paying_account_number ~ '^[0-9]{4,16}$'),
  paying_branch_code text NOT NULL CHECK (paying_branch_code ~ '^[0-9]{6}$'),
  paying_account_name text NOT NULL DEFAULT '',
  user_code text CHECK (user_code IS NULL OR user_code ~ '^[A-Za-z0-9]{4}$'),
  abbreviated_name text CHECK (abbreviated_name IS NULL OR length(abbreviated_name) <= 10),
  service_type text NOT NULL DEFAULT 'SAMEDAY' CHECK (service_type IN ('SAMEDAY', 'ONE DAY', 'TWO DAY')),
  entry_class text NOT NULL DEFAULT '61' CHECK (entry_class ~ '^[0-9]{2}$'),
  installation_generation integer NOT NULL DEFAULT 1 CHECK (installation_generation BETWEEN 1 AND 9999),
  user_generation integer NOT NULL DEFAULT 1 CHECK (user_generation BETWEEN 1 AND 9999),
  own_reference text NOT NULL DEFAULT 'SALARY {period}',
  recipient_reference text NOT NULL DEFAULT '{company} SALARY',
  include_hash_total boolean NOT NULL DEFAULT false,
  csv_columns text[] NOT NULL DEFAULT ARRAY['name', 'account_number', 'branch_code', 'amount', 'recipient_reference'],
  csv_header boolean NOT NULL DEFAULT true,
  csv_delimiter text NOT NULL DEFAULT ',' CHECK (csv_delimiter IN (',', ';')),
  csv_amount_style text NOT NULL DEFAULT 'rands' CHECK (csv_amount_style IN ('rands', 'cents', 'rands_no_decimals')),
  csv_date_format text NOT NULL DEFAULT 'YYYYMMDD' CHECK (csv_date_format IN ('YYYYMMDD', 'YYYY-MM-DD', 'DD/MM/YYYY', 'YYYY/MM/DD')),
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_bank_payment_profiles_one_default
  ON public.company_bank_payment_profiles (company_id) WHERE is_default AND active;

ALTER TABLE public.company_bank_payment_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_bank_payment_profiles_select ON public.company_bank_payment_profiles;
CREATE POLICY company_bank_payment_profiles_select ON public.company_bank_payment_profiles
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );
REVOKE ALL ON TABLE public.company_bank_payment_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.company_bank_payment_profiles FROM authenticated;
GRANT SELECT ON TABLE public.company_bank_payment_profiles TO authenticated;
GRANT ALL ON TABLE public.company_bank_payment_profiles TO service_role;

DROP TRIGGER IF EXISTS audit_company_bank_payment_profiles ON public.company_bank_payment_profiles;
CREATE TRIGGER audit_company_bank_payment_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.company_bank_payment_profiles
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

-- ── 4. UIF declarations as returns ──────────────────────────────────────────
ALTER TABLE public.statutory_returns DROP CONSTRAINT IF EXISTS statutory_returns_return_type_check;
ALTER TABLE public.statutory_returns ADD CONSTRAINT statutory_returns_return_type_check
  CHECK (return_type IN ('EMP201', 'EMP501', 'IRP5', 'TAX_CERTIFICATE', 'UIF_DECLARATION'));
