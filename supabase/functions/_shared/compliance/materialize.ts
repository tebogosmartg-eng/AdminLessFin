/**
 * The materializer: from facts, published rules and the company's current
 * obligation and cycle rows, work out the rows the company should have.
 *
 * Pure. The edge function reads the current rows, applies a user action to
 * them in memory, runs this, and sends the difference to one transactional
 * RPC. Precedence rules (plan section 7):
 *  1. A user's "not applicable" override wins over re-evaluation until the
 *     facts behind the rule change; then it is flagged as a conflict, never
 *     silently reopened.
 *  2. Open cycles keep the rule version they started with; new cycles use the
 *     newest version; a due-date change applies from the next cycle only.
 *  3. A retired rule keeps its open cycles visible and opens no new ones.
 */
import { conditionFacts, evaluateCondition } from './conditions.ts';
import { addDays, type HolidayCalendar } from './dates.ts';
import {
  cycleKindFor,
  initialTrackingFrom,
  occurrencesBetween,
  scheduleAnchorNeeds,
  wantedOccurrences,
  type ScheduleAnchors,
} from './schedules.ts';
import { isOpenStatus, timeSignalFor } from './signals.ts';
import type {
  Applicability,
  ComplianceFacts,
  CycleRow,
  EventRow,
  ObligationRow,
  RuleVersion,
} from './types.ts';

export type MaterializeInput = {
  companyId: string;
  today: string;
  facts: ComplianceFacts;
  /** Latest published or retired version per rule code, for the company's country. */
  rules: RuleVersion[];
  holidays: HolidayCalendar;
  obligations: ObligationRow[];
  cycles: CycleRow[];
  actorUserId: string | null;
  newId: () => string;
};

export type MaterializeOutput = {
  obligations: ObligationRow[];
  cycles: CycleRow[];
  events: EventRow[];
  summary: { considered: string[]; applicable: string[]; needs_information: string[] };
};

function anchorsFrom(facts: ComplianceFacts): ScheduleAnchors {
  return {
    incorporation_date: facts.incorporation_date ?? null,
    financial_year_end: facts.financial_year_end ?? null,
    vat_filing_frequency: facts.vat_filing_frequency ?? null,
  };
}

/** Stable fingerprint of the facts a rule depends on. */
export function ruleFactsHash(rule: RuleVersion, facts: ComplianceFacts): string {
  const names = [...conditionFacts(rule.condition), ...scheduleAnchorNeeds(rule.schedule)].sort();
  const picked: Record<string, unknown> = {};
  for (const n of names) picked[n] = (facts as Record<string, unknown>)[n] ?? null;
  if (rule.industry_code) picked.industry_code = facts.industry_code ?? null;
  return JSON.stringify(picked);
}

function whyFor(rule: RuleVersion, facts: ComplianceFacts, today: string): Record<string, unknown> {
  const matched: Record<string, unknown> = {};
  for (const n of conditionFacts(rule.condition)) matched[n] = (facts as Record<string, unknown>)[n] ?? null;
  return { facts: matched, rule_version: rule.version, evaluated_on: today };
}

export function materialize(input: MaterializeInput): MaterializeOutput {
  const { companyId, today, facts, rules, holidays, actorUserId, newId } = input;
  const anchors = anchorsFrom(facts);
  const obligations = new Map(input.obligations.map((o) => [o.rule_code, { ...o }]));
  const cycles = input.cycles.map((c) => ({ ...c }));
  const events: EventRow[] = [];
  const summary = { considered: [] as string[], applicable: [] as string[], needs_information: [] as string[] };

  const event = (
    type: string,
    obligation: ObligationRow,
    cycle: CycleRow | null,
    before: unknown,
    after: unknown,
    note: string | null = null,
  ) => {
    events.push({
      id: newId(),
      company_id: companyId,
      obligation_id: obligation.id,
      cycle_id: cycle?.id ?? null,
      actor_user_id: actorUserId,
      event_type: type,
      before,
      after,
      rule_version_id: cycle?.rule_version_id ?? obligation.rule_version_id,
      note,
    });
  };

  const cyclesOf = (obligationId: string) => cycles.filter((c) => c.obligation_id === obligationId);

  const ruleByCode = new Map(rules.map((r) => [r.rule_code, r]));

  // Obligations whose rule no longer exists at all are retired in place.
  for (const o of obligations.values()) {
    if (!ruleByCode.has(o.rule_code) && !o.retired) {
      o.retired = true;
      event('rule_retired', o, null, { retired: false }, { retired: true });
    }
  }

  for (const rule of rules) {
    summary.considered.push(rule.rule_code);

    // 1. Evaluate.
    let evaluated: Applicability;
    let missing: string[] = [];
    if (rule.industry_code && facts.industry_code !== rule.industry_code) {
      evaluated = facts.industry_code ? 'not_applicable' : 'needs_information';
      if (!facts.industry_code) missing = ['industry_code'];
    } else {
      const res = evaluateCondition(rule.condition, facts);
      if (res.result === true) {
        const needs = scheduleAnchorNeeds(rule.schedule).filter((k) => {
          const v = anchors[k];
          return v === null || v === undefined || v === '';
        });
        evaluated = needs.length ? 'needs_information' : 'applicable';
        missing = needs;
      } else if (res.result === false) {
        evaluated = 'not_applicable';
      } else {
        evaluated = 'needs_information';
        missing = res.missing;
      }
    }

    let obligation = obligations.get(rule.rule_code);
    if (!obligation) {
      // Nothing is created for a rule that does not apply, or for a rule
      // that was retired before this company ever tracked it.
      if (evaluated === 'not_applicable' || rule.status === 'retired') continue;
      obligation = {
        id: newId(),
        company_id: companyId,
        rule_code: rule.rule_code,
        rule_version_id: rule.id,
        applicability: evaluated,
        evaluated_applicability: evaluated,
        missing_facts: missing,
        override_not_applicable: false,
        override_reason: null,
        override_by: null,
        override_at: null,
        override_facts_hash: null,
        override_conflict: false,
        responsible_user_id: null,
        reminder_offsets: [...rule.reminder_offsets],
        tracking_from: null,
        retired: false,
        why: whyFor(rule, facts, today),
      };
      obligations.set(rule.rule_code, obligation);
      event('obligation_created', obligation, null, null, { applicability: evaluated, missing_facts: missing });
    }

    const o = obligation;

    // 2. Rule version and retirement.
    if (o.rule_version_id !== rule.id) {
      event('rule_version_changed', o, null, { rule_version_id: o.rule_version_id }, { rule_version_id: rule.id });
      o.rule_version_id = rule.id;
    }
    const retired = rule.status === 'retired';
    if (o.retired !== retired) {
      event(retired ? 'rule_retired' : 'rule_reinstated', o, null, { retired: o.retired }, { retired });
      o.retired = retired;
    }

    // 3. Applicability with the override precedence.
    const hash = ruleFactsHash(rule, facts);
    const priorApplicability = o.applicability;
    o.evaluated_applicability = evaluated;
    o.missing_facts = missing;
    if (o.override_not_applicable) {
      o.applicability = 'not_applicable';
      const conflict = o.override_facts_hash !== null && o.override_facts_hash !== hash;
      if (conflict && !o.override_conflict) {
        event('override_conflict', o, null, { facts: o.override_facts_hash }, { facts: hash },
          'The information behind this rule changed after it was marked not applicable.');
      }
      o.override_conflict = conflict;
    } else {
      o.applicability = evaluated;
      o.override_conflict = false;
    }
    if (priorApplicability !== o.applicability) {
      event('applicability_changed', o, null, { applicability: priorApplicability }, { applicability: o.applicability });
    }
    o.why = whyFor(rule, facts, today);

    if (o.applicability === 'applicable') summary.applicable.push(rule.rule_code);
    if (o.applicability === 'needs_information') summary.needs_information.push(rule.rule_code);

    // 4. Cycles.
    const mine = cyclesOf(o.id);

    if (o.applicability === 'not_applicable') {
      for (const c of mine) {
        if (isOpenStatus(c.status)) {
          const before = c.status;
          c.status = 'cancelled';
          event('cycle_cancelled', o, c, { status: before }, { status: 'cancelled' }, 'No longer applies.');
        }
      }
    } else if (o.applicability === 'applicable' && !o.retired) {
      const kind = cycleKindFor(rule.schedule);
      const reactivate = (c: CycleRow, reason: string) => {
        c.status = kind === 'term' && !c.expiry_date ? 'action_required' : 'not_started';
        event('cycle_reopened', o, c, { status: 'cancelled' }, { status: c.status }, reason);
      };

      if (kind === 'filing') {
        if (!o.tracking_from) o.tracking_from = initialTrackingFrom(rule.schedule, anchors, holidays, today);
        const byKey = new Map(mine.map((c) => [c.period_key, c]));
        const res = wantedOccurrences(rule.schedule, anchors, holidays, o.tracking_from, today, (key) => {
          const c = byKey.get(key);
          return !!c && c.status === 'completed';
        });
        if (res.ok) {
          const produced = occurrencesBetween(rule.schedule, anchors, holidays, o.tracking_from, addDays(today, 800));
          const producedKeys = new Set(produced.ok ? produced.occurrences.map((x) => x.period_key) : []);
          for (const occ of res.occurrences) {
            const existing = byKey.get(occ.period_key);
            if (!existing) {
              const c: CycleRow = {
                id: newId(),
                company_id: companyId,
                obligation_id: o.id,
                kind,
                period_key: occ.period_key,
                opens_on: occ.opens_on,
                due_date: occ.due_date,
                valid_from: null,
                expiry_date: null,
                status: 'not_started',
                time_signal: 'none',
                rule_version_id: rule.id,
                completed_at: null,
                completed_by: null,
                completion_note: null,
                why: whyFor(rule, facts, today),
              };
              cycles.push(c);
              byKey.set(c.period_key, c);
              event('cycle_opened', o, c, null, { period_key: c.period_key, due_date: c.due_date });
            } else if (existing.status === 'cancelled') {
              reactivate(existing, 'Applies again.');
            } else if (
              existing.status === 'not_started' &&
              existing.rule_version_id === rule.id &&
              (existing.due_date !== occ.due_date || existing.opens_on !== occ.opens_on)
            ) {
              // The company corrected an anchor date; the rule is unchanged.
              event('due_date_changed', o, existing, { due_date: existing.due_date }, { due_date: occ.due_date });
              existing.due_date = occ.due_date;
              existing.opens_on = occ.opens_on;
            }
          }
          // A period the schedule no longer produces at all (an anchor date
          // was corrected) is withdrawn, but only if nobody has started on it.
          for (const c of mine) {
            if (c.status === 'not_started' && !producedKeys.has(c.period_key)) {
              c.status = 'cancelled';
              event('cycle_cancelled', o, c, { status: 'not_started' }, { status: 'cancelled' },
                'The dates this period was based on changed.');
            }
          }
        }
      } else if (kind === 'once') {
        const existing = mine.find((c) => c.period_key === 'once');
        if (!existing) {
          const c: CycleRow = {
            id: newId(),
            company_id: companyId,
            obligation_id: o.id,
            kind,
            period_key: 'once',
            opens_on: today,
            due_date: null,
            valid_from: null,
            expiry_date: null,
            status: 'not_started',
            time_signal: 'none',
            rule_version_id: rule.id,
            completed_at: null,
            completed_by: null,
            completion_note: null,
            why: whyFor(rule, facts, today),
          };
          cycles.push(c);
          event('cycle_opened', o, c, null, { period_key: 'once' });
        } else if (existing.status === 'cancelled') {
          reactivate(existing, 'Applies again.');
        }
      } else {
        // Terms: the certificate's dates come from the user.
        const terms = mine.filter((c) => c.kind === 'term');
        if (!terms.length) {
          const c: CycleRow = {
            id: newId(),
            company_id: companyId,
            obligation_id: o.id,
            kind,
            period_key: 'term-1',
            opens_on: today,
            due_date: null,
            valid_from: null,
            expiry_date: null,
            status: 'action_required',
            time_signal: 'none',
            rule_version_id: rule.id,
            completed_at: null,
            completed_by: null,
            completion_note: null,
            why: whyFor(rule, facts, today),
          };
          cycles.push(c);
          event('cycle_opened', o, c, null, { period_key: 'term-1' }, 'Enter the certificate dates to start tracking.');
        } else {
          const latest = [...terms].sort((a, b) => termNumber(a.period_key) - termNumber(b.period_key)).pop()!;
          if (latest.status === 'cancelled') reactivate(latest, 'Applies again.');
        }
      }
    }
  }

  // 5. Time signals for every cycle (no events; they move every day).
  for (const c of cycles) {
    c.time_signal = timeSignalFor(c, today);
  }

  return { obligations: [...obligations.values()], cycles, events, summary };
}

export function termNumber(periodKey: string): number {
  const m = /^term-(\d+)$/.exec(periodKey);
  return m ? Number(m[1]) : 0;
}

/** The renewal date of a term: the expiry less the rule's lead time. */
export function termDueDate(expiry: string, renewalLeadDays: number): string {
  return addDays(expiry, -renewalLeadDays);
}

const OBLIGATION_FIELDS: Array<keyof ObligationRow> = [
  'rule_version_id', 'applicability', 'evaluated_applicability', 'missing_facts', 'override_not_applicable',
  'override_reason', 'override_by', 'override_at', 'override_facts_hash', 'override_conflict',
  'responsible_user_id', 'reminder_offsets', 'tracking_from', 'retired', 'why',
];

const CYCLE_FIELDS: Array<keyof CycleRow> = [
  'opens_on', 'due_date', 'valid_from', 'expiry_date', 'status', 'time_signal', 'rule_version_id',
  'completed_at', 'completed_by', 'completion_note', 'why',
];

function changed<T>(a: T, b: T, fields: Array<keyof T>): boolean {
  return fields.some((f) => JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null));
}

export type CompliancePlan = {
  obligations: ObligationRow[];
  cycles: CycleRow[];
  events: EventRow[];
};

/** Only the rows that differ from what is stored, plus every event. */
export function diffPlan(
  before: { obligations: ObligationRow[]; cycles: CycleRow[] },
  after: { obligations: ObligationRow[]; cycles: CycleRow[]; events: EventRow[] },
): CompliancePlan {
  const oldObligations = new Map(before.obligations.map((o) => [o.id, o]));
  const oldCycles = new Map(before.cycles.map((c) => [c.id, c]));
  return {
    obligations: after.obligations.filter((o) => {
      const prev = oldObligations.get(o.id);
      return !prev || changed(prev, o, OBLIGATION_FIELDS);
    }),
    cycles: after.cycles.filter((c) => {
      const prev = oldCycles.get(c.id);
      return !prev || changed(prev, c, CYCLE_FIELDS);
    }),
    events: after.events,
  };
}

export function isEmptyPlan(plan: CompliancePlan): boolean {
  return !plan.obligations.length && !plan.cycles.length && !plan.events.length;
}
