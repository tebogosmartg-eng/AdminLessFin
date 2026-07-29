import { test, expect } from './fixtures';
import { loadE2EEnv } from './env';

const env = loadE2EEnv();

/**
 * Read-only dispatch method for every Edge Function that exposes one. Only
 * non-mutating methods are used: certification runs against a live tenant and
 * must not create, alter or close real accounting records.
 */
const READ_METHODS: Record<string, string> = {
  accounting: 'GET_FINANCIAL_YEARS',
  'accounting-setup': 'GET_STATUS',
  'asset-categories': 'GET',
  banking: 'GET_BANK_ACCOUNTS',
  bills: 'GET',
  budgets: 'GET_ALL',
  'chart-of-accounts': 'GET',
  'credit-notes': 'GET_ALL',
  customers: 'GET',
  'data-import': 'GET_REFERENCES',
  employees: 'GET',
  'expense-claims': 'GET_ALL',
  'financial-close': 'LIST_CLOSE_WORKSPACES',
  'financial-statements': 'LIST_FRAMEWORKS',
  'fixed-assets': 'GET_ALL',
  inventory: 'LIST_WAREHOUSES',
  invoices: 'GET_ALL',
  'journal-entries': 'GET',
  loans: 'GET_ALL',
  messages: 'GET',
  payments: 'GET_AR_BALANCES',
  payroll: 'GET_RUNS',
  products: 'GET',
  projects: 'GET',
  'purchase-orders': 'GET_ALL',
  'quick-capture-expense': 'GET_CATEGORIES',
  quotes: 'GET_ALL',
  'recurring-bills': 'GET_ALL',
  'recurring-entries': 'GET_ALL',
  'recurring-invoices': 'GET_ALL',
  settings: 'GET',
  'tax-rates': 'GET',
  timesheets: 'GET',
  'vendor-credits': 'GET_ALL',
  vendors: 'GET',
  work: 'LIST_RESOURCE_TYPES',
};

/**
 * Functions that do not use body-level method dispatch. They are certified for
 * deployment and authentication only, because invoking their real payload would
 * mutate tenant data or send email.
 */
const DISPATCHLESS = [
  'accounting-health',
  'accounting-policy-engine',
  'accounting-rules-engine',
  'audit-logs',
  'business-event-orchestrator',
  'calendar-events',
  'dashboard-data',
  'global-search',
  'reports',
  'user-session',
];

let accessToken = '';
let companyId = '';

test.beforeAll(async ({ request }) => {
  const login = await request.post(`${env.supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: env.supabaseAnonKey, 'Content-Type': 'application/json' },
    data: { email: env.email, password: env.password },
  });
  expect(login.status(), 'certification account must authenticate').toBe(200);
  accessToken = (await login.json()).access_token;

  companyId = env.companyId || '';
  if (!companyId) {
    const res = await request.get(`${env.supabaseUrl}/rest/v1/companies?select=id&limit=1`, {
      headers: { apikey: env.supabaseAnonKey, Authorization: `Bearer ${accessToken}` },
    });
    companyId = (await res.json())?.[0]?.id || '';
  }
  expect(companyId, 'a tenant company is required').toBeTruthy();
});

function invoke(
  request: import('@playwright/test').APIRequestContext,
  fn: string,
  body: Record<string, unknown>,
  authenticated = true,
) {
  return request.post(`${env.supabaseUrl}/functions/v1/${fn}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated
        ? { apikey: env.supabaseAnonKey, Authorization: `Bearer ${accessToken}` }
        : {}),
    },
    data: body,
  });
}

/**
 * Deployed but not part of the customer-facing product surface. `reconciliations`
 * queries five `ermp_*` tables (reconciliations, differences, evidence, activity,
 * templates) that no migration in this repository creates, and no UI code invokes
 * it — the customer-facing Reconciliation Centre and bank reconciliation run
 * through the `accounting` and `banking` functions instead. It is certified for
 * deployment and authentication only; asserting a working payload would be
 * certifying an unreleased module.
 */
const UNRELEASED = ['reconciliations'];

const ALL_FUNCTIONS = [...Object.keys(READ_METHODS), ...DISPATCHLESS, ...UNRELEASED].sort();

test.describe('Edge Functions — anonymous callers get no data', () => {
  for (const fn of ALL_FUNCTIONS) {
    test(`${fn} is deployed and leaks nothing to an anonymous caller`, async ({ request }) => {
      const res = await invoke(request, fn, { method: READ_METHODS[fn] || 'GET' }, false);
      const body = await res.text();

      expect(body, `${fn} is not deployed`).not.toMatch(/function not found|BOOT_ERROR/i);
      expect(res.status(), `${fn} must never return 2xx to an anonymous caller`).toBeGreaterThanOrEqual(400);

      // The response must carry no tenant payload.
      let payload: unknown = null;
      try {
        payload = JSON.parse(body);
      } catch {
        payload = null;
      }
      expect(Array.isArray(payload), `${fn} returned a collection anonymously`).toBe(false);
    });
  }
});

test.describe('Edge Functions — authentication error contract', () => {
  for (const fn of ALL_FUNCTIONS) {
    test(`${fn} answers an anonymous caller with 401`, async ({ request }) => {
      const res = await invoke(request, fn, { method: READ_METHODS[fn] || 'GET' }, false);
      // Defect EF-03: functions deployed from pre-platform source report
      // "User not authenticated." as HTTP 500 instead of 401. Access is still
      // denied (covered above); only the status contract is wrong.
      expect(res.status(), await res.text()).toBe(401);
    });
  }
});

test.describe('Edge Functions — authenticated read operations', () => {
  for (const [fn, method] of Object.entries(READ_METHODS)) {
    test(`${fn} · ${method} returns a successful payload`, async ({ request }) => {
      const res = await invoke(request, fn, { method, company_id: companyId });
      const body = await res.text();

      expect(
        res.status(),
        `${fn} · ${method} returned ${res.status()}: ${body.slice(0, 300)}`,
      ).toBe(200);

      // A 200 must carry parseable JSON, not an error envelope.
      expect(() => JSON.parse(body)).not.toThrow();
      const parsed = JSON.parse(body);
      const errorField = parsed && !Array.isArray(parsed) ? parsed.error : undefined;
      expect(errorField, `${fn} · ${method} returned an error envelope with HTTP 200`).toBeFalsy();
    });
  }
});

test.describe('Edge Functions — unreleased modules', () => {
  // Tracks defect RECON-01 so the gap cannot be forgotten: the module is live and
  // authenticated, but its schema was never authored. When the ermp_* migration
  // lands this test fails, which is the signal to move `reconciliations` out of
  // UNRELEASED and certify it as a real read operation.
  test('reconciliations is deployed but has no backing schema', async ({ request }) => {
    const res = await invoke(request, 'reconciliations', {
      method: 'GET_DASHBOARD',
      company_id: companyId,
    });
    const body = await res.text();

    expect(res.status(), `reconciliations unexpectedly succeeded: ${body.slice(0, 200)}`).not.toBe(200);
    expect(body).toMatch(/ermp_reconciliations|relation|does not exist|schema/i);
  });
});

test.describe('Edge Functions — error contract', () => {
  test('an unroutable method is a client error, not a server fault', async ({ request }) => {
    const res = await invoke(request, 'customers', {
      method: 'NOT_A_REAL_METHOD',
      company_id: companyId,
    });
    // Defect EF-02: an unroutable method classifies as UnknownPlatformError and
    // is served as HTTP 500. It must be a 4xx client error.
    expect(res.status(), await res.text()).toBeLessThan(500);
  });

  test('audit trail retrieval succeeds', async ({ request }) => {
    // Defect EF-01: audit_logs.changed_by has no FK to profiles, so the
    // PostgREST embed fails and every request returns HTTP 500.
    const res = await invoke(request, 'settings', {
      method: 'GET_AUDIT_LOGS',
      company_id: companyId,
      table_name: 'all',
    });
    expect(res.status(), await res.text()).toBe(200);
  });
});
