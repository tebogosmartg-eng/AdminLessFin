/**
 * User actions on obligations and cycles, applied to in-memory rows.
 *
 * Pure. Each function validates the request against the current row, changes
 * the row, and returns the history events. The edge function then runs the
 * materializer over the result (so, for example, completing a filing opens
 * the next period) and sends the difference to one transactional RPC.
 */
import { isIsoDate } from './dates.ts';
import { termDueDate, termNumber } from './materialize.ts';
import { isOpenStatus } from './signals.ts';
import type { CycleRow, CycleStatus, EventRow, ObligationRow } from './types.ts';
import { REMINDER_OFFSET_CHOICES } from './types.ts';

export class ComplianceActionError extends Error {}

type Ctx = { companyId: string; actorUserId: string; now: string; newId: () => string };

function ev(
  ctx: Ctx,
  type: string,
  obligation: ObligationRow,
  cycle: CycleRow | null,
  before: unknown,
  after: unknown,
  note: string | null = null,
): EventRow {
  return {
    id: ctx.newId(),
    company_id: ctx.companyId,
    obligation_id: obligation.id,
    cycle_id: cycle?.id ?? null,
    actor_user_id: ctx.actorUserId,
    event_type: type,
    before,
    after,
    rule_version_id: cycle?.rule_version_id ?? obligation.rule_version_id,
    note,
  };
}

function cleanNote(note: unknown, max = 1000): string | null {
  if (typeof note !== 'string') return null;
  const t = note.trim();
  if (!t) return null;
  if (t.length > max) throw new ComplianceActionError(`Keep the note under ${max} characters.`);
  return t;
}

export function setOverride(
  ctx: Ctx,
  o: ObligationRow,
  input: { notApplicable: boolean; reason?: unknown; factsHash: string },
): EventRow[] {
  if (input.notApplicable) {
    const reason = cleanNote(input.reason, 500);
    if (!reason || reason.length < 5) {
      throw new ComplianceActionError('Give a reason (at least a few words) for marking this not applicable.');
    }
    const before = { override_not_applicable: o.override_not_applicable, reason: o.override_reason };
    o.override_not_applicable = true;
    o.override_reason = reason;
    o.override_by = ctx.actorUserId;
    o.override_at = ctx.now;
    o.override_facts_hash = input.factsHash;
    o.override_conflict = false;
    return [ev(ctx, before.override_not_applicable ? 'override_confirmed' : 'override_set', o, null, before,
      { override_not_applicable: true, reason }, reason)];
  }
  if (!o.override_not_applicable) throw new ComplianceActionError('This obligation is not marked not applicable.');
  const before = { override_not_applicable: true, reason: o.override_reason };
  o.override_not_applicable = false;
  o.override_reason = null;
  o.override_by = null;
  o.override_at = null;
  o.override_facts_hash = null;
  o.override_conflict = false;
  return [ev(ctx, 'override_cleared', o, null, before, { override_not_applicable: false })];
}

export function setResponsible(
  ctx: Ctx,
  o: ObligationRow,
  userId: string | null,
  eligibleUserIds: string[],
): EventRow[] {
  if (userId !== null && !eligibleUserIds.includes(userId)) {
    throw new ComplianceActionError('The responsible person must be an owner or admin of this company.');
  }
  if (o.responsible_user_id === userId) return [];
  const before = { responsible_user_id: o.responsible_user_id };
  o.responsible_user_id = userId;
  return [ev(ctx, 'responsible_changed', o, null, before, { responsible_user_id: userId })];
}

export function setReminderOffsets(ctx: Ctx, o: ObligationRow, offsets: unknown): EventRow[] {
  if (!Array.isArray(offsets) || offsets.length > REMINDER_OFFSET_CHOICES.length) {
    throw new ComplianceActionError('Choose reminder times from the list.');
  }
  const clean = [...new Set(offsets.map(Number))].sort((a, b) => b - a);
  if (clean.some((n) => !(REMINDER_OFFSET_CHOICES as readonly number[]).includes(n))) {
    throw new ComplianceActionError('Choose reminder times from the list.');
  }
  if (JSON.stringify(clean) === JSON.stringify(o.reminder_offsets)) return [];
  const before = { reminder_offsets: o.reminder_offsets };
  o.reminder_offsets = clean;
  return [ev(ctx, 'reminders_changed', o, null, before, { reminder_offsets: clean })];
}

const USER_SETTABLE: readonly CycleStatus[] = ['not_started', 'in_progress', 'action_required'];

export function setCycleStatus(
  ctx: Ctx,
  o: ObligationRow,
  c: CycleRow,
  to: unknown,
  note: unknown,
): EventRow[] {
  if (!isOpenStatus(c.status)) throw new ComplianceActionError('Reopen this period before changing its status.');
  if (!(USER_SETTABLE as readonly string[]).includes(String(to))) {
    throw new ComplianceActionError('That status cannot be set directly.');
  }
  const clean = cleanNote(note);
  if (c.status === to) return [];
  const before = { status: c.status };
  c.status = to as CycleStatus;
  return [ev(ctx, 'status_changed', o, c, before, { status: c.status }, clean)];
}

export function completeCycle(
  ctx: Ctx,
  o: ObligationRow,
  c: CycleRow,
  input: { completedOn?: unknown; note?: unknown; activeEvidenceCount: number; evidenceRequired: boolean; today: string },
): EventRow[] {
  if (!isOpenStatus(c.status)) throw new ComplianceActionError('This period is not open.');
  if (c.kind === 'term') {
    throw new ComplianceActionError('A certificate is completed by renewing it with its new dates.');
  }
  if (input.evidenceRequired && input.activeEvidenceCount < 1) {
    throw new ComplianceActionError('Add the proof (upload or link a record) before marking this completed.');
  }
  let completedOn = input.today;
  if (input.completedOn !== undefined && input.completedOn !== null && input.completedOn !== '') {
    if (!isIsoDate(input.completedOn)) throw new ComplianceActionError('The completion date is not a valid date.');
    if (input.completedOn > input.today) throw new ComplianceActionError('The completion date cannot be in the future.');
    completedOn = input.completedOn;
  }
  const note = cleanNote(input.note);
  const before = { status: c.status };
  c.status = 'completed';
  c.completed_at = `${completedOn}T00:00:00+02:00`;
  c.completed_by = ctx.actorUserId;
  c.completion_note = note;
  return [ev(ctx, 'cycle_completed', o, c, before, { status: 'completed', completed_on: completedOn }, note)];
}

export function reopenCycle(ctx: Ctx, o: ObligationRow, c: CycleRow, reason: unknown): EventRow[] {
  if (c.status !== 'completed') throw new ComplianceActionError('Only a completed period can be reopened.');
  const clean = cleanNote(reason, 500);
  if (!clean) throw new ComplianceActionError('Say why this period is being reopened.');
  const before = { status: c.status, completed_at: c.completed_at, completed_by: c.completed_by };
  c.status = 'in_progress';
  c.completed_at = null;
  c.completed_by = null;
  c.completion_note = null;
  return [ev(ctx, 'cycle_reopened', o, c, before, { status: 'in_progress' }, clean)];
}

function checkTermDates(validFrom: unknown, expiry: unknown): { validFrom: string; expiry: string } {
  if (!isIsoDate(validFrom) || !isIsoDate(expiry)) {
    throw new ComplianceActionError('Enter both the issue date and the expiry date.');
  }
  if (expiry <= validFrom) throw new ComplianceActionError('The expiry date must be after the issue date.');
  return { validFrom, expiry };
}

export function setTermDates(
  ctx: Ctx,
  o: ObligationRow,
  c: CycleRow,
  input: { validFrom: unknown; expiry: unknown; renewalLeadDays: number },
): EventRow[] {
  if (c.kind !== 'term') throw new ComplianceActionError('Only a certificate has issue and expiry dates.');
  if (!isOpenStatus(c.status)) throw new ComplianceActionError('This certificate term is closed.');
  const { validFrom, expiry } = checkTermDates(input.validFrom, input.expiry);
  const before = { valid_from: c.valid_from, expiry_date: c.expiry_date };
  c.valid_from = validFrom;
  c.expiry_date = expiry;
  c.due_date = termDueDate(expiry, input.renewalLeadDays);
  if (c.status === 'action_required') c.status = 'not_started';
  return [ev(ctx, 'term_dates_set', o, c, before, { valid_from: validFrom, expiry_date: expiry })];
}

export function renewTerm(
  ctx: Ctx,
  o: ObligationRow,
  c: CycleRow,
  allCycles: CycleRow[],
  input: { validFrom: unknown; expiry: unknown; renewalLeadDays: number; note?: unknown; today: string },
): { events: EventRow[]; next: CycleRow } {
  if (c.kind !== 'term') throw new ComplianceActionError('Only a certificate can be renewed.');
  if (!isOpenStatus(c.status)) throw new ComplianceActionError('This certificate term is already closed.');
  const { validFrom, expiry } = checkTermDates(input.validFrom, input.expiry);
  const note = cleanNote(input.note);
  const n = Math.max(0, ...allCycles.filter((x) => x.obligation_id === o.id).map((x) => termNumber(x.period_key)));
  const before = { status: c.status };
  c.status = 'completed';
  c.completed_at = ctx.now;
  c.completed_by = ctx.actorUserId;
  c.completion_note = note ?? 'Renewed.';
  const next: CycleRow = {
    id: ctx.newId(),
    company_id: ctx.companyId,
    obligation_id: o.id,
    kind: 'term',
    period_key: `term-${n + 1}`,
    opens_on: input.today,
    due_date: termDueDate(expiry, input.renewalLeadDays),
    valid_from: validFrom,
    expiry_date: expiry,
    status: 'not_started',
    time_signal: 'none',
    rule_version_id: o.rule_version_id,
    completed_at: null,
    completed_by: null,
    completion_note: null,
    why: c.why,
  };
  return {
    next,
    events: [
      ev(ctx, 'term_renewed', o, c, before, { status: 'completed' }, note),
      ev(ctx, 'cycle_opened', o, next, null, { period_key: next.period_key, valid_from: validFrom, expiry_date: expiry }),
    ],
  };
}

/** A new piece of evidence moves an untouched or in-progress period forward. */
export function evidenceAdded(ctx: Ctx, o: ObligationRow, c: CycleRow, title: string, kind: string): EventRow[] {
  const events = [ev(ctx, 'evidence_added', o, c, null, { title, kind })];
  if (c.status === 'not_started' || c.status === 'in_progress') {
    const before = { status: c.status };
    c.status = 'evidence_submitted';
    events.push(ev(ctx, 'status_changed', o, c, before, { status: 'evidence_submitted' }));
  }
  return events;
}
