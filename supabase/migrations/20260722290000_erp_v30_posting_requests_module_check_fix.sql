-- AdminLess Fin — ERP Blueprint V3.0, Phase 3: fix posting_requests.module CHECK
-- The Phase 2 constraint only allowed the four Phase 2 modules; Phase 3's
-- posting_engine_submit() was widened to accept accounts_payable/fixed_assets
-- but the table constraint was missed, causing every AP/asset posting to fail
-- at the posting_requests insert with a 23514 violation (caught by live testing).

ALTER TABLE public.posting_requests DROP CONSTRAINT IF EXISTS posting_requests_module_check;
ALTER TABLE public.posting_requests ADD CONSTRAINT posting_requests_module_check
  CHECK (module IN (
    'sales_invoice', 'inventory_receipt', 'inventory_issue', 'manual_journal',
    'accounts_payable', 'fixed_assets'
  ));
