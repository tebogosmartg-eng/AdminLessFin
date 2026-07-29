# 02 — User Journey Architecture

**Version:** 6.3.1  
**Board:** Independent Principal Enterprise User Experience Board  
**Verdict:** CERTIFIED  

---

## 1. Purpose

Certify every statutory FS user journey with Business Goal, Primary User, Starting/Ending points, Navigation Flow, Dependencies, Approval Gates, Expected Outputs, Audit Considerations, and Future AI Opportunities.

All journeys occur inside the **Financial Statements Workspace** unless noted (create flow may start from module landing).

---

## J1 — Create Annual Financial Statements

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Open a new statutory reporting engagement for a year (or period) |
| **Primary User** | Financial Manager / Controller |
| **Starting Point** | Financial Statements module landing (or “New workspace”) |
| **Ending Point** | Workspace Overview Dashboard with period selected, status = in progress |
| **Navigation Flow** | Module → Create → Select Entity/Company → Select Reporting Period → Confirm → Overview |
| **Dependencies** | Company membership; Accounting period/books available; flags (Phase 2+) |
| **Approval Gates** | Optional DoA to open period engagement |
| **Expected Outputs** | Close Workspace / Reporting Workspace identity |
| **Audit Considerations** | Actor, timestamp, entity, period recorded |
| **Future AI Opportunities** | Suggest period/framework from prior year engagement |

---

## J2 — Open Existing Workspace

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Resume an engagement |
| **Primary User** | Preparer / Manager / Partner / Auditor |
| **Starting Point** | Financial Statements → Workspace list |
| **Ending Point** | Overview Dashboard of selected workspace |
| **Navigation Flow** | List → filter by period/status → Open → Overview |
| **Dependencies** | Entitlement to company/workspace |
| **Approval Gates** | None beyond access control |
| **Expected Outputs** | Context loaded (period, framework, snapshot status) |
| **Audit Considerations** | Access may be logged |
| **Future AI Opportunities** | Rank workspaces by risk / outstanding tasks |

---

## J3 — Select Reporting Framework

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Bind Framework Pack (IFRS, IFRS SME, GRAP, MCS, IPSAS, …) |
| **Primary User** | Financial Manager |
| **Starting Point** | Overview or Setup → Framework |
| **Ending Point** | Framework bound; dashboard shows framework |
| **Navigation Flow** | Overview → Setup → Framework → Select version → Save |
| **Dependencies** | Platform Framework Packs; period dates |
| **Approval Gates** | Change after snapshot certify may require approval / new version policy |
| **Expected Outputs** | FrameworkBinding |
| **Audit Considerations** | Prior binding retained in history |
| **Future AI Opportunities** | Recommend pack from entity type / jurisdiction |

---

## J4 — Create Reporting Snapshot

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Seal Accounting facts into a certified Reporting Snapshot |
| **Primary User** | Preparer / Controller |
| **Starting Point** | Setup → Snapshot (after sufficient Close readiness or explicit create) |
| **Ending Point** | Snapshot Status = sealed/certified (or draft ready for certify) |
| **Navigation Flow** | Overview → Snapshot → Create/Extract → Review extract summary → Certify |
| **Dependencies** | Accounting balances/activity; Close readiness guidance; V6.0.1 rules |
| **Approval Gates** | Certification attributed; freeze later in pipeline |
| **Expected Outputs** | Fact Snapshot / Snapshot Version |
| **Audit Considerations** | Source RPC refs, hash, actor, time |
| **Future AI Opportunities** | Flag unusual YoY movements at seal |

---

## J5 — Prepare Working Papers

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Document evidence for assertions |
| **Primary User** | Accountant / Preparer |
| **Starting Point** | Close & Evidence → Working Papers |
| **Ending Point** | WP submitted / finalized (linked to snapshot when required) |
| **Navigation Flow** | Overview → Working Papers → Create/Open → Edit → Submit → (Review) |
| **Dependencies** | Tasks/checklist; Snapshot for finalize-on-amounts |
| **Approval Gates** | Manager clear of review notes on critical WPs |
| **Expected Outputs** | Working Paper versions |
| **Audit Considerations** | Authorship, hash, snapshot link |
| **Future AI Opportunities** | Draft WP narrative from lead/schedule data |

---

## J6 — Review Lead Schedules

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Confirm control-account roll-forwards tie to books/snapshot |
| **Primary User** | Preparer then Manager |
| **Starting Point** | Close & Evidence → Lead Schedules |
| **Ending Point** | Lead reviewed / locked to snapshot |
| **Navigation Flow** | Overview → Lead Schedules → Select control → Review lines → Sign / Lock |
| **Dependencies** | Snapshot or live extract for prepare; lock requires snapshot |
| **Approval Gates** | Reviewer sign-off before lock |
| **Expected Outputs** | Locked Lead Schedule |
| **Audit Considerations** | Variance explanations; source refs |
| **Future AI Opportunities** | Auto-propose roll-forward from journals |

---

## J7 — Prepare Statements

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Assemble framework primary statements from sealed snapshot |
| **Primary User** | Preparer / Reporting Manager |
| **Starting Point** | Financial Report → Statements |
| **Ending Point** | Statement Instances generated for framework |
| **Navigation Flow** | Overview (snapshot frozen or certified) → Statements → Generate/Refresh → Review lines |
| **Dependencies** | Snapshot + Framework + Mapping |
| **Approval Gates** | None until Validation/Review; must not use live GL |
| **Expected Outputs** | Statement Instances |
| **Audit Considerations** | Provenance to snapshot + mapping versions |
| **Future AI Opportunities** | Explain large movements vs comparative snapshot |

---

## J8 — Prepare Notes

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Complete note assemblies tied to statements |
| **Primary User** | Preparer / Reporting Manager |
| **Starting Point** | Financial Report → Notes |
| **Ending Point** | Notes assembled / drafted complete for checklist |
| **Navigation Flow** | Overview → Notes → Note list → Edit narrative/quant → Cross-ref statements |
| **Dependencies** | Statements; Snapshot; Framework note definitions |
| **Approval Gates** | Material notes in Manager Review |
| **Expected Outputs** | Note Instances |
| **Audit Considerations** | Totals reconcilable to statements |
| **Future AI Opportunities** | Draft note text from prior year + stub figures |

---

## J9 — Complete Disclosures

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Complete framework disclosure checklist |
| **Primary User** | Preparer / Reporting Manager |
| **Starting Point** | Financial Report → Disclosures |
| **Ending Point** | All required disclosures applicable/N/A with rationale |
| **Navigation Flow** | Overview → Disclosures → Checklist → Complete item → Attach evidence |
| **Dependencies** | Framework pack; Materiality decisions; WPs |
| **Approval Gates** | N/A waivers may need approval |
| **Expected Outputs** | Disclosure Instances |
| **Audit Considerations** | Completeness vs framework |
| **Future AI Opportunities** | Gap detection vs framework checklist |

---

## J10 — Validate Report

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Run articulation & completeness validation |
| **Primary User** | Preparer / Manager |
| **Starting Point** | Quality → Validation |
| **Ending Point** | ValidationRun sealed (pass or fail) |
| **Navigation Flow** | Overview → Validation → Run → View results |
| **Dependencies** | Statements, Notes, Disclosures, Snapshot |
| **Approval Gates** | Blocking fail blocks review submit |
| **Expected Outputs** | ValidationRun |
| **Audit Considerations** | Rule IDs, severity, timestamp |
| **Future AI Opportunities** | Prioritise findings by risk |

---

## J11 — Resolve Validation Issues

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Clear blocking/advisory findings |
| **Primary User** | Preparer |
| **Starting Point** | Validation results / Outstanding Tasks |
| **Ending Point** | Re-validation pass (or accepted advisories) |
| **Navigation Flow** | Finding → Deep link to Statement/Note/Lead/WP → Fix → Re-run Validation |
| **Dependencies** | May require Accounting audit adj + new snapshot |
| **Approval Gates** | Waive advisory only per policy |
| **Expected Outputs** | Updated artefacts + new ValidationRun |
| **Audit Considerations** | Link finding resolution trail |
| **Future AI Opportunities** | Suggest fix location |

---

## J12 — Manager Review

| Aspect | Definition |
|--------|------------|
| **Business Goal** | First formal review of engagement |
| **Primary User** | Financial Manager |
| **Starting Point** | Review → Manager Review (after readiness) |
| **Ending Point** | Approved or Returned |
| **Navigation Flow** | Overview → Manager Review → Work through notes → Approve/Return |
| **Dependencies** | Close readiness; validation pass; WPs/leads advanced |
| **Approval Gates** | **Manager approval** (SoD vs preparer) |
| **Expected Outputs** | ManagerReview decision |
| **Audit Considerations** | Reviewer identity, comments, timestamp |
| **Future AI Opportunities** | Highlight high-risk WPs for review |

---

## J13 — Partner Review

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Senior assurance gate before publish |
| **Primary User** | Partner / CFO designate |
| **Starting Point** | Review → Partner Review |
| **Ending Point** | Approved or Returned |
| **Navigation Flow** | Overview → Partner Review → Sign-off |
| **Dependencies** | Manager approved (when required) |
| **Approval Gates** | **Partner approval** |
| **Expected Outputs** | PartnerReview decision |
| **Audit Considerations** | Senior sign-off record |
| **Future AI Opportunities** | Brief executive summary of engagement |

---

## J14 — Approve Publication

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Confirm Publication Snapshot binding & readiness |
| **Primary User** | CFO / Partner / Controller |
| **Starting Point** | Publication → Readiness |
| **Ending Point** | Publication approved to release |
| **Navigation Flow** | Overview → Publication → Review checklist → Approve |
| **Dependencies** | Freeze; reviews; validation pass |
| **Approval Gates** | Publication approval (DoA when available) |
| **Expected Outputs** | Publication Readiness stamp |
| **Audit Considerations** | Gate proof bundle |
| **Future AI Opportunities** | Pre-flight checklist completeness |

---

## J15 — Publish Financial Statements

| Aspect | Definition |
|--------|------------|
| **Business Goal** | Issue immutable Published Pack |
| **Primary User** | Controller / Partner |
| **Starting Point** | Publication → Publish |
| **Ending Point** | Published Pack Version; Overview Publication Status = published |
| **Navigation Flow** | Publication → Confirm → Publish → View pack / history |
| **Dependencies** | Approve Publication (J14) |
| **Approval Gates** | Final publish action attributed |
| **Expected Outputs** | PublishedPackVersion; `fre.pack.published` |
| **Audit Considerations** | Content hash, snapshot ID, framework, mapping, approvers |
| **Future AI Opportunities** | Distribution summary for board pack |

---

## Journey Sequence (canonical)

```
J1/J2 → J3 → (Close evidence J5–J6) → J4 → J7 → J8 → J9 → J10 → J11* → J12 → J13 → J14 → J15
```

\* J11 loops until validation permits J12.

---

## Certification

User Journey Architecture (J1–J15) is **CERTIFIED**.
