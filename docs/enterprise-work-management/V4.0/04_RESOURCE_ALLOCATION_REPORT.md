# 04 — Resource Allocation Report

**Module:** Enterprise Work Management — Resource Engine  
**Version:** 4.0  
**Date:** 2026-07-13  
**Board verdict:** APPROVED  

---

## 1. Purpose

Resource Allocation matches **demand** (projects, tasks, milestones) to **supply** (people, skills, availability) across time.

Supports:

- Skills  
- Roles  
- Certifications  
- Availability  
- Project Assignment  
- Future Allocation  
- Bench Capacity  
- Succession signals (read-only to HR)

---

## 2. Isolation

| Owns | Reads | Does not own |
|------|-------|--------------|
| Allocations & bookings | Employees (identity frozen) | Employee number engine |
| Skill/role catalogues (company) | Certifications from HR | HR master data mutation |
| Bench definitions | Capacity facts | Payroll assignment |
| Soft/hard booking rules | Project hierarchy | Accounting |

---

## 3. Resource Model

```
Employee
  ├── Roles (primary + secondary)
  ├── Skills (level, recency)
  ├── Certifications (expiry)
  ├── Capacity profile
  └── Allocations[]
        ├── Project / Task / Milestone
        ├── Window (start–end)
        ├── Effort (hours or %)
        ├── Hard | Soft
        └── Status (proposed → confirmed → active → completed)
```

---

## 4. Allocation Types

| Type | Meaning | Capacity impact |
|------|---------|-----------------|
| Hard | Confirmed commitment | Counts as Booked |
| Soft | Tentative | Counts as Planned (configurable) |
| Named | Specific employee | Direct booking |
| Role-based | Need “Senior Engineer × 2” | Demand until filled |
| Bench | Unassigned available talent | Available − soft demand |

---

## 5. Matching Logic (Deterministic)

Priority for filling role-based demand:

1. Required certifications valid  
2. Required skills ≥ level  
3. Remaining capacity in window  
4. Existing project familiarity (optional weight)  
5. Cost rate band (operational)  

AI may later **suggest** matches via `ai.work.resource_match`; engine remains deterministic without AI.

---

## 6. Bench & Succession

| Concept | Definition |
|---------|------------|
| Bench Capacity | Available − Hard booked (optionally − Soft) |
| Hot bench | High-skill idle above threshold |
| Succession signal | Single-point skill coverage risk (one certified person) |

Signals emit BOE events for managers; HR owns career actions.

---

## 7. Workflow

```
Proposed → Confirmed → Active → Completed
                ↘ Rejected / Cancelled
```

Confirmed allocations update Capacity Engine bookings. Changes after time lock require compensating allocation + audit.

---

## 8. Multi-Project / Multi-Company

- Allocations always scoped by `company_id`  
- Cross-company secondment: explicit future phase (out of V4.0 core); V4.0 supports multi-project within one company  

---

## 9. Board Decision

**APPROVED.** Resource Engine is the sole authority for bookings that drive Capacity “Booked” totals.
