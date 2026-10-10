/**
 * Live check of time pay (daily and hourly-paid and casual workers: days or hours × rate)
 * against the deployed payroll and work functions. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-time-live.ts
 *
 * A weekly run for 14–20 December 2026, pay = quantity × rate and nothing else:
 * - an hourly worker (R50) paid for timesheet hours, with approved Work Management hours imported;
 * - a daily-paid casual (R250) on non-standard employment (flat 25% PAYE) under 24 hours in
 *   the month (no UIF);
 * - a casual below the national minimum wage (advice only);
 * - a salaried employee (not on the timesheet).
 * The run is finalised (Work Management hours consumed) and reversed (hours released).
 * Then the week of 21 December from the attendance register (hours, and ticked days), and
 * copy previous period.
 * The test employees end on 31 December 2026.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMPANY_NAME = 'CERT TX 1785230675937';
const START = '2026-12-14';
const END = '2026-12-20';

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures += 1;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

function loadEnv() {
  try {
    for (const line of readFileSync(join(process.cwd(), '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* vars may already be set */ }
}

async function invoke<T>(sb: SupabaseClient, fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    let payload = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) { try { payload = JSON.stringify(await ctx.clone().json()); } catch { /* keep */ } }
    throw new Error(`${fn}.${String(body.method)}: ${payload}`);
  }
  return data as T;
}
async function refused(promise: Promise<unknown>): Promise<string> {
  try { await promise; return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

type Item = { description: string; amount: number; irp5_code: string | null; type: string };
type Payslip = { id: string; employee_id: string; calculation_snapshot: Record<string, any> };
type RunDetail = { payslips: Payslip[]; warnings?: Array<{ code: string; employee_id: string; message: string }> };

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const payroll = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'payroll', { company_id: companyId, ...body });
  const work = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'work', { company_id: companyId, ...body });
  const stamp = Date.now().toString().slice(-6);
  const letters = [...stamp].map((d) => 'ABCDEFGHIJ'[Number(d)]).join('');

  const coa = await invoke<Array<{ id: string; name: string; type: string }>>(sb, 'chart-of-accounts', { method: 'GET', company_id: companyId });
  const wage = coa.find((a) => a.type === 'Expense' && /wage|salary|payroll/i.test(a.name))!;
  const bank = coa.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name))!;
  const liability = coa.find((a) => a.type === 'Liability' && /payroll|statutory|paye|uif/i.test(a.name)) ?? coa.find((a) => a.type === 'Liability')!;

  const employee = (first: string, extra: Record<string, unknown>) => invoke<{ id: string }>(sb, 'employees', {
    method: 'POST', company_id: companyId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
    employeeData: {
      first_name: first, last_name: `Time ${letters}`, email: `${first.toLowerCase()}.${stamp}@adminless-fin.test`, phone: '0215550100',
      department: 'Certification', position: 'Time check', employment_type: 'casual',
      start_date: '2026-12-01', end_date: '2026-12-31', salary_period: 'weekly',
      ordinary_hours_per_week: 40, work_days_per_week: 5, tax_number: '0001339050', id_number: '8601015800086',
      residential_street_number: '12', residential_street_name: 'Long Street', residential_city: 'Cape Town', residential_postal_code: '8001',
      bank_name: 'FNB', bank_account_number: '62000000001', bank_branch_code: '250655', bank_account_type: 'current',
      ...extra,
    },
  });

  const hourly = await employee('Hourly', { pay_basis: 'hourly', pay_rate: 50 });
  const daily = await employee('Daily', { pay_basis: 'daily', pay_rate: 250, tax_method: 'non_standard' });
  const low = await employee('Lowrate', { pay_basis: 'hourly', pay_rate: 25 });
  const salaried = await employee('Salaried', { employment_type: 'permanent', salary_amount: 4_000 });

  // Two approved hours in Work Management on Friday 18 December (ordinary time).
  const projects = await work<Array<{ id: string; name: string }>>({ method: 'LIST_EWM_PROJECTS' });
  const project = projects.find((p) => p.name === 'Payroll time check') ?? await work<{ id: string }>({ method: 'UPSERT_EWM_PROJECT', project: { name: 'Payroll time check', status: 'active' } });
  const entry = await work<{ id: string }>({ method: 'UPSERT_TIME_ENTRY', entry: { ewm_project_id: project.id, employee_id: hourly.id, entry_date: '2026-12-18', hours: 2, billable: false } });
  await work({ method: 'SUBMIT_TIME_ENTRY', time_entry_id: entry.id });
  await work({ method: 'APPROVE_TIME_ENTRY', time_entry_id: entry.id });
  await work({ method: 'LOCK_TIME_ENTRY', time_entry_id: entry.id });

  const run = await payroll<{ id: string }>({ method: 'CREATE_RUN', additional_run: true, runData: { pay_period_start: START, pay_period_end: END, pay_date: END, pay_frequency: 'weekly' } });
  type SheetRow = { employeeId: string; payBasis: string; rate: number; quantity: number | null; amount: number; source: string | null; attendance: { quantity: number } | null; workHours: { quantity: number; entries: number } | null };
  let sheet = await payroll<{ rows: SheetRow[]; total: number }>({ method: 'GET_TIMESHEET', runId: run.id });
  const hourlyRow = sheet.rows.find((r) => r.employeeId === hourly.id);
  check('Only daily and hourly-paid employees are on the timesheet',
    !!hourlyRow && sheet.rows.some((r) => r.employeeId === daily.id) && !sheet.rows.some((r) => r.employeeId === salaried.id));
  check('Approved Work Management hours are waiting for the hourly worker', hourlyRow?.workHours?.quantity === 2, hourlyRow?.workHours);

  const forged = await sb.from('ewm_payroll_input_facts').insert({ company_id: companyId, employee_id: low.id, time_entry_id: entry.id, entry_date: '2026-12-15', hours: 40 }).select('id');
  check('Approved hours cannot be written through the API (payroll pays them)', !!forged.error, forged.error?.message);

  await payroll({ method: 'IMPORT_WORK_HOURS', runId: run.id });
  sheet = await payroll({ method: 'GET_TIMESHEET', runId: run.id });
  const imported = sheet.rows.find((r) => r.employeeId === hourly.id)!;
  check('Importing puts the approved hours on the timesheet: 2 h × R50 = R100', imported.quantity === 2 && imported.source === 'work_module' && imported.amount === 100, imported);

  await payroll({
    method: 'SAVE_TIMESHEET', runId: run.id, rows: [
      { employeeId: hourly.id, quantity: 40 },
      { employeeId: daily.id, quantity: 2 },
      { employeeId: low.id, quantity: 10 },
    ],
  });
  sheet = await payroll({ method: 'GET_TIMESHEET', runId: run.id });
  const row = (id: string) => sheet.rows.find((r) => r.employeeId === id)!;
  check('The timesheet shows quantity × rate: 40 h × R50 = R2 000; 2 days × R250 = R500; 10 h × R25 = R250',
    row(hourly.id).amount === 2000 && row(daily.id).amount === 500 && row(low.id).amount === 250, sheet.rows.map((r) => [r.quantity, r.rate, r.amount]));
  const negative = await refused(payroll({ method: 'SAVE_TIMESHEET', runId: run.id, rows: [{ employeeId: hourly.id, quantity: -1 }] }));
  check('Negative hours are refused', /TIMESHEET_VALUE/.test(negative));
  const tooMany = await refused(payroll({ method: 'SAVE_TIMESHEET', runId: run.id, rows: [{ employeeId: daily.id, quantity: 40 }] }));
  check('More than 31 days on one run is refused', /TIMESHEET_VALUE/.test(tooMany));
  const direct = await sb.from('payroll_timesheets').insert({ company_id: companyId, payroll_run_id: run.id, employee_id: low.id, ordinary_hours: 99 }).select('id');
  check('Timesheets cannot be written through the API', !!direct.error, direct.error?.message);

  await payroll({ method: 'GENERATE_PAYSLIPS', runId: run.id });
  const detail = await payroll<RunDetail>({ method: 'GET_RUN_DETAIL', runId: run.id });
  const slip = (id: string) => detail.payslips.find((p) => p.employee_id === id)!;
  const items = async (id: string) => (await payroll<{ payslip_items: Item[] }>({ method: 'GET_PAYSLIP_DETAIL', payslipId: slip(id).id })).payslip_items ?? [];
  const engines = (id: string) => slip(id).calculation_snapshot.engine_results as Array<{ engine_id: string; employee_amount: number; skipped?: boolean; breakdown?: Record<string, number> }>;
  const engine = (id: string, e: string) => engines(id).find((r) => r.engine_id === e);
  const earnings = (list: Item[]) => list.filter((i) => i.type === 'earning');

  const h = await items(hourly.id);
  check('Hourly payslip: one line "Hours worked (40 × R50.00)" = R2 000 (IRP5 3601), nothing else',
    earnings(h).length === 1 && earnings(h)[0].description === 'Hours worked (40 × R50.00)' && near(Number(earnings(h)[0].amount), 2000) && earnings(h)[0].irp5_code === '3601',
    h.map((i) => [i.description, i.amount, i.irp5_code]));
  check('40 hours this month: UIF deducted', (engine(hourly.id, 'uif')?.employee_amount ?? 0) > 0 && slip(hourly.id).calculation_snapshot.period_employment?.uif_exempt_under_24_hours === false);
  check('ETI ordinary hours are the timesheet hours (40)', slip(hourly.id).calculation_snapshot.period_employment?.ordinary_hours === 40);

  const d = await items(daily.id);
  check('Daily payslip: "Days worked (2 × R250.00)" = R500, nothing else',
    earnings(d).length === 1 && earnings(d)[0].description === 'Days worked (2 × R250.00)' && near(Number(earnings(d)[0].amount), 500), d.map((i) => [i.description, i.amount]));
  check('Non-standard employment: PAYE is a flat 25% (R125)', near(engine(daily.id, 'paye')?.employee_amount ?? 0, 125) && engine(daily.id, 'paye')?.breakdown?.flatRate === 0.25, engine(daily.id, 'paye'));
  check('2 days (16 hours) in the month: no UIF (under 24 hours)', (engine(daily.id, 'uif')?.employee_amount ?? 0) === 0 && slip(daily.id).calculation_snapshot.period_employment?.uif_exempt_under_24_hours === true);

  const s = await items(salaried.id);
  check('Salaried: the R4 000 weekly salary, untouched by time', near(earnings(s).reduce((t, i) => t + Number(i.amount), 0), 4000), s.map((i) => [i.description, i.amount]));

  check('The casual below the national minimum wage gets advice (not refused, still paid)',
    detail.warnings?.some((w) => w.code === 'TIMESHEET_CHECK' && w.employee_id === low.id && /minimum wage/.test(w.message)) === true && !!slip(low.id),
    detail.warnings?.filter((w) => w.employee_id === low.id));

  // Back to the imported Work Management hours, so the run pays (and consumes) them.
  await payroll({ method: 'SAVE_TIMESHEET', runId: run.id, rows: [{ employeeId: hourly.id, quantity: 0 }] });
  await payroll({ method: 'IMPORT_WORK_HOURS', runId: run.id });
  await payroll({ method: 'GENERATE_PAYSLIPS', runId: run.id });
  await payroll({ method: 'APPROVE_RUN', runId: run.id });
  await payroll({ method: 'FINALIZE_RUN', runId: run.id, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });
  const { data: consumed } = await sb.from('ewm_payroll_input_facts').select('status, payroll_run_id').eq('time_entry_id', entry.id).single();
  check('Finalising consumes the imported Work Management hours (paid once)', consumed?.status === 'consumed' && consumed?.payroll_run_id === run.id, consumed);
  const locked = await refused(payroll({ method: 'SAVE_TIMESHEET', runId: run.id, rows: [{ employeeId: hourly.id, quantity: 1 }] }));
  check('A finalised run\'s timesheet cannot change', /RUN_NOT_DRAFT/.test(locked));
  await payroll({ method: 'REVERSE_RUN', runId: run.id, reason: 'Time live check: reverse the test run' });
  const { data: released } = await sb.from('ewm_payroll_input_facts').select('status, payroll_run_id').eq('time_entry_id', entry.id).single();
  check('Reversing the run releases the hours', released?.status === 'ready' && released?.payroll_run_id === null, released);

  // ── Attendance, payroll rules, copy previous period ──
  const policiesBefore = await payroll<{ allowNegativeLeave: boolean }>({ method: 'GET_PAYROLL_POLICIES' });
  try {
    await payroll({ method: 'UPDATE_PAYROLL_POLICIES', allowNegativeLeave: true });
    // Leave beyond the balance is allowed while the company allows it.
    const types = await payroll<Array<{ id: string; code: string }>>({ method: 'GET_LEAVE_TYPES' });
    const annualId = types.find((t) => t.code === 'annual')!.id;
    const advance = await refused(payroll({ method: 'RECORD_LEAVE', employeeId: daily.id, leaveTypeId: annualId, entryType: 'taken', startDate: '2026-12-28', endDate: '2026-12-31' }));
    check('Leave beyond the balance is recorded when the company allows negative balances', advance === '', advance.slice(0, 120));

    // The week of 21 December: Saturday, Sunday and Christmas Day count like any other day.
    await payroll({
      method: 'SAVE_ATTENDANCE', entries: [
        { employeeId: hourly.id, date: '2026-12-21', hours: 10 },
        { employeeId: hourly.id, date: '2026-12-22', hours: 3 },
        { employeeId: hourly.id, date: '2026-12-25', hours: 6 },
        { employeeId: hourly.id, date: '2026-12-27', hours: 4 },
        { employeeId: daily.id, date: '2026-12-21', days: 1 },
        { employeeId: daily.id, date: '2026-12-22', days: 0.5 },
        { employeeId: daily.id, date: '2026-12-26', days: 1 },
        { employeeId: daily.id, date: '2026-12-27', days: 1 },
      ],
    });
    const register = await payroll<{ entries: Array<{ employee_id: string; work_date: string; hours: number | null; days: number | null }>; publicHolidays: string[] }>({ method: 'GET_ATTENDANCE', from: '2026-12-21', to: '2026-12-27' });
    check('The register holds the week: hours for the hourly worker, days for the daily worker',
      register.entries.filter((e) => e.employee_id === hourly.id).length === 4 && register.entries.filter((e) => e.employee_id === daily.id && e.days != null).length === 4 && register.publicHolidays.includes('2026-12-25'));
    const badDay = await refused(payroll({ method: 'SAVE_ATTENDANCE', entries: [{ employeeId: daily.id, date: '2026-12-23', days: 2 }] }));
    check('A day is full, half or not worked (2 days on one date is refused)', /ATTENDANCE_DAYS/.test(badDay));
    const outside = await refused(payroll({ method: 'SAVE_ATTENDANCE', entries: [{ employeeId: hourly.id, date: '2027-01-04', hours: 8 }] }));
    check('Hours after the employee\'s end date are refused', /ATTENDANCE_OUTSIDE_EMPLOYMENT/.test(outside));

    const run2 = await payroll<{ id: string }>({ method: 'CREATE_RUN', additional_run: true, runData: { pay_period_start: '2026-12-21', pay_period_end: '2026-12-27', pay_date: '2026-12-27', pay_frequency: 'weekly' } });
    await payroll({ method: 'IMPORT_ATTENDANCE', runId: run2.id });
    const sheet2 = await payroll<{ rows: SheetRow[] }>({ method: 'GET_TIMESHEET', runId: run2.id });
    const t = (id: string) => sheet2.rows.find((r) => r.employeeId === id)!;
    check('Filled from attendance: hourly 10+3+6+4 = 23 h × R50 = R1 150; daily 3.5 days × R250 = R875',
      t(hourly.id).source === 'attendance' && t(hourly.id).quantity === 23 && t(hourly.id).amount === 1150 && t(daily.id).quantity === 3.5 && t(daily.id).amount === 875,
      [t(hourly.id), t(daily.id)].map((r) => [r.quantity, r.amount]));
    await payroll({ method: 'GENERATE_PAYSLIPS', runId: run2.id });
    const d2 = await payroll<RunDetail>({ method: 'GET_RUN_DETAIL', runId: run2.id });
    const pay2 = async (id: string) => earnings((await payroll<{ payslip_items: Item[] }>({ method: 'GET_PAYSLIP_DETAIL', payslipId: d2.payslips.find((p) => p.employee_id === id)!.id })).payslip_items);
    const h2 = await pay2(hourly.id);
    const dd2 = await pay2(daily.id);
    check('Payslips: R1 150 and R875 exactly, no overtime, Sunday or public holiday premiums',
      h2.length === 1 && near(Number(h2[0].amount), 1150) && dd2.length === 1 && near(Number(dd2[0].amount), 875), [h2, dd2].map((l) => l.map((i) => [i.description, i.amount])));
    await payroll({ method: 'APPROVE_RUN', runId: run2.id });
    await payroll({ method: 'FINALIZE_RUN', runId: run2.id, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });
    const lockedDay = await refused(payroll({ method: 'SAVE_ATTENDANCE', entries: [{ employeeId: hourly.id, date: '2026-12-21', hours: 9 }] }));
    check('Days paid by a finalised run are locked', /ATTENDANCE_PAID/.test(lockedDay));
    const directAttendance = await sb.from('payroll_attendance').insert({ company_id: companyId, employee_id: hourly.id, work_date: '2026-12-23', hours: 12 }).select('id');
    check('Attendance cannot be written through the API', !!directAttendance.error, directAttendance.error?.message);

    // Copy the previous period into the next run.
    const run3 = await payroll<{ id: string }>({ method: 'CREATE_RUN', additional_run: true, runData: { pay_period_start: '2026-12-28', pay_period_end: '2027-01-03', pay_date: '2027-01-03', pay_frequency: 'weekly' } });
    const copy = await payroll<{ copied: number; from: { start: string } | null }>({ method: 'COPY_PREVIOUS_TIMESHEET', runId: run3.id });
    const sheet3 = await payroll<{ rows: SheetRow[] }>({ method: 'GET_TIMESHEET', runId: run3.id });
    check('Copy previous period fills the next run from the last timesheet (23 h, 3.5 days)',
      copy.from?.start === '2026-12-21' && sheet3.rows.find((r) => r.employeeId === hourly.id)?.quantity === 23 && sheet3.rows.find((r) => r.employeeId === daily.id)?.quantity === 3.5, copy);
    await payroll({ method: 'DISCARD_RUN', runId: run3.id });

    await payroll({ method: 'REVERSE_RUN', runId: run2.id, reason: 'Time live check: reverse the register run' });
    const unlocked = await refused(payroll({ method: 'SAVE_ATTENDANCE', entries: [{ employeeId: hourly.id, date: '2026-12-21', hours: 9 }] }));
    check('Reversing the run unlocks its days', unlocked === '', unlocked.slice(0, 120));
    // Back to the week as recorded (the browser spec reads it: 23 hours, 3.5 days).
    await payroll({ method: 'SAVE_ATTENDANCE', entries: [{ employeeId: hourly.id, date: '2026-12-21', hours: 10 }] });
  } finally {
    await payroll({ method: 'UPDATE_PAYROLL_POLICIES', allowNegativeLeave: policiesBefore.allowNegativeLeave }).catch((e) => console.error('restore policies failed', e));
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
