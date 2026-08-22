-- AdminLess Fin — quotation Terms & Conditions.
--
-- Staging findings 1 and 2: quotation Terms & Conditions and the quotation
-- template. Neither existed. The `quotes` table had no terms column and no
-- template field, and nothing in the quote form, preview, print or email
-- rendered any terms — so there was no defect to repair, the capability was
-- absent.
--
-- Modelled on the existing invoice pattern (companies.default_invoice_notes),
-- so quotations behave the way invoices already do:
--
--   companies.default_quote_terms  the standing wording a company applies to
--                                  every new quotation (the "template" text)
--   quotes.terms                   the wording actually issued with THIS quote,
--                                  captured at issue so amending the company
--                                  default never rewrites a quote already sent
--
-- SAFETY: additive and nullable. No existing row changes meaning, no balance,
-- journal or posting is affected, and RLS is inherited from the existing
-- policies on both tables.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_quote_terms text;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS terms text;

COMMENT ON COLUMN public.companies.default_quote_terms IS
  'Standing quotation terms and conditions applied to new quotations. Editable in Settings.';
COMMENT ON COLUMN public.quotes.terms IS
  'Terms and conditions issued with this quotation. Copied from '
  'companies.default_quote_terms when the quote is created, then owned by the '
  'quote — changing the company default never alters a quotation already issued.';
