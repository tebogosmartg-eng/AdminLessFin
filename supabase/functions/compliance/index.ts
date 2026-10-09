// @ts-nocheck
/**
 * Compliance & Governance — tenant API (ADR-0004).
 *
 * Owner and admin only, enforced here for every method. The company comes
 * from the verified membership, every service-role query filters by it, and
 * every referenced row (obligation, cycle, evidence source, assignee) is
 * checked against it. Rule conditions are evaluated here and never returned.
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import {
  createAdminClient,
  edgeFailure,
  edgeSuccess,
  parseJsonBody,
  platformLog,
  requireAuthenticatedUser,
  withEnterprisePlatform,
} from '../_shared/enterpriseEdgePlatform.ts';
import {
  assertComplianceAccess,
  assertEvidenceFile,
  assertEvidencePathBelongs,
  assertEvidenceSourceTable,
  assertSameCompany,
  ComplianceAccessError,
  eligibleResponsibleUsers,
  EVIDENCE_BUCKET,
  evidenceObjectPath,
} from '../_shared/compliance/access.ts';
import {
  ComplianceActionError,
  completeCycle,
  evidenceAdded,
  renewTerm,
  reopenCycle,
  setCycleStatus,
  setOverride,
  setReminderOffsets,
  setResponsible,
  setTermDates,
} from '../_shared/compliance/actions.ts';
import { todayInJohannesburg } from '../_shared/compliance/dates.ts';
import { answerConflicts, onFile, QUESTIONNAIRE_VERSION, validateAnswers } from '../_shared/compliance/facts.ts';
import { ruleFactsHash } from '../_shared/compliance/materialize.ts';
import { timeSignalFor } from '../_shared/compliance/signals.ts';
import {
  currentCycle,
  describeSchedule,
  loadWorkingSet,
  runChange,
} from '../_shared/compliance/service.ts';
import { callerMembership, loadReference, loadRuleVersionsById } from '../_shared/compliance/store.ts';

const newId = () => crypto.randomUUID();

function must(res, what) {
  if (res.error) throw new Error(`Could not read ${what}: ${res.error.message}`);
  return res.data;
}

// ── Views ────────────────────────────────────────────────────────────────

async function overview(admin, companyId, today, ws) {
  const [reference, ruleDetails] = await Promise.all([
    loadReference(admin),
    loadRuleVersionsById(admin, ws.state.obligations.map((o) => o.rule_version_id)),
  ]);
  const byObligation = new Map();
  for (const c of ws.state.cycles) byObligation.set(c.obligation_id, [...(byObligation.get(c.obligation_id) ?? []), c]);

  const counts = { applicable: 0, needs_information: 0, not_applicable: 0, overdue: 0, due_soon: 0, expired: 0, conflicts: 0 };
  const obligations = ws.state.obligations.map((o) => {
    const rule = ruleDetails.get(o.rule_version_id);
    const cycles = byObligation.get(o.id) ?? [];
    const cur = currentCycle(cycles);
    const signal = cur ? timeSignalFor(cur, today) : 'none';
    counts[o.applicability] += 1;
    if (o.applicability === 'applicable' && !o.retired) {
      if (signal === 'overdue') counts.overdue += 1;
      if (signal === 'due_soon') counts.due_soon += 1;
      if (signal === 'expired') counts.expired += 1;
    }
    if (o.override_conflict) counts.conflicts += 1;
    return {
      id: o.id,
      rule_code: o.rule_code,
      title: rule?.title ?? o.rule_code,
      summary: rule?.summary ?? '',
      category_code: rule?.category_code ?? null,
      authority_code: rule?.authority_code ?? null,
      priority: rule?.priority ?? 'medium',
      reviewed: rule?.reviewed ?? false,
      applicability: o.applicability,
      missing_facts: o.missing_facts,
      override_not_applicable: o.override_not_applicable,
      override_conflict: o.override_conflict,
      responsible_user_id: o.responsible_user_id,
      retired: o.retired,
      current_cycle: cur ? cycleView(cur, today) : null,
      open_cycles: cycles.filter((c) => ['not_started', 'in_progress', 'evidence_submitted', 'action_required'].includes(c.status)).length,
    };
  });

  const profile = ws.state.profile;
  return {
    today,
    questionnaire_version: QUESTIONNAIRE_VERSION,
    profile: profile
      ? {
          status: profile.status,
          revision: profile.revision,
          questionnaire_version: profile.questionnaire_version,
          answers: profile.answers,
          completed_at: profile.completed_at,
          last_evaluated_at: profile.last_evaluated_at,
          outdated_questionnaire: profile.questionnaire_version !== QUESTIONNAIRE_VERSION,
        }
      : null,
    on_file: onFile(ws.raw),
    conflicts: profile ? answerConflicts(profile.answers ?? {}, ws.raw) : [],
    industries: reference.industries.filter((i) => i.active).map(({ code, name }) => ({ code, name })),
    categories: reference.categories,
    authorities: reference.authorities,
    content_unreviewed: ws.rules.some((r) => !r.reviewed),
    rules_available: ws.rules.length,
    obligations,
    counts,
    members: ws.members
      .filter((m) => m.role === 'owner' || m.role === 'admin')
      .map((m) => ({ user_id: m.user_id, name: m.name, role: m.role })),
  };
}

function cycleView(c, today) {
  return {
    id: c.id,
    kind: c.kind,
    period_key: c.period_key,
    opens_on: c.opens_on,
    due_date: c.due_date,
    valid_from: c.valid_from,
    expiry_date: c.expiry_date,
    status: c.status,
    time_signal: timeSignalFor(c, today),
    rule_version_id: c.rule_version_id,
    completed_at: c.completed_at,
    completed_by: c.completed_by,
    completion_note: c.completion_note,
  };
}

async function obligationDetail(admin, companyId, today, ws, obligationId) {
  const o = ws.state.obligations.find((x) => x.id === obligationId);
  assertSameCompany(o, companyId, 'obligation');
  const cycles = ws.state.cycles
    .filter((c) => c.obligation_id === o.id)
    .sort((a, b) => ((a.due_date ?? a.expiry_date ?? a.opens_on ?? '') < (b.due_date ?? b.expiry_date ?? b.opens_on ?? '') ? 1 : -1));
  const versionIds = [...new Set([o.rule_version_id, ...cycles.map((c) => c.rule_version_id)])];

  const [rules, guidance, evidence, events, reference] = await Promise.all([
    loadRuleVersionsById(admin, versionIds),
    admin.from('compliance_guidance_versions').select('rule_version_id, content').eq('rule_version_id', o.rule_version_id).maybeSingle(),
    admin
      .from('compliance_evidence')
      .select('id, cycle_id, kind, title, file_name, mime_type, size_bytes, upload_status, source_table, source_id, uploaded_by, created_at, deleted_at, deleted_by, delete_reason')
      .eq('company_id', companyId)
      .eq('obligation_id', o.id)
      .order('created_at', { ascending: false }),
    admin
      .from('compliance_cycle_events')
      .select('id, cycle_id, actor_user_id, event_type, before, after, note, created_at')
      .eq('company_id', companyId)
      .eq('obligation_id', o.id)
      .order('created_at', { ascending: false })
      .limit(200),
    loadReference(admin),
  ]);
  const rule = rules.get(o.rule_version_id);
  const g = must(guidance, 'guidance');
  const authority = reference.authorities.find((a) => a.code === rule?.authority_code);
  const category = reference.categories.find((c) => c.code === rule?.category_code);
  const names = new Map(ws.members.map((m) => [m.user_id, m.name]));
  const evidenceRows = (must(evidence, 'evidence') ?? []).filter((e) => e.upload_status === 'stored');

  return {
    today,
    obligation: {
      id: o.id,
      rule_code: o.rule_code,
      applicability: o.applicability,
      evaluated_applicability: o.evaluated_applicability,
      missing_facts: o.missing_facts,
      override_not_applicable: o.override_not_applicable,
      override_reason: o.override_reason,
      override_by: o.override_by,
      override_at: o.override_at,
      override_conflict: o.override_conflict,
      responsible_user_id: o.responsible_user_id,
      reminder_offsets: o.reminder_offsets,
      retired: o.retired,
      why: o.why,
    },
    rule: rule
      ? {
          title: rule.title,
          summary: rule.summary,
          version: rule.version,
          reviewed: rule.reviewed,
          priority: rule.priority,
          category: category ? { code: category.code, name: category.name } : null,
          authority: authority ? { code: authority.code, name: authority.name, website: authority.website } : null,
          schedule_type: rule.schedule?.type,
          due_rule: describeSchedule(rule.schedule),
          renewal_lead_days: rule.schedule?.renewal_lead_days ?? null,
          evidence_required: !!rule.evidence?.required,
          evidence_sources: rule.evidence?.source_tables ?? [],
          provenance: {
            source_title: rule.provenance?.source_title ?? null,
            source_url: rule.provenance?.source_url ?? null,
            reviewed_by: rule.provenance?.reviewed_by ?? null,
            last_reviewed: rule.provenance?.last_reviewed ?? null,
            review_due: rule.review_due ?? null,
          },
        }
      : null,
    guidance: g?.content ?? null,
    cycles: cycles.map((c) => ({
      ...cycleView(c, today),
      rule_version: rules.get(c.rule_version_id)?.version ?? null,
      completed_by_name: c.completed_by ? names.get(c.completed_by) ?? null : null,
      evidence: evidenceRows
        .filter((e) => e.cycle_id === c.id)
        .map((e) => ({
          ...e,
          uploaded_by_name: e.uploaded_by ? names.get(e.uploaded_by) ?? null : null,
          deleted_by_name: e.deleted_by ? names.get(e.deleted_by) ?? null : null,
        })),
    })),
    events: (must(events, 'history') ?? []).map((e) => ({
      ...e,
      actor_name: e.actor_user_id ? names.get(e.actor_user_id) ?? 'Former user' : 'AdminLess (automatic)',
    })),
    members: ws.members
      .filter((m) => m.role === 'owner' || m.role === 'admin')
      .map((m) => ({ user_id: m.user_id, name: m.name, role: m.role })),
  };
}

// ── Evidence helpers ─────────────────────────────────────────────────────

const SOURCE_READS = {
  statutory_returns: {
    select: 'id, company_id, return_type, tax_year, period, version, status, submitted_at, created_at',
    // A filed EMP201/EMP501 is identified by its SARS period and version, not only the tax year.
    label: (r) => `${r.return_type} ${r.period ?? r.tax_year ?? ''}${r.period && r.version ? ` v${r.version}` : ''} (${r.status})`.trim(),
    route: () => '/statutory-returns',
    file: () => null,
  },
  asset_documents: {
    select: 'id, company_id, asset_id, document_type, file_name, file_url, created_at',
    label: (r) => `${r.file_name}${r.document_type ? ` (${r.document_type})` : ''}`,
    route: (r) => `/fixed-assets/${r.asset_id}`,
    file: (r) => r.file_url ?? null,
  },
  bills: {
    select: 'id, company_id, bill_number, bill_date, attachment_url, created_at',
    label: (r) => `Bill ${r.bill_number ?? ''} ${r.bill_date ?? ''}`.trim(),
    route: () => '/bills',
    file: (r) => r.attachment_url ?? null,
  },
  purchase_orders: {
    select: 'id, company_id, po_number, po_date, attachment_url, created_at',
    label: (r) => `Purchase order ${r.po_number ?? ''}`.trim(),
    route: (r) => `/purchase-orders/${r.id}`,
    file: (r) => r.attachment_url ?? null,
  },
  loans: {
    select: 'id, company_id, principal_amount, start_date, status, loan_agreement_url, created_at',
    label: (r) => `Loan from ${r.start_date ?? 'unknown date'} (${r.status ?? 'status unknown'})`,
    route: (r) => `/loans/${r.id}`,
    file: (r) => r.loan_agreement_url ?? null,
  },
};

async function readSource(admin, companyId, table, id) {
  assertEvidenceSourceTable(table);
  const spec = SOURCE_READS[table];
  const res = await admin.from(table).select(spec.select).eq('id', id).eq('company_id', companyId).maybeSingle();
  const row = must(res, 'the linked record');
  assertSameCompany(row, companyId, 'record');
  return { row, spec };
}

function findCycle(ws, cycleId, companyId) {
  const c = ws.state.cycles.find((x) => x.id === cycleId);
  assertSameCompany(c, companyId, 'period');
  const o = ws.state.obligations.find((x) => x.id === c.obligation_id);
  assertSameCompany(o, companyId, 'obligation');
  return { c, o };
}

function ruleFor(ws, o) {
  const rule = ws.rules.find((r) => r.rule_code === o.rule_code);
  if (!rule) throw new ComplianceActionError('This obligation’s rule is no longer published.');
  return rule;
}

// ── Handler ──────────────────────────────────────────────────────────────

serve(withEnterprisePlatform('compliance', 'tenant', async (req, ctx) => {
  try {
    if (req.method !== 'POST') throw new Error('Method not allowed.');
    const { user } = await requireAuthenticatedUser(req, ctx);
    const body = await parseJsonBody(req);
    const companyId = typeof body.company_id === 'string' ? body.company_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new ComplianceActionError('Company ID is required.');
    ctx.companyId = companyId;
    const method = String(body.method ?? '');
    ctx.requestMethod = method;

    const admin = createAdminClient();
    // Owner or admin of THIS company, or nothing — the same answer for a
    // member and for a stranger to the company.
    assertComplianceAccess(await callerMembership(admin, user.id, companyId));
    platformLog(ctx, 'compliance.access_granted');

    const today = todayInJohannesburg();
    const change = (trigger, mutate) =>
      runChange(admin, { companyId, actorUserId: user.id, today, trigger, mutate, newId });

    switch (method) {
      case 'GET_OVERVIEW': {
        const ws = await loadWorkingSet(admin, companyId, today);
        return edgeSuccess(ctx, await overview(admin, companyId, today, ws));
      }

      case 'SAVE_PROFILE': {
        const complete = body.complete === true;
        const reference = await loadReference(admin);
        const answers = validateAnswers(body.answers, {
          complete,
          industryCodes: reference.industries.filter((i) => i.active).map((i) => i.code),
          today,
        });
        const expectedRevision = Number.isInteger(body.expected_revision) ? body.expected_revision : null;
        const ws = await change('profile_save', (w) => {
          const current = w.state.profile;
          if (expectedRevision !== null && (current?.revision ?? 0) !== expectedRevision) {
            throw new ComplianceActionError('These answers were changed elsewhere. Reload to see the latest before saving.');
          }
          if (current?.status === 'completed' && !complete) {
            throw new ComplianceActionError('Answer every question before saving changes to a completed profile.');
          }
          const becomingComplete = complete && current?.status !== 'completed';
          return {
            profile: {
              status: complete || current?.status === 'completed' ? 'completed' : 'draft',
              questionnaire_version: QUESTIONNAIRE_VERSION,
              revision: (current?.revision ?? 0) + 1,
              answers,
              completed_at: becomingComplete ? new Date().toISOString() : current?.completed_at ?? null,
              completed_by: becomingComplete ? user.id : current?.completed_by ?? null,
              updated_by: user.id,
            },
          };
        });
        return edgeSuccess(ctx, await overview(admin, companyId, today, ws));
      }

      case 'REFRESH': {
        const ws = await change('manual', () => ({}));
        return edgeSuccess(ctx, await overview(admin, companyId, today, ws));
      }

      case 'GET_OBLIGATION': {
        const ws = await loadWorkingSet(admin, companyId, today);
        return edgeSuccess(ctx, await obligationDetail(admin, companyId, today, ws, String(body.obligation_id ?? '')));
      }

      case 'SET_OVERRIDE':
      case 'SET_RESPONSIBLE':
      case 'SET_REMINDERS': {
        const obligationId = String(body.obligation_id ?? '');
        const ws = await change('action', (w, draft) => {
          const o = draft.obligations.find((x) => x.id === obligationId);
          assertSameCompany(o, companyId, 'obligation');
          if (method === 'SET_OVERRIDE') {
            const rule = ruleFor(w, o);
            return {
              events: setOverride(
                { companyId, actorUserId: user.id, now: new Date().toISOString(), newId },
                o,
                { notApplicable: body.not_applicable === true, reason: body.reason, factsHash: ruleFactsHash(rule, w.facts) },
              ),
            };
          }
          if (method === 'SET_RESPONSIBLE') {
            const target = body.user_id === null || body.user_id === '' ? null : String(body.user_id ?? '');
            return {
              events: setResponsible(
                { companyId, actorUserId: user.id, now: new Date().toISOString(), newId },
                o,
                target,
                eligibleResponsibleUsers(w.members),
              ),
            };
          }
          return {
            events: setReminderOffsets({ companyId, actorUserId: user.id, now: new Date().toISOString(), newId }, o, body.offsets),
          };
        });
        return edgeSuccess(ctx, await obligationDetail(admin, companyId, today, ws, obligationId));
      }

      case 'SET_CYCLE_STATUS':
      case 'COMPLETE_CYCLE':
      case 'REOPEN_CYCLE':
      case 'SET_TERM_DATES':
      case 'RENEW_TERM': {
        const cycleId = String(body.cycle_id ?? '');
        let obligationId = '';
        let activeEvidence = 0;
        if (method === 'COMPLETE_CYCLE') {
          const res = await admin
            .from('compliance_evidence')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('cycle_id', cycleId)
            .eq('upload_status', 'stored')
            .is('deleted_at', null);
          if (res.error) throw new Error(`Could not read evidence: ${res.error.message}`);
          activeEvidence = res.count ?? 0;
        }
        const ws = await change('action', (w, draft) => {
          const c = draft.cycles.find((x) => x.id === cycleId);
          assertSameCompany(c, companyId, 'period');
          const o = draft.obligations.find((x) => x.id === c.obligation_id);
          assertSameCompany(o, companyId, 'obligation');
          obligationId = o.id;
          const actx = { companyId, actorUserId: user.id, now: new Date().toISOString(), newId };
          const rule = ruleFor(w, o);
          if (o.applicability !== 'applicable' && method !== 'REOPEN_CYCLE') {
            throw new ComplianceActionError('This obligation is not currently applicable.');
          }
          switch (method) {
            case 'SET_CYCLE_STATUS':
              return { events: setCycleStatus(actx, o, c, body.status, body.note) };
            case 'COMPLETE_CYCLE':
              return {
                events: completeCycle(actx, o, c, {
                  completedOn: body.completed_on,
                  note: body.note,
                  activeEvidenceCount: activeEvidence,
                  evidenceRequired: !!rule.evidence?.required,
                  today,
                }),
              };
            case 'REOPEN_CYCLE':
              return { events: reopenCycle(actx, o, c, body.reason) };
            case 'SET_TERM_DATES':
              return {
                events: setTermDates(actx, o, c, {
                  validFrom: body.valid_from,
                  expiry: body.expiry_date,
                  renewalLeadDays: rule.schedule?.renewal_lead_days ?? 30,
                }),
              };
            default: {
              const { events, next } = renewTerm(actx, o, c, draft.cycles, {
                validFrom: body.valid_from,
                expiry: body.expiry_date,
                renewalLeadDays: rule.schedule?.renewal_lead_days ?? 30,
                note: body.note,
                today,
              });
              draft.cycles.push(next);
              return { events };
            }
          }
        });
        return edgeSuccess(ctx, await obligationDetail(admin, companyId, today, ws, obligationId));
      }

      case 'EVIDENCE_CREATE_UPLOAD': {
        const cycleId = String(body.cycle_id ?? '');
        assertEvidenceFile({ mimeType: body.mime_type, sizeBytes: body.size_bytes, fileName: body.file_name });
        const title = String(body.title ?? body.file_name ?? '').trim().slice(0, 200) || String(body.file_name);
        const evidenceId = newId();
        let path = '';
        await change('action', (w) => {
          const { c, o } = findCycle(w, cycleId, companyId);
          if (!['not_started', 'in_progress', 'evidence_submitted', 'action_required', 'completed'].includes(c.status)) {
            throw new ComplianceActionError('Proof cannot be added to a withdrawn period.');
          }
          path = evidenceObjectPath(companyId, c.id, evidenceId);
          return {
            evidence: [{
              id: evidenceId,
              company_id: companyId,
              obligation_id: o.id,
              cycle_id: c.id,
              kind: 'upload',
              title,
              file_name: String(body.file_name).trim(),
              storage_path: path,
              mime_type: body.mime_type,
              size_bytes: Number(body.size_bytes),
              upload_status: 'pending',
              uploaded_by: user.id,
            }],
          };
        });
        const { data, error } = await admin.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(path);
        if (error || !data) throw new Error(`Could not prepare the upload: ${error?.message ?? 'no upload URL'}`);
        return edgeSuccess(ctx, { evidence_id: evidenceId, path: data.path ?? path, token: data.token });
      }

      case 'EVIDENCE_CONFIRM_UPLOAD': {
        const evidenceId = String(body.evidence_id ?? '');
        const res = await admin
          .from('compliance_evidence')
          .select('id, company_id, cycle_id, obligation_id, kind, title, file_name, storage_path, mime_type, size_bytes, upload_status, uploaded_by')
          .eq('id', evidenceId)
          .eq('company_id', companyId)
          .maybeSingle();
        const ev = must(res, 'the upload');
        assertSameCompany(ev, companyId, 'upload');
        if (ev.kind !== 'upload') throw new ComplianceActionError('That proof is not an upload.');
        assertEvidencePathBelongs(ev.storage_path, companyId, ev.cycle_id);
        let obligationId = ev.obligation_id;
        if (ev.upload_status !== 'stored') {
          const folder = ev.storage_path.split('/').slice(0, 2).join('/');
          const name = ev.storage_path.split('/')[2];
          const listed = await admin.storage.from(EVIDENCE_BUCKET).list(folder, { search: name, limit: 5 });
          if (listed.error) throw new Error(`Could not confirm the upload: ${listed.error.message}`);
          if (!(listed.data ?? []).some((f) => f.name === name)) {
            throw new ComplianceActionError('The file has not arrived yet. Try the upload again.');
          }
          await change('action', (w, draft) => {
            const c = draft.cycles.find((x) => x.id === ev.cycle_id);
            assertSameCompany(c, companyId, 'period');
            const o = draft.obligations.find((x) => x.id === c.obligation_id);
            obligationId = o.id;
            return {
              evidence: [{ ...ev, upload_status: 'stored' }],
              events: evidenceAdded({ companyId, actorUserId: user.id, now: new Date().toISOString(), newId }, o, c, ev.title, 'upload'),
            };
          });
        }
        const ws = await loadWorkingSet(admin, companyId, today);
        return edgeSuccess(ctx, await obligationDetail(admin, companyId, today, ws, obligationId));
      }

      case 'EVIDENCE_ADD_REFERENCE': {
        const cycleId = String(body.cycle_id ?? '');
        const table = body.source_table;
        const sourceId = String(body.source_id ?? '');
        const { row, spec } = await readSource(admin, companyId, table, sourceId);
        let obligationId = '';
        const ws = await change('action', (w, draft) => {
          const c = draft.cycles.find((x) => x.id === cycleId);
          assertSameCompany(c, companyId, 'period');
          const o = draft.obligations.find((x) => x.id === c.obligation_id);
          assertSameCompany(o, companyId, 'obligation');
          obligationId = o.id;
          const rule = ruleFor(w, o);
          if (!(rule.evidence?.source_tables ?? []).includes(table)) {
            throw new ComplianceActionError('That kind of record is not accepted as proof for this obligation.');
          }
          const title = String(body.title ?? '').trim().slice(0, 200) || spec.label(row);
          return {
            evidence: [{
              id: newId(),
              company_id: companyId,
              obligation_id: o.id,
              cycle_id: c.id,
              kind: 'reference',
              title,
              source_table: table,
              source_id: row.id,
              upload_status: 'stored',
              uploaded_by: user.id,
            }],
            events: evidenceAdded({ companyId, actorUserId: user.id, now: new Date().toISOString(), newId }, o, c, title, table),
          };
        });
        return edgeSuccess(ctx, await obligationDetail(admin, companyId, today, ws, obligationId));
      }

      case 'EVIDENCE_LIST_SOURCES': {
        const table = body.source_table;
        assertEvidenceSourceTable(table);
        const spec = SOURCE_READS[table];
        const res = await admin
          .from(table)
          .select(spec.select)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(50);
        const rows = must(res, 'records') ?? [];
        return edgeSuccess(ctx, { sources: rows.map((r) => ({ id: r.id, label: spec.label(r) })) });
      }

      case 'EVIDENCE_OPEN': {
        const evidenceId = String(body.evidence_id ?? '');
        const res = await admin
          .from('compliance_evidence')
          .select('id, company_id, cycle_id, kind, storage_path, file_name, upload_status, source_table, source_id, deleted_at')
          .eq('id', evidenceId)
          .eq('company_id', companyId)
          .maybeSingle();
        const ev = must(res, 'the proof');
        assertSameCompany(ev, companyId, 'proof');
        if (ev.kind === 'upload') {
          if (ev.upload_status !== 'stored') throw new ComplianceActionError('That upload did not finish.');
          assertEvidencePathBelongs(ev.storage_path, companyId, ev.cycle_id);
          const { data, error } = await admin.storage
            .from(EVIDENCE_BUCKET)
            .createSignedUrl(ev.storage_path, 60, { download: ev.file_name ?? true });
          if (error || !data?.signedUrl) throw new Error(`Could not open the file: ${error?.message ?? 'no link'}`);
          return edgeSuccess(ctx, { kind: 'upload', url: data.signedUrl, expires_in: 60 });
        }
        const { row, spec } = await readSource(admin, companyId, ev.source_table, ev.source_id);
        return edgeSuccess(ctx, { kind: 'reference', route: spec.route(row), file_url: spec.file(row), label: spec.label(row) });
      }

      case 'EVIDENCE_DELETE': {
        const evidenceId = String(body.evidence_id ?? '');
        const reason = String(body.reason ?? '').trim();
        if (reason.length < 3) throw new ComplianceActionError('Say why this proof is being removed.');
        if (reason.length > 500) throw new ComplianceActionError('Keep the reason under 500 characters.');
        const res = await admin
          .from('compliance_evidence')
          .select('id, company_id, obligation_id, cycle_id, kind, title, file_name, storage_path, mime_type, size_bytes, upload_status, source_table, source_id, uploaded_by, deleted_at')
          .eq('id', evidenceId)
          .eq('company_id', companyId)
          .maybeSingle();
        const ev = must(res, 'the proof');
        assertSameCompany(ev, companyId, 'proof');
        if (ev.deleted_at) throw new ComplianceActionError('That proof was already removed.');
        const ws = await change('action', (w, draft) => {
          const c = draft.cycles.find((x) => x.id === ev.cycle_id);
          const o = draft.obligations.find((x) => x.id === ev.obligation_id);
          assertSameCompany(c, companyId, 'period');
          assertSameCompany(o, companyId, 'obligation');
          return {
            // Soft delete only: the file and the row stay for the record.
            evidence: [{ ...ev, deleted_at: new Date().toISOString(), deleted_by: user.id, delete_reason: reason }],
            events: [{
              id: newId(),
              company_id: companyId,
              obligation_id: o.id,
              cycle_id: c.id,
              actor_user_id: user.id,
              event_type: 'evidence_removed',
              before: { title: ev.title },
              after: null,
              rule_version_id: c.rule_version_id,
              note: reason,
            }],
          };
        });
        return edgeSuccess(ctx, await obligationDetail(admin, companyId, today, ws, ev.obligation_id));
      }

      case 'GET_CALENDAR': {
        const start = String(body.start_date ?? '');
        const end = String(body.end_date ?? '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
          throw new ComplianceActionError('A start and end date are required.');
        }
        const ws = await loadWorkingSet(admin, companyId, today);
        const ruleDetails = await loadRuleVersionsById(admin, ws.state.obligations.map((o) => o.rule_version_id));
        const applicable = new Map(
          ws.state.obligations.filter((o) => o.applicability === 'applicable').map((o) => [o.id, o]),
        );
        const events = [];
        for (const c of ws.state.cycles) {
          const o = applicable.get(c.obligation_id);
          if (!o || c.status === 'cancelled') continue;
          const title = ruleDetails.get(o.rule_version_id)?.title ?? o.rule_code;
          const signal = timeSignalFor(c, today);
          if (c.kind === 'term' && c.expiry_date && c.expiry_date >= start && c.expiry_date <= end) {
            events.push({ id: o.id, cycle_id: c.id, title: `${title} expires`, date: c.expiry_date, type: 'compliance_expiry', status: c.status, signal });
          }
          if (c.due_date && c.due_date >= start && c.due_date <= end) {
            events.push({
              id: o.id,
              cycle_id: c.id,
              title: c.kind === 'term' ? `Renew: ${title}` : title,
              date: c.due_date,
              type: 'compliance_due',
              status: c.status,
              signal,
            });
          }
        }
        return edgeSuccess(ctx, { events });
      }

      default:
        throw new ComplianceActionError(`Unknown method: ${method}`);
    }
  } catch (error) {
    if (error instanceof ComplianceAccessError) {
      return edgeFailure(ctx, error, {
        category: error.message === 'Permission denied.' ? 'AuthorizationError' : 'ValidationError',
        businessMessage: error.message === 'Permission denied.'
          ? 'Only owners and admins of this company can use Compliance & Governance.'
          : error.message,
      });
    }
    if (error instanceof ComplianceActionError) {
      return edgeFailure(ctx, error, { category: 'ValidationError', businessMessage: error.message });
    }
    return edgeFailure(ctx, error);
  }
}));
