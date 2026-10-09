-- Payroll Phase 2d: the statutory returns workspace (ADR-0005).
--
-- 1. statutory_returns: a second person approves a filed return before it is marked
--    submitted (approved_by / approved_at), with the payroll self-approval exception.
-- 2. statutory_return_payments: what was paid to SARS against each return (PRN, amount,
--    date), optionally posted to the ledger. Never deleted; a wrong payment is voided
--    with a reason and its journal reversed.
-- 3. payroll_tax_certificates: IRP5 / IT3(a) certificates issued with a filed EMP501.
--    A certificate number is never reused: corrections cancel the old certificate
--    and issue a new number. Numbers are allocated under a per-company lock.
-- 4. statutory_submission_ledger is written only by the payroll function.
-- All writes go through the payroll function (service role); members only read.

-- ── 1. Approval of filed returns ────────────────────────────────────────────
ALTER TABLE public.statutory_returns
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS self_approved boolean NOT NULL DEFAULT false;

ALTER TABLE public.statutory_returns DROP CONSTRAINT IF EXISTS statutory_returns_return_type_check;
ALTER TABLE public.statutory_returns ADD CONSTRAINT statutory_returns_return_type_check
  CHECK (return_type IN ('EMP201', 'EMP501', 'IRP5', 'TAX_CERTIFICATE'));

-- ── 2. Payments to SARS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.statutory_return_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statutory_return_id uuid NOT NULL REFERENCES public.statutory_returns(id),
  period text NOT NULL CHECK (period ~ '^[0-9]{6}$'),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL,
  payment_reference text NOT NULL CHECK (payment_reference ~ '^[A-Za-z0-9-]{4,40}$'),
  journal_entry_id uuid,
  posting_idempotency_key text,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  CONSTRAINT statutory_return_payments_void_reason CHECK (voided_at IS NULL OR length(trim(void_reason)) >= 10)
);

CREATE INDEX IF NOT EXISTS idx_statutory_return_payments_return
  ON public.statutory_return_payments (statutory_return_id);
CREATE INDEX IF NOT EXISTS idx_statutory_return_payments_company_period
  ON public.statutory_return_payments (company_id, period);

-- ── 3. Tax certificates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_tax_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statutory_return_id uuid NOT NULL REFERENCES public.statutory_returns(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  year_of_assessment integer NOT NULL CHECK (year_of_assessment BETWEEN 2000 AND 2100),
  period text NOT NULL CHECK (period ~ '^[0-9]{6}$'),
  certificate_type text NOT NULL CHECK (certificate_type IN ('IRP5', 'IT3A')),
  certificate_number text NOT NULL CHECK (certificate_number ~ '^[0-9A-Za-z]{30}$'),
  sequence integer NOT NULL CHECK (sequence > 0),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  cancelled_at timestamptz,
  cancelled_reason text,
  replaced_by uuid REFERENCES public.payroll_tax_certificates(id),
  certificate_data jsonb NOT NULL,
  content_hash text NOT NULL,
  issued_by uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_tax_certificates_number_unique UNIQUE (company_id, certificate_number)
);

CREATE INDEX IF NOT EXISTS idx_payroll_tax_certificates_return
  ON public.payroll_tax_certificates (statutory_return_id);
CREATE INDEX IF NOT EXISTS idx_payroll_tax_certificates_employee
  ON public.payroll_tax_certificates (company_id, employee_id, year_of_assessment);

-- Issued certificates are records: only cancellation may be recorded, and nothing is deleted.
CREATE OR REPLACE FUNCTION public.payroll_tax_certificates_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TAX_CERTIFICATE_IMMUTABLE: tax certificates cannot be deleted; cancel and replace instead';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'cancelled_at' - 'cancelled_reason' - 'replaced_by')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'cancelled_at' - 'cancelled_reason' - 'replaced_by') THEN
    RAISE EXCEPTION 'TAX_CERTIFICATE_IMMUTABLE: an issued certificate cannot change; cancel and replace it';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'TAX_CERTIFICATE_IMMUTABLE: a cancelled certificate cannot be reinstated';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_tax_certificates_guard ON public.payroll_tax_certificates;
CREATE TRIGGER payroll_tax_certificates_guard
  BEFORE UPDATE OR DELETE ON public.payroll_tax_certificates
  FOR EACH ROW EXECUTE FUNCTION public.payroll_tax_certificates_guard();

-- Payments: only voiding may be recorded, and nothing is deleted.
CREATE OR REPLACE FUNCTION public.statutory_return_payments_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'STATUTORY_PAYMENT_IMMUTABLE: payments cannot be deleted; void them with a reason';
  END IF;
  IF (to_jsonb(NEW) - 'voided_at' - 'voided_by' - 'void_reason')
     IS DISTINCT FROM (to_jsonb(OLD) - 'voided_at' - 'voided_by' - 'void_reason') THEN
    RAISE EXCEPTION 'STATUTORY_PAYMENT_IMMUTABLE: a recorded payment cannot change; void it and record it again';
  END IF;
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'STATUTORY_PAYMENT_IMMUTABLE: the payment is already voided';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS statutory_return_payments_guard ON public.statutory_return_payments;
CREATE TRIGGER statutory_return_payments_guard
  BEFORE UPDATE OR DELETE ON public.statutory_return_payments
  FOR EACH ROW EXECUTE FUNCTION public.statutory_return_payments_guard();

-- Issues the certificates of one filed EMP501 in one transaction. Sequence numbers
-- continue from the highest ever used for the prefix (cancelled ones included), so a
-- number is never handed out twice. p_certificates: [{employee_id, certificate_type,
-- certificate_data, content_hash}]; the number is p_prefix followed by the sequence,
-- zero-padded to 30 characters.
CREATE OR REPLACE FUNCTION public.payroll_issue_tax_certificates(
  p_company_id uuid,
  p_return_id uuid,
  p_prefix text,
  p_year_of_assessment integer,
  p_period text,
  p_actor uuid,
  p_certificates jsonb
)
RETURNS SETOF public.payroll_tax_certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  v_cert jsonb;
  v_width integer := 30 - length(p_prefix);
BEGIN
  IF p_prefix !~ '^[0-9]{16}$' THEN
    RAISE EXCEPTION 'CERTIFICATE_PREFIX_INVALID: expected the 10-digit PAYE reference, the 4-digit year and the 2-digit month';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM statutory_returns WHERE id = p_return_id AND company_id = p_company_id AND return_type = 'EMP501') THEN
    RAISE EXCEPTION 'CERTIFICATE_RETURN_INVALID: the EMP501 does not belong to this company';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('payroll_tax_certificates:' || p_company_id::text));
  SELECT COALESCE(MAX(sequence), 0) + 1 INTO v_next
    FROM payroll_tax_certificates
   WHERE company_id = p_company_id AND left(certificate_number, 16) = p_prefix;
  FOR v_cert IN SELECT * FROM jsonb_array_elements(p_certificates) LOOP
    RETURN QUERY
      INSERT INTO payroll_tax_certificates (
        company_id, statutory_return_id, employee_id, year_of_assessment, period,
        certificate_type, certificate_number, sequence, certificate_data, content_hash, issued_by
      ) VALUES (
        p_company_id, p_return_id, (v_cert->>'employee_id')::uuid, p_year_of_assessment, p_period,
        v_cert->>'certificate_type', p_prefix || lpad(v_next::text, v_width, '0'), v_next,
        v_cert->'certificate_data', v_cert->>'content_hash', p_actor
      )
      RETURNING *;
    v_next := v_next + 1;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.payroll_issue_tax_certificates(uuid, uuid, text, integer, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payroll_issue_tax_certificates(uuid, uuid, text, integer, text, uuid, jsonb) TO service_role;

-- ── Access: owners and admins read; only the payroll function writes ───────
ALTER TABLE public.statutory_return_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_tax_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS statutory_return_payments_select ON public.statutory_return_payments;
CREATE POLICY statutory_return_payments_select ON public.statutory_return_payments
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS payroll_tax_certificates_select ON public.payroll_tax_certificates;
CREATE POLICY payroll_tax_certificates_select ON public.payroll_tax_certificates
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

REVOKE ALL ON TABLE public.statutory_return_payments FROM anon;
REVOKE ALL ON TABLE public.payroll_tax_certificates FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.statutory_return_payments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.payroll_tax_certificates FROM authenticated;
GRANT SELECT ON TABLE public.statutory_return_payments TO authenticated;
GRANT SELECT ON TABLE public.payroll_tax_certificates TO authenticated;
GRANT ALL ON TABLE public.statutory_return_payments TO service_role;
GRANT ALL ON TABLE public.payroll_tax_certificates TO service_role;

-- The submission ledger is evidence: written by the payroll function only.
DROP POLICY IF EXISTS statutory_submission_ledger_insert ON public.statutory_submission_ledger;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.statutory_submission_ledger FROM anon, authenticated;
GRANT ALL ON TABLE public.statutory_submission_ledger TO service_role;

DROP TRIGGER IF EXISTS audit_statutory_return_payments ON public.statutory_return_payments;
CREATE TRIGGER audit_statutory_return_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.statutory_return_payments
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

DROP TRIGGER IF EXISTS audit_payroll_tax_certificates ON public.payroll_tax_certificates;
CREATE TRIGGER audit_payroll_tax_certificates
  AFTER INSERT OR UPDATE OR DELETE ON public.payroll_tax_certificates
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();
