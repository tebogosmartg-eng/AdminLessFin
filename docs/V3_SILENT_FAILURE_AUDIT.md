# AdminLess Fin V3 — Silent Failure Audit

**Programme:** Platform Hardening — Silent Failure Elimination  
**Date:** 2026-07-05  
**Phase:** 1 (Audit only — evidence collected before modifications)

---

## Executive Summary

| Category | Count | Highest Severity |
|----------|-------|------------------|
| Swallowing catch blocks | ~18 | High |
| Ignored Supabase errors | ~12 | Critical |
| Ignored fetch/invoke failures | ~28 | High |
| `return null` as error signaling | ~10 business-relevant | Medium |
| Generic error messages | ~65+ | Medium |
| Subscriber/command architectural gaps | 3 | Critical |
| Edge functions unstructured errors | ~53/54 | Medium |
| Void promise / unhandled rejection | ~8 | High |

**Total catalogued:** ~120+ findings

---

## Critical Findings (P0)

### 1. Command Dispatcher always returned `success: true`

**File:** `src/lib/boe/dispatchers/commandDispatcher.ts`  
**Evidence:** No failure branch; `success: true` hardcoded on all paths.  
**Impact:** Callers could not distinguish command failure from success without catching thrown exceptions.

### 2. Event Dispatcher had no subscriber isolation

**File:** `src/lib/boe/dispatchers/eventDispatcher.ts`  
**Evidence:** Sequential `await subscriber.onEvent(event)` with no try/catch.  
**Impact:** One failing subscriber (Activity, Dashboard, AI, Notifications, Calendar, Audit, Documents) could abort the entire command after the business mutation succeeded.

### 3. Payroll bank batch status update swallowed DB errors

**File:** `supabase/functions/payroll/index.ts` lines 1113–1122  
**Evidence:**

```typescript
data = statusUpdated ?? { bank_batch: bankBatch, persisted: !statusUpdateError };
error = null; // statusUpdateError ignored
```

**Impact:** HTTP 200 returned while DB update failed; UI showed success.

### 4. AuthContext swallowed session fetch failures

**File:** `src/contexts/AuthContext.tsx` lines 76–78  
**Evidence:** `catch` only logged to console; user state left stale.  
**Impact:** App appeared logged-in with empty profile/companies.

---

## High Findings (P1)

| File | Issue |
|------|-------|
| `src/lib/queries.ts` | 19 query functions checked transport `error` but not in-body `{ error }` |
| `src/pages/PayrollRunDetail.tsx` | `handleDownloadBankFile` / `handleDownloadAllPayslips` — no try/catch |
| `src/pages/PayrollRunDetail.tsx` | Never checked `persisted: false` from bank batch response |
| `supabase/functions/payroll/index.ts` | Audit insert failures swallowed (lines 134–136) |
| `src/lib/queries.ts` | Payroll period reports skip failed runs with `continue` |

---

## Swallowing Catch Blocks (Evidence)

| File | Lines | Severity |
|------|-------|----------|
| `src/contexts/AuthContext.tsx` | 76–78 | High |
| `src/lib/queries.ts` | 293–295, 308–310 | Medium (best-effort enrichment) |
| `src/lib/queries.ts` | 355–357, 374–376 | High (report omission) |
| `supabase/functions/payroll/index.ts` | 134–136 | High |
| `supabase/functions/send-payslip-email/index.ts` | 23–25 | High |
| `supabase/functions/_shared/employeeNumberEngine.ts` | 51–55 | Medium |
| `supabase/functions/_shared/employeeTimelineEngine.ts` | 69–74 | Medium |
| `src/components/SidebarNav.tsx` | 63–65 | Low (intentional prefetch) |

---

## Generic Error Messages

- **Edge functions (~53):** `{ error: error.message }` only — no code, category, recovery, correlationId
- **Reference implementation:** `supabase/functions/payroll/index.ts` — structured `{ error, stage, code, recovery }`
- **Frontend:** `ErrorBoundary.tsx` — "Oops! Something went wrong."

---

## Remediation Status

All P0/P1 items addressed in V3 reliability sprint. See companion reports for implementation evidence.
