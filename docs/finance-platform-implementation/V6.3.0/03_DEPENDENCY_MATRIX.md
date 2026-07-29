# 03 — Dependency Matrix

**Board:** Independent Principal Enterprise Implementation Board  
**Version:** 6.3.0  
**Verdict:** APPROVED  

---

## 1. Phase Dependencies

| Phase | Depends on | Blocks |
|-------|------------|--------|
| 1 | V6.2.1 nav cert; existing Accounting RPCs | Phase 2 not required for live move |
| 2 | Phase 1 exit (flags exist); V6.1.0 EFCP arch | Phase 3 UI depth |
| 3 | Phase 2 workspace; V6.0.1 Snapshot; V6.0.0 EFRE | Phase 4 expose |
| 4 | Phase 3 exit + certification evidence | Flag removal |

---

## 2. Technical Dependency Matrix

| Component | Depends on | Must not depend on |
|-----------|------------|--------------------|
| Accounting Reports (live) | Accounting balance/activity RPCs | Reporting Snapshots; EFRE Mapping |
| Financial Statements module | Feature flags | Live GL as publish source |
| Reporting Snapshot seal | Accounting period facts / RPCs | Report redesign |
| Working Papers | Snapshot Version IDs (when finalized) | Operational Reports |
| Lead Schedules | Accounting/Snapshot facts | Second GL |
| EFRE Statements/Disclosures | Sealed Snapshot + Mapping | Live `/financial-statements` data path |
| Publication | Validation + Review + Snapshot | Reports enterprise packs |
| Executive/Operational Reports | Domain sources | Accounting Reports live five as “Reports product” |
| Assets & Loans | Existing module | FS Phase work |

---

## 3. Team Dependencies

| Workstream | Owner team | Input from | Output to |
|------------|------------|------------|-----------|
| Nav / Accounting Reports move | Frontend + Platform | V6.2.1 | All users |
| Flag system | Platform | V6.1.1 / V6.3.0 | All FS work |
| Snapshot services | Backend | Accounting | Close / EFRE |
| Close WP/Leads | Full-stack | Snapshot | Phase 3 gate |
| EFRE assembly | Full-stack | Snapshot + Mapping | Publication |
| QA regression | QA | All phases | Phase exits |

---

## 4. External / Pillar Dependencies

| Pillar | Dependency type |
|--------|-----------------|
| Accounting | Hard — fact authority |
| EGCP | Soft — DoA when implemented; do not block Phases 1–3 |
| V3.6 Reporting Platform | Soft — export registry for enterprise Reports only |
| EWM | Soft — Work Management Reports under Reports |

---

## 5. Certification

Dependency Matrix is **APPROVED**.
