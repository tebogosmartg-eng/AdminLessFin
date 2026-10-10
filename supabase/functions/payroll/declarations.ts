// @ts-nocheck
/**
 * Phase 5 methods of the payroll function: salary payment files for the SA banks (bank
 * payment profiles), the monthly UIF declaration file for the Department of Employment and
 * Labour (E03), and the COIDA return of earnings worksheet. Every write uses the service role.
 */
import {
  buildBankFile,
  universalBranchCode,
} from '../_shared/payrollRulesEngine/bankFiles.ts'
import { buildUifDeclaration, normaliseUifReference } from '../_shared/payrollRulesEngine/uifDeclaration.ts'
import { buildRoeWorksheet, coidaEarningsFromItems, coidaPeriod } from '../_shared/payrollRulesEngine/coida.ts'
import { birthDateFromSaId } from '../_shared/payrollRulesEngine/periodEmployment.ts'
import { isRunInEffect } from '../_shared/payrollRunState.ts'
import { loadEmployerProfile, loadFinalisedPayslips, monthBounds, sha256Hex } from '../_shared/statutoryFiling.ts'

export const DECLARATION_METHODS = new Set([
  'LIST_BANK_PROFILES', 'SAVE_BANK_PROFILE', 'GENERATE_BANK_PAYMENT_FILE', 'CONFIRM_BANK_FILE_UPLOADED',
  'PREPARE_UIF_DECLARATION', 'EXPORT_UIF_DECLARATION', 'PREPARE_COIDA_ROE',
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const NON_TAXABLE_INCOME = new Set(['3602', '3652', '3703', '3753', '3714', '3764', '3815', '3865', '3821', '3871', '3822', '3872', '3830', '3880', '3832', '3882', '3834', '3884', '3908']);

function profileFromRow(row) {
  return {
    name: row.name,
    kind: row.kind,
    payingAccountNumber: row.paying_account_number,
    payingBranchCode: row.paying_branch_code,
    payingAccountName: row.paying_account_name ?? '',
    userCode: row.user_code,
    abbreviatedName: row.abbreviated_name,
    serviceType: row.service_type,
    entryClass: row.entry_class,
    installationGeneration: row.installation_generation,
    userGeneration: row.user_generation,
    ownReference: row.own_reference,
    recipientReference: row.recipient_reference,
    includeHashTotal: row.include_hash_total === true,
    csvColumns: row.csv_columns ?? [],
    csvHeader: row.csv_header !== false,
    csvDelimiter: row.csv_delimiter ?? ',',
    csvAmountStyle: row.csv_amount_style ?? 'rands',
    csvDateFormat: row.csv_date_format ?? 'YYYYMMDD',
  };
}

/** Gross taxable remuneration from IRP5-coded payslip lines (the 3699 build-up). */
function grossTaxable(items) {
  return round2((items ?? []).filter((i) => i.irp5_code && /^3[678]\d\d$/.test(i.irp5_code) && !NON_TAXABLE_INCOME.has(i.irp5_code))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0));
}

function uifCapped(snapshot) {
  const engines = Array.isArray(snapshot?.engine_results) ? snapshot.engine_results : [];
  return engines.filter((e) => e.engine_id === 'uif' && !e.skipped).reduce((s, e) => s + (Number(e.breakdown?.cappedRemuneration) || 0), 0);
}

export async function handleDeclarationMethod(method, ctx) {
  const { supabaseAdmin: admin, company_id, user, body, PayrollDomainError: Err, logPayrollAudit } = ctx;
  const fail = (code, message, recovery, status = 400, details = undefined) => { throw new Err({ stage: 'validation', code, message, recovery, status, details }); };
  const name = (e) => [e.first_name, e.last_name].filter(Boolean).join(' ') || e.id;

  switch (method) {
    case 'LIST_BANK_PROFILES': {
      const { data, error } = await admin.from('company_bank_payment_profiles').select('*').eq('company_id', company_id).order('created_at');
      if (error) throw error;
      return data ?? [];
    }

    case 'SAVE_BANK_PROFILE': {
      const p = body.profile ?? {};
      const digits = (v) => String(v ?? '').replace(/\D/g, '');
      const row = {
        company_id,
        name: String(p.name ?? '').trim(),
        kind: p.kind,
        paying_account_number: digits(p.paying_account_number),
        paying_branch_code: digits(p.paying_branch_code),
        paying_account_name: String(p.paying_account_name ?? '').trim().slice(0, 30),
        user_code: p.user_code ? String(p.user_code).trim().toUpperCase() : null,
        abbreviated_name: p.abbreviated_name ? String(p.abbreviated_name).trim().slice(0, 10) : null,
        service_type: p.service_type ?? 'SAMEDAY',
        entry_class: p.entry_class ? String(p.entry_class) : '61',
        own_reference: String(p.own_reference ?? 'SALARY {period}').slice(0, 60),
        recipient_reference: String(p.recipient_reference ?? '{company} SALARY').slice(0, 60),
        include_hash_total: p.include_hash_total === true,
        csv_columns: Array.isArray(p.csv_columns) ? p.csv_columns : undefined,
        csv_header: p.csv_header !== false,
        csv_delimiter: p.csv_delimiter ?? ',',
        csv_amount_style: p.csv_amount_style ?? 'rands',
        csv_date_format: p.csv_date_format ?? 'YYYYMMDD',
        is_default: p.is_default === true,
        active: p.active !== false,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      if (row.name.length < 2) fail('BANK_PROFILE_NAME', 'Give the bank profile a name (e.g. "FNB salaries").', 'Enter a name.');
      if (!/^\d{4,16}$/.test(row.paying_account_number)) fail('BANK_PROFILE_ACCOUNT', 'Enter the account the salaries are paid from (4–16 digits).', 'Check the account number.');
      if (!/^\d{6}$/.test(row.paying_branch_code)) fail('BANK_PROFILE_BRANCH', 'Enter the 6-digit branch code of the paying account.', 'Use the universal branch code, e.g. 250655 for FNB.');
      if (row.kind === 'acb' && !/^[A-Z0-9]{4}$/.test(row.user_code ?? '')) fail('BANK_PROFILE_USER_CODE', 'An ACB profile needs the 4-character user code the bank issued.', 'Ask the bank for the ACB user code, or choose the FNB or CSV format.');
      if (row.is_default) {
        await admin.from('company_bank_payment_profiles').update({ is_default: false }).eq('company_id', company_id).neq('id', p.id ?? '00000000-0000-0000-0000-000000000000');
      }
      if (row.csv_columns === undefined) delete row.csv_columns;
      const query = p.id
        ? admin.from('company_bank_payment_profiles').update(row).eq('id', p.id).eq('company_id', company_id)
        : admin.from('company_bank_payment_profiles').insert(row);
      const { data, error } = await query.select().single();
      if (error) throw error;
      await logPayrollAudit(admin, { company_id, event_type: 'bank_profile_saved', event_data: { profile_id: data.id, kind: data.kind, name: data.name }, created_by: user.id });
      return data;
    }

    case 'GENERATE_BANK_PAYMENT_FILE': {
      const { data: run, error: runError } = await admin.from('payroll_runs').select('*').eq('id', body.runId).eq('company_id', company_id).single();
      if (runError) throw runError;
      if (!isRunInEffect(run)) fail('RUN_NOT_PAYABLE', 'Bank files are made for finalised payroll runs that have not been reversed.', 'Finalise the run first.', 409);
      const { data: profileRow, error: profileError } = await admin.from('company_bank_payment_profiles').select('*').eq('id', body.profileId).eq('company_id', company_id).single();
      if (profileError) throw profileError;
      const actionDate = ISO_DATE.test(String(body.actionDate ?? '')) ? body.actionDate : run.pay_date;
      const { data: slips, error: slipError } = await admin.from('payslips')
        .select('employee_id, net_pay, employees!payslips_employee_id_fkey(id, employee_number, first_name, last_name, bank_name, bank_account_number, bank_branch_code, bank_account_type)')
        .eq('payroll_run_id', run.id).eq('company_id', company_id);
      if (slipError) throw slipError;
      const { data: company } = await admin.from('companies').select('name').eq('id', company_id).single();
      const payments = (slips ?? []).map((s) => {
        const e = Array.isArray(s.employees) ? s.employees[0] : s.employees;
        return {
          employeeName: e ? name(e) : s.employee_id,
          employeeNumber: e?.employee_number ?? null,
          accountNumber: e?.bank_account_number ?? null,
          branchCode: e?.bank_branch_code || universalBranchCode(e?.bank_name),
          bankName: e?.bank_name ?? null,
          accountType: e?.bank_account_type ?? null,
          amount: Number(s.net_pay) || 0,
        };
      });
      const profile = profileFromRow(profileRow);
      const today = new Date().toISOString().slice(0, 10);
      const result = buildBankFile(profile, payments, {
        actionDate, creationDate: today, period: run.pay_period_end.slice(0, 7), companyName: company?.name ?? 'Company',
      });
      if (actionDate < today) result.issues.unshift({ severity: 'warning', message: `The payment date ${actionDate} is in the past: the bank may refuse it or pay on the next business day.` });
      if (result.content) {
        const files = Array.isArray(run.output_metadata?.bank_files) ? run.output_metadata.bank_files : [];
        files.push({
          profile_id: profileRow.id, kind: profileRow.kind, generated_at: new Date().toISOString(), action_date: actionDate,
          payments: result.control.payments, total: result.control.total, hash_total: result.control.hashTotal,
          user_generation: profileRow.user_generation, content_hash: await sha256Hex(result.content), generated_by: user.id,
        });
        const { error: metaError } = await admin.from('payroll_runs').update({ output_metadata: { ...(run.output_metadata ?? {}), bank_files: files } }).eq('id', run.id);
        if (metaError) throw metaError;
        await logPayrollAudit(admin, {
          company_id, payroll_run_id: run.id, event_type: 'bank_payment_file_generated',
          event_data: { profile_id: profileRow.id, kind: profileRow.kind, payments: result.control.payments, total: result.control.total, left_out: result.issues.filter((i) => i.severity === 'error').length },
          created_by: user.id,
        });
      }
      return result;
    }

    case 'CONFIRM_BANK_FILE_UPLOADED': {
      const { data: row, error } = await admin.from('company_bank_payment_profiles').select('id, installation_generation, user_generation').eq('id', body.profileId).eq('company_id', company_id).single();
      if (error) throw error;
      const next = (n) => (n >= 9999 ? 1 : n + 1);
      const { data, error: updateError } = await admin.from('company_bank_payment_profiles')
        .update({ installation_generation: next(row.installation_generation), user_generation: next(row.user_generation), updated_by: user.id, updated_at: new Date().toISOString() })
        .eq('id', row.id).select().single();
      if (updateError) throw updateError;
      await logPayrollAudit(admin, { company_id, event_type: 'bank_payment_file_uploaded', event_data: { profile_id: row.id, user_generation: row.user_generation }, created_by: user.id });
      return data;
    }

    case 'PREPARE_UIF_DECLARATION':
    case 'EXPORT_UIF_DECLARATION': {
      const month = String(body.month ?? '');
      const { start, end } = monthBounds(month);
      const [{ rows }, { profile, errors: profileErrors }, employeesResult] = await Promise.all([
        loadFinalisedPayslips(admin, company_id, start, end),
        loadEmployerProfile(admin, company_id),
        admin.from('employees').select('*').eq('company_id', company_id),
      ]);
      if (employeesResult.error) throw employeesResult.error;
      const issues = profileErrors.map((message) => ({ severity: 'warning', message }));
      if (!profile) fail('EMPLOYER_PROFILE_MISSING', 'Capture the employer details (with the UIF reference number) under Settings → Payroll first.', 'Open Settings → Payroll.', 422);
      if (!profile.uif_dol_reference) issues.push({ severity: 'error', message: 'Add the UIF reference number issued by the Department of Labour (e.g. 1234567/8) to the employer details under Settings → Payroll.' });

      const byEmployee = new Map();
      for (const r of rows) {
        const list = byEmployee.get(r.employee_id) ?? [];
        list.push(r);
        byEmployee.set(r.employee_id, list);
      }
      const employed = (employeesResult.data ?? []).filter((e) => (!e.start_date || e.start_date <= end) && (!e.end_date || e.end_date >= start));
      const lines = employed.map((e) => {
        const slips = byEmployee.get(e.id) ?? [];
        const items = slips.flatMap((s) => s.payslip_items ?? []);
        const contribution = round2(items.filter((i) => i.irp5_code === '4141').reduce((s, i) => s + (Number(i.amount) || 0), 0));
        const gross = grossTaxable(items);
        const exempt = slips.some((s) => s.calculation_snapshot?.period_employment?.uif_exempt_under_24_hours === true);
        const left = e.end_date && e.end_date <= end;
        if (left && !e.termination_reason) {
          issues.push({ severity: 'warning', employeeId: e.id, message: `${name(e)} left on ${e.end_date}: no reason is set on the employee, so "Resigned" is reported. Set the reason employment ended.` });
        }
        return {
          employeeId: e.id,
          idNumber: e.id_number ?? null,
          otherNumber: e.passport_number ?? null,
          employeeNumber: e.employee_number ?? null,
          surname: (e.last_name ?? '').trim(),
          firstNames: (e.first_name ?? '').trim(),
          dateOfBirth: e.date_of_birth || birthDateFromSaId(e.id_number, end) || null,
          employedFrom: e.start_date ?? null,
          employedTo: e.end_date ?? null,
          status: left ? (e.termination_reason ?? 'resigned') : 'active',
          nonContributionReason: contribution > 0 ? null : exempt ? '01' : gross <= 0 ? '06' : null,
          grossTaxable: gross,
          uifRemuneration: round2(slips.reduce((s, r) => s + uifCapped(r.calculation_snapshot), 0)),
          contribution,
          branchCode: e.bank_branch_code || universalBranchCode(e.bank_name),
          accountNumber: e.bank_account_number ?? null,
          accountType: e.bank_account_type ?? null,
        };
      }).sort((a, b) => `${a.surname} ${a.firstNames}`.localeCompare(`${b.surname} ${b.firstNames}`));

      const { data: earlier, error: earlierError } = await admin.from('statutory_returns').select('id, period, status, version, declaration_data')
        .eq('company_id', company_id).eq('return_type', 'UIF_DECLARATION');
      if (earlierError) throw earlierError;
      const current = (earlier ?? []).find((r) => r.period === month.replace('-', '') && r.status !== 'superseded') ?? null;
      const maxSequence = Math.max(0, ...(earlier ?? []).map((r) => Number(r.declaration_data?.fileSequence) || 0));
      const fileSequence = current?.declaration_data?.fileSequence ?? (maxSequence >= 999 ? 1 : maxSequence + 1);
      const live = method === 'EXPORT_UIF_DECLARATION' && body.live === true;
      const file = buildUifDeclaration({
        month, live, fileSequence,
        creator: {
          uifReference: profile.uif_dol_reference ?? '',
          contactName: [profile.contact_first_name, profile.contact_surname].filter(Boolean).join(' '),
          contactPhone: profile.contact_business_phone ?? profile.contact_cell_phone ?? '',
          contactEmail: profile.contact_email ?? null,
        },
        employer: { uifReference: profile.uif_dol_reference ?? '', payeReference: profile.paye_reference ?? null, email: profile.contact_email ?? null },
        lines,
      });
      const allIssues = [...issues, ...file.issues];
      if (method === 'PREPARE_UIF_DECLARATION') {
        return { month, lines, totals: file.totals, issues: allIssues, fileName: file.fileName, filed: current ? { id: current.id, version: current.version, fileSequence } : null };
      }
      const blocking = allIssues.filter((i) => i.severity === 'error');
      if (blocking.length) fail('UIF_DECLARATION_NOT_READY', `${blocking.length} issue${blocking.length === 1 ? '' : 's'} to fix. ${blocking[0].message}`, 'Fix the listed issues and export again.', 422, blocking);
      if (live) {
        // A live file is kept as the month's declaration; exporting again replaces it (same file name).
        const id = crypto.randomUUID();
        if (current) {
          const { error: supersedeError } = await admin.from('statutory_returns')
            .update({ status: 'superseded', superseded_at: new Date().toISOString(), superseded_reason: 'Declaration file exported again' }).eq('id', current.id);
          if (supersedeError) throw supersedeError;
        }
        const { error: insertError } = await admin.from('statutory_returns').insert({
          id, company_id, country: 'ZA', return_type: 'UIF_DECLARATION', tax_year: month.slice(0, 4), period: month.replace('-', ''),
          status: 'ready', immutable: true, version: (current?.version ?? 0) + 1, generated_by: user.id, filed_by: user.id, filed_at: new Date().toISOString(),
          source_payroll_runs: [...new Set(rows.map((r) => r.payroll_run_id))],
          validation_result: { ok: true, issues: allIssues, validatedAt: new Date().toISOString() },
          declaration_data: { month, fileSequence, fileName: file.fileName, totals: file.totals, employees: lines.length },
          content_hash: await sha256Hex(file.content),
        });
        if (insertError) {
          if (current) await admin.from('statutory_returns').update({ status: current.status, superseded_at: null, superseded_reason: null }).eq('id', current.id);
          throw insertError;
        }
        await logPayrollAudit(admin, { company_id, event_type: 'uif_declaration_exported', event_data: { return_id: id, month, file: file.fileName, totals: file.totals }, created_by: user.id });
      }
      return { fileName: file.fileName, content: file.content, totals: file.totals, issues: allIssues };
    }

    case 'PREPARE_COIDA_ROE': {
      const startYear = Number(body.startYear);
      if (!Number.isInteger(startYear) || startYear < 2015 || startYear > 2100) fail('COIDA_YEAR', 'Choose the assessment year (March to February), e.g. 2025.', 'Pick a year.');
      const period = coidaPeriod(startYear);
      const [{ rows }, { profile }, employeesResult] = await Promise.all([
        loadFinalisedPayslips(admin, company_id, period.start, period.end),
        loadEmployerProfile(admin, company_id),
        admin.from('employees').select('id, employee_number, first_name, last_name, id_number').eq('company_id', company_id),
      ]);
      if (employeesResult.error) throw employeesResult.error;
      const earnings = new Map();
      for (const r of rows) {
        const amount = coidaEarningsFromItems((r.payslip_items ?? []).map((i) => ({ code: i.irp5_code, amount: Number(i.amount), type: i.type })));
        earnings.set(r.employee_id, round2((earnings.get(r.employee_id) ?? 0) + amount));
      }
      const employees = (employeesResult.data ?? []).filter((e) => earnings.has(e.id)).map((e) => ({
        employeeId: e.id, name: name(e), employeeNumber: e.employee_number ?? null, idNumber: e.id_number ?? null, earnings: earnings.get(e.id),
      }));
      const growth = Number(body.provisionalGrowthPercent);
      return {
        worksheet: buildRoeWorksheet({
          startYear, employees, ratePercent: profile?.coida_rate_percent ?? null, domestic: profile?.coida_domestic_employer === true,
          provisionalGrowthPercent: Number.isFinite(growth) ? growth : 0,
        }),
        registrationNumber: profile?.coida_registration_number ?? null,
        employerName: profile?.trading_name ?? null,
      };
    }
  }
  return undefined;
}

export { normaliseUifReference };
