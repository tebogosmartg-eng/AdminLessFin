/**
 * Apply a Supabase migration via Management API using Windows Credential Vault token.
 * Usage: node scripts/apply-migration-via-api.mjs <migration-file-path> [verify-sql]
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const projectRef = 'zaulhnpohrgqqodvzhxp';
const migrationPath = process.argv[2];
const verifySql = process.argv[3] ?? null;

if (!migrationPath) {
  console.error('Usage: node scripts/apply-migration-via-api.mjs <migration-file>');
  process.exit(1);
}

function getTokenFromVault() {
  const ps = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `
Add-Type -AssemblyName System.Security
$vault = New-Object Windows.Security.Credentials.PasswordVault
$cred = $vault.Retrieve('Supabase CLI', 'supabase')
$cred.RetrievePassword()
Write-Output $cred.Password
      `.trim(),
    ],
    { encoding: 'utf8', shell: false },
  );
  const token = (ps.stdout ?? '').trim();
  if (ps.status !== 0 || !token) {
    console.error('Failed to read Supabase token from Credential Vault:', ps.stderr || ps.stdout);
    process.exit(1);
  }
  return token;
}

async function runQuery(token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const sql = readFileSync(resolve(root, migrationPath), 'utf8');
  const token = getTokenFromVault();
  console.log('Applying migration:', migrationPath);
  const result = await runQuery(token, sql);
  console.log('Apply result:', JSON.stringify(result, null, 2));

  if (verifySql) {
    console.log('Running verify query...');
    const verify = await runQuery(token, verifySql);
    console.log('Verify result:', JSON.stringify(verify, null, 2));
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
