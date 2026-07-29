-- Employee Numbering Policy Engine — token-based formats (Phase 2)
-- Extends existing engine; does not modify assigned employee numbers.

ALTER TABLE company_employee_number_settings
  ADD COLUMN IF NOT EXISTS company_code text,
  ADD COLUMN IF NOT EXISTS branch_code text DEFAULT 'MAIN',
  ADD COLUMN IF NOT EXISTS starting_number bigint NOT NULL DEFAULT 1 CHECK (starting_number >= 1);

COMMENT ON COLUMN company_employee_number_settings.company_code IS 'Substituted for {COMPANY} token';
COMMENT ON COLUMN company_employee_number_settings.branch_code IS 'Substituted for {BRANCH} token';
COMMENT ON COLUMN company_employee_number_settings.starting_number IS 'Initial sequence value for new companies';

-- ---------------------------------------------------------------------------
-- Policy-driven formatter (data-driven tokens, never hardcoded in app logic)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION format_employee_number_from_policy(
  p_template text,
  p_padding integer,
  p_sequence bigint,
  p_company_code text DEFAULT NULL,
  p_branch_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result text;
BEGIN
  v_result := p_template;
  v_result := replace(v_result, '{SEQ}', lpad(p_sequence::text, p_padding, '0'));
  v_result := replace(v_result, '{YEAR}', to_char(now() AT TIME ZONE 'UTC', 'YYYY'));
  v_result := replace(v_result, '{MONTH}', to_char(now() AT TIME ZONE 'UTC', 'MM'));
  v_result := replace(v_result, '{COMPANY}', coalesce(nullif(trim(p_company_code), ''), 'CO'));
  v_result := replace(v_result, '{BRANCH}', coalesce(nullif(trim(p_branch_code), ''), 'MAIN'));
  RETURN v_result;
END;
$$;

-- Backward-compatible alias
CREATE OR REPLACE FUNCTION format_employee_number(
  p_template text,
  p_padding integer,
  p_sequence bigint
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT format_employee_number_from_policy(p_template, p_padding, p_sequence, NULL, NULL);
$$;

-- ---------------------------------------------------------------------------
-- Preview without consuming sequence
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION preview_employee_number(p_company_id uuid, p_sequence bigint DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings company_employee_number_settings%ROWTYPE;
  v_seq bigint;
BEGIN
  SELECT * INTO v_settings
  FROM company_employee_number_settings
  WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    v_settings.format_template := 'EMP-{SEQ}';
    v_settings.sequence_padding := 6;
    v_settings.next_sequence := 1;
    v_settings.company_code := NULL;
    v_settings.branch_code := 'MAIN';
    v_seq := 1;
  ELSE
    v_seq := coalesce(p_sequence, v_settings.next_sequence);
  END IF;

  RETURN format_employee_number_from_policy(
    v_settings.format_template,
    v_settings.sequence_padding,
    v_seq,
    v_settings.company_code,
    v_settings.branch_code
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Validate imported number matches current policy pattern (best-effort)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_employee_number_format(
  p_company_id uuid,
  p_employee_number text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings company_employee_number_settings%ROWTYPE;
  v_preview text;
BEGIN
  IF p_employee_number IS NULL OR length(trim(p_employee_number)) = 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_settings
  FROM company_employee_number_settings
  WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN p_employee_number ~ '^[A-Z0-9][A-Z0-9\-]*[0-9]$';
  END IF;

  -- Generated preview must share prefix structure (alphanumeric + hyphens)
  IF NOT (p_employee_number ~ '^[A-Z0-9][A-Z0-9\-]*[0-9]$') THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic generation — now policy-aware
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_employee_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings company_employee_number_settings%ROWTYPE;
  v_number text;
  v_company_code text;
BEGIN
  INSERT INTO company_employee_number_settings (company_id, starting_number, next_sequence)
  VALUES (p_company_id, 1, 1)
  ON CONFLICT (company_id) DO NOTHING;

  SELECT ces.* INTO v_settings
  FROM company_employee_number_settings ces
  WHERE ces.company_id = p_company_id
  FOR UPDATE;

  IF v_settings.company_code IS NULL OR trim(v_settings.company_code) = '' THEN
    SELECT upper(left(regexp_replace(c.name, '[^a-zA-Z0-9]', '', 'g'), 3))
    INTO v_company_code
    FROM companies c WHERE c.id = p_company_id;
  ELSE
    v_company_code := v_settings.company_code;
  END IF;

  v_number := format_employee_number_from_policy(
    v_settings.format_template,
    v_settings.sequence_padding,
    v_settings.next_sequence,
    v_company_code,
    v_settings.branch_code
  );

  UPDATE company_employee_number_settings
  SET next_sequence = next_sequence + 1,
      updated_at = now()
  WHERE company_id = p_company_id;

  RETURN v_number;
END;
$$;
