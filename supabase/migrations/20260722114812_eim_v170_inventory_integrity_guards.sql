-- AdminLess Fin V17.0 — Inventory integrity guards (additive)
-- Prevents negative on-hand balances and adds query indexes for large ledgers.

ALTER TABLE inv_balances
  DROP CONSTRAINT IF EXISTS inv_balances_qty_on_hand_nonneg;
ALTER TABLE inv_balances
  ADD CONSTRAINT inv_balances_qty_on_hand_nonneg CHECK (qty_on_hand >= 0);

ALTER TABLE inv_balances
  DROP CONSTRAINT IF EXISTS inv_balances_qty_reserved_nonneg;
ALTER TABLE inv_balances
  ADD CONSTRAINT inv_balances_qty_reserved_nonneg CHECK (qty_reserved >= 0);

ALTER TABLE inv_cost_layers
  DROP CONSTRAINT IF EXISTS inv_cost_layers_qty_remaining_nonneg;
ALTER TABLE inv_cost_layers
  ADD CONSTRAINT inv_cost_layers_qty_remaining_nonneg CHECK (qty_remaining >= 0);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_company_date
  ON inventory_transactions (company_id, transaction_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product
  ON inventory_transactions (company_id, product_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_inv_balances_company_product
  ON inv_balances (company_id, product_id);

CREATE INDEX IF NOT EXISTS idx_inv_goods_receipts_company_created
  ON inv_goods_receipts (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_transfers_company_created
  ON inv_transfers (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_cycle_counts_company_created
  ON inv_cycle_counts (company_id, created_at DESC);

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

ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_journal_entry_id_fkey;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_journal_entry_id_fkey
  FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL;

COMMENT ON CONSTRAINT inv_balances_qty_on_hand_nonneg ON inv_balances IS
  'V17.0 enterprise guard: negative on-hand stock is not permitted.';
