/**
 * Three-valued evaluation of a rule condition against the closed fact set.
 *
 * A fact that is missing or null is UNKNOWN. Unknown never silently becomes
 * "does not apply": the obligation is flagged "needs information" and the
 * missing facts are listed so the questionnaire can ask for them.
 */
import type { ComplianceFacts, Condition, FactName } from './types.ts';
import { CONDITION_FACTS } from './types.ts';

export type Tri = true | false | 'unknown';

export type ConditionResult = { result: Tri; missing: FactName[] };

function factValue(facts: ComplianceFacts, name: FactName): unknown {
  const v = facts[name];
  return v === undefined ? null : v;
}

function assertKnownFact(name: string): asserts name is FactName {
  if (!(CONDITION_FACTS as readonly string[]).includes(name)) {
    throw new Error(`Unknown compliance fact in condition: ${name}`);
  }
}

export function evaluateCondition(cond: Condition, facts: ComplianceFacts): ConditionResult {
  const missing = new Set<FactName>();

  const visit = (c: Condition): Tri => {
    if ('always' in c) return true;
    if ('all_of' in c) {
      const parts = c.all_of.map(visit);
      if (parts.includes(false)) return false;
      if (parts.includes('unknown')) return 'unknown';
      return true;
    }
    if ('any_of' in c) {
      const parts = c.any_of.map(visit);
      if (parts.includes(true)) return true;
      if (parts.includes('unknown')) return 'unknown';
      return false;
    }
    if ('not' in c) {
      const inner = visit(c.not);
      return inner === 'unknown' ? 'unknown' : !inner;
    }
    if ('fact_present' in c) {
      assertKnownFact(c.fact_present);
      const v = factValue(facts, c.fact_present);
      return v !== null && v !== '' && v !== false;
    }
    if ('fact_eq' in c) {
      const [name, expected] = c.fact_eq;
      assertKnownFact(name);
      const v = factValue(facts, name);
      if (v === null) {
        missing.add(name);
        return 'unknown';
      }
      return v === expected;
    }
    if ('fact_in' in c) {
      const [name, options] = c.fact_in;
      assertKnownFact(name);
      const v = factValue(facts, name);
      if (v === null) {
        missing.add(name);
        return 'unknown';
      }
      return (options as unknown[]).includes(v);
    }
    if ('fact_gt' in c) {
      const [name, threshold] = c.fact_gt;
      assertKnownFact(name);
      const v = factValue(facts, name);
      if (v === null || typeof v !== 'number') {
        missing.add(name);
        return 'unknown';
      }
      return v > threshold;
    }
    throw new Error(`Unsupported condition: ${JSON.stringify(c)}`);
  };

  const result = visit(cond);
  // Missing facts only matter when they decided the outcome.
  return { result, missing: result === 'unknown' ? [...missing].sort() : [] };
}

/** Every fact a condition reads, used to detect "the facts behind this changed". */
export function conditionFacts(cond: Condition): FactName[] {
  const out = new Set<FactName>();
  const visit = (c: Condition) => {
    if ('all_of' in c) c.all_of.forEach(visit);
    else if ('any_of' in c) c.any_of.forEach(visit);
    else if ('not' in c) visit(c.not);
    else if ('fact_present' in c) out.add(c.fact_present);
    else if ('fact_eq' in c) out.add(c.fact_eq[0]);
    else if ('fact_in' in c) out.add(c.fact_in[0]);
    else if ('fact_gt' in c) out.add(c.fact_gt[0]);
  };
  visit(cond);
  return [...out].sort();
}

/** Validates a condition tree, throwing on unknown operators or facts. */
export function assertValidCondition(cond: Condition): void {
  evaluateCondition(cond, {});
}
