-- AdminLess Fin V17.0 — Enterprise Inventory & Cost Management
-- Additive only. Does NOT alter journal engine, GL schema, assets, or existing product CRUD contracts.

-- ── Extend products (item master) ────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS item_class text NOT NULL DEFAULT 'finished_good'
    CHECK (item_class IN (
      'raw_material', 'finished_good', 'consumable', 'service', 'non_stock', 'asset_linked'
    )),
  ADD COLUMN IF NOT EXISTS uom text NOT NULL DEFAULT 'EA',
  ADD COLUMN IF NOT EXISTS cost_method text NOT NULL DEFAULT 'weighted_average'
    CHECK (cost_method IN ('fifo', 'weighted_average', 'standard', 'specific')),
  ADD COLUMN IF NOT EXISTS standard_cost numeric(18,6),
  ADD COLUMN IF NOT EXISTS category_name text,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_rate_id uuid,
  ADD COLUMN IF NOT EXISTS inventory_asset_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variance_account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'active'
    CHECK (stock_status IN ('active', 'inactive', 'discontinued', 'quarantine')),
  ADD COLUMN IF NOT EXISTS reorder_level numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_asset_id uuid REFERENCES fixed_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill item_class from legacy type
UPDATE products
SET item_class = CASE WHEN type = 'service' THEN 'service' ELSE 'finished_good' END
WHERE item_class IS NULL OR (type = 'service' AND item_class = 'finished_good');

UPDATE products
SET sku = COALESCE(NULLIF(sku, ''), 'SKU-' || LEFT(REPLACE(id::text, '-', ''), 8))
WHERE sku IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku
  ON products(company_id, sku) WHERE sku IS NOT NULL;

-- ── Extend inventory_transactions (valued movements) ─────────────────────────
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS unit_cost numeric(18,6),
  ADD COLUMN IF NOT EXISTS total_cost numeric(18,2),
  ADD COLUMN IF NOT EXISTS warehouse_id uuid,
  ADD COLUMN IF NOT EXISTS location_id uuid,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS cost_method text,
  ADD COLUMN IF NOT EXISTS source_doc_type text,
  ADD COLUMN IF NOT EXISTS source_doc_id uuid;

-- ── Warehouses & bins ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inv_warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
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
  location_type text NOT NULL DEFAULT 'bin'
    CHECK (location_type IN ('bin', 'aisle', 'zone', 'staging', 'quarantine')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, code)
);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_default_warehouse_id_fkey;
ALTER TABLE products
  ADD CONSTRAINT products_default_warehouse_id_fkey
  FOREIGN KEY (default_warehouse_id) REFERENCES inv_warehouses(id) ON DELETE SET NULL;

ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_warehouse_id_fkey;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_warehouse_id_fkey
  FOREIGN KEY (warehouse_id) REFERENCES inv_warehouses(id) ON DELETE SET NULL;

ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_location_id_fkey;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES inv_locations(id) ON DELETE SET NULL;

-- ── Balances & cost layers ───────────────────────────────────────────────────
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
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'exhausted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_cost_layers_fifo
  ON inv_cost_layers (company_id, product_id, warehouse_id, received_at)
  WHERE status = 'open' AND qty_remaining > 0;

-- ── Transfers, reservations, counts ──────────────────────────────────────────
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
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
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
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'released', 'consumed', 'cancelled')),
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
  count_type text NOT NULL DEFAULT 'cycle' CHECK (count_type IN ('cycle', 'physical')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'posted', 'cancelled')),
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
  unit_cost numeric(18,6) NOT NULL DEFAULT 0,
  variance_qty numeric(18,4) GENERATED ALWAYS AS (COALESCE(counted_qty, system_qty) - system_qty) STORED
);

-- ── Goods receipts (PO → stock; invoice matching metadata) ───────────────────
CREATE TABLE IF NOT EXISTS inv_goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  purchase_order_id uuid,
  vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
  warehouse_id uuid NOT NULL REFERENCES inv_warehouses(id),
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'received', 'matched', 'cancelled')),
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
  adjustment_type text NOT NULL
    CHECK (adjustment_type IN ('revaluation', 'variance', 'write_off', 'standard_update')),
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

-- Seed default UOMs per company lazily via app; optional global seed skipped.

-- ── RLS ──────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
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

COMMENT ON TABLE inv_warehouses IS 'V17.0 multi-warehouse inventory.';
COMMENT ON TABLE inv_cost_layers IS 'V17.0 FIFO/specific cost layers; weighted avg uses inv_balances.avg_unit_cost.';
COMMENT ON TABLE inv_goods_receipts IS 'V17.0 PO goods receipt — posts inventory JE via standard journal_entries pattern.';
