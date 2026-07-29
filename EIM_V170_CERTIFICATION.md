# AdminLess Fin V17.0 — Enterprise Inventory & Cost Management

**Status:** ENTERPRISE INVENTORY & COST MANAGEMENT CERTIFIED  
**Baseline:** V16.3 Asset Lifecycle certified (untouched)

## Architecture

Additive Inventory platform around existing `products` + `inventory_transactions`:

| Layer | Design |
|-------|--------|
| Item master | Extended `products` (SKU, UOM, cost method, item class, GL accounts) |
| Stock | `inv_warehouses`, `inv_locations`, `inv_balances`, `inv_cost_layers` |
| Ops | Receipts, transfers, reservations, cycle counts, cost adjustments |
| Costing | FIFO · Weighted Average · Standard · Specific (layers + avg) |
| GL | Posts via existing `journal_entries` / `journal_entry_items` pattern (engine unchanged) |
| API | New `inventory` edge function; `products` CRUD/ADJUST preserved |
| UI | `/inventory/*` workspaces; `/products` & `/inventory-valuation` retained |

Company-level `products.quantity_on_hand` stays synced from warehouse balances for backward compatibility.

## Database additions

Migration: `supabase/migrations/20260722064419_eim_v170_enterprise_inventory_cost.sql` (applied remotely)

- Product extensions + valued movement columns on `inventory_transactions`
- `inv_warehouses`, `inv_locations`, `inv_balances`, `inv_cost_layers`
- `inv_transfers`, `inv_reservations`, `inv_cycle_counts`, `inv_cycle_count_lines`
- `inv_goods_receipts`, `inv_goods_receipt_lines`, `inv_cost_adjustments`, `inv_uom`
- RLS on all new tables

## Integrations

| System | Integration |
|--------|-------------|
| GL | Inventory ↔ COGS / GRNI / variance / write-off journals |
| Purchasing | Goods receipts (PO-linked metadata); existing bills/POs unchanged |
| Sales | Issue/COGS path available; existing invoice RPCs untouched |
| Assets | `linked_asset_id` / capitalise flag on GRN (optional) |
| Reporting | Analytics + legacy Inventory Valuation report retained |

## Regression

| Check | Result |
|-------|--------|
| General Ledger / journal engine | Untouched |
| Assets module | Untouched |
| Products CRUD + ADJUST_QUANTITY | Preserved |
| Purchasing / Sales routes | Preserved |
| `/inventory-valuation` | Preserved (+ links) |
| Permissions / existing APIs | Compatible |
| `tsc --noEmit` | Pass |

Screenshots: `docs/eim-v170/`
