-- ============================================================================
-- invoices.status is an ENUM (invoice_status), not text.
--
-- Two consequences the allocation engine has to respect:
--
--   1. 'partially_paid' did not exist as a value, so deriving that status would
--      have failed at the UPDATE. It is added here.
--   2. Comparing the column against a label the type does not have is not
--      false — it is an ERROR ("invalid input value for enum invoice_status").
--      The first version compared against 'cancelled' and 'overdue', neither of
--      which this type has, so the FIFO branch and the guard would have thrown
--      on perfectly ordinary input.
--
-- Every status comparison below therefore casts to text. A cast comparison is
-- merely false for a label that does not exist, which is what the code means,
-- and it stays correct if the type gains or loses values later.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'invoice_status' AND e.enumlabel = 'partially_paid'
    ) THEN
      ALTER TYPE invoice_status ADD VALUE 'partially_paid';
    END IF;
  END IF;
END $$;
