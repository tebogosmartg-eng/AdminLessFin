/**
 * Live check of Payroll Phase 4 (hourly, daily-paid and casual workers, overtime, time data)
 * against the deployed payroll and work functions. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-time-live.ts
 *
 * A weekly run for 14–20 December 2026 (16 December is a public holiday):
 * - an hourly worker paid for timesheet hours, overtime 1.5×, Sunday 2× and the public
 *   holiday not worked, with approved Work Management hours imported;
 * - a daily-paid casual on non-standard employment (flat 25% PAYE) under 24 hours in the
 *   month (no UIF);
 * - a casual below the national minimum wage (flagged);
 * - a salaried employee with overtime.
 * The run is finalised (Work Management hours consumed) and reversed (hours released).
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
  const daily = await employee('Daily', { pay_basis: 'daily', pay_rate: 400, tax_method: 'non_standard' });
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
  let sheet = await payroll<{ rows: Array<{ employeeId: string; payBasis: string; suggestedPublicHolidays: string[]; workHours: { ordinary: number; factIds: string[] } | null }>; salaried: Array<{ employeeId: string }> }>({ method: 'GET_TIMESHEET', runId: run.id });
  const hourlyRow = sheet.rows.find((r) => r.employeeId === hourly.id);
  check('Hourly and daily-paid employees are on the timesheet; salaried can be added for overtime',
    !!hourlyRow && sheet.rows.some((r) => r.employeeId === daily.id) && sheet.salaried.some((s) => s.employeeId === salaried.id));
  check('The public holiday on a working day is suggested (16 December)', hourlyRow?.suggestedPublicHolidays.includes('2026-12-16') === true, hourlyRow?.suggestedPublicHolidays);
  check('Approved Work Management hours are waiting for the hourly worker', hourlyRow?.workHours?.ordinary === 2, hourlyRow?.workHours);

  const forged = await sb.from('ewm_payroll_input_facts').insert({ company_id: companyId, employee_id: low.id, time_entry_id: entry.id, entry_date: '2026-12-15', hours: 40 }).select('id');
  check('Approved hours cannot be written through the API (payroll pays them)', !!forged.error, forged.error?.message);

  await payroll({ method: 'IMPORT_WORK_HOURS', runId: run.id });
  sheet = await payroll({ method: 'GET_TIMESHEET', runId: run.id });
  const imported = sheet.rows.find((r) => r.employeeId === hourly.id) as unknown as { timesheet: { ordinaryHours: number }; source: string };
  check('Importing puts the approved hours on the timesheet', imported.timesheet?.ordinaryHours === 2 && imported.source === 'work_module', imported);

  await payroll({
    method: 'SAVE_TIMESHEET', runId: run.id, rows: [
      { employeeId: hourly.id, ordinaryHours: 32, overtimeHours: 4, sundayHours: 3, publicHolidayDaysPaid: 1, source: 'work_module', workFactIds: hourlyRow!.workHours!.factIds },
      { employeeId: daily.id, daysWorked: 2 },
      { employeeId: low.id, ordinaryHours: 10 },
      { employeeId: salaried.id, overtimeHours: 2 },
    ],
  });
  const negative = await refused(payroll({ method: 'SAVE_TIMESHEET', runId: run.id, rows: [{ employeeId: hourly.id, ordinaryHours: -1 }] }));
  check('Negative hours are refused', /TIMESHEET_VALUE/.test(negative));
  const direct = await sb.from('payroll_timesheets').insert({ company_id: companyId, payroll_run_id: run.id, employee_id: low.id, ordinary_hours: 99 }).select('id');
  check('Timesheets cannot be written through the API', !!direct.error, direct.error?.message);

  await payroll({ method: 'GENERATE_PAYSLIPS', runId: run.id });
  const detail = await payroll<RunDetail>({ method: 'GET_RUN_DETAIL', runId: run.id });
  const slip = (id: string) => detail.payslips.find((p) => p.employee_id === id)!;
  const items = async (id: string) => (await payroll<{ payslip_items: Item[] }>({ method: 'GET_PAYSLIP_DETAIL', payslipId: slip(id).id })).payslip_items ?? [];
  const engines = (id: string) => slip(id).calculation_snapshot.engine_results as Array<{ engine_id: string; employee_amount: number; skipped?: boolean; breakdown?: Record<string, number> }>;
  const engine = (id: string, e: string) => engines(id).find((r) => r.engine_id === e);

  const h = await items(hourly.id);
  const amount = (list: Item[], pred: (i: Item) => boolean) => list.filter(pred).reduce((s, i) => s + Number(i.amount), 0);
  check('Hourly: 32 h × R50 = R1 600 basic (IRP5 3601)', near(amount(h, (i) => i.irp5_code === '3601' && /basic/i.test(i.description)), 1600), h.map((i) => [i.description, i.amount, i.irp5_code]));
  check('Overtime 4 h × R50 × 1.5 = R300 under IRP5 3607', near(amount(h, (i) => i.irp5_code === '3607'), 300));
  check('Sunday 3 h × R50 × 2 = R300', near(amount(h, (i) => /Sunday/.test(i.description)), 300));
  check('Public holiday not worked: 1 day × 8 h × R50 = R400', near(amount(h, (i) => /Public holiday pay/.test(i.description)), 400));
  check('39 hours this month: UIF deducted', (engine(hourly.id, 'uif')?.employee_amount ?? 0) > 0 && slip(hourly.id).calculation_snapshot.period_employment?.uif_exempt_under_24_hours === false);
  check('ETI ordinary hours are the timesheet ordinary hours (32)', slip(hourly.id).calculation_snapshot.period_employment?.ordinary_hours === 32);

  const d = await items(daily.id);
  check('Daily-paid: 2 days × R400 = R800', near(amount(d, (i) => i.type === 'earning'), 800), d.map((i) => [i.description, i.amount]));
  check('Non-standard employment: PAYE is a flat 25% (R200)', near(engine(daily.id, 'paye')?.employee_amount ?? 0, 200) && engine(daily.id, 'paye')?.breakdown?.flatRate === 0.25, engine(daily.id, 'paye'));
  check('16 hours in the month: no UIF (under 24 hours)', (engine(daily.id, 'uif')?.employee_amount ?? 0) === 0 && slip(daily.id).calculation_snapshot.period_employment?.uif_exempt_under_24_hours === true);

  const s = await items(salaried.id);
  check('Salaried R4 000 a week, 40 h: overtime 2 h × R100 × 1.5 = R300 on top of the salary', near(amount(s, (i) => i.irp5_code === '3607'), 300) && near(amount(s, (i) => /basic/i.test(i.description)), 4000), s.map((i) => [i.description, i.amount]));

  check('The casual below the national minimum wage is flagged', detail.warnings?.some((w) => w.code === 'TIMESHEET_CHECK' && w.employee_id === low.id && /minimum wage/.test(w.message)) === true, detail.warnings?.filter((w) => w.employee_id === low.id));

  await payroll({ method: 'APPROVE_RUN', runId: run.id });
  await payroll({ method: 'FINALIZE_RUN', runId: run.id, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });
  const { data: consumed } = await sb.from('ewm_payroll_input_facts').select('status, payroll_run_id').eq('time_entry_id', entry.id).single();
  check('Finalising consumes the imported Work Management hours (paid once)', consumed?.status === 'consumed' && consumed?.payroll_run_id === run.id, consumed);
  const locked = await refused(payroll({ method: 'SAVE_TIMESHEET', runId: run.id, rows: [{ employeeId: hourly.id, ordinaryHours: 1 }] }));
  check('A finalised run\'s timesheet cannot change', /RUN_NOT_DRAFT/.test(locked));
  await payroll({ method: 'REVERSE_RUN', runId: run.id, reason: 'Time live check: reverse the test run' });
  const { data: released } = await sb.from('ewm_payroll_input_facts').select('status, payroll_run_id').eq('time_entry_id', entry.id).single();
  check('Reversing the run releases the hours', released?.status === 'ready' && released?.payroll_run_id === null, released);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
