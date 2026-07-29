/**
 * Apply V16.1 migration via Supabase CLI (Management API path).
 * Run: node scripts/apply-efs-v161-migration.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = join(
  root,
  'supabase/migrations/20260721120000_efs_v161_company_master_data.sql',
);

console.log('Applying migration:', migration);
const result = spawnSync(
  'supabase',
  ['db', 'query', '--linked', '-f', migration],
  {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    timeout: 300_000,
    env: process.env,
  },
);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
if (output) console.log(output);

if (result.error) {
  console.error('Spawn error:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
