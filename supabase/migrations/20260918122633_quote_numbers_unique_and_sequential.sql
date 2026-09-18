-- Quote numbers must be unique per company and sequential for QTE-#####.
--
-- The previous get_next_quote_number_for_user took the most recently created
-- quote, then parsed a QTE- integer out of it. A probe quote numbered
-- QDOC-<timestamp> became "the last quote", the parse returned NULL, and the
-- next number collapsed to QTE-00001 -- which already existed. There was no
-- unique constraint, so the duplicate saved.
--
-- Numbering now takes MAX(QTE-n) for the company (bigint, other prefixes
-- ignored). Existing duplicates are remapped, then uniqueness is enforced.

CREATE OR REPLACE FUNCTION public.get_next_quote_number(p_company_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'QTE-' || lpad(
    (COALESCE(MAX(substring(quote_number FROM '^QTE-(\d{1,9})$')::bigint), 0) + 1)::text,
    5,
    '0'
  )
  FROM public.quotes
  WHERE company_id = p_company_id;
$$;

COMMENT ON FUNCTION public.get_next_quote_number(uuid) IS
  'Next QTE-##### for a company. Ignores non-QTE references (QDOC-, CLOSURE-Q-, …).';

CREATE OR REPLACE FUNCTION public.get_next_quote_number_for_user()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT active_company_id INTO v_company_id FROM public.profiles WHERE id = auth.uid();
  IF v_company_id IS NULL THEN
    RETURN 'QTE-00001';
  END IF;
  RETURN public.get_next_quote_number(v_company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_next_quote_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_quote_number(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_quote_number_for_user() TO authenticated, service_role;

-- Keep the earliest quote of each duplicated number; later copies get the next
-- free QTE-##### so the unique index can be created.
DO $$
DECLARE
  r record;
  v_next text;
BEGIN
  FOR r IN
    SELECT id, company_id
    FROM (
      SELECT
        id,
        company_id,
        row_number() OVER (
          PARTITION BY company_id, lower(quote_number)
          ORDER BY created_at ASC NULLS LAST, quote_date ASC NULLS LAST, id ASC
        ) AS rn
      FROM public.quotes
    ) d
    WHERE rn > 1
  LOOP
    v_next := public.get_next_quote_number(r.company_id);
    UPDATE public.quotes SET quote_number = v_next WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_company_number_key
  ON public.quotes (company_id, lower(quote_number));
