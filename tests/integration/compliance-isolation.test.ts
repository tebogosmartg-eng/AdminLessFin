/**
 * Compliance & Governance — tenant and role isolation (in-process).
 *
 * The edge function's security rests on a few rules: refuse anyone who is
 * not an owner or admin of the requested company; take the company from the
 * verified membership; check every referenced row against it; and write only
 * through compliance_apply_plan, which refuses rows of another company. This
 * suite proves each rule on the real shared modules, and checks statically
 * that the handler applies them before any method runs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertComplianceAccess,
  assertEvidencePathBelongs,
  assertEvidenceSourceTable,
  assertSameCompany,
  eligibleResponsibleUsers,
} from '../../supabase/functions/_shared/compliance/access';
import { setResponsible } from '../../supabase/functions/_shared/compliance/actions';
import { diffPlan, materialize } from '../../supabase/functions/_shared/compliance/materialize';
import type { RuleVersion } from '../../supabase/functions/_shared/compliance/types';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

const RULE: RuleVersion = {
  id: 'rule-1',
  rule_code: 'ZA.CIPC.ANNUAL_RETURN',
  version: 1,
  status: 'published',
  country_code: 'ZA',
  category_code: 'corporate_cipc',
  industry_code: null,
  authority_code: 'CIPC',
  title: 'CIPC annual return',
  summary: 'x',
  condition: { fact_in: ['entity_type', ['private_company']] },
  schedule: { type: 'anniversary_business_days', anchor: 'incorporation_date', business_days: 30 },
  evidence: { required: true, source_tables: [] },
  priority: 'high',
  reminder_offsets: [30, 7, 1],
  effective_from: '2025-01-01',
  effective_to: null,
  reviewed: false,
};

function stateFor(companyId: string) {
  return materialize({
    companyId,
    today: '2026-09-30',
    facts: { entity_type: 'private_company', incorporation_date: '2019-03-15' },
    rules: [RULE],
    holidays: new Set(),
    obligations: [],
    cycles: [],
    actorUserId: null,
    newId,
  });
}

describe('role isolation', () => {
  it('a member of company A is refused', () => {
    expect(() => assertComplianceAccess({ role: 'member' })).toThrow('Permission denied.');
  });
  it('a user with no membership in the requested company is refused the same way', () => {
    expect(() => assertComplianceAccess(null)).toThrow('Permission denied.');
    expect(() => assertComplianceAccess(undefined)).toThrow('Permission denied.');
  });
  it('an owner or admin is allowed', () => {
    expect(() => assertComplianceAccess({ role: 'owner' })).not.toThrow();
    expect(() => assertComplianceAccess({ role: 'admin' })).not.toThrow();
  });
  it('a member cannot be made responsible, so reminders never reach one', () => {
    const a = stateFor(A);
    const eligible = eligibleResponsibleUsers([
      { user_id: 'owner-a', role: 'owner' },
      { user_id: 'member-a', role: 'member' },
    ]);
    expect(() =>
      setResponsible({ companyId: A, actorUserId: 'owner-a', now: '', newId }, a.obligations[0], 'member-a', eligible),
    ).toThrow(/owner or admin/);
  });
});

describe('tenant isolation', () => {
  it("company A's request cannot touch company B's rows", () => {
    const b = stateFor(B);
    expect(() => assertSameCompany(b.obligations[0], A, 'obligation')).toThrow(/not found/);
    expect(() => assertSameCompany(b.cycles[0], A, 'period')).toThrow(/not found/);
    expect(() => assertSameCompany(undefined, A)).toThrow(/not found/);
  });

  it("a plan computed for company A only ever contains company A's rows", () => {
    const a = stateFor(A);
    const plan = diffPlan({ obligations: [], cycles: [] }, a);
    const rows = [...plan.obligations, ...plan.cycles, ...plan.events];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.company_id === A)).toBe(true);
  });

  it('evidence files and linked records stay inside the company', () => {
    const cycle = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    expect(() => assertEvidencePathBelongs(`${B}/${cycle}/x`, A, cycle)).toThrow();
    expect(() => assertEvidencePathBelongs(`${A}/${cycle}/x`, A, cycle)).not.toThrow();
    expect(() => assertEvidenceSourceTable('employees')).toThrow();
    expect(() => assertEvidenceSourceTable('journal_entries')).toThrow();
  });
});

describe('the edge function applies the rules before any method', () => {
  const handler = readFileSync(join(process.cwd(), 'supabase/functions/compliance/index.ts'), 'utf8');

  it('checks owner/admin access before dispatching a method', () => {
    const access = handler.indexOf('assertComplianceAccess(await callerMembership(admin, user.id, companyId))');
    const dispatch = handler.indexOf('switch (method)');
    expect(access).toBeGreaterThan(0);
    expect(dispatch).toBeGreaterThan(access);
  });

  it('filters every direct read of a compliance table by the company', () => {
    const reads = handler.match(/\.from\('compliance_(evidence|cycle_events)'\)[\s\S]*?;/g) ?? [];
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r).toMatch(/\.eq\('company_id', companyId\)/);
  });

  it('filters every linked-record read by the company', () => {
    expect(handler).toMatch(/\.from\(table\)\.select\(spec\.select\)\.eq\('id', id\)\.eq\('company_id', companyId\)/);
    expect(handler).toMatch(/\.from\(table\)\s*\.select\(spec\.select\)\s*\.eq\('company_id', companyId\)/);
  });

  it('the scheduler accepts only the service role', () => {
    const scheduler = readFileSync(join(process.cwd(), 'supabase/functions/compliance-scheduler/index.ts'), 'utf8');
    expect(scheduler).toMatch(/requireServiceRole\(req, ctx\)/);
    expect(scheduler).not.toMatch(/bootstrapSystemRequest/);
  });

  it('the migration keeps writes away from ordinary users', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261001100000_compliance_governance_module.sql'), 'utf8');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.compliance_apply_plan\(uuid, bigint, jsonb\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.compliance_dispatch_reminder\(uuid, uuid, int, uuid, text, text\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.%I FROM anon, authenticated/);
    expect(sql).toMatch(/'compliance-evidence',\s*'compliance-evidence',\s*false/);
    expect(sql).toMatch(/USING \(public\.is_admin_of\(company_id\)\)/);
  });
});
