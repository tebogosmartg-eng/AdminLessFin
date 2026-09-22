/**
 * The global company + financial year context.
 *
 * One company context (AuthContext, set by the server), one accounting-period
 * context (ReportingPeriodContext, over the company's own calendar). Switching
 * company leaves nothing of the previous company on hand; no preset reaches
 * outside the selected year; the database decides which year and period are
 * current and which periods refuse postings.
 *
 * Behaviour against live data is proved by the migration rehearsal and by the
 * Playwright spec tests/e2e/playwright/11-global-context.spec.ts. These pin
 * the logic and the shape.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  companyIdentifier,
  groupCompaniesForSwitcher,
  isContextMessage,
  listPathAfterSwitch,
  switcherNeedsSearch,
  companyMatches,
} from '../../src/lib/companyContext/switching';
import {
  clearStoredSelections,
  describeReportingRange,
  formatPeriodName,
  periodsOfYear,
  readSelection,
  resolveSelectedPeriod,
  resolveSelectedYear,
  selectionStorageKey,
  writeSelection,
} from '../../src/lib/reportingPeriod/selection';
import { periodStatusMeta } from '../../src/lib/reportingPeriod/status';
import type {
  AccountingPeriodDomainModel,
  FinancialYearDomainModel,
} from '../../src/governance/domains/financialCalendar/model';

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const year = (id: string, code: string, start: string, end: string, extra: Partial<FinancialYearDomainModel> = {}): FinancialYearDomainModel => ({
  id, companyId: 'co', yearCode: code, startDate: start, endDate: end, status: 'open',
  previousFinancialYearId: null, createdAt: null, isCurrent: false, ...extra,
});
const period = (id: string, yearId: string, n: number, start: string, end: string, extra: Partial<AccountingPeriodDomainModel> = {}): AccountingPeriodDomainModel => ({
  id, financialYearId: yearId, companyId: 'co', periodNumber: n, startDate: start, endDate: end,
  status: 'open', financialYearCode: null, createdAt: null, updatedAt: null, isCurrent: false, ...extra,
});

// ---------------------------------------------------------------------------
describe('company switcher', () => {
  it('tells same-named companies apart', () => {
    const a = { id: '67b43d47-2fc1-48c4-8214-9eb2243b246b', name: "My's Company" };
    const b = { id: '3cbfd4eb-a095-43f3-837a-0b4f1e2c1752', name: "My's Company" };
    expect(companyIdentifier(a)).not.toBe(companyIdentifier(b));
    expect(companyIdentifier(a)).toBe('Ref 67B43D47');
    expect(companyIdentifier({ ...a, tax_id: ' 9123456789 ' })).toBe('Tax no. 9123456789');
  });

  it('shows recent companies first, never the active one, and only companies the server listed', () => {
    const companies = [
      { id: 'a', name: 'Beta' }, { id: 'b', name: 'alpha' }, { id: 'c', name: 'Gamma' },
    ];
    const { recent, all } = groupCompaniesForSwitcher(companies, 'a', ['a', 'gone', 'c', 'b']);
    expect(recent.map((c) => c.id)).toEqual(['c', 'b']); // 'a' is active, 'gone' is not a membership
    expect(all.map((c) => c.name)).toEqual(['alpha', 'Beta', 'Gamma']);
  });

  it('offers search once the list no longer fits at a glance', () => {
    expect(switcherNeedsSearch(1)).toBe(false);
    expect(switcherNeedsSearch(5)).toBe(false);
    expect(switcherNeedsSearch(14)).toBe(true);
  });

  it('searches by name, reference or tax number', () => {
    const c = { id: '67b43d47-2fc1-48c4-8214-9eb2243b246b', name: 'GAMA TV (PTY) LTD', tax_id: '9123' };
    expect(companyMatches(c, 'gama')).toBe(true);
    expect(companyMatches(c, '9123')).toBe(true);
    expect(companyMatches(c, 'spaceman')).toBe(false);
  });

  it('leaves a record page for its list when the company changes', () => {
    expect(listPathAfterSwitch('/invoices/0b07df94-1868-4ed9-aaa2-6ac8b847234b')).toBe('/invoices');
    expect(listPathAfterSwitch('/financial-statements-workspace/0b07df94-1868-4ed9-aaa2-6ac8b847234b/notes')).toBe('/financial-statements-workspace');
    expect(listPathAfterSwitch('/trial-balance')).toBeNull();
    expect(listPathAfterSwitch('/0b07df94-1868-4ed9-aaa2-6ac8b847234b')).toBe('/');
  });

  it('only accepts well-formed cross-tab messages', () => {
    expect(isContextMessage({ type: 'company-switched', userId: 'u', companyId: 'c' })).toBe(true);
    expect(isContextMessage({ type: 'company-switched', userId: 'u' })).toBe(false);
    expect(isContextMessage('company-switched')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('selected financial year and period', () => {
  const fy26 = year('y26', 'FY2026', '2025-03-01', '2026-02-28', { status: 'closed' });
  const fy27 = year('y27', 'FY2027', '2026-03-01', '2027-02-28', { isCurrent: true });
  const years = [fy27, fy26];

  it('defaults to the year the database marks current', () => {
    expect(resolveSelectedYear(years, null)?.id).toBe('y27');
  });

  it('keeps a chosen year of this company', () => {
    expect(resolveSelectedYear(years, 'y26')?.id).toBe('y26');
  });

  it('never trusts a remembered year this company does not have', () => {
    expect(resolveSelectedYear(years, 'another-companys-year')?.id).toBe('y27');
  });

  it('only accepts a period of the selected year', () => {
    const periods = [period('p-sep', 'y27', 7, '2026-09-01', '2026-09-30'), period('p-old', 'y26', 7, '2025-09-01', '2025-09-30')];
    expect(resolveSelectedPeriod(periods, fy27, 'p-sep')?.id).toBe('p-sep');
    expect(resolveSelectedPeriod(periods, fy27, 'p-old')).toBeNull();
    expect(periodsOfYear(periods, fy27).map((p) => p.id)).toEqual(['p-sep']);
  });

  it('names what is on screen', () => {
    const sep = period('p-sep', 'y27', 7, '2026-09-01', '2026-09-30');
    expect(formatPeriodName(sep)).toBe('September 2026');
    expect(describeReportingRange('accounting_period', { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }, sep)).toBe('September 2026');
    expect(describeReportingRange('current_financial_year', { from: new Date(2026, 2, 1), to: new Date(2027, 1, 28) }, null)).toBe('Full year');
  });
});

// ---------------------------------------------------------------------------
describe('the remembered choice', () => {
  const store = new Map<string, string>();
  const sessionStorage = {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  beforeEach(() => { (globalThis as any).window = { sessionStorage }; store.clear(); });
  afterEach(() => { delete (globalThis as any).window; });

  it('is kept per user AND per company', () => {
    const a = selectionStorageKey('user-1', 'company-a');
    const b = selectionStorageKey('user-1', 'company-b');
    writeSelection(a, { yearId: 'y26', preset: 'current_financial_year', periodId: null, customFrom: null, customTo: null });
    expect(readSelection(a)?.yearId).toBe('y26');
    expect(readSelection(b)).toBeNull();
    expect(readSelection(selectionStorageKey('user-2', 'company-a'))).toBeNull();
  });

  it('is forgotten on sign-out, and nothing else is touched', () => {
    store.set('unrelated', 'keep');
    writeSelection(selectionStorageKey('u', 'c'), { yearId: 'y', preset: 'current_financial_year', periodId: null, customFrom: null, customTo: null });
    clearStoredSelections();
    expect(readSelection(selectionStorageKey('u', 'c'))).toBeNull();
    expect(store.get('unrelated')).toBe('keep');
  });

  it('ignores a tampered or unknown preset', () => {
    store.set(selectionStorageKey('u', 'c'), JSON.stringify({ yearId: 5, preset: 'previous_financial_year' }));
    const s = readSelection(selectionStorageKey('u', 'c'));
    expect(s?.yearId).toBeNull();
    expect(s?.preset).toBe('current_financial_year');
  });
});

// ---------------------------------------------------------------------------
describe('period status is the database\'s rule', () => {
  it('the statuses shown as refusing postings are exactly the ones assert_period_open refuses', () => {
    const sql = read('supabase/migrations/20260722200000_erp_v10_accounting_period_foundation.sql');
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.assert_period_open'));
    const refused = /v_period\.status IN \(([^)]*)\)/.exec(fn)![1].match(/'([a-z_]+)'/g)!.map((s) => s.replace(/'/g, ''));
    const all = ['future', 'open', 'soft_closed', 'hard_closed', 'locked', 'reopened'];
    expect(all.filter((s) => !periodStatusMeta(s).acceptsPostings).sort()).toEqual(refused.sort());
  });
});

// ---------------------------------------------------------------------------
describe('switching company leaves nothing of the previous company', () => {
  const auth = read('src/contexts/AuthContext.tsx');
  const layout = read('src/components/Layout.tsx');

  it('the switch cancels in-flight requests, switches on the server, then drops every cached answer', () => {
    const fn = auth.slice(auth.indexOf('const performSwitch'), auth.indexOf('const queueSwitch'));
    const cancel = fn.indexOf('queryClient.cancelQueries()');
    const server = fn.indexOf("'SWITCH_COMPANY'");
    const clear = fn.indexOf('queryClient.clear()');
    const load = fn.indexOf('fetchUserAndCompanyData(user, { force: true })');
    expect(cancel).toBeGreaterThan(-1);
    expect(cancel).toBeLessThan(server);
    expect(server).toBeLessThan(clear);
    expect(clear).toBeLessThan(load);
  });

  it('a superseded switch is skipped, so the last company chosen is the one the server ends with', () => {
    expect(auth).toContain('if (latestSwitchTarget.current !== companyId) return;');
    expect(auth).toMatch(/switchChain\.current\s*\n?\s*\.catch/);
  });

  it('signing out, or a different user signing in, clears the cache and the remembered year', () => {
    const signOut = auth.slice(auth.indexOf('const signOut'), auth.indexOf('const refreshProfile'));
    expect(signOut).toContain('queryClient.clear()');
    expect(signOut).toContain('clearStoredSelections()');
    expect(auth).toContain('lastFetchUserId.current !== currentSession.user.id');
  });

  it('other tabs of the same user follow the switch', () => {
    expect(auth).toContain("message.userId !== user.id");
    expect(auth).toContain("queueSwitch(message.companyId, 'other-tab')");
  });

  it('pages remount per company and are not shown while switching', () => {
    expect(layout).toContain("key={activeCompany?.id ?? 'no-company'}");
    expect(layout).toMatch(/switchingTo \? \(\s*<SwitchingCompany/);
  });
});

// ---------------------------------------------------------------------------
describe('one context, no per-page year logic', () => {
  it('no page carries a fixed "Current Financial Year" badge', () => {
    for (const p of ['src/pages/FinancialStatements.tsx', 'src/pages/Reports.tsx', 'src/pages/PayrollWorkspace.tsx', 'src/pages/FixedAssets.tsx']) {
      expect(read(p)).not.toMatch(/>\s*Current Financial Year\s*</);
    }
  });

  it('the accounting filter bar has no year or period select of its own', () => {
    const bar = read('src/components/accounting/AccountingFiltersBar.tsx');
    expect(bar).not.toContain('All financial years');
    expect(bar).not.toContain("'Current · '");
  });

  it('the general ledger has no year shortcut of its own, and keeps old rows only while paging', () => {
    const gl = read('src/pages/GeneralLedger.tsx');
    expect(gl).not.toContain('handlePeriodFilterChange');
    expect(gl).not.toContain('placeholderData: (prev) => prev,');
    expect(gl).toContain('financial_year_id: financialYearId');
  });

  it('journal entries follow the global period', () => {
    const je = read('src/pages/JournalEntries.tsx');
    expect(je).toContain('date_from: dateFrom');
    expect(je).not.toContain('useState<DateRange');
  });

  it('settings does not work out the current year from the signed-in user\'s profile', () => {
    const fys = read('src/components/FinancialYearSettings.tsx');
    expect(fys).not.toContain('profile.current_financial_year_start');
    expect(fys).toContain('currentFinancialYear');
  });

  it('the accounting edge function has one current-period rule and no 1 January YTD', () => {
    const acc = read('supabase/functions/accounting/index.ts');
    expect(acc).toContain("admin.rpc('accounting_period_current'");
    expect(acc).not.toMatch(/String\(p\.status\)\.toLowerCase\(\) === 'open' \|\|\s*\n\s*\(p\.start_date <= today/);
    expect(acc).not.toContain('const yearStart = `${endDate.slice(0, 4)}-01-01`');
    expect(acc).not.toContain("body.start_date || `${new Date().getFullYear()}-01-01`");
  });

  it('the AFS home asks the database for the current year', () => {
    const fs = read('supabase/functions/financial-statements/index.ts');
    const home = fs.slice(fs.indexOf('case "GET_FINANCIAL_STATEMENTS_HOME"'), fs.indexOf('let workspace = null;', fs.indexOf('case "GET_FINANCIAL_STATEMENTS_HOME"')));
    expect(home).toContain('rpc("financial_year_current"');
    expect(home).not.toContain('y.status === "open"');
  });
});

// ---------------------------------------------------------------------------
describe('tenant safety of the context', () => {
  const mig = read('supabase/migrations/20260923100000_the_company_context_is_one_and_tenant_safe.sql');
  const inv = read('supabase/migrations/20260923110000_joining_a_company_needs_a_recorded_invitation.sql');

  it('the saved company must be a membership', () => {
    expect(mig).toContain('BEFORE INSERT OR UPDATE OF active_company_id ON public.profiles');
    expect(mig).toMatch(/cu\.user_id = NEW\.id AND cu\.company_id = NEW\.active_company_id/);
  });

  it('the year close/reopen that act on the saved company are service role only', () => {
    expect(mig).toContain('REVOKE EXECUTE ON FUNCTION public.close_financial_year(date) FROM PUBLIC, anon, authenticated;');
    expect(mig).toContain('REVOKE EXECUTE ON FUNCTION public.reopen_financial_year(uuid) FROM PUBLIC, anon, authenticated;');
  });

  it('years and periods cannot be rewritten or deleted from the browser', () => {
    expect(mig).toContain('DROP POLICY IF EXISTS financial_years_all');
    expect(mig).toContain('DROP POLICY IF EXISTS accounting_periods_all');
    expect(mig).toContain("WITH CHECK (public.is_admin_of(company_id) AND status IN ('open', 'draft'))");
    expect(mig).not.toMatch(/CREATE POLICY [a-z_]+ ON public\.(financial_years|accounting_periods)\s+FOR (UPDATE|DELETE|ALL)/);
  });

  it('joining a company needs an invitation the server recorded, and takes its role from it', () => {
    expect(inv).toContain('FROM public.company_invitations i');
    expect(inv).toContain('lower(i.email) = lower(new.email)');
    expect(inv).toContain('VALUES (v_invitation_company_id, new.id, v_invitation_role)');
    expect(inv).not.toContain("raw_user_meta_data ->> 'invited_role'");
  });

  it('invite-user records the invitation before sending it', () => {
    const fn = read('supabase/functions/invite-user/index.ts');
    expect(fn.indexOf(".from('company_invitations')")).toBeGreaterThan(-1);
    expect(fn.indexOf(".from('company_invitations')")).toBeLessThan(fn.indexOf('inviteUserByEmail'));
    expect(fn).toContain("only an owner can invite another owner");
  });

  it('recurring invoices check membership before using the service role', () => {
    const fn = read('supabase/functions/recurring-invoices/index.ts');
    expect(fn.indexOf(".from('company_users')")).toBeGreaterThan(-1);
    expect(fn.indexOf(".from('company_users')")).toBeLessThan(fn.indexOf('switch (method)'));
  });

  it('the profile update only writes the user\'s own editable fields', () => {
    const fn = read('supabase/functions/settings/index.ts');
    const upd = fn.slice(fn.indexOf("method === 'UPDATE_PROFILE'"), fn.indexOf("method === 'SWITCH_COMPANY'"));
    expect(upd).toContain('PROFILE_FIELDS');
    expect(upd).not.toContain("'active_company_id'");
    expect(upd).not.toContain('.update(body.profileData)');
  });
});
