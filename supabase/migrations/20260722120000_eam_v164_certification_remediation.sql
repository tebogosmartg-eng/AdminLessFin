-- AdminLess Fin V16.4 — EAM certification remediation (additive only)
-- Asset numbering sequences + allocation RPCs. No changes to depreciation / dispose / JE logic.

CREATE TABLE IF NOT EXISTS asset_code_sequences (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  seq_year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, seq_year)
);

CREATE INDEX IF NOT EXISTS idx_asset_code_sequences_company ON asset_code_sequences(company_id);

CREATE OR REPLACE FUNCTION allocate_asset_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer := extract(year from current_date)::int;
  n integer;
BEGIN
  LOOP
    UPDATE asset_code_sequences
    SET last_number = last_number + 1, updated_at = now()
    WHERE company_id = p_company_id AND seq_year = y
    RETURNING last_number INTO n;
    IF FOUND THEN
      RETURN format('AST-%s-%s', y, lpad(n::text, 6, '0'));
    END IF;
    BEGIN
      INSERT INTO asset_code_sequences (company_id, seq_year, last_number)
      VALUES (p_company_id, y, 1);
      RETURN format('AST-%s-%s', y, lpad('1', 6, '0'));
    EXCEPTION
      WHEN unique_violation THEN
        -- concurrent insert; retry
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION peek_next_asset_code(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer := extract(year from current_date)::int;
  n integer;
BEGIN
  SELECT last_number INTO n
  FROM asset_code_sequences
  WHERE company_id = p_company_id AND seq_year = y;
  n := COALESCE(n, 0) + 1;
  RETURN format('AST-%s-%s', y, lpad(n::text, 6, '0'));
END;
$$;

COMMENT ON TABLE asset_code_sequences IS 'V16.4 per-company sequential asset codes (AST-YYYY-NNNNNN).';
COMMENT ON FUNCTION allocate_asset_code IS 'Atomically allocates next company asset code.';
COMMENT ON FUNCTION peek_next_asset_code IS 'Preview next code without consuming sequence.';
