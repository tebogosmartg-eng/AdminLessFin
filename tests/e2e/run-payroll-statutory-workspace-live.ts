/**
 * Live check of Payroll Phase 2d (statutory returns workspace) against the deployed payroll
 * function and database. CERT TX demo company only.
 *
 *   npx --yes tsx tests/e2e/run-payroll-statutory-workspace-live.ts
 *
 * Uses the 2026 tax year (March 2025 – February 2026) with fortnightly runs, which no other
 * CERT TX employee is paid in: three employees with complete SARS details are paid in June
 * and July 2025; the EMP201s are filed, approved, submitted and paid; the interim EMP501 is
 * reconciled and filed, issuing IRP5 / IT3(a) certificates; the e@syFile file is produced
 * and checked; a correction cancels the certificates and issues new numbers.
 *
 * Filed returns, certificates and payments are permanent records, so CERT TX keeps them as
 * history. Re-running files corrections. The test employees end on 31 August 2025, so no
 * later run pays them. The employer's ETI setting and the approval controls are restored.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMPANY_NAME = 'CERT TX 1785230675937';
const YOA = 2026;
const MONTHS = ['2025-06', '2025-07'] as const;
const RUNS = [
  { start: '2025-06-02', end: '2025-06-15' },
  { start: '2025-07-14', end: '2025-07-27' },
];

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

/** A valid 13-digit SA ID for a birth date (Luhn check digit). */
function saId(yymmdd: string, sequence: string): string {
  const twelve = `${yymmdd}${sequence}08`;
  for (let c = 0; c < 10; c++) {
    const id = twelve + c;
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      let d = Number(id[12 - i]);
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    if (sum % 10 === 0) return id;
  }
  throw new Error('no check digit');
}

type Issue = { severity: string; code: string; message: string; employeeId?: string };
type Certificate = {
  employeeId: string; certificateType: string; reasonCode: string | null; grossTaxable: number; payPeriodsInYear: number; payPeriodsWorked: number;
  tax: { paye: number; uif: number | null; sdl: number | null; eti: number | null }; eti: { indicator: string | null; months: Array<{ month: string; eti: number }> };
  issues: Issue[];
};
type Reconciliation = {
  months: Array<{ month: string; declared: { paye: number } | null; certificates: { paye: number; uif: number; sdl: number }; paid: number; differences: { paye: number; uif: number; sdl: number; payment: number } }>;
  totals: { declared: { paye: number; payable: number }; certificates: { paye: number }; paid: number };
};
type Workspace = { months: Array<{ month: string; dueDate: string; state: string; paid: number; return: { id: string; totalPayable: number } | null }>; reconciliations: Array<{ kind: string; due: string; return: { id: string } | null }> };
type Ret = { id: string; period: string; status: string; version: number; approved_at: string | null; self_approved: boolean; declaration_data: { totalPayable: number } };
type IssuedCert = { id: string; certificate_number: string; certificate_type: string; status: string; replaced_by: string | null; employee_id: string };

async function main() {
  loadEnv();
  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { error: authError } = await sb.auth.signInWithPassword({ email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! });
  if (authError) throw authError;
  const { data: company } = await sb.from('companies').select('id').eq('name', COMPANY_NAME).single();
  const companyId = company!.id as string;
  const payroll = <T>(body: Record<string, unknown>) => invoke<T>(sb, 'payroll', { company_id: companyId, ...body });
  const stamp = Date.now().toString().slice(-6);
  // SARS does not accept digits in a surname (BRS 3030), so the run stamp is spelt in letters.
  const surname = `Recon ${[...stamp].map((d) => 'ABCDEFGHIJ'[Number(d)]).join('')}`;

  const coa = await invoke<Array<{ id: string; name: string; type: string }>>(sb, 'chart-of-accounts', { method: 'GET', company_id: companyId });
  const wage = coa.find((a) => a.type === 'Expense' && /wage|salary|payroll/i.test(a.name))!;
  const bank = coa.find((a) => a.type === 'Asset' && /bank|cash/i.test(a.name))!;
  const liability = coa.find((a) => a.type === 'Liability' && /payroll|statutory|paye|uif/i.test(a.name)) ?? coa.find((a) => a.type === 'Liability')!;

  const profileBefore = await payroll<{ profile: Record<string, unknown> | null }>({ method: 'GET_EMPLOYER_PROFILE' });
  if (!profileBefore.profile) throw new Error('CERT TX needs an employer profile: run run-payroll-employer-profile-live.ts first.');
  const { updated_at: _u, updated_by: _b, company_id: _c, ...profile } = profileBefore.profile;
  const controlsBefore = await payroll<{ allow_self_approval: boolean; self_approval_reason: string | null }>({ method: 'GET_PAYROLL_CONTROLS' });

  const employee = (first: string, extra: Record<string, unknown>) => invoke<{ id: string }>(sb, 'employees', {
    method: 'POST', company_id: companyId, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(),
    employeeData: {
      first_name: first, last_name: surname, email: `${first.toLowerCase()}.${stamp}@adminless-fin.test`, phone: '0215550100',
      department: 'Certification', position: 'EMP501 check', employment_type: 'permanent',
      start_date: '2025-03-01', end_date: '2025-08-31', salary_period: 'fortnightly', ordinary_hours_per_week: 40,
      residential_street_number: '12', residential_street_name: 'Long Street', residential_suburb: 'Gardens',
      residential_city: 'Cape Town', residential_postal_code: '8001',
      bank_name: 'FNB', bank_account_number: '62000000001', bank_branch_code: '250655', bank_account_type: 'current',
      ...extra,
    },
  });

  // Employees from earlier runs of this check that were saved with digits in the surname.
  const { data: earlier } = await sb.from('employees').select('id, last_name').eq('company_id', companyId).like('last_name', 'Recon-%');
  for (const e of earlier ?? []) {
    const fixed = `Recon ${e.last_name.slice(6).replace(/\d/g, (d: string) => 'ABCDEFGHIJ'[Number(d)])}`;
    await invoke(sb, 'employees', { method: 'PUT', company_id: companyId, employeeId: e.id, command_id: crypto.randomUUID(), correlation_id: crypto.randomUUID(), employeeData: { last_name: fixed } });
  }

  try {
    await payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile: { ...profile, claim_eti: true } });
    // Ages in 2025: 40, 35 and 23.
    const full = await employee('Full', { salary_amount: 15_000, id_number: saId('850315', '5800'), tax_number: '0001339050' });
    const low = await employee('Low', { salary_amount: 1_500, id_number: saId('900620', '5800'), tax_number: '0667056642' });
    const youth = await employee('Youth', { salary_amount: 3_000, id_number: saId('020510', '5800') });

    for (const r of RUNS) {
      const run = await payroll<{ id: string }>({
        method: 'CREATE_RUN', additional_run: true,
        runData: { pay_period_start: r.start, pay_period_end: r.end, pay_date: r.end, pay_frequency: 'fortnightly' },
      });
      await payroll({ method: 'GENERATE_PAYSLIPS', runId: run.id });
      await payroll({ method: 'APPROVE_RUN', runId: run.id });
      await payroll({ method: 'FINALIZE_RUN', runId: run.id, wageAccountId: wage.id, bankAccountId: bank.id, liabilityAccountId: liability.id });
    }

    // ── Workspace and due dates ──
    let ws = await payroll<Workspace>({ method: 'GET_STATUTORY_WORKSPACE', yearOfAssessment: YOA });
    const june = ws.months.find((m) => m.month === '2025-06')!;
    check('Year view lists the twelve months, March to February', ws.months.length === 12 && ws.months[0].month === '2025-03' && ws.months[11].month === '2026-02');
    check('EMP201 due dates: 7 July 2025 (Monday) and 7 August 2025', june.dueDate === '2025-07-07' && ws.months.find((m) => m.month === '2025-07')!.dueDate === '2025-08-07');
    check('EMP501 windows: interim by 31 October 2025, annual by 31 May 2026',
      ws.reconciliations.find((r) => r.kind === 'interim')?.due === '2025-10-31' && ws.reconciliations.find((r) => r.kind === 'annual')?.due === '2026-05-31');

    // ── EMP201 for both months: file (or correct), approval, submission, payments ──
    // Before this run's EMP201s are filed, the EMP501 must not reconcile: on a first run the
    // months are not filed; on a re-run the filed EMP201s no longer match the new payroll.
    const alreadyFiled = MONTHS.every((m) => !!ws.months.find((x) => x.month === m)?.return);
    const early = await payroll<{ issues: Issue[] }>({ method: 'PREPARE_EMP501', yearOfAssessment: YOA, kind: 'interim' });
    const expected = alreadyFiled ? 'DECLARED_NOT_EQUAL_CERTIFICATES' : 'EMP201_NOT_FILED';
    check(`Before this payroll is declared, the EMP501 reports every month (${expected})`,
      MONTHS.every((m) => early.issues.some((i) => i.code === expected && i.message.startsWith(m))), early.issues.map((i) => i.code));

    await payroll({ method: 'UPDATE_PAYROLL_CONTROLS', allow_self_approval: false });
    const filedReturns: Ret[] = [];
    for (const month of MONTHS) {
      const prepared = await payroll<{ filed: unknown; declaration: { employees: Array<{ employeeId: string; eti: { eti: number; hoursReported: number; qualifies: boolean } | null }> } }>({ method: 'PREPARE_EMP201', month });
      if (month === '2025-06') {
        const y = prepared.declaration.employees.find((l) => l.employeeId === youth.id)?.eti;
        check('Youth (23, R3 000 a fortnight, 80 hours): ETI R562.50 (grossed up to 160 hours, then scaled)', !!y && y.qualifies && near(y.eti, 562.5) && y.hoursReported === 80, y);
      }
      const filed = (await payroll<{ return: Ret }>({
        method: 'FILE_EMP201', month, replaceReason: prepared.filed ? `Live check re-run ${stamp}: new payroll in the month` : undefined,
      })).return;
      filedReturns.push(filed);
    }
    const [r06, r07] = filedReturns;
    const notApproved = await refused(payroll({ method: 'RECORD_RETURN_SUBMISSION', returnId: r06.id, reference: `PRN${stamp}06` }));
    check('Submission is refused until a second person approves', /RETURN_NOT_APPROVED/.test(notApproved), notApproved.slice(0, 100));
    const selfBlocked = await refused(payroll({ method: 'APPROVE_RETURN', returnId: r06.id }));
    check('The person who filed cannot approve while self-approval is off', /SELF_APPROVAL_BLOCKED/.test(selfBlocked), selfBlocked.slice(0, 100));
    await payroll({ method: 'UPDATE_PAYROLL_CONTROLS', allow_self_approval: true, reason: 'CERT TX: single test user files returns' });
    for (const r of filedReturns) {
      const approved = await payroll<{ self_approved: boolean; approved_at: string }>({ method: 'APPROVE_RETURN', returnId: r.id });
      if (r === r06) check('With the owner exception on, approval is recorded as self-approved', approved.self_approved === true && !!approved.approved_at);
      await payroll({ method: 'RECORD_RETURN_SUBMISSION', returnId: r.id, reference: `PRN${stamp}${r.period.slice(4)}` });
    }
    const twice = await refused(payroll({ method: 'APPROVE_RETURN', returnId: r06.id }));
    check('A return is approved once', /RETURN_ALREADY_APPROVED/.test(twice));

    // Payments: part, then the rest; a posted payment voided reverses its journal.
    const due06 = r06.declaration_data.totalPayable;
    const due07 = r07.declaration_data.totalPayable;
    await payroll({ method: 'RECORD_RETURN_PAYMENT', returnId: r06.id, amount: 100, paidOn: '2025-07-04', reference: `PRN${stamp}06` });
    ws = await payroll<Workspace>({ method: 'GET_STATUTORY_WORKSPACE', yearOfAssessment: YOA });
    check('A part payment shows the month as part paid', ws.months.find((m) => m.month === '2025-06')?.state === 'underpaid', ws.months.find((m) => m.month === '2025-06'));
    await payroll({ method: 'RECORD_RETURN_PAYMENT', returnId: r06.id, amount: Math.round((due06 - 100) * 100) / 100, paidOn: '2025-07-04', reference: `PRN${stamp}06` });
    const beforePosting = new Date(Date.now() - 1000).toISOString();
    const posted = await payroll<{ id: string; journal_entry_id: string }>({
      method: 'RECORD_RETURN_PAYMENT', returnId: r07.id, amount: due07, paidOn: '2025-08-06', reference: `PRN${stamp}07`,
      post: { liabilityAccountId: liability.id, bankAccountId: bank.id },
    });
    const { data: lines } = await sb.from('journal_entry_items').select('account_id, type, amount').eq('journal_entry_id', posted.journal_entry_id);
    check('A posted payment journals Dr payroll liability, Cr bank',
      (lines ?? []).some((l) => l.account_id === liability.id && l.type === 'debit' && near(Number(l.amount), due07))
        && (lines ?? []).some((l) => l.account_id === bank.id && l.type === 'credit' && near(Number(l.amount), due07)), lines);
    const shortVoid = await refused(payroll({ method: 'VOID_RETURN_PAYMENT', paymentId: posted.id, reason: 'oops' }));
    check('Voiding needs a reason', /REASON_REQUIRED/.test(shortVoid));
    await payroll({ method: 'VOID_RETURN_PAYMENT', paymentId: posted.id, reason: 'Live check: wrong bank account chosen' });
    const { data: bankLines } = await sb.from('journal_entry_items').select('type, amount, journal_entries!inner(created_at)')
      .eq('account_id', bank.id).gte('journal_entries.created_at', beforePosting);
    const bankNet = (bankLines ?? []).reduce((s, l) => s + (l.type === 'debit' ? Number(l.amount) : -Number(l.amount)), 0);
    check('Voiding reverses the payment journal (bank nets to nil)', near(bankNet, 0), { lines: (bankLines ?? []).length, bankNet });
    await payroll({ method: 'RECORD_RETURN_PAYMENT', returnId: r07.id, amount: due07, paidOn: '2025-08-06', reference: `PRN${stamp}07` });
    const directPayment = await sb.from('statutory_return_payments').update({ amount: 1 }).eq('id', posted.id).select('id');
    check('Payments cannot be changed through the API', !!directPayment.error || (directPayment.data ?? []).length === 0, directPayment.error?.message);
    ws = await payroll<Workspace>({ method: 'GET_STATUTORY_WORKSPACE', yearOfAssessment: YOA });
    check('Both months show as paid', MONTHS.every((m) => ws.months.find((x) => x.month === m)?.state === 'paid'), MONTHS.map((m) => ws.months.find((x) => x.month === m)?.state));

    // ── EMP501 interim: reconciliation and certificates ──
    const recon = await payroll<{ reconciliation: Reconciliation; certificates: Certificate[]; issues: Issue[]; filed: { id: string } | null }>({ method: 'PREPARE_EMP501', yearOfAssessment: YOA, kind: 'interim' });
    const errors = recon.issues.filter((i) => i.severity === 'error');
    check('Reconciliation has no blocking issues', errors.length === 0, errors.slice(0, 5));
    const rm = recon.reconciliation.months.filter((m) => MONTHS.includes(m.month as typeof MONTHS[number]));
    check('Declared PAYE, UIF and SDL equal the certificates every month', rm.every((m) => !m.differences.paye && !m.differences.uif && !m.differences.sdl), rm.map((m) => m.differences));
    check('Everything declared is paid', rm.every((m) => near(m.differences.payment, 0)) && near(recon.reconciliation.totals.paid, recon.reconciliation.totals.declared.payable));
    const cert = (id: string) => recon.certificates.find((c) => c.employeeId === id)!;
    check('R15 000 a fortnight: IRP5 with PAYE, 26 pay periods a year, 2 worked',
      cert(full.id).certificateType === 'IRP5' && cert(full.id).tax.paye > 0 && cert(full.id).payPeriodsInYear === 26 && cert(full.id).payPeriodsWorked === 2, cert(full.id));
    check('R1 500 a fortnight: IT3(a), reason 02 (below the tax threshold), UIF still reported',
      cert(low.id).certificateType === 'IT3A' && cert(low.id).reasonCode === '02' && (cert(low.id).tax.uif ?? 0) > 0, { type: cert(low.id).certificateType, reason: cert(low.id).reasonCode, uif: cert(low.id).tax.uif });
    const y = cert(youth.id);
    check('Youth certificate: ETI Y, six month blocks, 4118 = R1 125 (June and July)',
      y.eti.indicator === 'Y' && y.eti.months.length === 6 && near(y.tax.eti ?? 0, 1125), { indicator: y.eti.indicator, months: y.eti.months.length, eti: y.tax.eti });
    check('The test employees have no certificate issues', [full.id, low.id, youth.id].every((id) => cert(id).issues.length === 0), [full.id, low.id, youth.id].map((id) => cert(id).issues));

    let filed501: Ret;
    if (recon.filed) {
      const noReason = await refused(payroll({ method: 'FILE_EMP501', yearOfAssessment: YOA, kind: 'interim' }));
      check('An EMP501 already filed needs a reason to correct', /EMP501_ALREADY_FILED/.test(noReason));
      filed501 = (await payroll<{ return: Ret }>({ method: 'FILE_EMP501', yearOfAssessment: YOA, kind: 'interim', replaceReason: `Live check re-run ${stamp}: new payroll` })).return;
    } else {
      filed501 = (await payroll<{ return: Ret }>({ method: 'FILE_EMP501', yearOfAssessment: YOA, kind: 'interim' })).return;
    }
    let certs = await payroll<IssuedCert[]>({ method: 'LIST_TAX_CERTIFICATES', returnId: filed501.id });
    const prefix = `${String(profile.paye_reference)}${YOA}08`;
    check('Filing issues one certificate per employee paid, numbered PAYE ref + 2026 + 08 + 14 digits',
      certs.length === recon.certificates.length && certs.every((c) => c.status === 'issued' && c.certificate_number.length === 30 && c.certificate_number.startsWith(prefix)),
      certs.map((c) => c.certificate_number).slice(0, 3));

    // ── e@syFile file ──
    const liveEarly = await refused(payroll({ method: 'EXPORT_EMP501_FILE', returnId: filed501.id, live: true }));
    check('The live e@syFile file needs the EMP501 approved first', /RETURN_NOT_APPROVED/.test(liveEarly));
    const test = await payroll<{ fileName: string; content: string }>({ method: 'EXPORT_EMP501_FILE', returnId: filed501.id, live: false });
    const records = test.content.split('\r\n');
    check('Test file: employer record, one record per certificate, trailer 6010 = 1 + certificates',
      records.length === certs.length + 2 && records[0].startsWith('2010,') && records[0].includes('2015,"TEST"') && records[0].includes('2031,202508')
        && records.at(-1) === `6010,${certs.length + 1},9999` && records.every((r) => r.endsWith('9999')), { records: records.length, trailer: records.at(-1), file: test.fileName });
    const youthCert = certs.find((c) => c.employee_id === youth.id)!;
    const youthRecord = records.find((r) => r.includes(youthCert.certificate_number))!;
    check('Youth record carries 3026 Y, 4118 1125.00 and six 7006 month blocks',
      youthRecord.includes('3026,"Y"') && youthRecord.includes('4118,1125.00') && (youthRecord.match(/7006,/g) ?? []).length === 6, youthRecord.slice(0, 200));
    const lowRecord = records.find((r) => r.includes(certs.find((c) => c.employee_id === low.id)!.certificate_number))!;
    check('IT3(a) record: 3015 "IT3(a)", 4150 02, no 4102', lowRecord.includes('3015,"IT3(a)"') && lowRecord.includes('4150,02') && !lowRecord.includes('4102,'));
    await payroll({ method: 'APPROVE_RETURN', returnId: filed501.id });
    const live = await payroll<{ content: string }>({ method: 'EXPORT_EMP501_FILE', returnId: filed501.id, live: true });
    check('After approval the live file is produced (2015 LIVE)', live.content.startsWith('2010,') && live.content.includes('2015,"LIVE"'));

    // ── Correction: certificates cancelled, new numbers, never reused ──
    const oldNumbers = new Set(certs.map((c) => c.certificate_number));
    const corrected = (await payroll<{ return: Ret }>({ method: 'FILE_EMP501', yearOfAssessment: YOA, kind: 'interim', replaceReason: `Live check ${stamp}: correct a certificate` })).return;
    const newCerts = await payroll<IssuedCert[]>({ method: 'LIST_TAX_CERTIFICATES', returnId: corrected.id });
    certs = await payroll<IssuedCert[]>({ method: 'LIST_TAX_CERTIFICATES', returnId: filed501.id });
    check('A correction cancels the certificates and links each to its replacement',
      certs.every((c) => c.status === 'cancelled' && !!c.replaced_by && newCerts.some((n) => n.id === c.replaced_by)), certs.map((c) => c.status));
    check('The replacement certificates have new numbers (never reused)', newCerts.length === certs.length && newCerts.every((c) => !oldNumbers.has(c.certificate_number)));
    const deleteCert = await sb.from('payroll_tax_certificates').delete().eq('id', certs[0].id).select('id');
    check('Certificates cannot be deleted through the API', !!deleteCert.error || (deleteCert.data ?? []).length === 0, deleteCert.error?.message);
    const forged = await sb.from('payroll_tax_certificates').insert({ company_id: companyId, statutory_return_id: corrected.id, employee_id: full.id, year_of_assessment: YOA, period: '202508', certificate_type: 'IRP5', certificate_number: `${prefix}99999999999999`, sequence: 1, certificate_data: {}, content_hash: 'x', issued_by: full.id }).select('id');
    check('Certificates cannot be created through the API', !!forged.error, forged.error?.message);
    const rpc = await sb.rpc('payroll_issue_tax_certificates', { p_company_id: companyId, p_return_id: corrected.id, p_prefix: prefix, p_year_of_assessment: YOA, p_period: '202508', p_actor: full.id, p_certificates: [] });
    check('The certificate numbering function is closed to signed-in users', !!rpc.error, rpc.error?.message);

    const activity = await payroll<{ events: Array<{ event_type: string }>; payments: unknown[] }>({ method: 'LIST_RETURN_ACTIVITY', returnId: filed501.id });
    const kinds = activity.events.map((e) => e.event_type);
    check('Evidence trail: filed, approved, exported, replaced', ['generated', 'validated', 'exported', 'superseded'].every((k) => kinds.includes(k)), kinds);
    const ledgerInsert = await sb.from('statutory_submission_ledger').insert({ company_id: companyId, statutory_return_id: corrected.id, event_type: 'submitted' }).select('id');
    check('The evidence trail cannot be written through the API', !!ledgerInsert.error, ledgerInsert.error?.message);
  } finally {
    await payroll({ method: 'UPDATE_EMPLOYER_PROFILE', profile }).catch((e) => console.error('restore profile failed', e));
    await payroll({
      method: 'UPDATE_PAYROLL_CONTROLS', allow_self_approval: controlsBefore.allow_self_approval,
      reason: controlsBefore.self_approval_reason ?? undefined,
    }).catch((e) => console.error('restore controls failed', e));
    console.log(`Employer ETI setting and approval controls restored (self-approval ${controlsBefore.allow_self_approval}).`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
