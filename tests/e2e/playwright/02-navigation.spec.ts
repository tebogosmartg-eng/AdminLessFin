import { test, expect, expectNoErrorBoundary, waitForRouteSettled } from './fixtures';

/**
 * Every customer-reachable route, grouped by the module it certifies. A route
 * passes only when it renders without an error boundary, without uncaught
 * exceptions, and without a 5xx from the backend.
 */
const ROUTES: Array<{ module: string; path: string }> = [
  { module: 'Company', path: '/' },
  { module: 'Company', path: '/create-company' },
  { module: 'Company', path: '/accounting-setup' },
  { module: 'Company', path: '/calendar' },
  { module: 'Company', path: '/settings' },

  { module: 'Chart of Accounts', path: '/chart-of-accounts' },

  { module: 'General Ledger', path: '/journal-entries' },
  { module: 'General Ledger', path: '/recurring-entries' },
  { module: 'General Ledger', path: '/general-ledger' },
  { module: 'General Ledger', path: '/trial-balance' },
  { module: 'General Ledger', path: '/accounting' },
  { module: 'General Ledger', path: '/accounting/posting-requests' },
  { module: 'General Ledger', path: '/accounting/periods' },
  { module: 'General Ledger', path: '/accounting/years' },
  { module: 'General Ledger', path: '/accounting/audit-trail' },
  { module: 'General Ledger', path: '/accounting/timeline' },
  { module: 'General Ledger', path: '/accounting/exceptions' },
  { module: 'General Ledger', path: '/accounting/period-close' },
  { module: 'General Ledger', path: '/accounting/health' },

  { module: 'Banking', path: '/banking' },
  { module: 'Banking', path: '/banking/accounts' },
  { module: 'Banking', path: '/banking/transactions' },
  { module: 'Banking', path: '/banking/transfers' },
  { module: 'Banking', path: '/banking/petty-cash' },
  { module: 'Banking', path: '/banking/reconciliation' },
  { module: 'Banking', path: '/reconciliation' },
  { module: 'Banking', path: '/accounting/reconciliation' },

  { module: 'Customers', path: '/customers' },
  { module: 'Customers', path: '/sales' },
  { module: 'Customers', path: '/quotes' },
  { module: 'Customers', path: '/invoices' },
  { module: 'Customers', path: '/credit-notes' },
  { module: 'Customers', path: '/recurring-invoices' },
  { module: 'Customers', path: '/receive-payments' },

  { module: 'Suppliers', path: '/vendors' },
  { module: 'Suppliers', path: '/purchases' },
  { module: 'Suppliers', path: '/purchase-orders' },
  { module: 'Suppliers', path: '/bills' },
  { module: 'Suppliers', path: '/pay-bills' },
  { module: 'Suppliers', path: '/vendor-credits' },
  { module: 'Suppliers', path: '/recurring-bills' },

  { module: 'Inventory', path: '/products' },
  { module: 'Inventory', path: '/inventory' },
  { module: 'Inventory', path: '/inventory/register' },
  { module: 'Inventory', path: '/inventory/warehouses' },
  { module: 'Inventory', path: '/inventory/movements' },
  { module: 'Inventory', path: '/inventory/receipts' },
  { module: 'Inventory', path: '/inventory/transfers' },
  { module: 'Inventory', path: '/inventory/counts' },
  { module: 'Inventory', path: '/inventory/costing' },
  { module: 'Inventory', path: '/inventory/analytics' },
  { module: 'Inventory', path: '/inventory-valuation' },

  { module: 'Payroll', path: '/payroll' },
  { module: 'Payroll', path: '/employees' },
  { module: 'Payroll', path: '/payroll-runs' },
  { module: 'Payroll', path: '/payroll-reports' },
  { module: 'Payroll', path: '/expense-claims' },
  { module: 'Payroll', path: '/statutory-returns' },

  { module: 'Fixed Assets', path: '/fixed-assets' },
  { module: 'Fixed Assets', path: '/asset-categories' },
  { module: 'Fixed Assets', path: '/assets/acquisitions' },
  { module: 'Fixed Assets', path: '/assets/cockpit' },
  { module: 'Fixed Assets', path: '/assets/health' },
  { module: 'Fixed Assets', path: '/assets/analytics' },
  { module: 'Fixed Assets', path: '/assets/verification' },
  { module: 'Fixed Assets', path: '/assets/maintenance' },
  { module: 'Fixed Assets', path: '/assets/reports' },

  { module: 'VAT & Tax', path: '/tax-rates' },
  { module: 'VAT & Tax', path: '/tax-report' },

  { module: 'Financial Statements', path: '/financial-statements' },
  { module: 'Financial Statements', path: '/financial-statements-workspace' },
  { module: 'Financial Statements', path: '/financial-close' },

  { module: 'Reporting', path: '/reports' },
  { module: 'Reporting', path: '/comparative-pl' },
  { module: 'Reporting', path: '/comparative-bs' },
  { module: 'Reporting', path: '/budgets' },
  { module: 'Reporting', path: '/project-profitability' },
  { module: 'Reporting', path: '/audit-compliance-reports' },

  { module: 'Work & Projects', path: '/work' },
  { module: 'Work & Projects', path: '/work/projects' },
  { module: 'Work & Projects', path: '/work/time' },
  { module: 'Work & Projects', path: '/work/resources' },
  { module: 'Work & Projects', path: '/work/clocking' },
  { module: 'Work & Projects', path: '/projects' },
  { module: 'Work & Projects', path: '/time-tracking' },

  { module: 'Loans', path: '/loans' },
  { module: 'Files & Import', path: '/import' },
  { module: 'Collaboration', path: '/chat' },
  { module: 'Help', path: '/manual' },
];

const grouped = ROUTES.reduce<Record<string, string[]>>((acc, r) => {
  (acc[r.module] ||= []).push(r.path);
  return acc;
}, {});

for (const [module, paths] of Object.entries(grouped)) {
  test.describe(`${module} — route certification`, () => {
    for (const path of paths) {
      test(`${path} renders without runtime failure`, async ({ page, diagnostics }) => {
        await page.goto(path);
        await waitForRouteSettled(page);

        await expectNoErrorBoundary(page);
        expect(diagnostics.pageErrors, `uncaught exception on ${path}`).toEqual([]);
        expect(diagnostics.failedRequests, `server error on ${path}`).toEqual([]);
        expect(diagnostics.consoleErrors, `console error on ${path}`).toEqual([]);

        // The route must not silently fall through to the 404 page.
        await expect(page.getByText(/^404$/)).toHaveCount(0);
      });
    }
  });
}

test.describe('Navigation — unknown routes', () => {
  test('an unknown path renders the not-found page, not a crash', async ({ page, diagnostics }) => {
    await page.goto('/this-route-does-not-exist-cert');
    await expectNoErrorBoundary(page);
    expect(diagnostics.pageErrors).toEqual([]);
  });
});
