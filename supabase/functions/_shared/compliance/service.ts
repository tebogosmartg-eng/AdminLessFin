/**
 * The compliance service: one path for every change.
 *
 * read state → apply the user's action in memory → run the materializer →
 * send the difference to compliance_apply_plan in one transaction. If
 * anything changed the company's rows in between, the RPC refuses and the
 * whole cycle runs again on fresh rows, so the API and the scheduler can
 * never interleave half-applied changes.
 */
// deno-lint-ignore-file no-explicit-any
import { eligibleResponsibleUsers, type CompanyMember } from './access.ts';
import { deriveFacts, type RawCompanyRecords } from './facts.ts';
import { diffPlan, isEmptyPlan, materialize } from './materialize.ts';
import {
  applyPlan,
  ComplianceStateChanged,
  loadHolidays,
  loadMembers,
  loadRawRecords,
  loadRules,
  loadState,
  type ComplianceProfileRow,
  type ComplianceState,
} from './store.ts';
import type { ComplianceFacts, CycleRow, EventRow, ObligationRow, RuleVersion, Schedule } from './types.ts';

type Admin = any;

export const COMPLIANCE_COUNTRY = 'ZA';

export type WorkingSet = {
  state: ComplianceState;
  facts: ComplianceFacts;
  raw: RawCompanyRecords;
  rules: RuleVersion[];
  holidays: Set<string>;
  members: Array<CompanyMember & { name: string | null }>;
};

export type ChangeRequest = {
  companyId: string;
  actorUserId: string | null;
  today: string;
  trigger: 'profile_save' | 'manual' | 'scheduler' | 'action';
  /**
   * Changes the in-memory rows and returns their events. May replace the
   * profile (return it) and add evidence rows. Runs again on a retry.
   */
  mutate?: (ws: WorkingSet, draft: { obligations: ObligationRow[]; cycles: CycleRow[] }) => {
    events?: EventRow[];
    profile?: Partial<ComplianceProfileRow>;
    evidence?: Record<string, unknown>[];
  } | void;
  newId: () => string;
  /** Reference data can be shared across companies in one scheduler run. */
  cache?: { rules?: RuleVersion[]; holidays?: Set<string> };
};

export async function loadWorkingSet(
  admin: Admin,
  companyId: string,
  today: string,
  cache: ChangeRequest['cache'] = {},
): Promise<WorkingSet> {
  const [state, raw, rules, holidays, members] = await Promise.all([
    loadState(admin, companyId),
    loadRawRecords(admin, companyId, today),
    cache.rules ? Promise.resolve(cache.rules) : loadRules(admin, COMPLIANCE_COUNTRY, today),
    cache.holidays ? Promise.resolve(cache.holidays) : loadHolidays(admin, COMPLIANCE_COUNTRY),
    loadMembers(admin, companyId),
  ]);
  const facts = deriveFacts((state.profile?.answers ?? {}) as any, raw);
  return { state, raw, rules, holidays, members, facts };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * Applies a change and re-evaluates. Returns the new working set (re-read
 * after the write) so the caller can respond with fresh data.
 */
export async function runChange(admin: Admin, req: ChangeRequest): Promise<WorkingSet> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ws = await loadWorkingSet(admin, req.companyId, req.today, req.cache);
    const before = { obligations: ws.state.obligations, cycles: ws.state.cycles };
    const draft = { obligations: clone(ws.state.obligations), cycles: clone(ws.state.cycles) };
    const nowIso = new Date().toISOString();

    const result = req.mutate ? req.mutate(ws, draft) ?? {} : {};
    const actionEvents = result.events ?? [];

    // A profile patch may change the answers, so facts are re-derived.
    const profile: ComplianceProfileRow | null = result.profile
      ? ({ ...(ws.state.profile ?? {}), ...result.profile } as ComplianceProfileRow)
      : ws.state.profile;
    if (!profile) throw new Error('Complete the compliance questionnaire first.');
    const facts = deriveFacts((profile.answers ?? {}) as any, ws.raw);

    // The responsible person must still be an owner or admin; otherwise the
    // assignment falls back to the owners, and that is recorded.
    const eligible = eligibleResponsibleUsers(ws.members);
    for (const o of draft.obligations) {
      if (o.responsible_user_id && !eligible.includes(o.responsible_user_id)) {
        actionEvents.push({
          id: req.newId(),
          company_id: req.companyId,
          obligation_id: o.id,
          cycle_id: null,
          actor_user_id: req.actorUserId,
          event_type: 'responsible_fallback',
          before: { responsible_user_id: o.responsible_user_id },
          after: { responsible_user_id: null },
          rule_version_id: o.rule_version_id,
          note: 'The responsible person is no longer an owner or admin; reminders go to the owners.',
        });
        o.responsible_user_id = null;
      }
    }

    let obligations = draft.obligations;
    let cycles = draft.cycles;
    let materializedEvents: EventRow[] = [];
    let summary: { applicable: string[]; needs_information: string[] } = { applicable: [], needs_information: [] };
    const evaluate = profile.status === 'completed';
    if (evaluate) {
      const out = materialize({
        companyId: req.companyId,
        today: req.today,
        facts,
        rules: ws.rules,
        holidays: ws.holidays,
        obligations,
        cycles,
        actorUserId: req.actorUserId,
        newId: req.newId,
      });
      obligations = out.obligations;
      cycles = out.cycles;
      materializedEvents = out.events;
      summary = out.summary;
    }

    const diff = diffPlan(before, { obligations, cycles, events: [...actionEvents, ...materializedEvents] });
    const plan: Record<string, unknown> = {
      obligations: diff.obligations,
      cycles: diff.cycles,
      events: diff.events,
      evidence: result.evidence ?? [],
    };
    const profileChanged = !!result.profile;
    const factsChanged = JSON.stringify(profile.fact_snapshot ?? {}) !== JSON.stringify(facts);
    if (profileChanged || factsChanged || evaluate) {
      plan.profile = {
        status: profile.status,
        questionnaire_version: profile.questionnaire_version,
        revision: profile.revision,
        answers: profile.answers,
        fact_snapshot: facts,
        completed_at: profile.completed_at,
        completed_by: profile.completed_by,
        updated_by: profile.updated_by,
        last_evaluated_at: evaluate ? nowIso : profile.last_evaluated_at,
      };
    }
    const meaningful = !isEmptyPlan(diff) || profileChanged || factsChanged || (result.evidence ?? []).length > 0;
    if (evaluate && (meaningful || req.trigger !== 'scheduler')) {
      plan.run = {
        profile_revision: profile.revision,
        trigger: req.trigger,
        rule_versions: ws.rules.map((r) => ({ code: r.rule_code, version: r.version, id: r.id })),
        applicable: summary.applicable,
        needs_information: summary.needs_information,
        actor_user_id: req.actorUserId,
      };
    }

    // The scheduler skips the write entirely when nothing changed.
    if (req.trigger === 'scheduler' && !meaningful) return ws;

    try {
      await applyPlan(admin, req.companyId, ws.state.profile?.state_version ?? 0, plan);
    } catch (e) {
      if (e instanceof ComplianceStateChanged && attempt < 2) continue;
      if (e instanceof ComplianceStateChanged) {
        throw new Error('Someone else changed these compliance records at the same moment. Please try again.');
      }
      throw e;
    }
    return await loadWorkingSet(admin, req.companyId, req.today, req.cache);
  }
  throw new Error('Could not save compliance changes. Please try again.');
}

/** Plain-language due rule for the UI. Conditions are never sent. */
export function describeSchedule(schedule: Schedule): string {
  switch (schedule.type) {
    case 'anniversary_business_days':
      return `Within ${schedule.business_days} business days after the anniversary of registration.`;
    case 'annual_fixed_month_day': {
      const month = new Date(Date.UTC(2000, schedule.month - 1, 1)).toLocaleString('en-ZA', { month: 'long', timeZone: 'UTC' });
      return `Every year by ${schedule.day} ${month}${schedule.adjust === 'previous_business_day' ? ' (earlier if that is not a business day)' : ''}.`;
    }
    case 'months_after_year_end':
      if (schedule.months === 0) return 'By the last day of the financial year.';
      if (schedule.months < 0) return `${-schedule.months} months before the financial year ends.`;
      return `Within ${schedule.months} months after the financial year ends.`;
    case 'periodic':
      return schedule.frequency === 'monthly'
        ? `Every month, by the ${ordinal(schedule.due_day)} of the following month.`
        : `Every VAT period, by the ${ordinal(schedule.due_day)} of the month after the period ends.`;
    case 'certificate_expiry':
      return `Renew before it expires; reminders start ${schedule.renewal_lead_days} days ahead.`;
    case 'once_off':
      return 'Once, and keep it up to date when things change.';
    default:
      return '';
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** The cycle a list should show for an obligation. */
export function currentCycle(cycles: CycleRow[]): CycleRow | null {
  const open = cycles
    .filter((c) => ['not_started', 'in_progress', 'evidence_submitted', 'action_required'].includes(c.status))
    .sort((a, b) => (a.due_date ?? a.expiry_date ?? '9999') < (b.due_date ?? b.expiry_date ?? '9999') ? -1 : 1);
  if (open.length) return open[0];
  const done = cycles
    .filter((c) => c.status === 'completed')
    .sort((a, b) => ((a.completed_at ?? '') < (b.completed_at ?? '') ? 1 : -1));
  return done[0] ?? null;
}
