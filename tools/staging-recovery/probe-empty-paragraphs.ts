/**
 * List a company's authored note paragraphs that are empty, with when they
 * were created (from their P<ms> code) — to tell leftovers of an interrupted test run from the
 * preparer's own work. Pass --delete to remove the ones listed through the
 * product's own delete method.
 *
 *   npx tsx tools/staging-recovery/probe-empty-paragraphs.ts "CERT TX 1785230987178" [--delete]
 */
import { connect, invoke } from './edgeProbe';

async function main() {
  const { supabase, company } = await connect(process.argv[2] || 'CERT TX 1785230987178');
  const remove = process.argv.includes('--delete');
  console.log(`company: ${company.name}  ${company.id}`);
  const { data, error } = await supabase
    .from('efs_disclosure_paragraphs')
    .select('id, paragraph_code, body, disclosure_instance_id')
    .eq('company_id', company.id);
  if (error) throw error;
  const empty = (data || []).filter((p) => !String(p.body || '').trim());
  for (const p of empty) {
    // A paragraph added in the editor is coded P<milliseconds>: its creation time.
    const ms = Number(String(p.paragraph_code).replace(/^P/, ''));
    const when = Number.isFinite(ms) && ms > 1e12 ? new Date(ms).toISOString() : 'unknown';
    console.log(`${when}  ${p.paragraph_code}  ${p.id}`);
    if (remove) {
      const r = await invoke(supabase, 'financial-statements', {
        method: 'DELETE_DISCLOSURE_PARAGRAPH',
        company_id: company.id,
        paragraph_id: p.id,
      });
      console.log(r.ok ? '  deleted' : `  refused: ${JSON.stringify(r.body).slice(0, 160)}`);
    }
  }
  console.log(`${empty.length} empty of ${(data || []).length} paragraphs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
