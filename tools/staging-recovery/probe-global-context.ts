/**
 * The global company + financial year context, checked live as the E2E user.
 *
 *   npx tsx tools/staging-recovery/probe-global-context.ts <ids.json>
 *
 * <ids.json> lists company ids; those the user does not belong to are used as
 * "foreign" companies. Everything that is attempted against them is expected
 * to be refused; nothing here changes a company's books. The user's own
 * profile is touched only by writing back values it already has, and its
 * active company is restored at the end.
 *
 * Checks:
 *   1. one current period per company, inside the current year, and the
 *      accounting context reports the same one;
 *   2. "YTD" in the account activity workspace starts at the financial year,
 *      not 1 January (a March-year company);
 *   3. recurring invoices refuse a company the user does not belong to;
 *   4. the profile update refuses fields other than the user's own;
 *   5. the saved active company cannot be pointed at a foreign company (REST);
 *   6. periods and years cannot be rewritten or deleted from the browser (REST);
 *   7. the legacy year close/reopen cannot be called by a signed-in user.
 */
import fs from 'node:fs';
import { connect, invoke, tech } from './edgeProbe';

type Row = { ok: boolean; label: string; detail: string };
const rows: Row[] = [];
const check = (ok: boolean, label: string, detail = '') => rows.push({ ok, label, detail });

async function main() {
  const idsFile = process.argv[2];
  if (!idsFile) throw new Error('Pass a JSON file of company ids.');
  const allIds = JSON.parse(fs.readFileSync(idsFile, 'utf8')) as string[];
  const { supabase: api, companies } = await connect('Spaceman');
  const mine = new Set(companies.map((c) => c.id));
  const foreign = allIds.filter((id) => !mine.has(id));
  const session = await invoke(api, 'user-session', { method: 'GET' });
  const originalActive = (session.body as any)?.activeCompany?.id as string;
  const userId = (session.body as any)?.profile?.id as string;

  // ---- 1. current period ------------------------------------------------
  let checked = 0; let bad = 0; const detail: string[] = [];
  for (const c of companies) {
    const years = (await invoke(api, 'accounting', { method: 'GET_FINANCIAL_YEARS', company_id: c.id })).body as any[];
    const periods = (await invoke(api, 'accounting', { method: 'GET_FINANCIAL_PERIODS', company_id: c.id })).body as any[];
    const ctx = (await invoke(api, 'accounting', { method: 'GET_ENTERPRISE_CONTEXT', company_id: c.id })).body as any;
    if (!years?.length) continue;
    checked++;
    const cy = years.filter((y) => y.is_current);
    const cp = (periods || []).filter((p) => p.is_current);
    const today = new Date().toISOString().slice(0, 10);
    const problems: string[] = [];
    if (cy.length !== 1) problems.push(`${cy.length} current years`);
    if (cp.length !== 1) problems.push(`${cp.length} current periods`);
    if (cy[0] && cp[0] && cp[0].financial_year_id !== cy[0].id) problems.push('period not in current year');
    if (cy[0] && cp[0] && cy[0].start_date <= today && today <= cy[0].end_date && !(cp[0].start_date <= today && today <= cp[0].end_date)) problems.push('period does not contain today');
    if (ctx?.current_accounting_period?.id !== cp[0]?.id) problems.push('context disagrees on period');
    if (ctx?.current_financial_year?.id !== cy[0]?.id) problems.push('context disagrees on year');
    if (problems.length) { bad++; detail.push(`${c.name}: ${problems.join(', ')}`); }
  }
  check(bad === 0 && checked > 0, 'one current period per company, in the current year, and the context agrees', `${checked} companies; ${detail.join('; ') || 'all agree'}`);

  // ---- 2. YTD starts at the financial year ------------------------------
  const marchCo = companies.find((c) => c.name === 'Spaceman') ?? companies[0];
  const years = (await invoke(api, 'accounting', { method: 'GET_FINANCIAL_YEARS', company_id: marchCo.id })).body as any[];
  const cur = years.find((y) => y.is_current);
  const accounts = (await invoke(api, 'chart-of-accounts', { method: 'GET', company_id: marchCo.id })).body as any;
  const accountList = Array.isArray(accounts) ? accounts : accounts?.data ?? [];
  const endDate = new Date().toISOString().slice(0, 10) < cur.end_date ? new Date().toISOString().slice(0, 10) : cur.end_date;
  const dayBefore = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  const { data: balNow } = await api.rpc('get_balances_as_of_date', { p_end_date: endDate, p_company_id: marchCo.id });
  const { data: balOpen } = await api.rpc('get_balances_as_of_date', { p_end_date: dayBefore(cur.start_date), p_company_id: marchCo.id });
  const moved = (accountList as any[]).find((a) => {
    const n = Number((balNow as any[] || []).find((b) => b.id === a.id)?.balance || 0);
    const o = Number((balOpen as any[] || []).find((b) => b.id === a.id)?.balance || 0);
    return Math.abs(n - o) > 0.005;
  });
  if (moved) {
    const ws = (await invoke(api, 'accounting', {
      method: 'GET_ACCOUNT_ACTIVITY_WORKSPACE', company_id: marchCo.id, account_id: moved.id,
      start_date: cur.start_date, end_date: endDate, financial_year_id: cur.id, page: 1, page_size: 5,
    })).body as any;
    const n = Number((balNow as any[]).find((b) => b.id === moved.id)?.balance || 0);
    const o = Number((balOpen as any[]).find((b) => b.id === moved.id)?.balance || 0);
    const expected = Math.round((n - o) * 100) / 100;
    const got = Math.round(Number(ws?.header?.ytd_movement ?? NaN) * 100) / 100;
    check(Math.abs(got - expected) < 0.01, `YTD movement runs from the financial year start (${cur.start_date}), not 1 January`, `expected ${expected}, got ${got}`);
  } else {
    check(true, 'YTD movement check skipped: no account moved this year', '');
  }

  // ---- 3. recurring invoices refuse a foreign company --------------------
  const ri = await invoke(api, 'recurring-invoices', { method: 'GET_ALL', company_id: foreign[0] });
  check(!ri.ok && ri.status === 403, 'recurring invoices refuse a company the user does not belong to', `status ${ri.status}`);
  const riOwn = await invoke(api, 'recurring-invoices', { method: 'GET_ALL', company_id: originalActive });
  check(riOwn.ok, 'and still serve the user\'s own company', `status ${riOwn.status}`);

  // ---- 4. the profile update only takes the user's own fields -----------
  const badProfile = await invoke(api, 'settings', { method: 'UPDATE_PROFILE', profileData: { active_company_id: foreign[0] } });
  check(!badProfile.ok, 'the profile update refuses active_company_id', tech(badProfile) || String((badProfile.body as any)?.businessMessage ?? ''));
  const badRole = await invoke(api, 'settings', { method: 'UPDATE_PROFILE', profileData: { role: 'admin' } });
  check(!badRole.ok, 'and the app role', tech(badRole) || '');
  const fullName = (session.body as any)?.profile?.full_name ?? null;
  const okProfile = await invoke(api, 'settings', { method: 'UPDATE_PROFILE', profileData: { full_name: fullName } });
  check(okProfile.ok, 'but still saves the user\'s own name', `status ${okProfile.status}`);

  // ---- 5. the saved company must be a membership (direct REST) -----------
  const rest = await api.from('profiles').update({ active_company_id: foreign[0] }).eq('id', userId).select('active_company_id');
  const after = await invoke(api, 'user-session', { method: 'GET' });
  check(!!rest.error && (after.body as any)?.activeCompany?.id === originalActive,
    'the saved company cannot be pointed at a foreign company, even through the REST API', rest.error?.message ?? 'accepted');

  // ---- 6. periods and years are read-only from the browser -------------
  const { data: somePeriods } = await api.from('accounting_periods').select('id, status').eq('company_id', originalActive).limit(1);
  const p = somePeriods?.[0];
  if (p) {
    const upd = await api.from('accounting_periods').update({ status: p.status === 'locked' ? 'open' : 'locked' }).eq('id', p.id).select('id');
    const del = await api.from('accounting_periods').delete().eq('id', p.id).select('id');
    const { data: still } = await api.from('accounting_periods').select('id, status').eq('id', p.id);
    check((upd.data ?? []).length === 0 && (del.data ?? []).length === 0 && still?.[0]?.status === p.status,
      'a period cannot be rewritten or deleted from the browser', `update ${upd.data?.length ?? 0} rows, delete ${del.data?.length ?? 0} rows, status still ${still?.[0]?.status}`);
  }
  const { data: someYears } = await api.from('financial_years').select('id, status').eq('company_id', originalActive).limit(1);
  const y = someYears?.[0];
  if (y) {
    const del = await api.from('financial_years').delete().eq('id', y.id).select('id');
    const upd = await api.from('financial_years').update({ status: 'closed' }).eq('id', y.id).select('id');
    const { data: still } = await api.from('financial_years').select('id, status').eq('id', y.id);
    check((del.data ?? []).length === 0 && (upd.data ?? []).length === 0 && still?.[0]?.status === y.status,
      'nor a financial year', `delete ${del.data?.length ?? 0}, update ${upd.data?.length ?? 0}, status still ${still?.[0]?.status}`);
  }

  // ---- 7. legacy close/reopen are not callable ---------------------------
  const close = await api.rpc('close_financial_year', { p_end_date: '2099-12-31' });
  check(!!close.error && /permission denied/i.test(close.error.message), 'a signed-in user cannot call close_financial_year', close.error?.message ?? 'ran');
  const reopen = await api.rpc('reopen_financial_year', { p_closed_year_id: '00000000-0000-0000-0000-000000000000' });
  check(!!reopen.error && /permission denied/i.test(reopen.error.message), 'nor reopen_financial_year', reopen.error?.message ?? 'ran');

  // restore
  await invoke(api, 'settings', { method: 'SWITCH_COMPANY', company_id: originalActive, target_company_id: originalActive });

  for (const r of rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.label}${r.detail ? `   << ${r.detail}` : ''}`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`---- ${rows.length - failed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
