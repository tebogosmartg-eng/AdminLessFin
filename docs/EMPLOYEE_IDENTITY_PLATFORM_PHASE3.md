# Employee Identity Platform — Phase 3 Enterprise Identity Maturity

**Platform:** AdminLess Fin V3  
**Date:** 2026-07-05  
**Status:** Implemented

---

## 1. Employee Identity Platform Audit

### Identity hierarchy (locked)

| Layer | Role |
|-------|------|
| UUID | Technical identifier — internal only |
| Employee Number | Permanent business identifier (`EMP-000245`) |
| Employee Identity Service | Single source of truth for all modules |
| EmployeeIdentity component | Official presentation layer |

### Pre-Phase 3 gaps (resolved)

| Area | Before | After |
|------|--------|-------|
| Identity service | Format helpers only | Full `resolveEmployeeIdentity()` service |
| Component variants | Stacked/inline only | 14 variants (sm/md/lg + avatar/list/table/card/selector/timeline/document/email/export) |
| Smart selectors | Per-form Select dropdowns | Shared `EmployeeSelector` with fuzzy search |
| Timeline | None | Immutable `employee_timeline_events` table + UI |
| QR / Barcode | Payslip QR only | Platform `EmployeeCodes` component (QR + Code128) |
| Global search | Basic fields | Number, name, ID, passport, email, phone, dept, branch, position, status, manager |
| Audit | Basic payload | Human-readable + branch/position/readable field |
| AI | Name + number | Number + name + department + position + company |
| Settings | Numbering only | Full Employee Identity settings (QR, barcode, display) |

### Architecture preservation

| System | Status |
|--------|--------|
| BOE | ✅ Unchanged |
| Commands | ✅ Unchanged |
| Events | ✅ Unchanged |
| Subscribers | ✅ Unchanged |
| Accounting | ✅ Unchanged |
| Security | ✅ RLS on timeline; company_users gate unchanged |
| Employee Number Engine | ✅ Same RPC, same immutability trigger |

---

## 2. Platform Integration Matrix

| Module | EmployeeIdentity | Identity Service | Smart Selector | Timeline | QR/Barcode | Search | Documents | Audit | AI |
|--------|-----------------|------------------|----------------|----------|------------|--------|-----------|-------|-----|
| Employee List | ✅ Cell | ✅ | — | — | — | ✅ Ranked filter | — | — | — |
| Employee Profile | ✅ Card | ✅ | — | ✅ | ✅ | — | — | — | — |
| Employee Form | ✅ | ✅ | — | ✅ on create | — | — | — | ✅ | — |
| Payroll Run | ✅ | ✅ compact | — | — | — | — | ✅ | — | — |
| Payslips | ✅ | ✅ | — | — | ✅ PDF QR | ✅ | ✅ | — | ✅ |
| Payroll Reports | ✅ | ✅ export | — | — | — | — | ✅ CSV | — | ✅ |
| Expense Claims | ✅ | ✅ | ✅ Selector | — | — | — | ✅ journal | ✅ | ✅ |
| Fixed Assets | ✅ | ✅ | ✅ Selector | — | — | — | — | — | — |
| Payroll Workspace | ✅ | ✅ | — | — | — | — | — | — | ✅ |
| Global Search (⌘K) | ✅ result format | ✅ | — | — | — | ✅ Advanced | — | — | — |
| Settings | ✅ preview | ✅ policy | — | — | ✅ config | — | — | — | — |
| Import | — | ✅ backend | — | ✅ on import | — | — | — | ✅ | — |

---

## 3. Employee Identity Service Design

**Location:** `src/lib/employeeIdentity.ts`

### Responsibilities

| Function | Purpose |
|----------|---------|
| `resolveEmployeeIdentity()` | Canonical resolved identity object |
| `buildEmployeeSearchLabels()` | All searchable labels for an employee |
| `employeeMatchesSearch()` | Client-side fuzzy/partial match |
| `employeeSearchScore()` | Ranked search scoring |
| `filterAndRankEmployees()` | Sorted search results |
| `resolveEmployeeByNumber()` | Lookup by business ID |
| `resolveEmployeeById()` | Lookup by UUID |
| `formatEmployeeDocumentHeader()` | Document standard block |
| `formatEmployeeEmailIdentity()` | Email standard line |
| `formatEmployeeExportRow()` | CSV/Excel row |
| `formatEmployeeAiContext()` | AI standard string |
| `formatEmployeeAuditReadable()` | Human-readable audit line |
| `buildEmployeeAuditRecord()` | Structured audit payload |

### Server API (`employees` edge function)

| Method | Purpose |
|--------|---------|
| `RESOLVE` | Resolve full identity by UUID or employee number |
| `SEARCH` | Server-side employee search with fuzzy token match |
| `GET_TIMELINE` | Immutable timeline for an employee |

### Identity fields

```typescript
EmployeeIdentityFields {
  id, employee_number, first_name, last_name,
  department, branch, position, email, phone, id_number,
  employment_status, manager_id, manager_name,
  company_id, company_name, avatar_url
}
```

---

## 4. Employee Timeline Design

### Storage

**Table:** `employee_timeline_events`  
**Migration:** `20260705180000_employee_identity_platform.sql`

| Column | Purpose |
|--------|---------|
| `employee_id` | UUID reference |
| `employee_number` | Business ID at time of event |
| `company_id` | Tenant scope |
| `event_type` | e.g. `DEPARTMENT_CHANGED` |
| `event_label` | Human-readable label |
| `event_data` | JSONB detail payload |
| `command_id` | BOE command reference |
| `correlation_id` | BOE correlation reference |
| `changed_by` | Auth user UUID |
| `created_at` | Immutable timestamp |

### Immutability

- `BEFORE UPDATE OR DELETE` trigger raises exception
- Insert-only from edge functions via service role

### Event types supported

`EMPLOYEE_CREATED`, `EMPLOYEE_NUMBER_ASSIGNED`, `DEPARTMENT_CHANGED`, `BRANCH_CHANGED`, `MANAGER_CHANGED`, `POSITION_CHANGED`, `SALARY_CHANGED`, `PAYROLL_GENERATED`, `ASSET_ASSIGNED`, `ASSET_RETURNED`, `LOAN_ISSUED`, `LOAN_CLOSED`, `EXPENSE_SUBMITTED`, `EXPENSE_APPROVED`, `EXPENSE_PAID`, `LEAVE_APPROVED`, `LEAVE_DECLINED`, `EMPLOYMENT_TERMINATED`, `EMPLOYMENT_REINSTATED`, `EMPLOYEE_ARCHIVED`

### Recording paths

| Trigger | Events |
|---------|--------|
| Employee POST/IMPORT | `EMPLOYEE_CREATED`, `EMPLOYEE_NUMBER_ASSIGNED` |
| Employee PUT | Field diff → mapped timeline events |
| Future modules | `recordEmployeeTimelineEvent()` in `_shared/employeeTimelineEngine.ts` |

### UI

**Component:** `src/components/hr/EmployeeTimeline.tsx`  
**Surface:** Employee Preview Dialog

---

## 5. Smart Selector Design

**Component:** `src/components/hr/EmployeeSelector.tsx`

### Features

- Popover + Command palette search
- Displays: Employee Number, Name, Department, Branch, Status, Avatar initials
- Typing `Sarah` or `EMP-000245` resolves immediately
- `filterAndRankEmployees()` scoring (exact number match = highest priority)
- Active-only filter (excludes terminated/archived by default)
- Used in: ExpenseClaimForm, AssetForm

### Migration path

Legacy `EmployeeSelectOption` retained for backward compatibility; new forms use `EmployeeSelector`.

---

## 6. Document Integration Report

| Document | Employee Number | Name | Department | Company | Standard Function |
|----------|----------------|------|------------|---------|-------------------|
| Payslip PDF/HTML | ✅ | ✅ | ✅ | ✅ | `formatEmployeeDocumentHeader()` |
| Payslip email | ✅ | ✅ | ✅ | ✅ | `formatEmployeeEmailIdentity()` |
| Payroll register CSV | ✅ | ✅ | ✅ | — | `formatEmployeeExportRow()` |
| Bank payment file | ✅ | ✅ compact | — | — | `formatEmployeeIdentityCompact()` |
| Expense claim journal | ✅ | ✅ | ✅ | — | `formatEmployeeIdentityContext()` |
| Reimbursement journal | ✅ | ✅ | ✅ | — | `formatEmployeeIdentityContext()` |

**Rule enforced:** No document displays employee name alone without employee number.

---

## 7. Search Integration Report

### Global Search (`global-search` edge function)

**Fields searched:** employee_number, first_name, last_name, id_number, email, phone, department, branch, position, employment_status

**Enhancements:**
- Instant match for `EMP-000245` (exact/prefix scoring)
- Single-character search allowed for employee number patterns (`EMP`, `ABC-`)
- Manager name resolved via secondary lookup
- Result format: title = employee number, subtitle = name · dept · branch · position · manager · status

### Employee List

Uses `filterAndRankEmployees()` — same field coverage with ranked results.

### Server Search

`employees` method `SEARCH` — fuzzy token matching for API consumers.

---

## 8. Audit Integration Report

### Enhanced audit payload (`employeeNumberEngine.ts`)

Every `EMPLOYEE_NUMBER_GENERATED` audit entry now includes:

```json
{
  "employee_id": "uuid",
  "employee_number": "EMP-000245",
  "employee_name": "Sarah Mokoena",
  "department": "Finance",
  "branch": "PTA",
  "position": "Accountant",
  "company_id": "uuid",
  "command_id": null,
  "correlation_id": null,
  "readable": "EMP-000245 — Sarah Mokoena · Finance"
}
```

### Human-readable format

`formatEmployeeAuditReadable()` produces:
`[OPERATION] · EMP-000245 (abc12345…) · Sarah Mokoena · Dept: Finance · Company: Acme · @ 2026-07-05T…`

### Timeline as audit extension

Timeline events carry the same command_id, correlation_id, changed_by, and timestamp fields required by the audit standard.

---

## 9. AI Integration Report

**Standard function:** `formatEmployeeAiContext(employee)`

**Format:** `EMP-000245 — Sarah Mokoena — Finance — Accountant — Acme Corp`

### Consumers

| Module | Usage |
|--------|-------|
| `payrollIntelligence.ts` | Duplicate detection, readiness alerts, workspace exceptions |
| `ReimburseClaimDialog.tsx` | AI reimbursement context |
| `PayslipDetailDialog.tsx` | Payslip AI context |
| Expense claim journals | Server-side `formatEmployeeIdentityContext()` |

**Rule:** AI never references employees by name alone.

---

## 10. Verification Report

| Gate | Result |
|------|--------|
| Employee Number Engine preserved | ✅ Same RPC, immutability trigger |
| BOE preserved | ✅ No command/event/subscriber changes |
| Commands preserved | ✅ |
| Events preserved | ✅ |
| Subscribers preserved | ✅ |
| Security preserved | ✅ RLS on timeline |
| Accounting preserved | ✅ Journal descriptions enhanced only |
| No duplicate identity logic | ✅ Single service + component |
| EmployeeIdentity component used | ✅ All employee surfaces |
| Global Search upgraded | ✅ |
| Smart selectors implemented | ✅ ExpenseClaims return, AssetForm |
| Timeline working | ✅ DB + UI + edge recording |
| QR generation working | ✅ EmployeeCodes + payslip existing |
| Barcode generation working | ✅ Code128/Code39 via jsbarcode |
| Documents updated | ✅ |
| Audit updated | ✅ |
| AI updated | ✅ |
| `npm run build` | ✅ Pass |
| `npx tsc --noEmit` | ✅ Pass |

---

## 11. Production Readiness Report

### Deploy steps

1. Apply migrations (in order):
   - `20260703140000_employee_number_engine.sql`
   - `20260703150000_employee_numbering_policy.sql`
   - `20260705180000_employee_identity_platform.sql`
2. Redeploy edge functions: `employees`, `global-search`, `expense-claims`
3. Verify Settings → Payroll → **Employee Identity** shows numbering + display + QR/barcode options
4. Create test employee — confirm timeline shows Created + Number Assigned events
5. Open employee profile — confirm QR + barcode render
6. Search `EMP-000001` in ⌘K — confirm instant ranked match
7. Create expense claim — confirm smart selector finds by name or number

### New dependencies

- `jsbarcode` + `@types/jsbarcode` (Code128/Code39 barcodes)
- `qrcode` (already present — reused for platform QR)

### Key files

| File | Purpose |
|------|---------|
| `src/lib/employeeIdentity.ts` | Identity service |
| `src/components/hr/EmployeeIdentity.tsx` | Presentation component |
| `src/components/hr/EmployeeSelector.tsx` | Smart selector |
| `src/components/hr/EmployeeCodes.tsx` | QR + barcode |
| `src/components/hr/EmployeeTimeline.tsx` | Timeline UI |
| `supabase/functions/_shared/employeeTimelineEngine.ts` | Server timeline recording |
| `supabase/migrations/20260705180000_employee_identity_platform.sql` | Schema |

### Risk assessment

| Risk | Mitigation |
|------|------------|
| Timeline table missing on deploy | Migration includes IF NOT EXISTS + graceful server fallback |
| Barcode invalid chars | JsBarcode try/catch — renders empty on failure |
| Large employee lists in selector | Results capped at 50; server SEARCH available |

---

**Employee Identity is now a core platform service. UUID = technical identifier. Employee Number = permanent business identifier. Employee Identity Service = single source of truth.**
