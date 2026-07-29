# 04 — Production Readiness Assessment

**Pack:** Financial Statements Internal Preview  
**Version:** 6.5.0  
**Assessment type:** Controlled internal exposure — **not** public GA  
**Verdict:** READY FOR INTERNAL PREVIEW · NOT READY FOR PUBLIC PRODUCTION

---

## 1. Scope decision

| Question | Decision |
|----------|----------|
| Release to all tenants in production UI by default? | **No** |
| Release to System Admins / Finance Managers / allowlisted Accountants & Testers when flags ON? | **Yes** |
| Allow Publication / XBRL / AI? | **No** — under implementation |
| Keep operational Accounting & Reports paths? | **Yes** — mandatory |

---

## 2. Readiness scorecard

| Dimension | Internal Preview | Public Production |
|-----------|------------------|-------------------|
| Architecture freeze | ✅ | ✅ |
| Foundation → Review Workflow | ✅ | ✅ |
| Snapshot-only statutory calc | ✅ | ✅ |
| Permission matrix | ✅ | Needs GA role model review |
| Feature-flag kill-switch | ✅ | ✅ |
| Sidebar discovery | ✅ (flagged) | Requires public release board |
| Publication engine | ❌ deferred | Required for GA |
| XBRL | ❌ deferred | Required only if filing scope |
| AI Assistance | ❌ deferred | Optional post-GA |
| Broad tenant onboarding | ❌ | Required for GA |
| Support runbooks / SLA | Partial (internal) | Required for GA |

---

## 3. Go / No-Go

| Audience | Decision |
|----------|----------|
| Internal users (approved personas) | **GO** |
| External / general production users | **NO-GO** until Publication (and any mandated XBRL/AI) clear a future board |

---

## 4. Operating constraints

1. Defaults remain **OFF** in shared production configs until an environment owner explicitly enables Internal Preview flags.  
2. Accountants and Internal Testers **must** be listed in `VITE_EFS_ALLOWLIST` when they hold `member` role.  
3. Do not enable deferred env keys expecting UI unlock — code forces Publication / XBRL / AI OFF.  
4. Statutory statements must never be rewired to live GL; preserve Financial Facts Adapter.  
5. Rollback SLA: flip `VITE_EFS_NAV_SIDEBAR` (and optionally module/workspace) within minutes.

---

## 5. Exit criteria for a future public release (not this pack)

- Publication platform certified  
- XBRL (if in scope) certified  
- AI Assistance (if in scope) certified or explicitly out-of-scope  
- GA permission model without rely-only allowlist for Accountants  
- Full suite operational regression green under default-ON flags  

---

## 6. Board declaration

**INTERNAL RELEASE APPROVED**

The Financial Statements module is approved for controlled internal use while Publication, XBRL, and AI remain under implementation.
