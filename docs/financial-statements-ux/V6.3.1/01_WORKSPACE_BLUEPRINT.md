# 01 — Financial Statements Workspace Blueprint

**Version:** 6.3.1  
**Board:** Independent Principal Enterprise User Experience Board  
**Verdict:** CERTIFIED  

---

## 1. Business Purpose

The Financial Statements Workspace is the **sole engagement environment** for preparing statutory Annual Financial Statements (and equivalent period packs). Users work inside a single reporting engagement — not across disconnected AdminLess Fin modules for the same statutory outcome.

Live TB/IS/BS/CF remain under **Accounting → Accounting Reports** (unchanged). Enterprise analytics remain under **Reports** (unchanged).

---

## 2. Engagement Metaphor

| Metaphor element | Workspace meaning |
|------------------|-------------------|
| Engagement / Workspace | One Reporting Entity + Reporting Period (Close Workspace) |
| Job bag | Working Papers, Lead Schedules, tasks |
| Draft accounts | Statements / Notes / Disclosures from Snapshot |
| Review file | Validation, Manager/Partner Review |
| Signed report | Publication |

---

## 3. Workspace Overview Dashboard (certified widgets)

Every open workspace **shall** present an Overview Dashboard containing:

| Widget | Purpose |
|--------|---------|
| **Reporting Period** | Period label, bounds, company/entity |
| **Framework** | Bound Framework Pack (IFRS, IFRS SME, GRAP, MCS, IPSAS, …) |
| **Snapshot Status** | draft / certified / frozen / publication-bound |
| **Progress** | % or stage of engagement workflow complete |
| **Outstanding Tasks** | Open Close tasks / checklist items |
| **Validation Summary** | Pass / fail / advisory counts |
| **Review Status** | Manager / Partner state |
| **Publication Status** | Not ready / ready / published / restated |
| **Recent Activity** | Audit-friendly event stream for this engagement |

Dashboard is **orientation**, not a second home for Accounting or Reports.

---

## 4. Workspace Structure (logical)

```
Financial Statements Workspace (engagement)
├── Overview Dashboard          ← always first landing when opening workspace
├── Setup
│     ├── Reporting Period
│     ├── Framework binding
│     └── Snapshot (create / status)
├── Close & Evidence            ← EFCP
│     ├── Checklist / Tasks
│     ├── Working Papers
│     ├── Lead Schedules
│     └── Reconciliations / Issues (as needed)
├── Financial Report            ← EFRE (snapshot-fed only)
│     ├── Statements
│     ├── Notes
│     └── Disclosures
├── Quality
│     ├── Validation
│     └── Resolve issues
├── Review
│     ├── Manager Review
│     └── Partner Review
└── Publication
      ├── Publish readiness
      └── Published packs / history
```

---

## 5. Hard UX Rules

| Rule | Mandate |
|------|---------|
| Workspace-first | User enters an engagement; stages are contextual within it |
| Snapshot-only for statements | Statements/Notes/Disclosures never bind live GL |
| No duplicate nav | Do not re-link live Accounting Reports or enterprise Reports as statutory homes |
| Accounting unchanged | No redirect of journal/CoA workflows into this workspace |
| Reports unchanged | No absorption of Operational/Executive packs |
| Multi-framework | Framework selector in Setup; engines refuse unbound packs |
| Multi-company | Workspace scoped by `company_id` (+ reporting entity) |

---

## 6. Primary Personas in Workspace

| Persona | Focus |
|---------|-------|
| Accountant / Preparer | Tasks, WPs, Leads, draft statements |
| Financial Manager | Progress, validation, manager review |
| CFO / Partner | Partner review, publication approve |
| Auditor (read) | WPs, leads, snapshot trail, published packs |

---

## 7. Certification

Financial Statements Workspace Blueprint is **CERTIFIED**.
