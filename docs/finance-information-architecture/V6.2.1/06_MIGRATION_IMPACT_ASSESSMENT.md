# 06 — Migration Impact Assessment

**Version:** 6.2.1  
**Board:** Independent Principal Finance Architecture Board  
**Verdict:** CERTIFIED (impact assessed — no code in this pack)  

---

## 1. Purpose

Assess impact of the navigation refinement on certified packs and future implementation — **without implementing**.

---

## 2. Impact on Prior Certifications

| Pack | Impact |
|------|--------|
| V6.2.0 FIA | **Refined** — live FS five move from Operational Reports to Accounting Reports |
| V6.0.0 EFRE / Migration dual-track | **Preserved** — live vs statutory remains; live home clarified as Accounting |
| V6.0.1 Snapshots | **Unaffected** |
| V6.1.0 EFCP | **Unaffected** — still under Financial Statements Workspace |
| V6.1.1 Implementation Approval | **Binding for execution** — protected routes (`/financial-statements`, `/reports`) still must not break; nav group ownership may change via labelled migration without deleting paths |

---

## 3. Product Surface Impact (future implementation)

| Surface today | Target ownership | Implementation note (when approved) |
|---------------|------------------|-------------------------------------|
| `/financial-statements` live page | Accounting Reports | Keep path (compat); move nav item under Accounting; relabel “Live…” |
| `/reports` hub | Operational Reporting (analytics) | Remove live FS as conceptual home; keep other reports |
| Comparative P&L/B/S | Accounting Reports (operational comparative) | Prefer Accounting Reports; not statutory |
| General Ledger | Accounting Reports | Already conceptually inquiry — align nav under Accounting |
| Future `/financial-close` | Financial Statements | Per V6.1.1 — unchanged by this decision |

---

## 4. Risk of Navigation Change

| Risk | Mitigation |
|------|------------|
| User habit for Reports → FS | Label + redirect optional; Command Menu synonyms; V6.1.1 no broken routes |
| Temporary dual nav during migrate | Forbidden as permanent; transitional redirect ≤ one release then single home |
| V6.2.0 docs conflict | This pack **supersedes** live-FS-under-Reports assignment |

---

## 5. What Does Not Change

- Accounting remains SoT for balances  
- Operational live behaviour remains real-time  
- Statutory Close/EFRE pipeline unchanged  
- Assets & Loans independence unchanged  
- No calculation ownership moves  

---

## 6. Certification

Migration Impact Assessment is **CERTIFIED**. Execution remains under separate Implementation Approvals citing V6.2.1.
