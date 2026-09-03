/**
 * Every static PostgREST select in the edge functions, validated against the
 * live schema.
 *
 * An embed that names a table reachable by two foreign keys is rejected outright
 * (PGRST201), and an embed naming a relationship that does not exist is rejected
 * too (PGRST200). Both are 500s at runtime that no unit test can see, because
 * only the database knows the relationships. This asks the database.
 *
 * Rows are fetched with limit(0): the shape is checked, no data is read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { connect } from './edgeProbe';

const NL = String.fromCharCode(10);
const FN_DIR = path.join(process.cwd(), 'supabase/functions');

function sources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

type Q = { file: string; table: string; select: string };

function extract(file: string): Q[] {
  const src = fs.readFileSync(file, 'utf8');
  const out: Q[] = [];
  // .from('table') ... .select(<literal>)
  const re = /\.from\(\s*['"]([A-Za-z0-9_]+)['"]\s*\)\s*(?:\.[A-Za-z]+\([^)]*\)\s*)*?\.select\(\s*([`'"])([\s\S]*?)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const sel = m[3];
    if (sel.includes('${')) continue;          // built at runtime, cannot be checked statically
    if (!/[A-Za-z_]\s*\(/.test(sel)) continue; // no embed, nothing relational to check
    out.push({ file: path.relative(process.cwd(), file), table: m[1], select: sel.replace(/\s+/g, ' ').trim() });
  }
  return out;
}

async function main() {
  const { supabase: s } = await connect('Spaceman');
  const all = sources(FN_DIR).flatMap(extract);
  const seen = new Set<string>();
  const queries = all.filter((q) => {
    const k = q.table + '::' + q.select;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  console.log('distinct static selects containing an embed: ' + queries.length);

  const broken: Array<Q & { code: string; message: string }> = [];
  for (const q of queries) {
    const { error } = await s.from(q.table).select(q.select).limit(0);
    if (!error) continue;
    const code = String((error as { code?: string }).code ?? '');
    // PGRST200 no such relationship, PGRST201 ambiguous relationship.
    if (code === 'PGRST200' || code === 'PGRST201' || /more than one relationship|Could not (embed|find a relationship)/i.test(error.message)) {
      broken.push({ ...q, code, message: error.message });
    }
  }

  console.log(NL + '======== RELATIONSHIP FAULTS ========');
  if (!broken.length) console.log('  none');
  for (const b of broken) {
    console.log('  ' + b.file + '  from(' + b.table + ')');
    console.log('    ' + b.code + ': ' + b.message.slice(0, 150));
    console.log('    select: ' + b.select.slice(0, 150));
  }
  console.log(NL + (broken.length ? 'FAIL ' + broken.length : 'PASS 0') + ' relationship faults');
  if (broken.length) process.exit(1);
}
main().catch((e) => { console.error(String(e)); process.exit(1); });
