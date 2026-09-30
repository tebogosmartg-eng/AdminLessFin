/**
 * Compliance content repository — schema, checksums, holidays, and the
 * boundaries that keep rule conditions out of the browser (ADR-0004).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPLIANCE_CONTENT } from '../../content/compliance/index';
import { ruleChecksum, updatedLock, validateContentRepository, type ChecksumLock } from '../../content/compliance/schema';
import { evaluateCondition } from '../../supabase/functions/_shared/compliance/conditions.ts';
import { occurrencesBetween } from '../../supabase/functions/_shared/compliance/schedules.ts';
import { ENTITY_TYPES, VAT_FILING_FREQUENCIES } from '../../supabase/functions/_shared/compliance/types.ts';
import { QUESTIONNAIRE_VERSION as SERVER_QUESTIONNAIRE_VERSION } from '../../supabase/functions/_shared/compliance/facts.ts';
import {
  ENTITY_TYPE_OPTIONS,
  QUESTIONNAIRE_VERSION,
  VAT_FREQUENCY_OPTIONS,
} from '../../src/compliance/questionnaire';

const lock = JSON.parse(readFileSync(join(process.cwd(), 'content/compliance/checksums.lock.json'), 'utf8')) as ChecksumLock;

function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day)).toISOString().slice(0, 10);
}
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

describe('compliance content repository', () => {
  it('is valid and matches its checksum lock', () => {
    expect(validateContentRepository(COMPLIANCE_CONTENT, lock)).toEqual([]);
  });

  it('refuses a silent edit, and refuses to relock published text', () => {
    const edited = structuredClone(COMPLIANCE_CONTENT);
    edited.rules[0].guidance.why_it_matters += ' Edited.';
    expect(validateContentRepository(edited, lock).join('\n')).toMatch(/checksum does not match/);
    const published = structuredClone(COMPLIANCE_CONTENT);
    published.rules[0] = { ...published.rules[0], status: 'published', provenance: { ...published.rules[0].provenance, reviewed_by: 'A Reviewer', last_reviewed: '2026-10-01' } };
    const lockForPublished = { ...lock, [`${published.rules[0].code}@1`]: ruleChecksum(published.rules[0]) };
    published.rules[0].title = 'Changed after publishing';
    expect(() => updatedLock(published, lockForPublished)).toThrow(/publish a new version/i);
  });

  it('a published rule must name its reviewer', () => {
    const repo = structuredClone(COMPLIANCE_CONTENT);
    repo.rules[0].status = 'published';
    expect(validateContentRepository(repo, lock).join('\n')).toMatch(/reviewer/);
  });

  it('every rule evaluates and dates cleanly against realistic facts', () => {
    const facts = {
      entity_type: 'private_company' as const,
      incorporation_date: '2019-03-15',
      incorporation_date_known: true,
      has_registration_number: true,
      vat_status: 'registered' as const,
      vat_filing_frequency: 'bimonthly_even' as const,
      has_employees: true,
      employee_count: 60,
      financial_year_end: { month: 2, day: 31 },
      activity_security: true,
      activity_food: true,
      activity_construction: true,
      activity_childcare: true,
    };
    const holidays = new Set(COMPLIANCE_CONTENT.holidays.ZA.map(([d]) => d));
    for (const rule of COMPLIANCE_CONTENT.rules) {
      expect(evaluateCondition(rule.applies_when, facts).result, rule.code).toBe(true);
      const occ = occurrencesBetween(rule.schedule, facts, holidays, '2026-01-01', '2027-12-31');
      expect(occ.ok, rule.code).toBe(true);
      if (occ.ok && !['certificate_expiry', 'once_off'].includes(rule.schedule.type)) {
        expect(occ.occurrences.length, rule.code).toBeGreaterThan(0);
        for (const o of occ.occurrences) expect(o.due_date! >= o.opens_on, `${rule.code} ${o.period_key}`).toBe(true);
      }
    }
  });

  it('public holidays include the Easter dates and Sunday observances', () => {
    const dates = new Set(COMPLIANCE_CONTENT.holidays.ZA.map(([d]) => d));
    for (let y = 2025; y <= 2030; y++) {
      expect(dates.has(shift(easter(y), -2)), `Good Friday ${y}`).toBe(true);
      expect(dates.has(shift(easter(y), 1)), `Family Day ${y}`).toBe(true);
    }
    for (const [d, name] of COMPLIANCE_CONTENT.holidays.ZA) {
      if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) {
        expect(dates.has(shift(d, 1)) || dates.has(shift(d, 2)), `${name} ${d} observed`).toBe(true);
      }
    }
  });
});

describe('questionnaire stays in step with the server', () => {
  it('shares the version and the option lists', () => {
    expect(QUESTIONNAIRE_VERSION).toBe(SERVER_QUESTIONNAIRE_VERSION);
    expect(ENTITY_TYPE_OPTIONS.map((o) => o.value).sort()).toEqual([...ENTITY_TYPES].sort());
    expect(VAT_FREQUENCY_OPTIONS.map((o) => o.value).filter((v) => v !== 'not_sure').sort()).toEqual([...VAT_FILING_FREQUENCIES].sort());
  });
});

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

describe('module boundaries (ADR-0004)', () => {
  const srcFiles = filesUnder(join(process.cwd(), 'src')).filter((f) => /\.(ts|tsx)$/.test(f));

  it('the browser never imports the evaluator or the rule content', () => {
    const offenders = srcFiles.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return /(from|import)\s*\(?\s*['"][^'"]*(_shared\/compliance|content\/compliance)/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('the compliance UI never queries tables directly', () => {
    const offenders = srcFiles
      .filter((f) => f.replace(/\\/g, '/').includes('/src/compliance/'))
      .filter((f) => /supabase\s*\.\s*from\(|\.rpc\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('only the calendar adapter and the shell reach into src/compliance', () => {
    const allowed = ['src/router.tsx', 'src/components/SidebarNav.tsx', 'src/pages/FinancialCalendar.tsx'];
    const importers = srcFiles
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => !f.includes('/src/compliance/'))
      .filter((f) => /from ['"][./]*compliance\//.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(f.indexOf('src/')));
    expect(importers.sort()).toEqual(allowed.sort());
  });

  it('never calls a finished period "compliant"', () => {
    const text = filesUnder(join(process.cwd(), 'src/compliance'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(text).not.toMatch(/['">]\s*Compliant\b/);
  });
});
