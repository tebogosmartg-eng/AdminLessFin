import fs from 'node:fs';
import path from 'node:path';

export type E2EEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  email: string;
  password: string;
  companyId?: string;
};

let cached: E2EEnv | null = null;

/**
 * Reads `.env` directly — Playwright runs outside Vite so `import.meta.env` is
 * unavailable. Values may be quoted in `.env`, so quotes are stripped.
 */
export function loadE2EEnv(): E2EEnv {
  if (cached) return cached;

  const file = path.join(process.cwd(), '.env');
  const values: Record<string, string> = {};

  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }

  const read = (key: string) => process.env[key] || values[key] || '';

  const env: E2EEnv = {
    supabaseUrl: read('VITE_SUPABASE_URL'),
    supabaseAnonKey: read('VITE_SUPABASE_ANON_KEY'),
    email: read('E2E_EMAIL'),
    password: read('E2E_PASSWORD'),
    companyId: read('EAM_CERT_COMPANY_ID') || read('E2E_COMPANY_ID') || undefined,
  };

  const missing = (['supabaseUrl', 'supabaseAnonKey', 'email', 'password'] as const).filter(
    (k) => !env[k],
  );
  if (missing.length) {
    throw new Error(
      `E2E certification requires ${missing.join(', ')} in .env (or the environment).`,
    );
  }

  cached = env;
  return env;
}

export const STORAGE_STATE = path.join(process.cwd(), 'tests/e2e/.auth/state.json');
