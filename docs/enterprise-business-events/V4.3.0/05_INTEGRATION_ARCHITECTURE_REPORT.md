# 05 — Integration Architecture Report

**Version:** 4.3.0  
**Status:** CERTIFIED  

---

## 1. Target integration model

```
UI / API Command
    → Domain Edge Function (SoT mutation)  [Edge Platform V4.2.1]
    → Completed BusinessEvent (fact)
    → Event Dispatcher
    → N Independent Consumers (Activity, Audit, Notify, AI, Reporting, …)
```

Modules **do not** call each other for cross-cutting side effects when a certified event exists. They **publish once** and **consume**.

---

## 2. Separation of planes

| Plane | Responsibility |
|-------|----------------|
| Command | Intent (`BusinessCommand`) |
| Domain execution | Edge function + DB SoT |
| Event | Completed fact (`BusinessEvent`) |
| Consumer | Side effects / projections / advise |
| Edge Platform | CORS/auth/correlation (V4.2.1) |

---

## 3. Dependency rules

| Allowed | Forbidden |
|---------|-----------|
| Sales → publishes `invoice.created` → Accounting consumes for journal path | EWM posts `journal.posted` |
| EWM → `work.time_locked` → Payroll adapter consumes | EWM runs statutory engines |
| Approvals → `approval.granted` → subject domain resumes | AI grants approval |
| Inventory → `inventory.issue_posted` → EWM aligns consumption | EWM owns stock qty |
| AI consumes `work.budget_at_risk` | AI polls payroll tables as SoT |

---

## 4. Circular dependency scan

| Path | Result |
|------|--------|
| work → payroll adapter → payroll.* → work | No cycle (adapter is one-way input) |
| invoice → journal → invoice | No cycle (journal does not republish invoice.created) |
| approval → domain → approval | Gate closes; domain does not re-request same approvalId |
| ai → domain mutate → ai | **Forbidden** by catalogue |

**Result: PASS — no certified circular publish dependencies.**

---

## 5. Async readiness

| Capability | Certification |
|------------|---------------|
| At-least-once delivery assumption | Required |
| Idempotent consumers | Required (keys in catalogue) |
| Isolated subscriber failure | Required (dispatcher contract) |
| Broker/queue technology | Out of scope (this board) |
| Future async workers | Ready — consume same Event IDs |

---

## 6. Multi-company & security

- Every event includes `companyId`.  
- Consumers must filter by `companyId`.  
- Cross-company fan-out mutations are forbidden.  
- Security classification per event (Internal / Confidential / Restricted).

---

## 7. Relation to current runtime

BOE registry + subscribers exist as **contract/orchestration layer** (`src/lib/boe/**`). Full fleet execution-through-BOE remains an **implementation programme** outside this certification. This board certifies **what** events mean and **who** owns them — not that every mutation already publishes today.
