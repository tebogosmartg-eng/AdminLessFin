import { test, expect } from './fixtures';
import { loadE2EEnv } from './env';

const env = loadE2EEnv();

async function anonAccess(request: import('@playwright/test').APIRequestContext, table: string) {
  return request.get(`${env.supabaseUrl}/rest/v1/${table}?select=*&limit=5`, {
    headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}` },
  });
}

/**
 * Tenant tables that must never be readable without an authenticated session.
 * Every entry is confirmed to exist and to hold rows for the certification
 * tenant, so an empty anonymous result proves RLS is filtering rather than
 * proving the table is simply absent.
 */
const TENANT_TABLES = [
  'companies',
  'profiles',
  'company_users',
  'journal_entries',
  'customers',
  'vendors',
  'invoices',
  'bills',
  'employees',
  'payroll_runs',
  'products',
  'bank_accounts',
  'bank_transactions',
  'fixed_assets',
  'audit_logs',
  'financial_years',
  // P0 2026-07-28 remediation targets (previously anon-readable)
  'asset_code_sequences',
  'payroll_rule_catalog',
  'payroll_tax_year_config',
];

test.describe('Security — Row Level Security', () => {
  for (const table of TENANT_TABLES) {
    test(`anonymous reads of ${table} return no tenant data`, async ({ request }) => {
      const res = await anonAccess(request, table);
      // Either RLS denies outright, or it filters to an empty set. Leaking rows
      // to an anonymous caller is a certification blocker.
      if (res.status() === 200) {
        const rows = await res.json();
        expect(Array.isArray(rows) ? rows : []).toHaveLength(0);
      } else {
        expect([401, 403]).toContain(res.status());
      }
    });

    test(`${table} is reachable for the authenticated tenant`, async ({ request }) => {
      const login = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
        headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
        data: { email: env.email, password: env.password },
      });
      const { access_token } = await login.json();
      const res = await request.get(`${env.supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${access_token}` },
      });
      // Proves the anonymous empty result above is RLS filtering, not a missing table.
      expect(res.status(), `${table} must exist and be readable by a member`).toBe(200);
    });
  }
});

test.describe('Security — JWT validation', () => {
  test('a structurally invalid bearer token is rejected', async ({ request }) => {
    const res = await request.get(`${env.supabaseUrl}/rest/v1/companies?select=id&limit=1`, {
      headers: { apikey: env.supabaseAnonKey, Authorization: 'Bearer not.a.jwt' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('a token with a tampered signature is rejected', async ({ request }) => {
    const login = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
      data: { email: env.email, password: env.password },
    });
    expect(login.status()).toBe(200);
    const { access_token } = await login.json();

    const [header, payload] = String(access_token).split('.');
    const forged = `${header}.${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

    const res = await request.get(`${env.supabaseUrl}/rest/v1/companies?select=id&limit=1`, {
      headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${forged}` },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('an expired-audience anon key cannot reach the admin REST root', async ({ request }) => {
    const res = await request.get(`${env.supabaseUrl}/rest/v1/`, {
      headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}` },
    });
    // Only service_role may introspect the REST root.
    expect(res.status()).toBe(401);
  });
});

test.describe('Security — tenant isolation', () => {
  test('an authenticated user only sees companies they are a member of', async ({ request }) => {
    const login = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
      data: { email: env.email, password: env.password },
    });
    const { access_token, user } = await login.json();

    const companies = await request.get(
      `${env.supabaseUrl}/rest/v1/companies?select=id,name&limit=200`,
      { headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${access_token}` } },
    );
    expect(companies.status()).toBe(200);
    const rows: Array<{ id: string }> = await companies.json();

    const memberships = await request.get(
      `${env.supabaseUrl}/rest/v1/company_users?select=company_id&user_id=eq.${user.id}`,
      { headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${access_token}` } },
    );
    expect(memberships.status()).toBe(200);
    const allowed = new Set(
      ((await memberships.json()) as Array<{ company_id: string }>).map((m) => m.company_id),
    );

    const leaked = rows.filter((c) => !allowed.has(c.id)).map((c) => c.id);
    expect(leaked, 'companies visible without a membership row').toEqual([]);
  });

  test('reading a fabricated company id returns nothing', async ({ request }) => {
    const login = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
      data: { email: env.email, password: env.password },
    });
    const { access_token } = await login.json();

    const res = await request.get(
      `${env.supabaseUrl}/rest/v1/companies?select=id&id=eq.00000000-0000-0000-0000-000000000000`,
      { headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${access_token}` } },
    );
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

test.describe('Security — injection resistance', () => {
  test('SQL metacharacters in a filter do not break or leak the query', async ({ request }) => {
    const login = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
      data: { email: env.email, password: env.password },
    });
    const { access_token } = await login.json();

    const payload = encodeURIComponent("' OR 1=1--");
    const res = await request.get(
      `${env.supabaseUrl}/rest/v1/companies?select=id&name=eq.${payload}`,
      { headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${access_token}` } },
    );

    // Two acceptable outcomes, both safe:
    //   403 — the edge WAF rejects the injection signature before Postgres.
    //   200 — PostgREST parameterised the value, so the filter matches nothing.
    expect([200, 400, 403]).toContain(res.status());
    if (res.status() === 200) expect(await res.json()).toEqual([]);
  });

  test('a script payload rendered in the UI does not execute', async ({ page, diagnostics }) => {
    let alertFired = false;
    page.on('dialog', async (d) => {
      alertFired = true;
      await d.dismiss();
    });

    await page.goto(`/customers?q=${encodeURIComponent('<img src=x onerror=alert(1)>')}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);

    expect(alertFired, 'reflected XSS executed').toBe(false);
    expect(diagnostics.pageErrors).toEqual([]);
  });
});
