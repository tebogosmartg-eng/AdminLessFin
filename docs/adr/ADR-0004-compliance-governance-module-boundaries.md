# ADMINLESS FIN

# ARCHITECTURE DECISION RECORD (ADR)

## ADR-0004

# COMPLIANCE & GOVERNANCE MODULE — SCOPE AND BOUNDARIES

**Status:** PROPOSED
**Date:** 30 September 2026
**Version:** 1.0
**Supersedes:** None (complements ADR-0001 CoA freeze and ADR-0003 CFA freeze)
**Plan:** `docs/architecture/COMPLIANCE_GOVERNANCE_IMPLEMENTATION_PLAN.md`

---

## Context

AdminLess Fin is adding a Compliance & Governance module that tells a business which statutory and industry obligations apply to it, tracks each obligation's cycles and evidence, and reminds the responsible person.

The repository already contains three things called "governance", none of which is this module:

- `src/governance/` — the company-admin foundation (financial calendar, company branding, master-data proxy, accounting policies, team security).
- The Accounting Policy Engine and Accounting Rules Engine — posting-pipeline controls.
- `docs/enterprise-governance-compliance/V5.0.0/` — a certified 13-domain design (EGCP) that, by its own readiness assessment, implements no services, schema, Edge Functions, or UI.

Without a recorded boundary, compliance work would drift into those areas and collide with frozen payroll, CoA, and CFA code.

---

## Decision

1. **Narrow scope.** The module is a tenant obligation workspace. It does not implement the full EGCP: no delegation of authority, risk and control library, control testing, exception management, compliance scoring, or second legislation repository.
2. **Location.**
   - `src/compliance/` — UI.
   - `supabase/functions/compliance/` — tenant API.
   - `supabase/functions/compliance-scheduler/` — daily job.
   - `supabase/functions/_shared/compliance/` — evaluator and date engine.
   - `content/compliance/` — rule and guidance source.

   It is not a `src/governance` domain, and the dormant governance flags are not repurposed.
3. **Access.** Version 1 is owner and admin only. This is enforced in the Edge Function, not only by `AdminRoute`. Members get no route, navigation entry, calendar event, or reminder.
4. **Read, never own.** Compliance reads master data, payroll, sales, purchases, assets, banking, inventory, and treasury records. It never writes to them. Questionnaire answers are never written back to `efs_company_master_data` or `companies`. No employee, vendor, or customer document store is created inside Compliance.
5. **Payroll law stays in `src/statutory/`.** Compliance may list EMP201, IRP5, PAYE, UIF, or SDL obligations and reference finalized `statutory_returns` rows. It never recalculates them.
6. **Evidence storage.**
   - Compliance-owned files go in a private `compliance-evidence` bucket. Uploads and downloads use signed URLs issued by the Edge Function, and object keys are never overwritten.
   - The public `attachments` bucket is never used.
   - Evidence held by other modules is referenced by row id from a fixed allow-list, never copied.
7. **Regulatory content is data.** Rules and guidance are versioned, checksummed files carrying source provenance and review-due dates, following the `src/statutory` pattern. A seed script publishes them to platform tables, which have no read policy for users. Published versions are immutable (enforced by a trigger). A rule without a named reviewer is a draft; drafts reach production only on an explicit flag, and the app labels them unreviewed. There is no in-app rule editor and no tenant rule authoring.
8. **Server-side evaluation.** Rules are evaluated only in Edge code against a closed set of facts, and the results are stored. Rule conditions are never shipped to or evaluated in the browser. Dates are computed in `Africa/Johannesburg`.
9. **Status wording.** A finished cycle is "completed", never "compliant". The product gives guidance, not legal advice, and version 1 does not file with any authority.
10. **Additive only.** The module is off by default behind `VITE_COMPLIANCE_*` flags and an allowlist. It adds tables, one private bucket, and Edge Functions. It changes no existing column, route, onboarding step, RLS policy, or edge function. The Operations Calendar reads compliance dates through one flag-gated adapter (`src/compliance/calendarSource.ts`) that calls the compliance function, which refuses anyone but an owner or admin.
11. **Reminders are exactly-once and role-checked at send time.** A reminder dispatch and its `notifications` row are written in one transaction, keyed per recipient. The recipient's owner or admin role is checked when the reminder is sent, with the owners as fallback.

---

## Consequences

- Compliance does not aggregate money. ADR-0003 applies: `npm run guard:cfa` must stay green.
- Compliance does not touch account roles or system accounts. ADR-0001 applies.
- Existing weaknesses found during Phase 0 are recorded in the plan and fixed separately, not inside this module:
  - `calendar-events` returns payroll dates to members.
  - `settings` `GET_AUDIT_LOGS` checks membership only.
  - The `attachments` and `avatars` buckets are public.
- Every new tenant table must attach the `process_audit_log()` trigger in its own migration; it is per table, not automatic.
- Audit rows written by the service role have no actor, because `process_audit_log()` records `auth.uid()`. Compliance therefore records the acting user explicitly in its own append-only event table.
- Changes to scope, access (including member read access), storage, or content authoring need a superseding ADR.

---

## Approval

Pending owner sign-off. Change **Status** to ACCEPTED once approved.
