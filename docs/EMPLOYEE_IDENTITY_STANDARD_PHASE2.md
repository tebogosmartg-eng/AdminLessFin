# Employee Identity Standard — Phase 2 Report

**Platform:** AdminLess Fin V3  
**Date:** 2026-07-03  
**Status:** Implemented

---

## 1. Platform Employee Identity Audit

### Identity hierarchy (permanent)

```
Database UUID        → internal only, never shown to users
Employee Number      → official business identifier (EMP-000245)
Employee Name        → display name
Department           → cost centre / org unit
Company              → tenant scope
```

### Pre-Phase 2 gaps (resolved)

| Area | Before | After |
|------|--------|-------|
| Numbering format | Hardcoded `EMP-{SEQ}` in SQL only | Data-driven policy with tokens |
| Settings UI | None | Settings → Payroll → Employee Numbering |
| UI presentation | Inconsistent (name-only in many places) | `EmployeeIdentity` component standard |
| Expense claims | Name only | Number + name + department |
| Assets | Name only | Standard identity on assignment |
| Global search | Partial fields | Number, name, ID, email, phone, department |
| AI / intelligence | Name-only alerts | `formatEmployeeAiContext()` |
| Audit | Basic number log | Full identity payload |
| Payslip emails | Name only | Employee number included |

### Modules without employee selectors (N/A)

| Module | Notes |
|--------|-------|
| Time Tracking | Project-based; no employee picker in current schema |
| Loans | Lender/vendor based, not employee |
| Internal Chat | Team/user based |
| Projects | No employee assignment in current UI |

---

## 2. Module Integration Matrix

| Module | Employee Number | Standard UI | Search | Documents | Status |
|--------|----------------|-------------|--------|-----------|--------|
| Employee List | ✅ | ✅ `EmployeeIdentityCell` | ✅ Local filter | — | Complete |
| Employee Profile | ✅ | ✅ Preview dialog | — | — | Complete |
| Employee Form | ✅ Read-only | ✅ | — | — | Complete |
| Payroll Run | ✅ | ✅ Payslip table | — | ✅ Register | Complete |
| Payslips | ✅ | ✅ Dialog/PDF/HTML | — | ✅ | Complete |
| Payslip Email | ✅ | — | — | ✅ HTML | Complete |
| Payroll Reports | ✅ | ✅ Register grid | — | ✅ CSV | Complete |
| Expense Claims | ✅ | ✅ Table + selectors | — | — | Complete |
| Expense Reimburse | ✅ | ✅ AI context string | — | — | Complete |
| Fixed Assets | ✅ | ✅ Detail + selector | — | — | Complete |
| Payroll Workspace | ✅ | ✅ Pending claims | — | — | Complete |
| Payroll Intelligence | ✅ | — | — | — | ✅ AI alerts |
| Global Search (⌘K) | ✅ | ✅ | ✅ | — | Complete |
| Settings | ✅ | ✅ Policy editor | — | — | Complete |
| Import | ✅ | — | — | — | ✅ Backend ready |
| Audit Logs | ✅ | — | — | — | ✅ Enhanced payload |

---

## 3. Numbering Policy Engine Design

### Storage

`company_employee_number_settings` (extended in `20260703150000_employee_numbering_policy.sql`):

| Column | Purpose |
|--------|---------|
| `format_template` | Pattern e.g. `EMP-{YEAR}-{SEQ}` |
| `sequence_padding` | Zero-pad width (default 6) |
| `next_sequence` | Monotonic counter (never decrements) |
| `starting_number` | Initial value for new companies |
| `company_code` | `{COMPANY}` token value |
| `branch_code` | `{BRANCH}` token value (default MAIN) |

### Supported tokens

| Token | Substitution |
|-------|--------------|
| `{SEQ}` | Padded sequence (required in pattern) |
| `{YEAR}` | Current UTC year |
| `{MONTH}` | Current UTC month |
| `{COMPANY}` | Company code or derived abbreviation |
| `{BRANCH}` | Branch code |

### Functions (Postgres)

- `format_employee_number_from_policy()` — token replacement
- `generate_employee_number()` — atomic allocation (unchanged contract)
- `preview_employee_number()` — settings preview without consuming sequence
- `validate_employee_number_format()` — import validation

### Policy change rule

Changing pattern **never modifies** existing `employees.employee_number` values. Only `generate_employee_number()` uses the updated template for new hires.

---

## 4. Settings Implementation

**Location:** Settings → Payroll → **Employee Numbering** (`EmployeeNumberSettings.tsx`)

Features:
- Pattern editor with token badges
- Preset patterns (Standard, Yearly, Company prefix, Branch + year)
- Company code and branch code fields
- Sequence padding control
- Live preview (next + following number)
- Count of already-assigned employees (immutable notice)

**API:** `employees` edge function
- `GET_NUMBERING_POLICY`
- `UPDATE_NUMBERING_POLICY`

---

## 5. UI Standard Report

**Component:** `src/components/hr/EmployeeIdentity.tsx`

| Export | Use case |
|--------|----------|
| `EmployeeIdentity` | Stacked or inline: number → name → department |
| `EmployeeSelectOption` | Dropdown items |
| `EmployeeIdentityCell` | Table cells with optional click handler |

**Helpers:** `src/lib/employeeIdentity.ts`

| Function | Use case |
|----------|----------|
| `formatEmployeeIdentityLine()` | Single-line display |
| `formatEmployeeIdentityCompact()` | Registers, exports |
| `formatEmployeeAiContext()` | AI, alerts, audit |
| `employeeMatchesSearch()` | Client-side filtering |
| `previewEmployeeNumber()` | Settings preview |

---

## 6. Document Integration Report

| Document | Employee Number |
|----------|----------------|
| Payslip PDF/HTML | ✅ Prominent header |
| Payslip email HTML | ✅ Employee No field |
| Payroll register CSV/HTML | ✅ Column |
| Payroll reports CSV | ✅ Column |
| Bank payment file | ✅ Reference includes compact identity |

---

## 7. Search Integration Report

**Global search** (`global-search` edge function):

Searches: `employee_number`, `first_name`, `last_name`, `id_number` (passport/ID), `email`, `phone`, `department`

Result format: title = employee number, subtitle = name · department · email

**Employee list:** `employeeMatchesSearch()` — same field coverage client-side

---

## 8. AI Integration Report

`payrollIntelligence.ts` now uses `formatEmployeeAiContext()` for:
- Duplicate email/name detection messages
- Workspace exception list (missing salary, email, bank)
- Payroll readiness AI insights

Format: `EMP-000245 — Sarah Mokoena · Finance`

---

## 9. Verification Report

| Gate | Result |
|------|--------|
| Employee Number Engine preserved | ✅ Same RPC, same immutability |
| No duplicate numbers | ✅ Unique index unchanged |
| Multi-company safe | ✅ Per-company settings |
| Concurrent generation safe | ✅ `FOR UPDATE` lock |
| Search updated | ✅ |
| Payroll / claims / assets updated | ✅ |
| Reports / PDFs / emails updated | ✅ |
| Settings UI | ✅ |
| Audit enhanced | ✅ UUID + number + name + dept |
| `npm run build` | ✅ Pass |
| `npx tsc --noEmit` | ✅ Pass |

---

## 10. Production Readiness Report

### Deploy steps

1. Apply migrations (in order):
   - `20260703140000_employee_number_engine.sql`
   - `20260703150000_employee_numbering_policy.sql`
2. Redeploy edge functions: `employees`, `global-search`, `payroll`, `expense-claims`, `fixed-assets`, `send-payslip-email`
3. Verify Settings → Payroll → Employee Numbering shows policy + preview
4. Create test employee — confirm number matches policy
5. Search `EMP-000001` in ⌘K — confirm instant match

### Risk assessment

| Risk | Mitigation |
|------|------------|
| Pattern change confusion | UI warns existing numbers unchanged |
| Import invalid format | `validate_employee_number_format` RPC |
| Token typo in pattern | `{SEQ}` required validation on save |

### Remaining (future phases)

- Employee CSV import UI (backend `IMPORT_EMPLOYEES` ready)
- Time tracking employee assignment (when schema supports it)
- Chat `@employee` mentions with number resolution
- Audit log viewer: dedicated employee number filter UI

---

**The Employee Number is now the canonical business identifier across AdminLess Fin.**
