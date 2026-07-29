-- V3.2.20 — Run in Supabase Dashboard SQL Editor
-- Allows employee DELETE to cascade-remove timeline audit rows (updates stay immutable).

CREATE OR REPLACE FUNCTION prevent_employee_timeline_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'employee_timeline_events is immutable';
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_timeline_immutable ON employee_timeline_events;
CREATE TRIGGER trg_employee_timeline_immutable
  BEFORE UPDATE ON employee_timeline_events
  FOR EACH ROW EXECUTE FUNCTION prevent_employee_timeline_mutation();
