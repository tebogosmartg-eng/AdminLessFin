-- Employee Number Engine: permanent HR identifiers per company
-- Atomic sequence generation, immutable numbers, backfill for existing rows

-- ---------------------------------------------------------------------------
-- Company format & sequence (one row per company)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_employee_number_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  format_template text NOT NULL DEFAULT 'EMP-{SEQ}',
  sequence_padding integer NOT NULL DEFAULT 6 CHECK (sequence_padding BETWEEN 1 AND 12),
  next_sequence bigint NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE company_employee_number_settings IS
  'Per-company employee number format and monotonic sequence. Numbers are never recycled.';
COMMENT ON COLUMN company_employee_number_settings.format_template IS
  'Template with {SEQ} placeholder, e.g. EMP-{SEQ}, SPC-EMP-{SEQ}, ABC-{SEQ}';

-- ---------------------------------------------------------------------------
-- employee_number column on employees
-- ---------------------------------------------------------------------------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_employee_number
  ON employees (company_id, employee_number)
  WHERE employee_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_employee_number_search
  ON employees (company_id, employee_number text_pattern_ops);

-- ---------------------------------------------------------------------------
-- Format helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION format_employee_number(
  p_template text,
  p_padding integer,
  p_sequence bigint
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(p_template, '{SEQ}', lpad(p_sequence::text, p_padding, '0'));
$$;

-- ---------------------------------------------------------------------------
-- Atomic number generation (concurrency-safe via row lock)
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
BEGIN
  INSERT INTO company_employee_number_settings (company_id)
  VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  SELECT * INTO v_settings
  FROM company_employee_number_settings
  WHERE company_id = p_company_id
  FOR UPDATE;

  v_number := format_employee_number(
    v_settings.format_template,
    v_settings.sequence_padding,
    v_settings.next_sequence
  );

  UPDATE company_employee_number_settings
  SET next_sequence = next_sequence + 1,
      updated_at = now()
  WHERE company_id = p_company_id;

  RETURN v_number;
END;
$$;

-- ---------------------------------------------------------------------------
-- Advance sequence when an explicit number is imported (never recycle)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_employee_sequence_after_import(
  p_company_id uuid,
  p_employee_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings company_employee_number_settings%ROWTYPE;
  v_imported_seq bigint;
  v_suffix text;
BEGIN
  INSERT INTO company_employee_number_settings (company_id)
  VALUES (p_company_id)
  ON CONFLICT (company_id) DO NOTHING;

  SELECT * INTO v_settings
  FROM company_employee_number_settings
  WHERE company_id = p_company_id
  FOR UPDATE;

  v_suffix := regexp_replace(p_employee_number, '[^0-9]', '', 'g');
  IF v_suffix = '' THEN
    RETURN;
  END IF;

  v_imported_seq := v_suffix::bigint;

  IF v_imported_seq >= v_settings.next_sequence THEN
    UPDATE company_employee_number_settings
    SET next_sequence = v_imported_seq + 1,
        updated_at = now()
    WHERE company_id = p_company_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Immutability: employee_number cannot be changed after assignment
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_employee_number_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.employee_number IS NOT NULL
     AND NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'employee_number cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_employee_number_immutable ON employees;
CREATE TRIGGER trg_employees_employee_number_immutable
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION prevent_employee_number_update();

-- ---------------------------------------------------------------------------
-- Backfill existing employees (ordered by created_at, never recycle)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_company_id uuid;
  v_employee_id uuid;
  v_number text;
BEGIN
  FOR v_company_id IN
    SELECT DISTINCT company_id FROM employees WHERE employee_number IS NULL
  LOOP
    INSERT INTO company_employee_number_settings (company_id)
    VALUES (v_company_id)
    ON CONFLICT (company_id) DO NOTHING;

    FOR v_employee_id IN
      SELECT id FROM employees
      WHERE company_id = v_company_id AND employee_number IS NULL
      ORDER BY created_at ASC NULLS LAST, id ASC
    LOOP
      v_number := generate_employee_number(v_company_id);
      UPDATE employees SET employee_number = v_number WHERE id = v_employee_id;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE employees
  ALTER COLUMN employee_number SET NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS for settings (admins only)
-- ---------------------------------------------------------------------------
ALTER TABLE company_employee_number_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_employee_number_settings_select ON company_employee_number_settings;
CREATE POLICY company_employee_number_settings_select ON company_employee_number_settings
  FOR SELECT USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS company_employee_number_settings_mutate ON company_employee_number_settings;
CREATE POLICY company_employee_number_settings_mutate ON company_employee_number_settings
  FOR ALL USING (
    company_id IN (
      SELECT cu.company_id FROM company_users cu
      WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')
    )
  );
