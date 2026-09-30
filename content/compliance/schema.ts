/**
 * Compliance content — schema, checksums and repository validation.
 *
 * Rules and guidance are regulatory content, not code (ADR-0004, decision 7).
 * They are written here as typed files, validated by
 * tests/unit/compliance-content.test.ts, and published to the platform tables
 * by scripts/complianceContentSeed.ts. This folder sits outside src/ so rule
 * conditions are never bundled into the browser.
 *
 * Every rule carries a checksum over its own content. Changing a word without
 * recomputing the checksum fails validation, so an edit can never slip into a
 * published version unnoticed: a change is a new version.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assertValidCondition } from '../../supabase/functions/_shared/compliance/conditions';
import { isIsoDate } from '../../supabase/functions/_shared/compliance/dates';
import {
  EVIDENCE_SOURCE_TABLES,
  REMINDER_OFFSET_CHOICES,
  type Condition,
  type Schedule,
} from '../../supabase/functions/_shared/compliance/types';

const isoDate = z.string().refine(isIsoDate, 'must be a YYYY-MM-DD date');
const url = z.string().url().refine((u) => u.startsWith('https://'), 'must be an https URL');

const adjust = z.enum(['none', 'previous_business_day', 'next_business_day']);

export const scheduleSchema: z.ZodType<Schedule> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('anniversary_business_days'),
    anchor: z.literal('incorporation_date'),
    business_days: z.number().int().min(1).max(120),
  }),
  z.object({
    type: z.literal('annual_fixed_month_day'),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    adjust,
    opens_days_before_due: z.number().int().min(0).max(366),
  }),
  z.object({
    type: z.literal('months_after_year_end'),
    months: z.number().int().min(-12).max(24),
    adjust,
    opens_days_before_due: z.number().int().min(0).max(366),
  }),
  z.object({
    type: z.literal('periodic'),
    frequency: z.enum(['monthly', 'from_vat_filing_frequency']),
    due_day: z.number().int().min(1).max(31),
    adjust,
  }),
  z.object({
    type: z.literal('certificate_expiry'),
    renewal_lead_days: z.number().int().min(0).max(366),
    default_term_months: z.number().int().min(1).max(120),
  }),
  z.object({ type: z.literal('once_off') }),
]) as z.ZodType<Schedule>;

export const guidanceSchema = z.object({
  what_is_this: z.string().min(20),
  why_it_matters: z.string().min(20),
  how_to_comply: z.array(z.string().min(5)).min(1),
  documents_needed: z.array(z.string().min(3)),
  if_you_dont: z.string().min(10),
  where_to_complete: z.object({ label: z.string().min(3), url }),
  disclaimer: z.string().min(20),
});

export const ruleSourceSchema = z
  .object({
    code: z.string().regex(/^[A-Z]{2}\.[A-Z0-9_]+\.[A-Z0-9_]+$/, 'code is COUNTRY.AUTHORITY.NAME'),
    version: z.number().int().min(1),
    status: z.enum(['draft', 'published', 'retired']),
    country_code: z.string().length(2),
    category_code: z.string().min(2),
    industry_code: z.string().min(2).nullable(),
    authority_code: z.string().min(2),
    title: z.string().min(5).max(120),
    summary: z.string().min(10).max(300),
    applies_when: z.custom<Condition>((v) => {
      try {
        assertValidCondition(v as Condition);
        return true;
      } catch {
        return false;
      }
    }, 'invalid condition'),
    schedule: scheduleSchema,
    evidence: z.object({
      required: z.boolean(),
      source_tables: z.array(z.enum(EVIDENCE_SOURCE_TABLES)),
    }),
    priority: z.enum(['high', 'medium', 'low']),
    reminder_offsets: z
      .array(z.number().int())
      .refine((a) => a.every((n) => (REMINDER_OFFSET_CHOICES as readonly number[]).includes(n)), 'offsets from the allowed set'),
    effective_from: isoDate,
    effective_to: isoDate.nullable(),
    provenance: z.object({
      source_title: z.string().min(5),
      source_url: url,
      retrieved_on: isoDate,
      reviewed_by: z.string().min(3).nullable(),
      last_reviewed: isoDate.nullable(),
      review_due: isoDate,
      notes: z.string().optional(),
    }),
    guidance: guidanceSchema,
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.status !== 'draft' && (!r.provenance.reviewed_by || !r.provenance.last_reviewed)) {
      ctx.addIssue({ code: 'custom', message: 'a published or retired rule must name its reviewer and review date' });
    }
    if (r.effective_to && r.effective_to <= r.effective_from) {
      ctx.addIssue({ code: 'custom', message: 'effective_to must be after effective_from' });
    }
    if (!r.code.startsWith(`${r.country_code}.`)) {
      ctx.addIssue({ code: 'custom', message: 'code must start with the country code' });
    }
  });

export type RuleSource = z.infer<typeof ruleSourceSchema>;

export type AuthoritySource = { code: string; name: string; country_code: string; website: string };
export type CategorySource = { code: string; name: string; sort_order: number };
export type IndustrySource = { code: string; name: string; active: boolean };
export type HolidaySource = [date: string, name: string];

/** Deterministic JSON: object keys sorted at every level. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 over the whole rule, guidance included. */
export function ruleChecksum(rule: RuleSource): string {
  return createHash('sha256').update(canonicalJson(rule)).digest('hex');
}

/** `code@version` → checksum, kept in content/compliance/checksums.lock.json. */
export type ChecksumLock = Record<string, string>;

export const lockKey = (rule: Pick<RuleSource, 'code' | 'version'>) => `${rule.code}@${rule.version}`;

/**
 * The lock for the current repository. Draft entries follow the text; an
 * entry for a published or retired version may never change, so this
 * refuses instead of rewriting it.
 */
export function updatedLock(repo: ContentRepository, lock: ChecksumLock): ChecksumLock {
  const next: ChecksumLock = {};
  for (const rule of repo.rules) {
    const key = lockKey(rule);
    const sum = ruleChecksum(rule);
    if (rule.status !== 'draft' && lock[key] && lock[key] !== sum) {
      throw new Error(`${key} is ${rule.status} and its text changed. Publish a new version instead.`);
    }
    next[key] = sum;
  }
  return Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function guidanceChecksum(rule: RuleSource): string {
  return createHash('sha256').update(canonicalJson(rule.guidance)).digest('hex');
}

export type ContentRepository = {
  authorities: AuthoritySource[];
  categories: CategorySource[];
  industries: IndustrySource[];
  holidays: Record<string, HolidaySource[]>;
  rules: RuleSource[];
};

/** Every problem in the repository; empty means valid. */
export function validateContentRepository(repo: ContentRepository, lock: ChecksumLock): string[] {
  const problems: string[] = [];
  const authorityCodes = new Set(repo.authorities.map((a) => a.code));
  const categoryCodes = new Set(repo.categories.map((c) => c.code));
  const industryCodes = new Set(repo.industries.map((i) => i.code));

  for (const [country, list] of Object.entries(repo.holidays)) {
    const seen = new Set<string>();
    for (const [date, name] of list) {
      if (!isIsoDate(date)) problems.push(`holiday ${country} ${date}: not a date`);
      if (!name?.trim()) problems.push(`holiday ${country} ${date}: no name`);
      if (seen.has(date)) problems.push(`holiday ${country} ${date}: listed twice`);
      seen.add(date);
    }
  }

  const byCodeVersion = new Set<string>();
  for (const rule of repo.rules) {
    const label = `${(rule as { code?: string }).code ?? '?'} v${(rule as { version?: number }).version ?? '?'}`;
    const parsed = ruleSourceSchema.safeParse(rule);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) problems.push(`${label}: ${issue.path.join('.')} ${issue.message}`);
      continue;
    }
    const key = `${rule.code}@${rule.version}`;
    if (byCodeVersion.has(key)) problems.push(`${label}: duplicate code and version`);
    byCodeVersion.add(key);
    if (!authorityCodes.has(rule.authority_code)) problems.push(`${label}: unknown authority ${rule.authority_code}`);
    if (!categoryCodes.has(rule.category_code)) problems.push(`${label}: unknown category ${rule.category_code}`);
    if (rule.industry_code && !industryCodes.has(rule.industry_code)) {
      problems.push(`${label}: unknown industry ${rule.industry_code}`);
    }
    if (!repo.holidays[rule.country_code] && rule.schedule.type !== 'certificate_expiry' && rule.schedule.type !== 'once_off') {
      problems.push(`${label}: no public-holiday calendar for ${rule.country_code}`);
    }
    const expected = ruleChecksum(rule);
    if (lock[lockKey(rule)] !== expected) {
      problems.push(
        `${label}: checksum does not match checksums.lock.json` +
          (rule.status === 'draft' ? ' (run: npm run compliance:content -- --update-lock)' : ' (published text may not change)'),
      );
    }
  }
  for (const key of Object.keys(lock)) {
    if (!repo.rules.some((r) => lockKey(r) === key)) problems.push(`${key}: in checksums.lock.json but not in the content`);
  }

  // Versions of one rule may not overlap in time.
  const byCode = new Map<string, RuleSource[]>();
  for (const r of repo.rules) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  for (const [code, versions] of byCode) {
    const sorted = [...versions].sort((a, b) => a.version - b.version);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (!prev.effective_to || prev.effective_to > cur.effective_from) {
        problems.push(`${code}: v${prev.version} must end on or before v${cur.version} starts`);
      }
    }
  }
  return problems;
}

/** Rules whose review date has passed (the stale-content report). */
export function staleRules(repo: ContentRepository, today: string): RuleSource[] {
  return repo.rules.filter((r) => r.status !== 'retired' && r.provenance.review_due < today);
}
