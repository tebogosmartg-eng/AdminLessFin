#!/usr/bin/env node
/**
 * Employee Number Engine — production migration orchestrator (V3.2.18).
 *
 * Applies pending Supabase migrations including:
 *   - 20260703140000_employee_number_engine.sql
 *   - 20260703150000_employee_numbering_policy.sql
 *   - 20260705180000_employee_identity_platform.sql
 *
 * Requires SUPABASE_DB_PASSWORD (Dashboard → Settings → Database).
 *
 * Usage:
 *   node scripts/applyEmployeeNumberEngine.mjs --step preflight
 *   node scripts/applyEmployeeNumberEngine.mjs --step apply
 *   node scripts/applyEmployeeNumberEngine.mjs --step verify
 *   node scripts/applyEmployeeNumberEngine.mjs
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(filename) {
  const path = resolve(root, filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function requireDbPassword() {
  if (!process.env.SUPABASE_DB_PASSWORD) {
    console.error(
      'Missing SUPABASE_DB_PASSWORD.\n' +
        'Add it to .env.local from Supabase Dashboard → Settings → Database.\n' +
        'Then run: node scripts/applyEmployeeNumberEngine.mjs',
    );
    process.exit(1);
  }
}

function runSupabase(args, { allowFailure = false } = {}) {
  const result = spawnSync('supabase', args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (output) console.log(output);
  if (result.status !== 0 && !allowFailure) {
    console.error(`Command failed: supabase ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
  return { status: result.status ?? 0, output };
}

const VERIFY_SQL = `
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'employee_number'
  ) AS employee_number_column_exists,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'generate_employee_number'
  ) AS generate_rpc_exists,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'company_employee_number_settings'
  ) AS settings_table_exists,
  (SELECT COUNT(*) FROM employees) AS total_employees,
  (SELECT COUNT(*) FROM employees WHERE employee_number IS NOT NULL AND trim(employee_number) <> '') AS numbered_employees,
  (SELECT COUNT(*) FROM employees WHERE employee_number IS NULL OR trim(employee_number) = '') AS unnumbered_employees;
`;

function stepPreflight() {
  requireDbPassword();
  console.log('\n# Employee Number Engine — Pre-flight');
  runSupabase(['migration', 'list', '--linked'], { allowFailure: true });
}

function stepApply() {
  requireDbPassword();
  console.log('\n# Employee Number Engine — Apply migrations');
  runSupabase(['db', 'push', '--linked', '--yes']);
}

function stepVerify() {
  requireDbPassword();
  console.log('\n# Employee Number Engine — Verify schema');
  const verifyPath = resolve(root, 'scripts', '.employee-number-verify.tmp.sql');
  writeFileSync(verifyPath, VERIFY_SQL);
  try {
    runSupabase(['db', 'query', '--linked', '-f', verifyPath]);
  } finally {
    try { unlinkSync(verifyPath); } catch { /* ignore */ }
  }
}

const step = process.argv.find((a) => a.startsWith('--step='))?.split('=')[1]
  ?? (process.argv.includes('--step') ? process.argv[process.argv.indexOf('--step') + 1] : 'all');

switch (step) {
  case 'preflight':
    stepPreflight();
    break;
  case 'apply':
    stepApply();
    break;
  case 'verify':
    stepVerify();
    break;
  case 'all':
  default:
    stepPreflight();
    stepApply();
    stepVerify();
    break;
}
