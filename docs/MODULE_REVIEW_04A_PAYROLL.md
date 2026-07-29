# MODULE REVIEW 04A — PAYROLL REFINEMENT SPRINT
## AdminLess Fin · Product Excellence Programme · Version 2

**Date:** July 2026  
**Type:** Refinement sprint (not a new module review)  
**Constraint:** No Supabase/schema/calculation changes — client-side intelligence only

---

## 1. Payroll Command Centre Improvements

**Root cause:** The workspace showed metrics but required scrolling to build a mental model of payroll health.

**Business value:** Finance opens `/payroll` and immediately sees readiness, cash impact, key metrics, timeline, alerts, and insights in one viewport.

**Files affected:**
- `src/pages/PayrollWorkspace.tsx` — restructured as command centre grid
- `src/components/payroll/*` — modular UI components

**Risk:** Low — presentation layer only.

**Outcome:** Above-the-fold command centre with compact metric cards, readiness score, and cash preview.

---

## 2. Readiness Engine

**Root cause:** Binary ready/not-ready did not explain what blocked payroll.

**Business value:** Finance knows exactly why payroll is at 97% vs 100% and what to fix.

**Implementation:** `src/lib/payrollIntelligence.ts` → `computeReadinessScore()` + `buildReadinessIssues()`

**Scoring model:**
- Per-employee checks: salary, email, bank, tax number (4 × active employees)
- Company checks: pending claims cleared, draft run has payslips
- Score = `(passed / total) × 100`
- Status: ≥95% Ready · ≥75% Needs attention · <75% Not ready

**Issues surfaced:**
| Issue | Severity |
|-------|----------|
| Missing salary structures | Critical |
| Missing bank accounts | Critical |
| Missing tax numbers | Warning |
| Missing email addresses | Warning |
| Missing cost centres (department) | Info |
| Pending expense claims | Warning |
| Claims awaiting reimbursement | Info |
| Draft run without payslips | Warning |

**Files:** `PayrollReadinessScore.tsx`

**Risk:** Low — derived from existing employee + workspace data.

---

## 3. Payroll Timeline

**Root cause:** No chronological view of what happens when before pay day.

**Business value:** Reduces uncertainty; each step navigates to the right workflow.

**Implementation:** `buildPayrollTimeline()` generates interactive events:
- Today → Expense claims pending
- Pay date − 2 → Payroll review
- Pay date − 1 → Payroll processing
- Pay date → Payslips distributed
- Pay date + 1 → Payroll journal posted

**Files:** `PayrollTimeline.tsx`

**Risk:** Low — computed dates from upcoming run; no backend changes.

---

## 4. Cash Impact Preview

**Root cause:** Finance could not see whether cash covers upcoming payroll without leaving the module.

**Business value:** Immediate cash health assessment before running payroll.

**Implementation:** `computeCashImpact()` reuses:
- Bank balances from `dashboard-data` accounts (same logic as Dashboard)
- Estimated payroll from workspace metrics
- Upcoming bills from `purchasesWorkspaceQuery` (due before pay date)

**Display:**
| Line | Source |
|------|--------|
| Current Cash | Asset accounts matching bank/cash keywords |
| Estimated Payroll | Draft run net pay or monthly estimate |
| Upcoming Bills | Open bills due before pay date |
| Upcoming Tax | Reserved (0 — no statutory engine yet) |
| Remaining Cash | Arithmetic sum |
| Health indicator | Healthy / Caution / Critical thresholds |

**Files:** `PayrollCashImpact.tsx`

**Risk:** Low — no financial calculations changed; reuses existing balances.

---

## 5. Employee 360 Preview

**Root cause:** Employees were list-only with no consolidated view.

**Business value:** Foundation for future Employee Workspace without redesigning Employees page.

**Implementation:** `EmployeePreviewDialog.tsx`
- Employment details
- Payroll history (link to runs — full history deferred)
- Expense claims filtered by employee
- Assigned fixed assets
- Upcoming actions (missing fields)
- Triggered from Employees table (click name) and readiness issues

**Files:** `EmployeePreviewDialog.tsx`, `Employees.tsx`

**Risk:** Low — read-only preview; edit opens existing form.

---

## 6. Payroll AI Insights

**Root cause:** No intelligent layer explaining payroll data.

**Business value:** Surfaces variance explanations, duplicates, and priorities without manual analysis.

**Architecture:** Follows `DashboardInsights` pattern — rule-based intelligence branded as AI insights. **Insights only — never posts transactions.**

**Implementation:** `buildPayrollInsights()` generates:
- Payroll variance explanations (% change vs last run)
- Duplicate claim detection (same employee + amount)
- Readiness summary with top blockers
- Payroll cost forecast trend
- Missing information gaps

**Files:** `PayrollAiInsights.tsx`, `payrollIntelligence.ts`

**Risk:** Low — read-only derived text.

---

## 7. Calendar Integration

**Root cause:** Calendar showed payroll pay dates only; no review deadlines or claim deadlines.

**Business value:** Every payroll event visible in Operations Calendar.

**Implementation:** Client-side merge in `FinancialCalendar.tsx`:
- Fetches `payrollWorkspaceQuery` + `expenseClaimsQuery`
- Merges `buildPayrollCalendarEvents()` into calendar events
- New event types: `payroll_review`, `claim_deadline`, `payslip_release`
- Payroll workspace includes 30-day calendar strip with link to full calendar

**Files:** `FinancialCalendar.tsx`, `PayrollCalendarStrip.tsx`

**Risk:** Low — supplemental events merged client-side; existing API unchanged.

---

## 8. Cross Module Integration Report

| Module | Status | Evidence |
|--------|--------|----------|
| **Dashboard** | ✅ Connected | Draft payroll runs in actions + insights (from 04) |
| **Calendar** | ✅ Enhanced | Supplemental payroll events merged client-side |
| **Chat** | ❌ Not connected | No payroll query handlers |
| **Accounting / GL** | ✅ Unchanged | Finalize flow preserved |
| **General Ledger** | ⚠️ Partial | Timeline links to GL; no run→JE drill-back |
| **Budgets** | ❌ Not connected | No payroll budget tracking |
| **Projects** | ⚠️ Partial | Claims link projects; not on command centre |
| **Reports** | ✅ Linked | Insights link to payroll reports |
| **AI Copilot** | ⚠️ Rule-based | Insights panel; no LLM integration |
| **Notifications** | ⚠️ Partial | Operational alerts on command centre only |

**Low-risk improvements implemented:** Calendar merge, cash from dashboard, bills from purchases workspace, assets in employee preview.

---

## 9. Operational Alerts

**Root cause:** Critical payroll risks were buried in lists.

**Business value:** Business-risk-prioritised alerts with direct navigation.

**Implementation:** `buildOperationalAlerts()` detects:
| Alert | Threshold |
|-------|-----------|
| Payroll variance exceeds threshold | ≥10% vs last run |
| Possible duplicate employee | Same email or name |
| Claims approaching deadline | Draft >14 days |
| Missing banking details | Any active employee |
| Payroll due soon | Pay date within 3 days |

**Files:** `PayrollAlerts.tsx`

**Risk:** Low — read-only alerts.

---

## 10. Build Verification

```
npm run build — ✅ PASSED (30.8s)
TypeScript — ✅ No errors
Modules transformed — 3416
```

---

## 11. Regression Verification

| Quality Gate | Result |
|--------------|--------|
| Payroll calculations preserved | ✅ No RPC or calculation code touched |
| GL posting preserved | ✅ No edge function changes |
| Accounting integrity | ✅ No posting logic modified |
| Security preserved | ✅ No auth changes |
| Database schema preserved | ✅ No migrations |
| Edge functions preserved | ✅ Zero backend changes |
| APIs preserved | ✅ Existing queries only |
| Usability improved | ✅ Command centre layout |
| Discoverability improved | ✅ Timeline, alerts, calendar strip |
| Operational awareness improved | ✅ Readiness score + cash preview |

---

## 12. Production Readiness Summary

**Ready for production.** This sprint is entirely additive frontend intelligence composing existing APIs.

**What changed:**
- 1 intelligence library (`payrollIntelligence.ts`)
- 7 payroll components
- 3 page enhancements (PayrollWorkspace, Employees, FinancialCalendar)
- 1 nav label update

**What did NOT change:**
- Supabase edge functions
- Database schema
- Payroll calculations
- GL posting logic
- Security model

**Recommended next (awaiting approval for Module 05):**
- LLM-powered insights via Chat integration
- Bulk payslip distribution
- `journal_entry_id` on payroll runs (requires schema — separate approval)
- Statutory tax line in cash preview when compliance engine exists

---

## File Index

| File | Purpose |
|------|---------|
| `src/lib/payrollIntelligence.ts` | Readiness, timeline, cash, alerts, insights, calendar events |
| `src/components/payroll/PayrollReadinessScore.tsx` | Scored readiness with issue list |
| `src/components/payroll/PayrollTimeline.tsx` | Interactive chronological workflow |
| `src/components/payroll/PayrollCashImpact.tsx` | Cash impact preview |
| `src/components/payroll/PayrollAlerts.tsx` | Risk-prioritised alerts |
| `src/components/payroll/PayrollAiInsights.tsx` | Rule-based AI insights |
| `src/components/payroll/PayrollCalendarStrip.tsx` | 30-day payroll calendar |
| `src/components/payroll/EmployeePreviewDialog.tsx` | Employee 360 foundation |
| `src/pages/PayrollWorkspace.tsx` | Command centre orchestration |
| `src/pages/Employees.tsx` | Employee preview on name click |
| `src/pages/FinancialCalendar.tsx` | Merged payroll calendar events |
