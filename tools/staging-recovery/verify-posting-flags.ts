/**
 * Proves the posting flags now travel from the database to the client AND are
 * honoured, by flipping one real account and watching it leave the postable
 * list. The account is restored afterwards.
 */
import { connect, invoke } from './edgeProbe';
import { manuallyPostableAccounts } from '../../src/lib/accounting/accountRoles';

const NL = String.fromCharCode(10);

async function fetchAccounts(s: Awaited<ReturnType<typeof connect>>['supabase'], company_id: string) {
  const r = await invoke(s, 'chart-of-accounts', { method: 'GET', company_id });
  return (r.body as Array<Record<string, unknown>>) ?? [];
}

async function main() {
  const { supabase: s, company } = await connect('Spaceman');
  const company_id = company.id;

  const before = await fetchAccounts(s, company_id);
  const sample = before[0] ?? {};
  console.log('=== 1. DOES THE PAYLOAD CARRY THE FLAGS? ===');
  console.log(`  allow_manual_posting present: ${'allow_manual_posting' in sample}`);
  console.log(`  posting_blocked present     : ${'posting_blocked' in sample}`);
  console.log(`  requires_dimension present  : ${'requires_dimension' in sample} (deliberately not shipped — no consumer)`);

  const postableBefore = manuallyPostableAccounts(before as never);
  console.log(NL + `  accounts returned: ${before.length}; manually postable: ${postableBefore.length}`);

  // Pick an ordinary postable expense account to flip.
  const target = postableBefore.find(
    (a) => (a as unknown as { type?: string }).type === 'Expense',
  ) as unknown as { id: string; name: string; account_number: number } | undefined;
  if (!target) { console.log('no postable expense account to test with'); return; }
  console.log(NL + `=== 2. FLIP allow_manual_posting=false ON ${target.account_number} ${target.name} ===`);

  const off = await s.from('chart_of_accounts').update({ allow_manual_posting: false }).eq('id', target.id);
  if (off.error) { console.log('  could not update: ' + off.error.message); return; }

  try {
    const after = await fetchAccounts(s, company_id);
    const flipped = after.find((a) => a.id === target.id) as Record<string, unknown> | undefined;
    console.log(`  payload now reports allow_manual_posting=${flipped?.allow_manual_posting}`);
    const postableAfter = manuallyPostableAccounts(after as never);
    const stillOffered = postableAfter.some((a) => (a as unknown as { id: string }).id === target.id);
    console.log(`  still offered to manual documents: ${stillOffered ? 'YES — NOT HONOURED' : 'no — withheld'}`);
    console.log(`  postable count ${postableBefore.length} -> ${postableAfter.length}`);
  } finally {
    const back = await s.from('chart_of_accounts').update({ allow_manual_posting: true }).eq('id', target.id);
    console.log(NL + `=== 3. RESTORED === ${back.error ? 'FAILED ' + back.error.message : 'allow_manual_posting=true'}`);
    const restored = await fetchAccounts(s, company_id);
    const check = restored.find((a) => a.id === target.id) as Record<string, unknown> | undefined;
    console.log(`  ${target.account_number} ${target.name}: allow_manual_posting=${check?.allow_manual_posting}`);
    console.log(`  manually postable again: ${manuallyPostableAccounts(restored as never).length} (was ${postableBefore.length})`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
