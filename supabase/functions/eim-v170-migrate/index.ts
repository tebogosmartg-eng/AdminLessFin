// @ts-nocheck
/**
 * One-shot V17.0 schema apply — runs inside Supabase network via SUPABASE_DB_URL.
 * Safe to re-run (IF NOT EXISTS). Remove after certification if desired.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js"
import {
  ENTERPRISE_CORS_HEADERS,
  withEnterprisePlatform,
  edgeFailure,
} from '../_shared/enterpriseEdgePlatform.ts'

const corsHeaders = ENTERPRISE_CORS_HEADERS

const SQL = `
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS item_class text NOT NULL DEFAULT 'finished_good',
  ADD COLUMN IF NOT EXISTS uom text NOT NULL DEFAULT 'EA',
  ADD COLUMN IF NOT EXISTS cost_method text NOT NULL DEFAULT 'weighted_average',
  ADD COLUMN IF NOT EXISTS standard_cost numeric(18,6),
  ADD COLUMN IF NOT EXISTS category_name text,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_rate_id uuid,
  ADD COLUMN IF NOT EXISTS inventory_asset_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variance_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS reorder_level numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_asset_id uuid REFERENCES fixed_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE products
SET item_class = CASE WHEN type = 'service' THEN 'service' ELSE COALESCE(NULLIF(item_class, ''), 'finished_good') END;

UPDATE products
SET sku = COALESCE(NULLIF(sku, ''), 'SKU-' || LEFT(REPLACE(id::text, '-', ''), 8))
WHERE sku IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku
  ON products(company_id, sku) WHERE sku IS NOT NULL;

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS unit_cost numeric(18,6),
  ADD COLUMN IF NOT EXISTS total_cost numeric(18,2),
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS cost_method text,
  ADD COLUMN IF NOT EXISTS source_doc_type text,
  ADD COLUMN IF NOT EXISTS source_doc_id uuid;

CREATE TABLE IF NOT EXISTS inv_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS inv_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'bin',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS inv_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id) ON DELETE CASCADE,
  location_id uuid REFERENCES inv_locations(id) ON DELETE SET NULL,
  qty_on_hand numeric(18,4) NOT NULL DEFAULT 0,
  qty_reserved numeric(18,4) NOT NULL DEFAULT 0,
  avg_unit_cost numeric(18,6) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_balances_unique
  ON inv_balances (company_id, product_id, warehouse_id, (COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)));

CREATE TABLE IF NOT EXISTS inv_cost_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id) ON DELETE CASCADE,
  qty_remaining numeric(18,4) NOT NULL DEFAULT 0,
  unit_cost numeric(18,6) NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  source_doc_type text,
  source_doc_id uuid,
  lot_code text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_cost_layers_fifo
  ON inv_cost_layers (company_id, product_id, warehouse_id, received_at)
  WHERE status = 'open' AND qty_remaining > 0;

CREATE TABLE IF NOT EXISTS inv_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transfer_number text NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty numeric(18,4) NOT NULL,
  from_warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id),
  to_warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id),
  from_location_id uuid REFERENCES inv_locations(id),
  to_location_id uuid REFERENCES inv_locations(id),
  status text NOT NULL DEFAULT 'completed',
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, transfer_number)
);

CREATE TABLE IF NOT EXISTS inv_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id) ON DELETE CASCADE,
  qty numeric(18,4) NOT NULL,
  status text NOT NULL DEFAULT 'open',
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE TABLE IF NOT EXISTS inv_cycle_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  count_number text NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id),
  location_id uuid REFERENCES inv_locations(id),
  count_type text NOT NULL DEFAULT 'cycle',
  status text NOT NULL DEFAULT 'draft',
  count_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid,
  posted_at timestamptz,
  journal_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, count_number)
);

CREATE TABLE IF NOT EXISTS inv_cycle_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  count_id uuid NOT NULL REFERENCES inv_cycle_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  system_qty numeric(18,4) NOT NULL DEFAULT 0,
  counted_qty numeric(18,4),
  unit_cost numeric(18,6) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inv_goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  purchase_order_id uuid,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id),
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  journal_entry_id uuid,
  bill_id uuid,
  capitalise_to_asset boolean NOT NULL DEFAULT false,
  acquisition_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS inv_goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES inv_goods_receipts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES inv_locations(id),
  qty_ordered numeric(18,4) NOT NULL DEFAULT 0,
  qty_received numeric(18,4) NOT NULL DEFAULT 0,
  unit_cost numeric(18,6) NOT NULL DEFAULT 0,
  po_line_id uuid,
  notes text
);

CREATE TABLE IF NOT EXISTS inv_cost_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES inv_warehouses(id),
  adjustment_type text NOT NULL,
  qty numeric(18,4) NOT NULL DEFAULT 0,
  unit_cost_from numeric(18,6),
  unit_cost_to numeric(18,6),
  amount numeric(18,2) NOT NULL DEFAULT 0,
  reason text,
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inv_uom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_base boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

ALTER TABLE inv_balances DROP CONSTRAINT IF EXISTS inv_balances_qty_on_hand_nonneg;
ALTER TABLE inv_balances ADD CONSTRAINT inv_balances_qty_on_hand_nonneg CHECK (qty_on_hand >= 0);
ALTER TABLE inv_balances DROP CONSTRAINT IF EXISTS inv_balances_qty_reserved_nonneg;
ALTER TABLE inv_balances ADD CONSTRAINT inv_balances_qty_reserved_nonneg CHECK (qty_reserved >= 0);
ALTER TABLE inv_cost_layers DROP CONSTRAINT IF EXISTS inv_cost_layers_qty_remaining_nonneg;
ALTER TABLE inv_cost_layers ADD CONSTRAINT inv_cost_layers_qty_remaining_nonneg CHECK (qty_remaining >= 0);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_date ON inventory_transactions (company_id, transaction_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product ON inventory_transactions (company_id, product_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_balances_company_product ON inv_balances (company_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inv_goods_receipts_company_created ON inv_goods_receipts (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_company_created ON inv_transfers (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_cycle_counts_company_created ON inv_cycle_counts (company_id, created_at DESC);

ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_warehouse_id_fkey;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_warehouse_id_fkey
  FOREIGN KEY (warehouse_id) REFERENCES inv_warehouses(id) ON DELETE SET NULL;
ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_location_id_fkey;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES inv_locations(id) ON DELETE SET NULL;
ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_journal_entry_id_fkey;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_journal_entry_id_fkey
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inv_warehouses', 'inv_locations', 'inv_balances', 'inv_cost_layers',
    'inv_transfers', 'inv_reservations', 'inv_cycle_counts', 'inv_cycle_count_lines',
    'inv_goods_receipts', 'inv_goods_receipt_lines', 'inv_cost_adjustments', 'inv_uom'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))',
      t || '_select', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid())) WITH CHECK (company_id IN (SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()))',
      t || '_all', t
    );
  END LOOP;
END $$;
`

serve(withEnterprisePlatform('eim-v170-migrate', 'system', async (_req, _ctx) => {
  try {
    const dbUrl = Deno.env.get('SUPABASE_DB_URL')
    if (!dbUrl) throw new Error('SUPABASE_DB_URL not configured')
    const sql = postgres(dbUrl, { max: 1, idle_timeout: 5 })
    try {
      await sql.unsafe(SQL)
      const check = await sql`
        SELECT to_regclass('public.inv_warehouses') AS warehouses,
               to_regclass('public.inv_balances') AS balances,
               to_regclass('public.inv_goods_receipts') AS receipts
      `
      return new Response(JSON.stringify({ ok: true, check: check[0] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } finally {
      await sql.end({ timeout: 5 })
    }
  } catch (error) {
    return edgeFailure(_ctx, error)
  }
}))
