import { connect } from './edgeProbe';
const NL = String.fromCharCode(10);
const c = (n: unknown) => Math.round(Number(n ?? 0) * 100);
async function main() {
  const { supabase: s } = await connect('Spaceman');
  for (const id of ['3e1427dc-b5a6-4e09-b392-7ed4d8d9493a', '20be201a-7e27-4e4c-a9d7-8c8ff733a510']) {
    const j = await s.from('journal_entries').select('*').eq('id', id).maybeSingle();
    if (!j.data) { console.log(id + ': not found'); continue; }
    const rec = j.data as Record<string, unknown>;
    console.log(NL + `${rec.journal_number}  ${rec.entry_date}  created=${rec.created_at}`);
    console.log(`  desc: ${rec.description}`);
    const it = await s
      .from('journal_entry_items')
      .select('type, amount, chart_of_accounts ( account_code, account_number, name )')
      .eq('journal_entry_id', id);
    let d = 0; let k = 0;
    for (const x of it.data ?? []) {
      const a = (x as unknown as { chart_of_accounts: { account_code: string | null; account_number: number; name: string } }).chart_of_accounts;
      if (x.type === 'debit') d += c(x.amount); else k += c(x.amount);
      console.log(`    ${x.type.padEnd(6)} ${String(x.amount).padStart(12)}  ${a?.account_code ?? a?.account_number} ${a?.name}`);
    }
    console.log(`    Dr=${d / 100} Cr=${k / 100} diff=${d - k}c`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
