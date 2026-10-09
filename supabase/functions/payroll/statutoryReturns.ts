// @ts-nocheck
/**
 * Statutory returns workspace methods of the payroll function (Phase 2d, ADR-0005):
 * the year view, approval of filed returns by a second person, payments to SARS,
 * the EMP501 reconciliation with numbered IRP5 / IT3(a) certificates, and the
 * e@syFile import file. Every write is made here with the service role.
 */
import {
  loadEmployerProfile,
  loadPaymentsByReturn,
  loadStatutoryWorkspace,
  prepareEmp501,
  sha256Hex,
} from '../_shared/statutoryFiling.ts'
import { buildEasyFile } from '../_shared/sars/easyFile.ts'
import { reconciliationPeriod } from '../_shared/sars/statutoryCalendar.ts'

const REFERENCE_PATTERN = /^[A-Za-z0-9-]{4,40}$/;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const STATUTORY_RETURN_METHODS = new Set([
  'GET_STATUTORY_WORKSPACE',
  'APPROVE_RETURN',
  'RECORD_RETURN_PAYMENT',
  'VOID_RETURN_PAYMENT',
  'LIST_RETURN_ACTIVITY',
  'PREPARE_EMP501',
  'FILE_EMP501',
  'LIST_TAX_CERTIFICATES',
  'EXPORT_EMP501_FILE',
]);

/** Records an event on a return's submission ledger (append-only evidence). */
export async function logReturnEvent(admin, { company_id, return_id, event_type, content_hash = null, payload = {}, user_id }) {
  const { error } = await admin.from('statutory_submission_ledger').insert({
    company_id,
    statutory_return_id: return_id,
    event_type,
    content_hash,
    event_payload: payload,
    created_by: user_id,
  });
  if (error) console.error('statutory_submission_ledger insert failed', error.message);
}

function yearOf(body, Err) {
  const yoa = Number(body.yearOfAssessment);
  if (!Number.isInteger(yoa) || yoa < 2014 || yoa > 2100) {
    throw new Err({ stage: 'validation', code: 'YEAR_INVALID', message: 'Choose the tax year (the year it ends in, e.g. 2027).', recovery: 'Pick a tax year.' });
  }
  return yoa;
}

function kindOf(body, Err) {
  if (body.kind !== 'interim' && body.kind !== 'annual') {
    throw new Err({ stage: 'validation', code: 'KIND_INVALID', message: 'Choose the interim (March–August) or annual reconciliation.', recovery: 'Pick interim or annual.' });
  }
  return body.kind;
}

async function loadReturn(admin, companyId, returnId, Err) {
  const { data, error } = await admin
    .from('statutory_returns')
    .select('id, company_id, return_type, period, status, version, filed_by, approved_at, declaration_data, content_hash, tax_year')
    .eq('id', returnId).eq('company_id', companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Err({ stage: 'validation', code: 'RETURN_NOT_FOUND', message: 'That return was not found.', recovery: 'Refresh the page.', status: 404 });
  return data;
}

async function postPaymentJournal(admin, { company_id, user, payment, post, period, Err }) {
  const { data: accounts, error } = await admin
    .from('chart_of_accounts').select('id, type')
    .eq('company_id', company_id).in('id', [post.liabilityAccountId, post.bankAccountId]);
  if (error) throw error;
  const typeOf = (id) => accounts?.find((a) => a.id === id)?.type;
  if (typeOf(post.liabilityAccountId) !== 'Liability' || typeOf(post.bankAccountId) !== 'Asset') {
    throw new Err({
      stage: 'validation', code: 'PAYMENT_ACCOUNTS_INVALID',
      message: 'Choose the payroll liability account and the bank account the payment left from.',
      recovery: 'Pick the accounts again.',
    });
  }
  const key = `payroll:statutory_payment:${payment.id}`;
  const { data: posted, error: postError } = await admin.rpc('posting_engine_submit', {
    p_request: {
      company_id,
      posting_date: payment.paid_on,
      module: 'payroll',
      document_type: 'statutory_payment',
      document_id: payment.id,
      reference: payment.payment_reference,
      description: `Payment to SARS — EMP201 ${period}`,
      currency: 'ZAR',
      source: 'payroll_statutory_payment',
      created_by: user.id,
      idempotency_key: key,
      lines: [
        { account_id: post.liabilityAccountId, debit: payment.amount, credit: 0 },
        { account_id: post.bankAccountId, debit: 0, credit: payment.amount },
      ],
    },
    p_mode: 'commit',
  });
  if (postError) throw postError;
  return { journalEntryId: posted?.journal_id ?? null, key };
}

/**
 * Handles one workspace method. Returns the response data; the caller passes its own
 * error type, audit logger and controls loader so behaviour matches the other methods.
 */
export async function handleStatutoryReturnMethod(method, ctx) {
  const { supabaseAdmin: admin, company_id, user, body, PayrollDomainError: Err, logPayrollAudit, loadPayrollControls } = ctx;

  switch (method) {
    case 'GET_STATUTORY_WORKSPACE': {
      return await loadStatutoryWorkspace(admin, company_id, yearOf(body, Err));
    }

    case 'APPROVE_RETURN': {
      const ret = await loadReturn(admin, company_id, body.returnId, Err);
      if (ret.status === 'superseded') {
        throw new Err({ stage: 'state_transition', code: 'RETURN_SUPERSEDED', message: 'This return was replaced; approve the current version.', recovery: 'Refresh the page.', status: 409 });
      }
      if (ret.approved_at) {
        throw new Err({ stage: 'state_transition', code: 'RETURN_ALREADY_APPROVED', message: 'This return is already approved.', recovery: 'Refresh the page.', status: 409 });
      }
      // Separation of duties: the person who filed the return cannot approve it, unless
      // the owner allowed self-approval (the same control as payroll run approval).
      const selfApproval = ret.filed_by === user.id;
      if (selfApproval) {
        const controls = await loadPayrollControls(admin, company_id);
        if (!controls.allow_self_approval) {
          throw new Err({
            stage: 'validation', code: 'SELF_APPROVAL_BLOCKED',
            message: 'You filed this return, so another owner or admin must approve it.',
            recovery: 'Ask another owner or admin to approve it. In a one-person business the company owner can allow self-approval under Payroll Settings.',
            status: 409,
          });
        }
      }
      const approvedAt = new Date().toISOString();
      const { data, error } = await admin
        .from('statutory_returns')
        .update({ approved_by: user.id, approved_at: approvedAt, self_approved: selfApproval })
        .eq('id', ret.id).is('approved_at', null)
        .select('id, status, approved_at, approved_by, self_approved').single();
      if (error) throw error;
      await logReturnEvent(admin, { company_id, return_id: ret.id, event_type: 'validated', content_hash: ret.content_hash, payload: { approved_by: user.id, self_approved: selfApproval }, user_id: user.id });
      await logPayrollAudit(admin, {
        company_id, event_type: 'statutory_return_approved',
        event_data: { return_id: ret.id, return_type: ret.return_type, period: ret.period, version: ret.version, self_approved: selfApproval },
        created_by: user.id,
      });
      return data;
    }

    case 'RECORD_RETURN_PAYMENT': {
      const ret = await loadReturn(admin, company_id, body.returnId, Err);
      if (ret.return_type !== 'EMP201' || ret.status === 'superseded') {
        throw new Err({ stage: 'validation', code: 'PAYMENT_RETURN_INVALID', message: 'Payments are recorded against the current EMP201 of a month.', recovery: 'Refresh the page.' });
      }
      const amount = round2(Number(body.amount));
      const paidOn = String(body.paidOn ?? '');
      const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
      if (!(amount > 0)) throw new Err({ stage: 'validation', code: 'PAYMENT_AMOUNT_INVALID', message: 'Enter the amount paid.', recovery: 'Enter an amount greater than zero.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn))) {
        throw new Err({ stage: 'validation', code: 'PAYMENT_DATE_INVALID', message: 'Enter the date the payment was made.', recovery: 'Use the date on the bank statement.' });
      }
      if (!REFERENCE_PATTERN.test(reference)) {
        throw new Err({ stage: 'validation', code: 'REFERENCE_INVALID', message: 'Enter the SARS payment reference number (PRN), letters and digits only.', recovery: 'Copy the PRN from eFiling.' });
      }
      const id = crypto.randomUUID();
      const payment = {
        id, company_id, statutory_return_id: ret.id, period: ret.period, amount, paid_on: paidOn,
        payment_reference: reference, recorded_by: user.id,
      };
      let journal = { journalEntryId: null, key: null };
      const post = body.post ?? null;
      if (post?.liabilityAccountId && post?.bankAccountId) {
        journal = await postPaymentJournal(admin, { company_id, user, payment, post, period: ret.period, Err });
      }
      const { data, error } = await admin.from('statutory_return_payments')
        .insert({ ...payment, journal_entry_id: journal.journalEntryId, posting_idempotency_key: journal.key })
        .select().single();
      if (error) {
        if (journal.key) {
          await admin.rpc('posting_engine_rollback', { p_idempotency_key: journal.key, p_company_id: company_id, p_reason: 'Payment record failed', p_actor_user_id: user.id });
        }
        throw error;
      }
      await logPayrollAudit(admin, {
        company_id, event_type: 'statutory_payment_recorded',
        event_data: { return_id: ret.id, period: ret.period, payment_id: id, amount, paid_on: paidOn, reference, journal_entry_id: journal.journalEntryId },
        created_by: user.id,
      });
      return data;
    }

    case 'VOID_RETURN_PAYMENT': {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 10) {
        throw new Err({ stage: 'validation', code: 'REASON_REQUIRED', message: 'Give a reason of at least 10 characters for voiding the payment.', recovery: 'Say why the payment record is wrong.' });
      }
      const { data: payment, error: lookupError } = await admin
        .from('statutory_return_payments').select('*')
        .eq('id', body.paymentId).eq('company_id', company_id).maybeSingle();
      if (lookupError) throw lookupError;
      if (!payment) throw new Err({ stage: 'validation', code: 'PAYMENT_NOT_FOUND', message: 'That payment was not found.', recovery: 'Refresh the page.', status: 404 });
      if (payment.voided_at) throw new Err({ stage: 'state_transition', code: 'PAYMENT_ALREADY_VOIDED', message: 'This payment is already voided.', recovery: 'Refresh the page.', status: 409 });
      if (payment.posting_idempotency_key) {
        const { error: rollbackError } = await admin.rpc('posting_engine_rollback', {
          p_idempotency_key: payment.posting_idempotency_key, p_company_id: company_id,
          p_reason: `Payment to SARS voided: ${reason}`, p_actor_user_id: user.id,
        });
        if (rollbackError) throw rollbackError;
      }
      const { data, error } = await admin.from('statutory_return_payments')
        .update({ voided_at: new Date().toISOString(), voided_by: user.id, void_reason: reason })
        .eq('id', payment.id).select().single();
      if (error) throw error;
      await logPayrollAudit(admin, {
        company_id, event_type: 'statutory_payment_voided',
        event_data: { payment_id: payment.id, period: payment.period, amount: payment.amount, reason },
        created_by: user.id,
      });
      return data;
    }

    case 'LIST_RETURN_ACTIVITY': {
      const ret = await loadReturn(admin, company_id, body.returnId, Err);
      const [payments, events] = await Promise.all([
        admin.from('statutory_return_payments').select('*').eq('company_id', company_id).eq('statutory_return_id', ret.id).order('recorded_at'),
        admin.from('statutory_submission_ledger').select('event_type, content_hash, event_payload, created_by, created_at')
          .eq('company_id', company_id).eq('statutory_return_id', ret.id).order('created_at'),
      ]);
      if (payments.error) throw payments.error;
      if (events.error) throw events.error;
      return { payments: payments.data ?? [], events: events.data ?? [] };
    }

    case 'PREPARE_EMP501': {
      const yoa = yearOf(body, Err);
      const kind = kindOf(body, Err);
      const prepared = await prepareEmp501(admin, company_id, yoa, kind);
      const { data: existing } = await admin
        .from('statutory_returns')
        .select('id, status, version, filed_at, approved_at, submission_reference')
        .eq('company_id', company_id).eq('return_type', 'EMP501').eq('period', reconciliationPeriod(yoa, kind))
        .neq('status', 'superseded').maybeSingle();
      return {
        reconciliation: prepared.reconciliation,
        certificates: prepared.certificates,
        issues: prepared.issues,
        filed: existing ?? null,
      };
    }

    case 'FILE_EMP501': {
      const yoa = yearOf(body, Err);
      const kind = kindOf(body, Err);
      const period = reconciliationPeriod(yoa, kind);
      const prepared = await prepareEmp501(admin, company_id, yoa, kind);
      const blocking = prepared.issues.filter((i) => i.severity === 'error');
      if (blocking.length || !prepared.profile) {
        throw new Err({
          stage: 'validation', code: 'EMP501_NOT_READY',
          message: `${blocking.length} issue${blocking.length === 1 ? '' : 's'} must be fixed before the EMP501 can be filed. ${blocking[0]?.message ?? ''}`.trim(),
          recovery: 'Fix the listed issues (employee details, EMP201s for every month) and file again.',
          status: 422, details: blocking,
        });
      }
      const { data: existing, error: existingError } = await admin
        .from('statutory_returns').select('id, version, status, superseded_reason')
        .eq('company_id', company_id).eq('return_type', 'EMP501').eq('period', period)
        .neq('status', 'superseded').maybeSingle();
      if (existingError) throw existingError;
      const replaceReason = typeof body.replaceReason === 'string' ? body.replaceReason.trim() : '';
      if (existing && replaceReason.length < 10) {
        throw new Err({
          stage: 'validation', code: 'EMP501_ALREADY_FILED',
          message: `The ${kind} EMP501 for ${yoa} is already filed (version ${existing.version}).`,
          recovery: 'To file a corrected EMP501, give a reason of at least 10 characters. Its certificates are cancelled and new certificate numbers are issued.',
          status: 409,
        });
      }

      const returnId = crypto.randomUUID();
      const declaration = {
        kind,
        yearOfAssessment: yoa,
        period,
        reconciliation: prepared.reconciliation,
        certificateCount: prepared.certificates.length,
        warnings: prepared.issues.filter((i) => i.severity === 'warning'),
      };
      const declarationJson = JSON.stringify(declaration);
      // One active return per period: the filed one steps aside first and is restored
      // if anything below fails.
      const restoreExisting = async () => {
        if (existing) {
          await admin.from('statutory_returns')
            .update({ status: existing.status, superseded_at: null, superseded_reason: null }).eq('id', existing.id);
        }
      };
      if (existing) {
        const { error: supersedeError } = await admin.from('statutory_returns')
          .update({ status: 'superseded', superseded_at: new Date().toISOString(), superseded_reason: replaceReason })
          .eq('id', existing.id);
        if (supersedeError) throw supersedeError;
      }
      // Inserted as a draft so it can be removed if issuing the certificates fails.
      const { error: insertError } = await admin.from('statutory_returns').insert({
        id: returnId, company_id, country: 'ZA', return_type: 'EMP501', tax_year: `${yoa - 1}-${yoa}`, period,
        status: 'draft', immutable: false, version: (existing?.version ?? 0) + 1,
        generated_by: user.id, filed_by: user.id, source_payroll_runs: prepared.sourceRunIds,
        validation_result: { ok: true, issues: declaration.warnings, validatedAt: new Date().toISOString() },
        declaration_data: declaration, content_hash: await sha256Hex(declarationJson),
      });
      if (insertError) {
        await restoreExisting();
        if (insertError.code === '23505') {
          throw new Err({ stage: 'validation', code: 'EMP501_ALREADY_FILED', message: 'This EMP501 was filed a moment ago.', recovery: 'Refresh the page.', status: 409 });
        }
        throw insertError;
      }

      const certificates = [];
      for (const c of prepared.certificates) {
        certificates.push({
          employee_id: c.employeeId,
          certificate_type: c.certificateType,
          certificate_data: c,
          content_hash: await sha256Hex(JSON.stringify(c)),
        });
      }
      const prefix = `${String(prepared.profile.paye_reference).replace(/\D/g, '')}${yoa}${period.slice(4)}`;
      const { data: issued, error: issueError } = await admin.rpc('payroll_issue_tax_certificates', {
        p_company_id: company_id, p_return_id: returnId, p_prefix: prefix, p_year_of_assessment: yoa,
        p_period: period, p_actor: user.id, p_certificates: certificates,
      });
      if (issueError) {
        await admin.from('statutory_returns').delete().eq('id', returnId).eq('status', 'draft');
        await restoreExisting();
        throw issueError;
      }

      if (existing) {
        // The replaced return's certificates are cancelled; their numbers are never reused.
        const { data: oldCerts, error: oldError } = await admin.from('payroll_tax_certificates')
          .select('id, employee_id').eq('statutory_return_id', existing.id).eq('status', 'issued');
        if (oldError) throw oldError;
        const newByEmployee = new Map((issued ?? []).map((c) => [c.employee_id, c.id]));
        for (const old of oldCerts ?? []) {
          const { error: cancelError } = await admin.from('payroll_tax_certificates').update({
            status: 'cancelled', cancelled_at: new Date().toISOString(),
            cancelled_reason: `EMP501 ${period} replaced: ${replaceReason}`, replaced_by: newByEmployee.get(old.employee_id) ?? null,
          }).eq('id', old.id);
          if (cancelError) throw cancelError;
        }
        await logReturnEvent(admin, { company_id, return_id: existing.id, event_type: 'superseded', payload: { replaced_by: returnId, reason: replaceReason }, user_id: user.id });
      }

      const { data: filed, error: fileError } = await admin.from('statutory_returns')
        .update({ status: 'ready', immutable: true, filed_at: new Date().toISOString() })
        .eq('id', returnId).select().single();
      if (fileError) throw fileError;
      await logReturnEvent(admin, { company_id, return_id: returnId, event_type: 'generated', content_hash: filed.content_hash, payload: { certificates: (issued ?? []).length, version: filed.version }, user_id: user.id });
      await logPayrollAudit(admin, {
        company_id, event_type: existing ? 'emp501_refiled' : 'emp501_filed',
        event_data: {
          return_id: returnId, period, kind, version: filed.version, replaced: existing?.id ?? null, reason: replaceReason || null,
          certificates: (issued ?? []).length, totals: prepared.reconciliation.totals,
        },
        created_by: user.id,
      });
      return { return: filed, certificates: (issued ?? []).map(({ certificate_data, ...rest }) => rest), issues: prepared.issues };
    }

    case 'LIST_TAX_CERTIFICATES': {
      let query = admin.from('payroll_tax_certificates')
        .select('id, statutory_return_id, employee_id, year_of_assessment, period, certificate_type, certificate_number, status, cancelled_at, cancelled_reason, replaced_by, certificate_data, issued_at')
        .eq('company_id', company_id)
        .order('certificate_number');
      if (body.returnId) query = query.eq('statutory_return_id', body.returnId);
      if (body.yearOfAssessment) query = query.eq('year_of_assessment', Number(body.yearOfAssessment));
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    }

    case 'EXPORT_EMP501_FILE': {
      const ret = await loadReturn(admin, company_id, body.returnId, Err);
      if (ret.return_type !== 'EMP501' || ret.status === 'superseded') {
        throw new Err({ stage: 'validation', code: 'EXPORT_RETURN_INVALID', message: 'Export the current filed EMP501.', recovery: 'Refresh the page.' });
      }
      const live = body.live === true;
      if (live && !ret.approved_at) {
        throw new Err({
          stage: 'validation', code: 'RETURN_NOT_APPROVED',
          message: 'The EMP501 must be approved before the live e@syFile file is produced.',
          recovery: 'Approve it (or ask another owner or admin to), or download a test file.', status: 409,
        });
      }
      const [{ profile, errors }, certsResult] = await Promise.all([
        loadEmployerProfile(admin, company_id),
        admin.from('payroll_tax_certificates').select('certificate_number, certificate_data')
          .eq('company_id', company_id).eq('statutory_return_id', ret.id).eq('status', 'issued').order('certificate_number'),
      ]);
      if (certsResult.error) throw certsResult.error;
      if (!profile || errors.length) {
        throw new Err({ stage: 'validation', code: 'EMPLOYER_PROFILE_INVALID', message: errors[0] ?? 'Capture the employer details for SARS first.', recovery: 'Correct the employer details under Settings → Payroll.', status: 422 });
      }
      const declaration = ret.declaration_data ?? {};
      const file = buildEasyFile({
        profile,
        yearOfAssessment: Number(declaration.yearOfAssessment),
        period: ret.period,
        live,
        certificates: (certsResult.data ?? []).map((c) => ({ ...c.certificate_data, certificateNumber: c.certificate_number })),
      });
      const blocking = file.issues.filter((i) => i.severity === 'error');
      if (blocking.length) {
        throw new Err({
          stage: 'validation', code: 'EASYFILE_INVALID',
          message: `The file fails ${blocking.length} SARS rule${blocking.length === 1 ? '' : 's'}. ${blocking[0].message}`,
          recovery: 'Correct the records and file a corrected EMP501.', status: 422, details: blocking,
        });
      }
      const hash = await sha256Hex(file.content);
      await logReturnEvent(admin, { company_id, return_id: ret.id, event_type: 'exported', content_hash: hash, payload: { live, file_name: file.fileName, certificates: (certsResult.data ?? []).length }, user_id: user.id });
      return { fileName: file.fileName, content: file.content, contentHash: hash, issues: file.issues };
    }
  }
  return undefined;
}

export { loadPaymentsByReturn };
