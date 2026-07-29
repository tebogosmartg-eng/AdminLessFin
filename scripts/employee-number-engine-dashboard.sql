-- =============================================================================
-- EMPLOYEE NUMBER ENGINE — DASHBOARD SQL (V3.2.18)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Project: zaulhnpohrgqqodvzhxp (Smart Accounting)
--
-- Execute ALL sections in order. Then run the verification block at the bottom.
-- After success: employees edge function is already deployed (v3.2.18 fix).
-- =============================================================================

-- === MIGRATION 1: 20260703140000_employee_number_engine.sql ===

CREATE TABLE IF NOT EXISTS company_employee_number_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  format_template text NOT NULL DEFAULT 'EMP-{SEQ}',
  sequence_padding integer NOT NULL DEFAULT 6 CHECK (sequence_padding BETWEEN 1 AND 12),
  next_sequence bigint NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_employee_number
  ON employees (company_id, employee_number) WHERE employee_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_employee_number_search
  ON employees (company_id, employee_number text_pattern_ops);

CREATE OR REPLACE FUNCTION format_employee_number(p_template text, p_padding integer, p_sequence bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(p_template, '{SEQ}', lpad(p_sequence::text, p_padding, '0'));
$$;

CREATE OR REPLACE FUNCTION generate_employee_number(p_company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings company_employee_number_settings%ROWTYPE;
  v_number text;
BEGIN
  INSERT INTO company_employee_number_settings (company_id) VALUES (p_company_id) ON CONFLICT (company_id) DO NOTHING;
  SELECT * INTO v_settings FROM company_employee_number_settings WHERE company_id = p_company_id FOR UPDATE;
  v_number := format_employee_number(v_settings.format_template, v_settings.sequence_padding, v_settings.next_sequence);
  UPDATE company_employee_number_settings SET next_sequence = next_sequence + 1, updated_at = now() WHERE company_id = p_company_id;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION sync_employee_sequence_after_import(p_company_id uuid, p_employee_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings company_employee_number_settings%ROWTYPE;
  v_imported_seq bigint;
  v_suffix text;
BEGIN
  INSERT INTO company_employee_number_settings (company_id) VALUES (p_company_id) ON CONFLICT (company_id) DO NOTHING;
  SELECT * INTO v_settings FROM company_employee_number_settings WHERE company_id = p_company_id FOR UPDATE;
  v_suffix := regexp_replace(p_employee_number, '[^0-9]', '', 'g');
  IF v_suffix = '' THEN RETURN; END IF;
  v_imported_seq := v_suffix::bigint;
  IF v_imported_seq >= v_settings.next_sequence THEN
    UPDATE company_employee_number_settings SET next_sequence = v_imported_seq + 1, updated_at = now() WHERE company_id = p_company_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_employee_number_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.employee_number IS NOT NULL AND NEW.employee_number IS DISTINCT FROM OLD.employee_number THEN
    RAISE EXCEPTION 'employee_number cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_employee_number_immutable ON employees;
CREATE TRIGGER trg_employees_employee_number_immutable
  BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION prevent_employee_number_update();

DO $$
DECLARE
  v_company_id uuid;
  v_employee_id uuid;
  v_number text;
BEGIN
  FOR v_company_id IN SELECT DISTINCT company_id FROM employees WHERE employee_number IS NULL
  LOOP
    INSERT INTO company_employee_number_settings (company_id) VALUES (v_company_id) ON CONFLICT (company_id) DO NOTHING;
    FOR v_employee_id IN
      SELECT id FROM employees WHERE company_id = v_company_id AND employee_number IS NULL
      ORDER BY created_at ASC NULLS LAST, id ASC
    LOOP
      v_number := generate_employee_number(v_company_id);
      UPDATE employees SET employee_number = v_number WHERE id = v_employee_id;
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE employees ALTER COLUMN employee_number SET NOT NULL;

ALTER TABLE company_employee_number_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_employee_number_settings_select ON company_employee_number_settings;
CREATE POLICY company_employee_number_settings_select ON company_employee_number_settings
  FOR SELECT USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')));
DROP POLICY IF EXISTS company_employee_number_settings_mutate ON company_employee_number_settings;
CREATE POLICY company_employee_number_settings_mutate ON company_employee_number_settings
  FOR ALL USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')));

-- === MIGRATION 2: 20260703150000_employee_numbering_policy.sql ===

ALTER TABLE company_employee_number_settings
  ADD COLUMN IF NOT EXISTS company_code text,
  ADD COLUMN IF NOT EXISTS branch_code text DEFAULT 'MAIN',
  ADD COLUMN IF NOT EXISTS starting_number bigint NOT NULL DEFAULT 1 CHECK (starting_number >= 1);

CREATE OR REPLACE FUNCTION format_employee_number_from_policy(
  p_template text, p_padding integer, p_sequence bigint,
  p_company_code text DEFAULT NULL, p_branch_code text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE v_result text;
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

CREATE OR REPLACE FUNCTION format_employee_number(p_template text, p_padding integer, p_sequence bigint)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT format_employee_number_from_policy(p_template, p_padding, p_sequence, NULL, NULL);
$$;

CREATE OR REPLACE FUNCTION preview_employee_number(p_company_id uuid, p_sequence bigint DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_settings company_employee_number_settings%ROWTYPE; v_seq bigint;
BEGIN
  SELECT * INTO v_settings FROM company_employee_number_settings WHERE company_id = p_company_id;
  IF NOT FOUND THEN
    v_settings.format_template := 'EMP-{SEQ}'; v_settings.sequence_padding := 6; v_settings.next_sequence := 1;
    v_settings.company_code := NULL; v_settings.branch_code := 'MAIN'; v_seq := 1;
  ELSE v_seq := coalesce(p_sequence, v_settings.next_sequence); END IF;
  RETURN format_employee_number_from_policy(v_settings.format_template, v_settings.sequence_padding, v_seq, v_settings.company_code, v_settings.branch_code);
END;
$$;

CREATE OR REPLACE FUNCTION validate_employee_number_format(p_company_id uuid, p_employee_number text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_employee_number IS NULL OR length(trim(p_employee_number)) = 0 THEN RETURN false; END IF;
  IF NOT (p_employee_number ~ '^[A-Z0-9][A-Z0-9\-]*[0-9]$') THEN RETURN false; END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION generate_employee_number(p_company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_settings company_employee_number_settings%ROWTYPE;
  v_number text;
  v_company_code text;
BEGIN
  INSERT INTO company_employee_number_settings (company_id, starting_number, next_sequence)
  VALUES (p_company_id, 1, 1) ON CONFLICT (company_id) DO NOTHING;
  SELECT ces.* INTO v_settings FROM company_employee_number_settings ces WHERE ces.company_id = p_company_id FOR UPDATE;
  IF v_settings.company_code IS NULL OR trim(v_settings.company_code) = '' THEN
    SELECT upper(left(regexp_replace(c.name, '[^a-zA-Z0-9]', '', 'g'), 3)) INTO v_company_code FROM companies c WHERE c.id = p_company_id;
  ELSE v_company_code := v_settings.company_code; END IF;
  v_number := format_employee_number_from_policy(v_settings.format_template, v_settings.sequence_padding, v_settings.next_sequence, v_company_code, v_settings.branch_code);
  UPDATE company_employee_number_settings SET next_sequence = next_sequence + 1, updated_at = now() WHERE company_id = p_company_id;
  RETURN v_number;
END;
$$;

-- === MIGRATION 3: 20260705180000_employee_identity_platform.sql ===

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'on_leave', 'suspended', 'terminated', 'archived'));

CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees (manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees (company_id, branch) WHERE branch IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_employment_status ON employees (company_id, employment_status);

ALTER TABLE company_employee_number_settings
  ADD COLUMN IF NOT EXISTS qr_style text NOT NULL DEFAULT 'standard' CHECK (qr_style IN ('standard', 'minimal', 'branded')),
  ADD COLUMN IF NOT EXISTS barcode_style text NOT NULL DEFAULT 'code128' CHECK (barcode_style IN ('code128', 'code39')),
  ADD COLUMN IF NOT EXISTS display_format text NOT NULL DEFAULT 'stacked' CHECK (display_format IN ('stacked', 'inline', 'compact', 'number_first'));

CREATE TABLE IF NOT EXISTS employee_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_number text NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_label text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}',
  command_id uuid,
  correlation_id text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_timeline_employee ON employee_timeline_events (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_timeline_company ON employee_timeline_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_timeline_number ON employee_timeline_events (company_id, employee_number);

CREATE OR REPLACE FUNCTION prevent_employee_timeline_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'employee_timeline_events is immutable'; END;
$$;

DROP TRIGGER IF EXISTS trg_employee_timeline_immutable ON employee_timeline_events;
CREATE TRIGGER trg_employee_timeline_immutable
  BEFORE UPDATE OR DELETE ON employee_timeline_events FOR EACH ROW EXECUTE FUNCTION prevent_employee_timeline_mutation();

ALTER TABLE employee_timeline_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_timeline_select ON employee_timeline_events;
CREATE POLICY employee_timeline_select ON employee_timeline_events
  FOR SELECT USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()));
DROP POLICY IF EXISTS employee_timeline_insert ON employee_timeline_events;
CREATE POLICY employee_timeline_insert ON employee_timeline_events
  FOR INSERT WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid() AND cu.role IN ('owner', 'admin')));
DROP POLICY IF EXISTS employee_timeline_service ON employee_timeline_events;
CREATE POLICY employee_timeline_service ON employee_timeline_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_employees_identity_search ON employees USING gin (
  to_tsvector('simple',
    coalesce(employee_number, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' ||
    coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(id_number, '') || ' ' ||
    coalesce(department, '') || ' ' || coalesce(branch, '') || ' ' || coalesce(position, '')
  )
);

-- =============================================================================
-- VERIFICATION (run after main script succeeds)
-- =============================================================================
SELECT
  (SELECT COUNT(*) FROM employees) AS total_employees,
  (SELECT COUNT(*) FROM employees WHERE employee_number IS NOT NULL) AS with_number,
  (SELECT COUNT(*) FROM employees WHERE employee_number IS NULL) AS null_numbers,
  (SELECT COUNT(DISTINCT employee_number) FROM employees) AS distinct_numbers,
  preview_employee_number((SELECT company_id FROM employees LIMIT 1)) AS preview_next_number;

-- Expected: null_numbers = 0, with_number = total_employees, distinct_numbers = total_employees
