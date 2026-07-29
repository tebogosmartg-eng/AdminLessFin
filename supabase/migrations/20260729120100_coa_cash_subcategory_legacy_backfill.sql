-- One-time legacy backfill: cash-equivalent subcategory for accounts that
-- lack CoA engine metadata (e.g. certification tenant account named "Bank").
-- Runtime identity uses subcategory — never display name.

UPDATE public.chart_of_accounts
SET subcategory = 'Cash and Cash Equivalents',
    category = COALESCE(NULLIF(category, type::text), 'Current Assets')
WHERE type = 'Asset'
  AND subcategory IS NULL
  AND account_role IS NULL
  AND (
    lower(trim(name)) IN ('bank', 'cash', 'petty cash', 'cash on hand')
    OR name ~* '^(bank|cash|petty\s*cash|checking|savings)\b'
    OR name ~* '\bbank\s*-\s*current\b'
  );
