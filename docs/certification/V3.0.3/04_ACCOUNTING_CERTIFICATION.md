# 4. Accounting Certification Report (V3.0.3)

**Date:** 2026-07-05  
**Phase:** 4 — Accounting  
**Result:** **PARTIAL FAIL**

---

## Journal Model (Observed in `payroll/index.ts` FINALIZE_RUN)

| Line | Account | Type | Amount |
|------|---------|------|--------|
| Wages | User-selected expense | Debit | Σ total_earnings |
| Bank | User-selected asset | Credit | Σ net_pay |
| Liabilities | User-selected liability | Credit | Σ total_deductions (if > 0) |

**Balance proof:** `totalWages = totalNetPay + totalDeductions` by construction → Debit = Credit.

---

## Required vs Actual

| Required Account | Present | Evidence |
|------------------|---------|----------|
| Salary Expense | ✅ | Wages debit line |
| Employer UIF | ❌ | Consolidated into liability bucket |
| Employer SDL | ❌ | SDL in payslip items; not separate JE line |
| PAYE Liability | ❌ | Consolidated |
| UIF Liability | ❌ | Consolidated |
| SDL Liability | ❌ | Consolidated |
| Retirement Liability | ❌ | Consolidated |
| Medical Liability | ❌ | Consolidated |
| Net Salary Payable | ✅ | Bank credit |
| Bank Clearing | ✅ | Bank credit |

**Note:** `statutoryPayrollEngine/pipeline.ts` defines granular `buildJournalLines()` with per-statutory accounts, but **FINALIZE_RUN does not use it**.

---

## Rollback Evidence (Code)

- JE create failure → run reverted to `draft`
- JE items failure → `deleteJournalEntry` + revert
- Status update failure → journal deleted if newly created

---

## Not Verified

- Trial Balance reconciliation (no live GL)
- General Ledger drill-down
- Financial Reports tie-out
- Orphan/duplicate journal detection at runtime

**Phase 4 Verdict:** **PARTIAL FAIL** — balances but does not meet granular account requirements.
