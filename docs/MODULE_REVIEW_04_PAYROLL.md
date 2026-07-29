# MODULE REVIEW 04 — PAYROLL
## AdminLess Fin · Product Excellence Programme · Version 2

**Scope:** Employees, Expense Claims, Payroll Runs, Payslips, Payroll Reports  
**Date:** July 2026  
**Status:** Review complete · Quick wins implemented

---

## 1. Current State Audit

### 1.1 Module Inventory (Evidence)

| Layer | Files | Purpose |
|-------|-------|---------|
| **Routes** | `/payroll`, `/employees`, `/expense-claims`, `/payroll-runs`, `/payroll-runs/:id`, `/payroll-reports` | All admin-gated via `AdminRoute` |
| **Pages** | `PayrollWorkspace`, `Employees`, `ExpenseClaims`, `PayrollRuns`, `PayrollRunDetail`, `PayrollReports` | Core UI |
| **Components** | `EmployeeForm`, `ExpenseClaimForm`, `ReimburseClaimDialog`, `NewPayrollRunDialog`, `PayslipDialog`, `PayslipDetailDialog` | Forms & dialogs |
| **Queries** | `employeesQuery`, `payrollRunsQuery`, `expenseClaimsQuery`, `payrollWorkspaceQuery` | React Query layer |
| **Edge Functions** | `payroll`, `employees`, `expense-claims`, `send-payslip-email` | API layer |
| **RPCs** | `generate_payslips_for_run`, `get_payroll_summary_report` | DB logic (not in repo) |
| **Integrations** | `dashboard-data`, `calendar-events` | Partial |

### 1.2 Employee Management

**What works:**
- Full CRUD via `employees` edge function (admin-only mutations)
- Field masking for non-admin GET (id, name, department, position only)
- Employment types: permanent, contract, intern, casual
- Salary amount + period (monthly/weekly/fortnightly)
- Bank details, tax/ID numbers, start/end dates

**Gaps identified:**
- No employee detail/profile page — list-only with edit dialog
- No onboarding checklist or document storage
- No link to timesheets, projects, or fixed assets from employee record
- Delete has no FK guard (employees with payslips may fail at DB level)
- No validation that salary is set before payroll generation (RPC-dependent)

### 1.3 Expense Claims

**What works:**
- Full lifecycle: draft → approved (GL post) → paid (reimbursement GL post)
- Line items with expense accounts and optional project allocation
- Attachment URL support
- Auto-numbering (`EXP-#####`)
- Journal entry linked on approval (`journal_entry_id`)

**Gaps identified (pre-fix):**
- Route was open to all members while nav was admin-only — **fixed**
- Any member could approve/reimburse/delete — **fixed (admin RBAC)**
- Delete/edit allowed on approved/paid at API level — **fixed (status guards)**
- No link from claim to posted journal entry in UI
- Reimburse liability account not validated against approval JE

### 1.4 Payroll Runs

**What works:**
- Create run with pay period + pay date
- Generate payslips via RPC from employee salaries
- Edit payslip line items (earnings/deductions) in draft
- Finalize → posts consolidated journal entry (wages DR, bank CR, liabilities CR)
- View payslip detail, print, email

**Gaps identified (pre-fix):**
- Could finalize processed run again — **fixed**
- Could regenerate payslips on processed run — **fixed**
- Could edit payslip after finalize at API level — **fixed**
- No `journal_entry_id` on `payroll_runs` — cannot drill to posted entry
- No bulk payslip email
- No recurring payroll scheduling

### 1.5 Payslip Generation

- Delegated entirely to `generate_payslips_for_run` RPC (source not in repository)
- UI assumes salary-based generation for all active employees
- Manual adjustments via `UPDATE_PAYSLIP` after generation
- No statutory deductions (PAYE, UIF, SDL)

### 1.6 Email Distribution

- `send-payslip-email` uses Resend API, ZAR formatting
- HTML payslip with earnings/deductions/net pay
- **Pre-fix:** No authentication — **fixed (admin + company check)**

### 1.7 Accounting Integration

**Payroll finalize JE:**
| Line | Account | Type | Amount |
|------|---------|------|--------|
| Wages | User-selected expense | Debit | Σ total_earnings |
| Bank | User-selected asset | Credit | Σ net_pay |
| Liabilities | User-selected liability | Credit | Σ total_deductions (if > 0) |

**Expense claim approve JE:**
| Line | Account | Type |
|------|---------|------|
| Per item | expense_account_id | Debit |
| Liability | User-selected | Credit |

**Expense claim reimburse JE:**
| Line | Account | Type |
|------|---------|------|
| Liability | User-selected | Debit |
| Payment | User-selected asset | Credit |

### 1.8 Dead Code / Duplicate Logic

| Issue | Location |
|-------|----------|
| Earnings/deductions reduce duplicated | `payroll/UPDATE_PAYSLIP`, `PayslipDialog`, `send-payslip-email` |
| Duplicate payslip fetch | `PayslipDialog` vs `PayslipDetailDialog` (separate query keys) |
| `basic_salary` on Payslip type unused | `PayrollRunDetail.tsx` |
| Inline expense claims query (was) | Now `expenseClaimsQuery` |

### 1.9 Performance

- Workspace summary uses parallel `Promise.all` — efficient
- Payroll runs list is lightweight (no N+1)
- Dashboard fetches claims count via head-only count query — good
- No pagination on employees/claims lists (acceptable at SME scale)

---

## 2. Business Review

### Can Payroll support the complete employee lifecycle?

| Stage | Supported | Evidence |
|-------|-----------|----------|
| Hire / record | ✅ Partial | Employee form with start date, salary, bank |
| Onboard | ❌ | No checklist, documents, or provisioning |
| Compensate | ✅ | Salary + payroll runs |
| Expense reimburse | ✅ | Separate claims workflow |
| Pay | ✅ | Payslip generation + GL post |
| Offboard | ⚠️ Partial | `end_date` field exists; no workflow |
| Report | ✅ | Payroll summary report by line item |

### Can finance immediately understand status without multiple screens?

**Before this review:** No — payroll was fragmented across 3 list pages with no operational overview.

**After quick wins:** Yes — `/payroll` workspace surfaces:
- Payroll ready status
- Estimated monthly payroll cost
- Upcoming net pay & variance
- Pending claims & reimbursements
- Draft payroll runs
- Employee setup exceptions
- Recent activity & upcoming pay date

---

## 3. Payroll Lifecycle Review

```
Employee Record
    ↓ (salary, bank, email setup)
Payroll Setup Validation  ← NEW: workspace exceptions
    ↓
Expense Claims (parallel path)
    ↓ approve → GL liability
    ↓ reimburse → bank payment
Adjustments (payslip line items)
    ↓
Validation (draft run + payslips exist)  ← NEW: backend guards
    ↓
Payroll Run (CREATE_RUN)
    ↓
Generate Payslips (RPC)
    ↓
Review & Edit Payslips
    ↓
Finalize & Post GL
    ↓
Payslips (view/print/email)
    ↓
Payments (manual — no bank file export)
    ↓
General Ledger (JE posted, no back-link)
    ↓
Reporting (summary by line item)
    ↓
History (payroll runs list)
```

**Friction points remaining:**
- No approval step before finalize (single-user finalize)
- No payment file generation
- Claims not integrated into net pay deductions
- Timesheets don't feed payroll

---

## 4. Enterprise Comparison

| Capability | BC / NetSuite / Intacct | SuccessFactors | Xero Payroll | AdminLess Fin |
|------------|-------------------------|----------------|--------------|---------------|
| Employee master | ✅ Rich profiles | ✅ HR-centric | ✅ Basic | ⚠️ List + form |
| Payroll calendar | ✅ | ✅ | ✅ | ⚠️ Calendar shows dates only |
| Approval workflows | ✅ Multi-level | ✅ | ✅ | ❌ |
| Statutory compliance | ✅ | ✅ | ✅ Region-specific | ❌ |
| Payslip distribution | ✅ Auto bulk | ✅ | ✅ | ⚠️ Manual per payslip |
| GL integration | ✅ Auto-map accounts | ✅ | ✅ | ✅ Manual account pick |
| Expense → payroll | ✅ Deductions | ✅ | ⚠️ | ❌ Separate AP flow |
| Operational dashboard | ✅ Role-based | ✅ | ✅ | ✅ NEW workspace |
| Cash forecasting | ✅ | ✅ | ✅ | ⚠️ Payroll not in forecast |
| AI assistance | Emerging | ✅ | Limited | ❌ Not yet |

**Why enterprise platforms succeed:**
1. **Single operational view** — finance sees readiness, exceptions, and cost before drilling down
2. **Guarded workflows** — state machines prevent duplicate posting
3. **Automation** — recurring runs, bulk payslips, reminders
4. **Compliance built-in** — tax tables, filing, audit trails
5. **Discoverability** — everything payroll-related in one navigation group

AdminLess Fin now addresses #1 and partially #2. Does not copy UI — applies the principles with simpler SA SME-focused design.

---

## 5. Product Vision — Payroll Operations Workspace

**North star:** Finance opens `/payroll` and immediately knows:
- Is payroll ready?
- What will it cost?
- What needs my attention?
- When is the next pay date?
- Are there exceptions?

**Implemented workspace surfaces:**

| Signal | Source |
|--------|--------|
| Payroll Ready Status | Employees with salary configured |
| Pending Claims | `expense_claims` draft count |
| Employees Awaiting Action | Missing salary/email/bank |
| Upcoming Payroll | Next draft run by pay_date |
| Estimated Payroll Cost | Normalized monthly salaries |
| Payroll Variance | Draft run net vs last processed |
| Expense Claims Awaiting Approval | Draft + approved lists |
| Payroll Exceptions | Per-employee setup gaps |
| Recent Payroll Activity | Last 10 runs |
| Payroll Calendar | Via `/calendar` (pay dates) |

---

## 6. AI Opportunities

| Use Case | Value | Complexity |
|----------|-------|------------|
| Payroll readiness analysis | "3 employees missing bank details" — partially done via rules | Low |
| Anomaly detection | Flag unusual net pay vs prior run | Medium |
| Salary variance explanations | "Net pay up 12% due to overtime line" | Medium |
| Duplicate claim detection | Same amount/date/employee | Low |
| Policy compliance checks | Per diem limits, receipt requirements | Medium |
| Payroll forecasting | 3-month cash requirement | Medium |
| Claim summarisation | Natural language claim review | Low |
| Approval suggestions | Auto-approve under threshold | Medium |
| Cash requirement forecasting | Include payroll in 30-day forecast | Medium |

**Principle:** AI should surface answers, not add steps. Start with readiness and anomaly alerts on the workspace.

---

## 7. Automation Opportunities

| Automation | Current | Target |
|------------|---------|--------|
| Payroll reminders | ❌ | Notify 3 days before pay_date |
| Expense approval routing | ❌ | Route to manager by department |
| Payslip distribution | Manual email | Bulk send on finalize |
| Payroll validation | Partial (backend guards) | Pre-flight checklist UI |
| Payroll posting | Manual finalize | Optional auto-post on pay_date |
| GL reconciliation | ❌ | Match payroll JE to bank payment |
| Employee onboarding tasks | ❌ | Checklist on new employee |
| Recurring payroll | ❌ | Monthly auto-create draft run |
| Calendar integration | Pay dates shown | Amount on calendar events |
| Chat integration | ❌ | "What's our payroll cost this month?" |
| Notifications | Dashboard badges only | Push/email for claims & payroll |

---

## 8. Integration Matrix

| System | Integration | Status |
|--------|-------------|--------|
| Dashboard | Pending claims, draft payroll runs | ✅ Enhanced |
| Calendar | Payroll pay dates | ✅ Exists (no amounts) |
| Chat | Payroll queries | ❌ |
| Accounting / GL | JE on finalize & claims | ✅ |
| Reports | Payroll summary RPC | ✅ |
| Projects | Expense claim line items | ✅ |
| Budgets | No payroll budget tracking | ❌ |
| Banking | No payment file | ❌ |
| AI Copilot | Not connected | ❌ |
| Notifications | Dashboard insights only | ⚠️ |
| Timesheets | Billable to invoices only | ❌ |
| Loans | Separate module | ❌ |
| Fixed Assets | `assigned_to_employee_id` | ⚠️ Read-only |
| Global Search | Not indexed | ❌ |

---

## 9. UX Review

| Area | Assessment | Action Taken |
|------|------------|--------------|
| Navigation | Payroll group lacked hub page | ✅ Added `/payroll` workspace |
| Tables | Basic, functional | Payroll runs got EmptyState |
| Employee profiles | List only | Roadmap: detail page |
| Claims workflow | Clear status badges | Delete disabled for non-draft |
| Payroll run UX | Good step flow | Backend guards added |
| Search/filters | None on payroll lists | Roadmap |
| Bulk actions | None | Roadmap |
| Loading states | Inconsistent | Payroll runs improved |
| Mobile | Responsive cards/tables | Acceptable |
| Permissions | Mismatched route/API | ✅ Aligned to admin |

---

## 10. Implementation Roadmap

### Quick Wins ✅ (Implemented)

1. **Payroll Operations Workspace** (`/payroll`) with operational metrics
2. **`GET_WORKSPACE_SUMMARY`** API endpoint
3. **Security:** Auth on payslip email; admin RBAC on expense claim mutations
4. **Guards:** Prevent double-finalize, regenerate on processed, edit processed payslips
5. **`expenseClaimsQuery`** centralized in queries.ts
6. **Route alignment:** Expense claims moved to `AdminRoute`
7. **Nav fix:** Payroll reports only in admin reports; workspace as payroll hub
8. **Dashboard:** Draft payroll runs in actions & insights
9. **UX:** EmptyState on payroll runs; delete guard on claims UI
10. **Payslip detail:** Include `position` in API select

### Medium Improvements

- Employee detail/profile page
- Link payroll run → journal entry (requires `journal_entry_id` column)
- Bulk payslip email on finalize
- Payroll amounts on calendar events
- Cash flow forecast includes upcoming payroll
- Expense claim → journal entry drill-down
- Filters/search on employee and claims tables
- Pre-flight validation UI before generate/finalize

### Major Improvements

- Statutory deduction engine (PAYE, UIF, SDL for ZA)
- Recurring payroll runs
- Multi-level approval workflow
- Timesheet → payroll integration
- Bank payment file export
- Employee self-service portal for claims/payslips
- Budget vs actual payroll tracking

### High Value / Low Risk (Next Sprint)

- Bulk payslip email (auth now in place)
- Payroll in cash flow forecast (query draft run net pay)
- Global search indexing for employees/claims/runs
- Chat integration for payroll summary queries

---

## 11. Quick Wins Implemented — Change Log

| File | Change |
|------|--------|
| `supabase/functions/payroll/index.ts` | `GET_WORKSPACE_SUMMARY`; finalize/generate/update guards; company_id scoping |
| `supabase/functions/expense-claims/index.ts` | Admin RBAC; status guards on PUT/DELETE/APPROVE/REIMBURSE |
| `supabase/functions/send-payslip-email/index.ts` | Authentication + admin authorization |
| `supabase/functions/dashboard-data/index.ts` | `draftPayrollRuns` action count |
| `src/pages/PayrollWorkspace.tsx` | **New** operations workspace |
| `src/lib/queries.ts` | `expenseClaimsQuery`, `payrollWorkspaceQuery` |
| `src/router.tsx` | `/payroll` route; expense-claims under AdminRoute |
| `src/components/SidebarNav.tsx` | Payroll hub link; reports nav fix |
| `src/pages/PayrollRuns.tsx` | EmptyState + skeleton loading |
| `src/pages/ExpenseClaims.tsx` | Shared query; delete guard |
| `src/components/DashboardInsights.tsx` | Draft payroll insight |
| `src/pages/Dashboard.tsx` | Draft payroll action button |

---

## 12. Verification Report

| Quality Gate | Result |
|--------------|--------|
| Build successfully | ✅ `npm run build` passed |
| TypeScript | ✅ No errors |
| Payroll calculations preserved | ✅ No changes to RPC or calculation logic |
| GL posting preserved | ✅ Finalize/approve/reimburse logic unchanged (guards only) |
| Payslip generation preserved | ✅ RPC call unchanged |
| Accounting integrity | ✅ Duplicate finalize blocked |
| Security | ✅ Email auth; claim mutations admin-only |
| Workflow improved | ✅ Workspace + guards |
| Discoverability improved | ✅ `/payroll` hub |
| Productivity improved | ✅ At-a-glance metrics |

---

## Summary

Payroll in AdminLess Fin is a **functional SME payroll system** with solid GL integration but was previously **operationally invisible** — finance had to visit three separate pages to understand payroll status.

This review transforms the module's **entry point** into a Payroll Operations Workspace while hardening security and workflow guards. The foundation is now in place for statutory compliance, automation, and AI-assisted operations in subsequent programme modules.

**Recommended next module action:** Implement bulk payslip distribution and payroll cash forecasting (high value, low risk, builds on workspace data).
