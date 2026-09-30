/**
 * CERT TX asset register take-on + depreciation runs, through the deployed
 * fixed-assets edge function. Idempotent: take-ons are guarded by
 * description, depreciation runs by the engine's (asset, as-of) idempotency.
 *
 *   npx tsx tools/staging-recovery/cert-asset-takeon.ts
 */
import { connect, invoke } from './edgeProbe';

const COMPANY = 'ed2f2a92-a8f4-4496-a6fe-51d68bf9ba03';

type TakeOn = {
  description: string;
  account: string;
  purchase_date: string;
  purchase_cost: number;
  useful_life_years?: number;
  residual_value?: number;
  depreciates?: boolean;
};

const ASSETS: TakeOn[] = [
  { description: 'Land — 12 Protea Road, Centurion', account: 'Land and Buildings', purchase_date: '2025-02-01', purchase_cost: 300_000, depreciates: false },
  { description: 'Office building — 12 Protea Road, Centurion', account: 'Land and Buildings', purchase_date: '2025-02-01', purchase_cost: 900_000, useful_life_years: 20, residual_value: 0 },
  { description: 'Delivery vehicle — Toyota Hilux 2.4 GD-6', account: 'Motor Vehicles', purchase_date: '2025-02-10', purchase_cost: 480_000, useful_life_years: 5, residual_value: 0 },
  { description: 'Delivery vehicle — Ford Transit (instalment sale)', account: 'Motor Vehicles', purchase_date: '2026-03-31', purchase_cost: 385_000, useful_life_years: 5, residual_value: 25_000 },
  { description: 'Computer equipment — initial fleet', account: 'Computer Equipment', purchase_date: '2025-02-10', purchase_cost: 165_000, useful_life_years: 3, residual_value: 3_000 },
  { description: 'Computer equipment — 2026 additions', account: 'Computer Equipment', purchase_date: '2026-02-28', purchase_cost: 94_000, useful_life_years: 3, residual_value: 4_000 },
  { description: 'Office equipment — initial', account: 'Office Equipment', purchase_date: '2025-02-10', purchase_cost: 92_000, useful_life_years: 5, residual_value: 2_000 },
  { description: 'Furniture and fittings — initial', account: 'Furniture and Fittings', purchase_date: '2025-02-10', purchase_cost: 78_000, useful_life_years: 6, residual_value: 6_000 },
  { description: 'Furniture and fittings — 2026 additions', account: 'Furniture and Fittings', purchase_date: '2026-02-28', purchase_cost: 46_000, useful_life_years: 6, residual_value: 2_800 },
];

async function main() {
  const { supabase } = await connect('x');

  const { data: coa, error } = await supabase
    .from('chart_of_accounts')
    .select('id, name')
    .eq('company_id', COMPANY);
  if (error) throw error;
  const account = (name: string) => {
    const hit = (coa ?? []).find((a) => String(a.name).trim().toLowerCase() === name.toLowerCase());
    if (!hit) throw new Error(`No account: ${name}`);
    return hit.id;
  };
  const accumulated = account('Accumulated Depreciation');
  const expense = account('Depreciation');

  const { data: existing } = await supabase
    .from('fixed_assets')
    .select('description')
    .eq('company_id', COMPANY);
  const already = new Set((existing ?? []).map((r) => String(r.description)));

  for (const a of ASSETS) {
    if (already.has(a.description)) {
      console.log(`skip (registered)  ${a.description}`);
      continue;
    }
    const assetData: Record<string, unknown> = {
      description: a.description,
      purchase_date: a.purchase_date,
      purchase_cost: a.purchase_cost,
      asset_account_id: account(a.account),
      source_reference: 'AFS disclosure demonstration acquisitions',
    };
    if (a.depreciates === false) {
      assetData.depreciation_method = 'none';
    } else {
      assetData.useful_life_years = a.useful_life_years;
      assetData.residual_value = a.residual_value ?? 0;
      assetData.accumulated_depreciation_account_id = accumulated;
      assetData.depreciation_expense_account_id = expense;
    }
    const r = await invoke(supabase, 'fixed-assets', { method: 'REGISTER_TAKE_ON', company_id: COMPANY, assetData });
    if (!r.ok) {
      console.log(`FAIL take-on ${a.description}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
      continue;
    }
    console.log(`ok take-on  ${(r.body as { asset_code?: string }).asset_code}  ${a.description}`);
  }

  for (const asOf of ['2025-12-31', '2026-12-31']) {
    const r = await invoke(supabase, 'fixed-assets', { method: 'RUN_DEPRECIATION', company_id: COMPANY, as_of: asOf });
    if (!r.ok) {
      console.log(`FAIL run ${asOf}: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
      continue;
    }
    const body = r.body as { processed: Array<{ asset_code: string; months: number; amount: number }>; skipped: Array<{ asset_code: string; reason: string }>; total_amount: number };
    console.log(`\nrun to ${asOf}: total ${body.total_amount}`);
    for (const p of body.processed) console.log(`  posted ${p.asset_code}  ${p.months} months  ${p.amount}`);
    for (const s of body.skipped) console.log(`  skipped ${s.asset_code}: ${s.reason}`);
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
