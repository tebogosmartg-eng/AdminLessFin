# 06 — Risk Assessment

**Pack:** Financial Close Implementation Approval  
**Version:** 6.1.1  
**Date:** 2026-07-13  
**Board:** Independent Principal Enterprise Release Board  
**Verdict:** RISKS ACCEPTABLE WITH CONTROLS  

---

## 1. Purpose

Assess risks of introducing EFCP under the phased plan and prove residual risk to Operational Reporting is **acceptable**.

---

## 2. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Residual |
|----|------|------------|--------|------------|----------|
| R1 | Accidental change to `/financial-statements` behaviour | M | H | Protected route list; PR checklist; Phase 1 “no UI” gate | L |
| R2 | Live reports switched to sealed snapshots | L | H | Architecture + Roadmap forbid; code review rule | L |
| R3 | Duplicated balance calculations in Close | M | H | Consume Accounting RPCs / seals only; no parallel GL | L |
| R4 | Sidebar exposes Close prematurely | M | M | `efcp.nav_sidebar` default OFF; Phase 4 board gate | L |
| R5 | Flag leak enables Close APIs for all tenants | M | M | Default OFF; allowlist; Edge guards | L |
| R6 | Route collision `/financial-close` vs statements | L | M | Distinct paths; never alias | L |
| R7 | Performance load from dual pipelines | M | M | Snapshot pipeline off until Phase 3; scale tests | M |
| R8 | User confusion (two “statements”) | H | M | Labelling strategy; training at Phase 4 | M |
| R9 | Incomplete Close mistaken for published FS | M | H | Publication gates; no publish without freeze | L |
| R10 | Rollback fails to restore ops | L | H | Ops path has zero Close dependency; drill flag OFF | L |
| R11 | Scope creep redesigns Reports engine | M | H | Explicit forbid in this approval | L |
| R12 | Accounting posting from Close UI | L | H | Audit Adj posts only via Accounting services | L |

---

## 3. Operational Reporting Risk Conclusion

| Question | Answer |
|----------|--------|
| Can EFCP break live Reports if flags OFF? | **No** — if Phase 1 coupling rule held |
| Can Phase 4 nav expose break Reports? | **No** — additive item only |
| Worst-case Close failure | Disable `efcp.*`; Operational Reports continue |

---

## 4. Go / No-Go on Risk

**GO** — Residual risks are acceptable provided phase gates and flag defaults are enforced.

**NO-GO conditions (revoke implementation execution):**

- Any Phase proposes deletion/redesign of operational FS  
- Any Phase proposes moving Accounting calculations into Close/EFRE  
- Operational regression suite red without fix before next phase  

---

## 5. Certification

Risk Assessment is **APPROVED** with controls above.
