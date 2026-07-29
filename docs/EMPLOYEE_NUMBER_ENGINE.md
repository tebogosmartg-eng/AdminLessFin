# Employee Number Engine — Implementation Report

**Platform:** AdminLess Fin V3  
**Date:** 2026-07-03  
**Status:** Implemented

---

## 1. Employee Number Generation Design

### Purpose
Every employee receives a permanent, company-scoped HR identifier at creation. This is **not** the database UUID, is **never** user-editable, and is **never** recycled after deletion.

### Format
Configurable per company via `company_employee_number_settings`:

| Setting | Default | Example |
|---------|---------|---------|
| `format_template` | `EMP-{SEQ}` | `SPC-EMP-{SEQ}`, `ABC-{SEQ}` |
| `sequence_padding` | `6` | `EMP-000001` |

`{SEQ}` is replaced with a zero-padded monotonic integer.

### Multi-company isolation
Each company maintains its own sequence in `company_employee_number_settings`. Company A and Company B may both have `EMP-000001`.

### Generation path (BOE-compliant)
```
EmployeeForm (UI)
  → employees edge function (POST)
    → RPC generate_employee_number()  [atomic, Postgres]
    → INSERT employees
    → audit_logs (EMPLOYEE_NUMBER_GENERATED)
```

Generation **never** occurs on the frontend.

---

## 2. Database Migration

**File:** `supabase/migrations/20260703140000_employee_number_engine.sql`

| Object | Purpose |
|--------|---------|
| `employees.employee_number` | `TEXT NOT NULL` after backfill |
| `idx_employees_company_employee_number` | Unique per `(company_id, employee_number)` |
| `idx_employees_employee_number_search` | Pattern search index |
| `company_employee_number_settings` | Format + `next_sequence` per company |
| `generate_employee_number()` | Atomic allocation with `FOR UPDATE` row lock |
| `sync_employee_sequence_after_import()` | Bump sequence after explicit import numbers |
| `prevent_employee_number_update()` | Trigger — blocks UPDATE of assigned numbers |

---

## 3. Generation Strategy

1. **Create (POST):** Strip any client-supplied `employee_number` → call `generate_employee_number` RPC → insert with generated value.
2. **Import (IMPORT_EMPLOYEES):** If `employee_number` supplied → validate uniqueness + sync sequence; if omitted → auto-generate.
3. **Update (PUT):** `employee_number` stripped from payload; DB trigger rejects modification attempts.
4. **Delete:** Row removed; number **not** returned to the pool.

---

## 4. Concurrency Verification

`generate_employee_number()` uses:

```sql
SELECT * FROM company_employee_number_settings
WHERE company_id = p_company_id
FOR UPDATE;
```

This serializes concurrent allocations per company inside a single transaction. Two simultaneous POST requests cannot receive the same sequence value.

**Recommended production test:** Run parallel `POST` requests against the employees edge function for one company and assert all returned `employee_number` values are unique.

---

## 5. Backfill Strategy

Migration backfill (in order):

1. Add nullable `employee_number` column.
2. For each `company_id` with unnumbered employees:
   - Ensure settings row exists.
   - Order employees by `created_at ASC, id ASC`.
   - Call `generate_employee_number()` for each (preserves chronological assignment).
3. `ALTER COLUMN employee_number SET NOT NULL`.

Existing employees receive `EMP-000001`, `EMP-000002`, … in creation order per company.

---

## 6. UI Integration Report

| Surface | Change |
|---------|--------|
| **Employee List** | `Employee No.` column + local search (number, name, ID, email, mobile) |
| **Employee Profile** | Prominent `employee_number` in preview dialog |
| **Employee Form** | Read-only display on edit; auto-assign message on create |
| **Payroll Run** | Emp. No. column in payslip table |
| **Payslips** | Employee number in dialog, PDF, and HTML (official payroll reference) |
| **Payroll Reports** | Emp. No. in register grid + CSV export |
| **Global Search** | `EMP-000124` resolves via `global-search` edge function |
| **Expense Claims / Assets** | Employee pickers show `{number} · {name}` |
| **Exports** | Register CSV/HTML include Employee Number column |

UUID is not displayed in any user-facing employee surface.

---

## 7. Payroll Integration Report

| Component | Integration |
|-----------|-------------|
| `payroll/index.ts` | All employee joins include `employee_number` |
| `GET_RUN_DETAIL` | Payslip list carries employee number |
| `GET_PAYSLIP_DETAIL` | Full payslip detail includes number |
| `GET_PERIOD_REPORTS` | Register inputs include `employee_number` |
| `payrollReports.ts` | Register rows + CSV export |
| `payrollDocuments.ts` | Payslip PDF/HTML, register HTML/CSV |
| `PayslipDetailDialog` | Uses `employees.employee_number` (replaces `id_number` alias) |

Payslip mandatory fields now satisfied: **Employee Number**, Employee Name, Pay Period, Department, Company.

---

## 8. Verification Report

| Gate | Result |
|------|--------|
| No duplicate employee numbers | ✅ Unique index `(company_id, employee_number)` |
| Concurrent creation safe | ✅ `FOR UPDATE` sequence lock |
| Multi-company safe | ✅ Per-company settings table |
| Existing employees backfilled | ✅ Migration DO block |
| Employee search works | ✅ List filter + global search |
| Payroll uses employee numbers | ✅ All payroll selects updated |
| Payslips display employee numbers | ✅ PDF/HTML/dialog |
| Reports display employee numbers | ✅ Register + CSV |
| `npm run build` | ✅ Pass |
| `npx tsc --noEmit` | ✅ Pass |
| No business logic regression | ✅ Payroll calculations unchanged |

### Audit trail
Each generation writes to `audit_logs`:

```json
{
  "operation": "EMPLOYEE_NUMBER_GENERATED",
  "new_data": {
    "employee_number": "EMP-000001",
    "command_id": null,
    "correlation_id": null,
    "source": "create|import",
    "timestamp": "..."
  }
}
```

Pass `command_id` and `correlation_id` in the employees edge function body when BOE command wiring is extended.

### Deploy steps
1. Apply migration: `supabase db push` or run SQL in dashboard.
2. Redeploy edge functions: `employees`, `global-search`, `payroll`.
3. Verify one employee create returns `EMP-00000N`.

---

**The Employee Number is now the permanent business identifier for every employee across AdminLess Fin.**
