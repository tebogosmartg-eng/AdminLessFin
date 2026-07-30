/**
 * RT-004 REGRESSION VAULT — fixed_assets.company_id must not FK to users.
 *
 * Runtime evidence: acquire_fixed_asset_atomic failed with
 *   fixed_assets_user_id_fkey
 *   FOREIGN KEY (company_id) REFERENCES auth.users(id)
 *
 * The first remediation migration only matched public.users, so the auth.users
 * constraint survived. CI must keep a migration that drops company_id → users
 * in both auth and public schemas.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations');

describe('RT-004 — fixed_assets company_id must not reference users', () => {
  it('ships a remediation migration that drops company_id → auth.users (and public.users)', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    const remediations = files.filter((f) => {
      const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
      const dropsCompanyIdUsersFk =
        /fixed_assets/.test(sql) &&
        /company_id/.test(sql) &&
        /DROP CONSTRAINT/i.test(sql) &&
        /auth/.test(sql) &&
        /users/.test(sql);
      return dropsCompanyIdUsersFk;
    });

    expect(
      remediations.length,
      'expected a migration that drops fixed_assets.company_id FK to auth.users',
    ).toBeGreaterThan(0);

    // Pin the known RT-004 follow-up so renaming/deleting it fails CI.
    const pin = '20260730120000_rt004_drop_fixed_assets_company_id_auth_users_fk.sql';
    expect(existsSync(join(MIGRATIONS, pin)), `missing pinned migration ${pin}`).toBe(true);

    const pinned = readFileSync(join(MIGRATIONS, pin), 'utf8');
    expect(pinned).toMatch(/refn\.nspname\s+IN\s*\(\s*'auth'\s*,\s*'public'\s*\)/);
    expect(pinned).toMatch(/REFERENCES public\.companies\(id\)/);
  });

  it('does not reintroduce company_id → users after the RT-004 remediation', () => {
    const pin = '20260730120000_rt004_drop_fixed_assets_company_id_auth_users_fk.sql';
    const offenders = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql') && f > pin)
      .filter((f) => {
        const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
        // Catch re-adding a company_id FK referencing users on fixed_assets.
        return (
          /fixed_assets/i.test(sql) &&
          /company_id/i.test(sql) &&
          /REFERENCES\s+(auth\.|public\.)?users\s*\(/i.test(sql) &&
          /ADD\s+CONSTRAINT|FOREIGN\s+KEY/i.test(sql)
        );
      });

    expect(offenders, `later migration reintroduces company_id→users:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });
});
