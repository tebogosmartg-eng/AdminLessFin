/**
 * Compliance & Governance engine — conditions, date engine, schedules,
 * materializer precedence, actions, signals, reminders and facts.
 * Pure functions only; the same modules run in the edge functions.
 */
import { describe, expect, it } from 'vitest';
import { evaluateCondition, conditionFacts } from '../../supabase/functions/_shared/compliance/conditions.ts';
import {
  addBusinessDays,
  addMonths,
  adjustToBusinessDay,
  anniversaryIn,
  todayInJohannesburg,
} from '../../supabase/functions/_shared/compliance/dates.ts';
import { occurrencesBetween, initialTrackingFrom } from '../../supabase/functions/_shared/compliance/schedules.ts';
import { diffPlan, isEmptyPlan, materialize, ruleFactsHash } from '../../supabase/functions/_shared/compliance/materialize.ts';
import {
  completeCycle,
  ComplianceActionError,
  renewTerm,
  reopenCycle,
  setCycleStatus,
  setOverride,
  setReminderOffsets,
  setResponsible,
  setTermDates,
} from '../../supabase/functions/_shared/compliance/actions.ts';
import { reminderOffsetDue, timeSignalFor, OVERDUE_OFFSET } from '../../supabase/functions/_shared/compliance/signals.ts';
import {
  assertComplianceAccess,
  assertEvidenceFile,
  assertEvidencePathBelongs,
  assertEvidenceSourceTable,
  evidenceObjectPath,
  reminderRecipients,
} from '../../supabase/functions/_shared/compliance/access.ts';
import { deriveFacts, validateAnswers, type RawCompanyRecords } from '../../supabase/functions/_shared/compliance/facts.ts';
import type { ComplianceFacts, CycleRow, ObligationRow, RuleVersion } from '../../supabase/functions/_shared/compliance/types.ts';
import { ZA_PUBLIC_HOLIDAYS } from '../../content/compliance/za/reference';

const HOLIDAYS = new Set(ZA_PUBLIC_HOLIDAYS.map(([d]) => d));
const COMPANY = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';

let seq = 0;
const newId = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
};

function rule(partial: Partial<RuleVersion> & Pick<RuleVersion, 'rule_code' | 'condition' | 'schedule'>): RuleVersion {
  return {
    id: `rule-${partial.rule_code}-v${partial.version ?? 1}`,
    version: 1,
    status: 'published',
    country_code: 'ZA',
    category_code: 'corporate_cipc',
    industry_code: null,
    authority_code: 'CIPC',
    title: partial.rule_code,
    summary: 'x',
    evidence: { required: false, source_tables: [] },
    priority: 'high',
    reminder_offsets: [30, 7, 1],
    effective_from: '2025-01-01',
    effective_to: null,
    reviewed: false,
    ...partial,
  };
}

const CIPC = rule({
  rule_code: 'ZA.CIPC.ANNUAL_RETURN',
  condition: { fact_in: ['entity_type', ['private_company', 'public_company', 'close_corporation', 'non_profit_company']] },
  schedule: { type: 'anniversary_business_days', anchor: 'incorporation_date', business_days: 30 },
  evidence: { required: true, source_tables: [] },
});
const EMP201 = rule({
  rule_code: 'ZA.SARS.EMP201',
  condition: { fact_eq: ['has_employees', true] },
  schedule: { type: 'periodic', frequency: 'monthly', due_day: 7, adjust: 'previous_business_day' },
  reminder_offsets: [7, 3, 1],
});
const CERT = rule({
  rule_code: 'ZA.BBBEE.CERTIFICATE',
  condition: { fact_present: 'entity_type' },
  schedule: { type: 'certificate_expiry', renewal_lead_days: 60, default_term_months: 12 },
});
const ONCE = rule({
  rule_code: 'ZA.INFOREG.INFORMATION_OFFICER',
  condition: { fact_present: 'entity_type' },
  schedule: { type: 'once_off' },
});

function run(
  facts: ComplianceFacts,
  rules: RuleVersion[],
  today: string,
  state: { obligations: ObligationRow[]; cycles: CycleRow[] } = { obligations: [], cycles: [] },
) {
  return materialize({
    companyId: COMPANY,
    today,
    facts,
    rules,
    holidays: HOLIDAYS,
    obligations: state.obligations,
    cycles: state.cycles,
    actorUserId: ACTOR,
    newId,
  });
}

const ctx = () => ({ companyId: COMPANY, actorUserId: ACTOR, now: '2026-09-30T08:00:00Z', newId });

describe('conditions — three-valued, never silently "no"', () => {
  it('matches, refuses, and reports the facts it is missing', () => {
    const c = { all_of: [{ fact_eq: ['has_employees', true] }, { fact_gt: ['employee_count', 49] }] } as const;
    expect(evaluateCondition(c, { has_employees: true, employee_count: 50 }).result).toBe(true);
    expect(evaluateCondition(c, { has_employees: false }).result).toBe(false);
    const unknown = evaluateCondition(c, { has_employees: true });
    expect(unknown).toEqual({ result: 'unknown', missing: ['employee_count'] });
    expect(evaluateCondition({ any_of: [{ fact_eq: ['vat_status', 'registered'] }, { always: true }] }, {}).result).toBe(true);
    expect(evaluateCondition({ not: { fact_eq: ['vat_status', 'registered'] } }, {}).result).toBe('unknown');
    expect(evaluateCondition({ fact_present: 'entity_type' }, {}).result).toBe(false);
  });

  it('rejects unknown facts and operators outright', () => {
    expect(() => evaluateCondition({ fact_eq: ['favourite_colour' as never, 'blue'] }, {})).toThrow(/Unknown compliance fact/);
    expect(() => evaluateCondition({ eval: 'x' } as never, {})).toThrow(/Unsupported condition/);
    expect(conditionFacts({ all_of: [{ fact_eq: ['vat_status', 'registered'] }, { fact_gt: ['employee_count', 1] }] })).toEqual([
      'employee_count',
      'vat_status',
    ]);
  });
});

describe('date engine — Africa/Johannesburg, business days, month ends', () => {
  it('counts business days over weekends and public holidays', () => {
    // Anniversary 15 March 2026 (a Sunday); Good Friday 3 Apr, Family Day
    // 6 Apr and Freedom Day 27 Apr all fall inside the 30 business days.
    expect(addBusinessDays('2026-03-15', 30, HOLIDAYS)).toBe('2026-04-29');
    expect(addBusinessDays('2026-12-24', 1, HOLIDAYS)).toBe('2026-12-28');
  });

  it('moves a due date back to the previous business day', () => {
    expect(adjustToBusinessDay('2026-03-07', 'previous_business_day', HOLIDAYS)).toBe('2026-03-06');
    expect(adjustToBusinessDay('2026-08-10', 'previous_business_day', HOLIDAYS)).toBe('2026-08-07');
    expect(adjustToBusinessDay('2026-08-10', 'next_business_day', HOLIDAYS)).toBe('2026-08-11');
  });

  it('keeps month ends as month ends and clamps impossible days', () => {
    expect(addMonths('2026-02-28', -6)).toBe('2025-08-31');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(anniversaryIn('2020-02-29', 2026)).toBe('2026-02-28');
  });

  it('dates "today" in Johannesburg, not in UTC or the host zone', () => {
    expect(todayInJohannesburg(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10-01');
    expect(todayInJohannesburg(new Date('2026-09-30T21:59:00Z'))).toBe('2026-09-30');
  });
});

describe('schedules', () => {
  it('CIPC annual return: 30 business days after each anniversary', () => {
    const res = occurrencesBetween(CIPC.schedule, { incorporation_date: '2019-03-15' }, HOLIDAYS, '2026-01-01', '2027-12-31');
    expect(res.ok && res.occurrences).toEqual([
      { period_key: '2026', opens_on: '2026-03-15', due_date: '2026-04-29' },
      { period_key: '2027', opens_on: '2027-03-15', due_date: '2027-04-30' }, // 22 Mar, 26 Mar, 29 Mar, 27 Apr are holidays
    ]);
  });

  it('needs the incorporation date before any period can be dated', () => {
    expect(occurrencesBetween(CIPC.schedule, {}, HOLIDAYS, '2026-01-01', '2026-12-31')).toEqual({
      ok: false,
      missing: ['incorporation_date'],
    });
  });

  it('EMP201: the 7th of the following month, or the business day before', () => {
    const res = occurrencesBetween(EMP201.schedule, {}, HOLIDAYS, '2026-02-01', '2026-07-01');
    if (!res.ok) throw new Error('expected occurrences');
    const byKey = Object.fromEntries(res.occurrences.map((o) => [o.period_key, o.due_date]));
    expect(byKey['2026-02']).toBe('2026-03-06'); // 7 March 2026 is a Saturday
    expect(byKey['2026-07']).toBe('2026-08-07');
  });

  it('VAT bi-monthly periods follow the filing frequency', () => {
    const schedule = { type: 'periodic', frequency: 'from_vat_filing_frequency', due_day: 25, adjust: 'previous_business_day' } as const;
    const even = occurrencesBetween(schedule, { vat_filing_frequency: 'bimonthly_even' }, HOLIDAYS, '2026-07-01', '2026-07-01');
    expect(even.ok && even.occurrences).toEqual([{ period_key: '2026-08', opens_on: '2026-07-01', due_date: '2026-09-25' }]);
    const odd = occurrencesBetween(schedule, { vat_filing_frequency: 'bimonthly_odd' }, HOLIDAYS, '2026-08-01', '2026-08-01');
    expect(odd.ok && odd.occurrences).toEqual([{ period_key: '2026-09', opens_on: '2026-08-01', due_date: '2026-10-23' }]);
    expect(occurrencesBetween(schedule, {}, HOLIDAYS, '2026-01-01', '2026-12-31')).toEqual({ ok: false, missing: ['vat_filing_frequency'] });
  });

  it('months after (or before) the financial year end', () => {
    const fye = { financial_year_end: { month: 2, day: 31 } };
    const provisional1 = { type: 'months_after_year_end', months: -6, adjust: 'previous_business_day', opens_days_before_due: 90 } as const;
    // Year ending 28 Feb 2026: six months before is 31 Aug 2025, a Sunday,
    // so the first payment is due on Friday 29 Aug 2025.
    const r1 = occurrencesBetween(provisional1, fye, HOLIDAYS, '2025-05-01', '2025-06-30');
    expect(r1.ok && r1.occurrences).toEqual([{ period_key: 'FY2026-02-28', opens_on: '2025-05-31', due_date: '2025-08-29' }]);
    const itr14 = { type: 'months_after_year_end', months: 12, adjust: 'none', opens_days_before_due: 365 } as const;
    const r2 = occurrencesBetween(itr14, fye, HOLIDAYS, '2026-02-01', '2026-03-31');
    expect(r2.ok && r2.occurrences.map((o) => [o.period_key, o.due_date])).toEqual([['FY2026-02-28', '2027-02-28']]);
    const afs = { type: 'months_after_year_end', months: 6, adjust: 'none', opens_days_before_due: 183 } as const;
    const r3 = occurrencesBetween(afs, fye, HOLIDAYS, '2026-02-01', '2026-03-31');
    expect(r3.ok && r3.occurrences.map((o) => o.due_date)).toEqual(['2026-08-31']);
  });

  it('starts tracking at the latest period that has already opened', () => {
    expect(initialTrackingFrom(CIPC.schedule, { incorporation_date: '2019-03-15' }, HOLIDAYS, '2026-09-30')).toBe('2026-03-15');
    expect(initialTrackingFrom(CIPC.schedule, { incorporation_date: '2026-06-01' }, HOLIDAYS, '2026-09-30')).toBe('2026-09-30');
  });
});

describe('materializer', () => {
  const facts: ComplianceFacts = { entity_type: 'private_company', incorporation_date: '2019-03-15', incorporation_date_known: true };

  it('opens the running period and the next one, with server-side signals', () => {
    const out = run(facts, [CIPC], '2026-09-30');
    expect(out.obligations).toHaveLength(1);
    expect(out.obligations[0]).toMatchObject({ applicability: 'applicable', tracking_from: '2026-03-15', company_id: COMPANY });
    const cycles = out.cycles.map((c) => [c.period_key, c.due_date, c.status, c.time_signal]);
    expect(cycles).toEqual([
      ['2026', '2026-04-29', 'not_started', 'overdue'],
      ['2027', '2027-04-30', 'not_started', 'none'],
    ]);
    expect(out.events.map((e) => e.event_type)).toEqual(['obligation_created', 'cycle_opened', 'cycle_opened']);
  });

  it('is idempotent: re-running on its own output changes nothing', () => {
    const first = run(facts, [CIPC], '2026-09-30');
    const second = run(facts, [CIPC], '2026-09-30', { obligations: first.obligations, cycles: first.cycles });
    expect(isEmptyPlan(diffPlan({ obligations: first.obligations, cycles: first.cycles }, second))).toBe(true);
  });

  it('flags "needs information" instead of guessing', () => {
    const out = run({ entity_type: 'private_company' }, [CIPC], '2026-09-30');
    expect(out.obligations[0]).toMatchObject({ applicability: 'needs_information', missing_facts: ['incorporation_date'] });
    expect(out.cycles).toHaveLength(0);
    const unknownType = run({}, [CIPC], '2026-09-30');
    expect(unknownType.obligations[0]).toMatchObject({ applicability: 'needs_information', missing_facts: ['entity_type'] });
  });

  it('creates nothing for a rule that does not apply', () => {
    const out = run({ entity_type: 'sole_proprietor', incorporation_date: '2019-03-15' }, [CIPC], '2026-09-30');
    expect(out.obligations).toHaveLength(0);
    expect(out.cycles).toHaveLength(0);
  });

  it('a user override wins until the facts change, then shows a conflict', () => {
    const base = run(facts, [CIPC], '2026-09-30');
    const o = base.obligations[0];
    setOverride(ctx(), o, { notApplicable: true, reason: 'Dormant; deregistration pending', factsHash: ruleFactsHash(CIPC, facts) });
    const afterOverride = run(facts, [CIPC], '2026-09-30', base);
    expect(afterOverride.obligations[0]).toMatchObject({ applicability: 'not_applicable', override_conflict: false });
    expect(afterOverride.cycles.every((c) => c.status === 'cancelled')).toBe(true);

    // Same facts again: the override stands, silently.
    const again = run(facts, [CIPC], '2026-10-01', afterOverride);
    expect(again.obligations[0]).toMatchObject({ applicability: 'not_applicable', override_conflict: false });

    // The facts behind the rule change: still not applicable, but flagged.
    const changed = { ...facts, entity_type: 'public_company' as const };
    const conflict = run(changed, [CIPC], '2026-10-01', again);
    expect(conflict.obligations[0]).toMatchObject({ applicability: 'not_applicable', override_conflict: true });
    expect(conflict.events.map((e) => e.event_type)).toContain('override_conflict');

    // Clearing the override brings the withdrawn periods back.
    setOverride(ctx(), conflict.obligations[0], { notApplicable: false, factsHash: '' });
    const cleared = run(changed, [CIPC], '2026-10-01', conflict);
    expect(cleared.obligations[0].applicability).toBe('applicable');
    expect(cleared.cycles.filter((c) => c.status === 'not_started')).toHaveLength(2);
  });

  it('open periods keep their rule version; new periods use the new one', () => {
    const v1 = run(facts, [CIPC], '2026-09-30');
    const v2rule = { ...CIPC, id: 'rule-cipc-v2', version: 2 };
    const later = run(facts, [v2rule], '2027-09-30', v1);
    const byKey = Object.fromEntries(later.cycles.map((c) => [c.period_key, c]));
    expect(byKey['2026'].rule_version_id).toBe(CIPC.id);
    expect(byKey['2027'].rule_version_id).toBe(CIPC.id);
    expect(byKey['2028'].rule_version_id).toBe('rule-cipc-v2');
    expect(later.obligations[0].rule_version_id).toBe('rule-cipc-v2');
  });

  it('a retired rule opens no new periods and keeps open ones visible', () => {
    const v1 = run(facts, [CIPC], '2026-09-30');
    const retired = run(facts, [{ ...CIPC, status: 'retired' }], '2027-09-30', v1);
    expect(retired.obligations[0].retired).toBe(true);
    expect(retired.cycles.map((c) => c.period_key)).toEqual(['2026', '2027']);
    expect(retired.cycles.every((c) => c.status === 'not_started')).toBe(true);
  });

  it('completing a filing opens the next period', () => {
    const f = { has_employees: true };
    const first = run(f, [EMP201], '2026-09-30');
    expect(first.cycles.map((c) => [c.period_key, c.due_date])).toEqual([['2026-09', '2026-10-07']]);
    const o = first.obligations[0];
    const c = first.cycles[0];
    completeCycle(ctx(), o, c, { activeEvidenceCount: 0, evidenceRequired: false, today: '2026-09-30' });
    const next = run(f, [EMP201], '2026-09-30', first);
    expect(next.cycles.map((x) => [x.period_key, x.status])).toEqual([
      ['2026-09', 'completed'],
      ['2026-10', 'not_started'],
    ]);
  });

  it('a corrected anchor date moves an untouched period and withdraws one that no longer exists', () => {
    const first = run(facts, [CIPC], '2026-09-30');
    const corrected = run({ ...facts, incorporation_date: '2019-03-20' }, [CIPC], '2026-09-30', first);
    const y2026 = corrected.cycles.find((c) => c.period_key === '2026')!;
    expect(y2026.due_date).toBe('2026-05-07'); // 3 Apr, 6 Apr, 27 Apr and 1 May are holidays
    expect(corrected.events.map((e) => e.event_type)).toContain('due_date_changed');
  });

  it('certificates are tracked by term, not by filing period', () => {
    const first = run({ entity_type: 'private_company' }, [CERT], '2026-09-30');
    const term = first.cycles[0];
    expect(term).toMatchObject({ kind: 'term', period_key: 'term-1', status: 'action_required', due_date: null });
    const o = first.obligations[0];
    setTermDates(ctx(), o, term, { validFrom: '2026-01-01', expiry: '2026-12-31', renewalLeadDays: 60 });
    expect(term).toMatchObject({ status: 'not_started', due_date: '2026-11-01' });
    expect(timeSignalFor(term, '2026-10-15')).toBe('none');
    expect(timeSignalFor(term, '2026-11-01')).toBe('due_soon');
    expect(timeSignalFor(term, '2027-01-01')).toBe('expired');
    const { next } = renewTerm(ctx(), o, term, first.cycles, {
      validFrom: '2026-12-15',
      expiry: '2027-12-14',
      renewalLeadDays: 60,
      today: '2026-12-15',
    });
    expect(term.status).toBe('completed');
    expect(next).toMatchObject({ period_key: 'term-2', due_date: '2027-10-15', status: 'not_started' });
  });

  it('a once-off obligation has one period and no due date', () => {
    const out = run({ entity_type: 'trust' }, [ONCE], '2026-09-30');
    expect(out.cycles.map((c) => [c.kind, c.period_key, c.due_date])).toEqual([['once', 'once', null]]);
  });

  it('never produces a row for another company', () => {
    const out = run(facts, [CIPC, EMP201, CERT, ONCE], '2026-09-30');
    expect([...out.obligations, ...out.cycles, ...out.events].every((r) => r.company_id === COMPANY)).toBe(true);
  });
});

describe('actions', () => {
  const setup = () => {
    const out = run({ entity_type: 'private_company', incorporation_date: '2019-03-15' }, [CIPC], '2026-09-30');
    return { o: out.obligations[0], c: out.cycles[0], cycles: out.cycles };
  };

  it('requires proof before completion when the rule asks for it', () => {
    const { o, c } = setup();
    expect(() => completeCycle(ctx(), o, c, { activeEvidenceCount: 0, evidenceRequired: true, today: '2026-09-30' })).toThrow(ComplianceActionError);
    expect(() => completeCycle(ctx(), o, c, { activeEvidenceCount: 1, evidenceRequired: true, today: '2026-09-30', completedOn: '2026-10-05' })).toThrow(/future/);
    completeCycle(ctx(), o, c, { activeEvidenceCount: 1, evidenceRequired: true, today: '2026-09-30', completedOn: '2026-04-20' });
    expect(c).toMatchObject({ status: 'completed', completed_by: ACTOR });
  });

  it('a completed period can be reopened, with a reason, and never deleted', () => {
    const { o, c } = setup();
    completeCycle(ctx(), o, c, { activeEvidenceCount: 1, evidenceRequired: true, today: '2026-09-30' });
    expect(() => reopenCycle(ctx(), o, c, '')).toThrow(/why/);
    const events = reopenCycle(ctx(), o, c, 'Filed with the wrong turnover');
    expect(c).toMatchObject({ status: 'in_progress', completed_at: null });
    expect(events[0]).toMatchObject({ event_type: 'cycle_reopened', actor_user_id: ACTOR, company_id: COMPANY });
  });

  it('an override needs a reason; statuses are limited to what a user may set', () => {
    const { o, c } = setup();
    expect(() => setOverride(ctx(), o, { notApplicable: true, reason: 'no', factsHash: 'x' })).toThrow(/reason/);
    expect(() => setCycleStatus(ctx(), o, c, 'completed', null)).toThrow(/cannot be set/);
    setCycleStatus(ctx(), o, c, 'in_progress', 'Gathering turnover');
    expect(c.status).toBe('in_progress');
  });

  it('only an owner or admin can be responsible; reminder times come from the list', () => {
    const { o } = setup();
    expect(() => setResponsible(ctx(), o, 'member-id', ['owner-id'])).toThrow(/owner or admin/);
    setResponsible(ctx(), o, 'owner-id', ['owner-id']);
    expect(o.responsible_user_id).toBe('owner-id');
    expect(() => setReminderOffsets(ctx(), o, [5])).toThrow(/list/);
    setReminderOffsets(ctx(), o, [7, 30, 7]);
    expect(o.reminder_offsets).toEqual([30, 7]);
  });
});

describe('reminders and signals', () => {
  const cycle = (due: string, status: CycleRow['status'] = 'not_started') =>
    ({ kind: 'filing', status, due_date: due, expiry_date: null }) as Pick<CycleRow, 'kind' | 'status' | 'due_date' | 'expiry_date'>;

  it('sends only the tightest reminder that has been reached', () => {
    expect(reminderOffsetDue(cycle('2026-10-05'), [30, 7, 1], '2026-09-30')).toBe(7);
    expect(reminderOffsetDue(cycle('2026-11-30'), [30, 7, 1], '2026-09-30')).toBe(null);
    expect(reminderOffsetDue(cycle('2026-10-01'), [30, 7, 1], '2026-09-30')).toBe(1);
    expect(reminderOffsetDue(cycle('2026-09-01'), [30, 7, 1], '2026-09-30')).toBe(OVERDUE_OFFSET);
    expect(reminderOffsetDue(cycle('2026-10-05', 'completed'), [30, 7, 1], '2026-09-30')).toBe(null);
  });

  it('signals are computed from Johannesburg dates', () => {
    expect(timeSignalFor(cycle('2026-09-29'), '2026-09-30')).toBe('overdue');
    expect(timeSignalFor(cycle('2026-10-29'), '2026-09-30')).toBe('due_soon');
    expect(timeSignalFor(cycle('2026-12-29'), '2026-09-30')).toBe('none');
    expect(timeSignalFor(cycle('2026-09-01', 'cancelled'), '2026-09-30')).toBe('none');
  });

  it('reminders fall back to the owners when the responsible person no longer qualifies', () => {
    const members = [
      { user_id: 'owner-b', role: 'owner' },
      { user_id: 'owner-a', role: 'owner' },
      { user_id: 'admin-1', role: 'admin' },
      { user_id: 'member-1', role: 'member' },
    ];
    expect(reminderRecipients({ responsible_user_id: 'admin-1' }, members)).toEqual({ recipients: ['admin-1'], fallback: false });
    expect(reminderRecipients({ responsible_user_id: 'member-1' }, members)).toEqual({ recipients: ['owner-a', 'owner-b'], fallback: true });
    expect(reminderRecipients({ responsible_user_id: 'gone' }, members)).toEqual({ recipients: ['owner-a', 'owner-b'], fallback: true });
    expect(reminderRecipients({ responsible_user_id: null }, members)).toEqual({ recipients: ['owner-a', 'owner-b'], fallback: false });
  });
});

describe('access', () => {
  it('owners and admins only; members and strangers get the same refusal', () => {
    expect(() => assertComplianceAccess(null)).toThrow('Permission denied.');
    expect(() => assertComplianceAccess({ role: 'member' })).toThrow('Permission denied.');
    expect(() => assertComplianceAccess({ role: 'owner' })).not.toThrow();
    expect(() => assertComplianceAccess({ role: 'admin' })).not.toThrow();
  });

  it('evidence stays inside its company and cycle', () => {
    const cycleId = '33333333-3333-4333-8333-333333333333';
    const path = evidenceObjectPath(COMPANY, cycleId, '44444444-4444-4444-8444-444444444444');
    expect(path).toBe(`${COMPANY}/${cycleId}/44444444-4444-4444-8444-444444444444`);
    expect(() => evidenceObjectPath('../x', cycleId, cycleId)).toThrow();
    expect(() => assertEvidencePathBelongs(path, '55555555-5555-4555-8555-555555555555', cycleId)).toThrow();
    expect(() => assertEvidenceSourceTable('employees')).toThrow();
    expect(() => assertEvidenceSourceTable('statutory_returns')).not.toThrow();
    expect(() => assertEvidenceFile({ mimeType: 'application/x-msdownload', sizeBytes: 10, fileName: 'a.exe' })).toThrow();
    expect(() => assertEvidenceFile({ mimeType: 'application/pdf', sizeBytes: 30 * 1024 * 1024, fileName: 'a.pdf' })).toThrow(/20 MB/);
    expect(() => assertEvidenceFile({ mimeType: 'application/pdf', sizeBytes: 1000, fileName: 'confirmation.pdf' })).not.toThrow();
  });
});

describe('facts', () => {
  const raw = (over: Partial<RawCompanyRecords> = {}): RawCompanyRecords => ({
    registration_number: null,
    vat_number: null,
    master_entity_type: null,
    nature_of_business: null,
    address_on_file: null,
    paye_number: null,
    active_employee_count: 0,
    has_payroll_runs: false,
    financial_year_end_date: null,
    ...over,
  });

  it('records on file win over answers; unknown stays unknown', () => {
    const f = deriveFacts({ vat_status: 'not_registered', has_employees: false, has_premises: false }, raw({
      vat_number: '4123456789',
      active_employee_count: 3,
      address_on_file: '1 Main Road',
      financial_year_end_date: '2026-02-28',
    }));
    expect(f).toMatchObject({ vat_status: 'registered', has_employees: true, employee_count: 3, has_premises: true, financial_year_end: { month: 2, day: 31 } });
    const unknown = deriveFacts({ vat_status: 'not_sure' }, raw());
    expect(unknown).toMatchObject({ vat_status: null, has_employees: null, employee_count: null, incorporation_date: null });
    const noStaff = deriveFacts({ has_employees: false }, raw());
    expect(noStaff).toMatchObject({ has_employees: false, employee_count: 0 });
  });

  it('validates answers on the server', () => {
    const opts = { complete: true, industryCodes: ['general'], today: '2026-09-30' };
    expect(() => validateAnswers({ entity_type: 'llc' }, opts)).toThrow(/business type/);
    expect(() => validateAnswers({ incorporation_date: '2030-01-01' }, { ...opts, complete: false })).toThrow(/future/);
    expect(() => validateAnswers({ entity_type: 'trust' }, opts)).toThrow(/unanswered/);
    const ok = validateAnswers(
      {
        entity_type: 'private_company',
        industry_code: 'general',
        incorporation_date: '2019-03-15',
        activity_transport: false,
        activity_food: false,
        activity_security: false,
        activity_construction: false,
        activity_childcare: false,
        processes_personal_information: true,
        injected: 'dropped',
      },
      opts,
    );
    expect(ok).not.toHaveProperty('injected');
    expect(ok.entity_type).toBe('private_company');
  });
});
