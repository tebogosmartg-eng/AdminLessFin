# 03 — Certification Workflow

**Version:** 4.4.0  
**Status:** CERTIFIED  

---

## 1. End-to-end workflow

```
1. Propose Change
2. Classify (V4.4.0 class)
3. Identify Artefacts Touched
4. Impact Assessment
5. Draft / Update Documentation (before code)
6. Board Approval(s)
7. Implementation Approval Issued
8. Implement under approval constraints
9. Test to class threshold
10. Release Certification
11. Deploy
12. Post-Release Audit & (if Emergency) Governance review
```

No step may be skipped. AI agents must stop at step 6 if approval is missing.

---

## 2. Step detail

| Step | Exit criteria |
|------|---------------|
| Propose | Ticket with problem statement and scope |
| Classify | Single primary class (+ secondary if needed) |
| Artefacts | Explicit list of certified packs/IDs |
| Impact | Modules, events, KPIs, schema, freeze flags |
| Documentation | PR/docs pack merged or approved draft linked |
| Approval | Recorded decision by required boards |
| Implementation Approval | Written cite of V4.4.0 + artefact versions |
| Implement | Diff limited to approval scope |
| Test | Evidence attached to ticket |
| Release Certification | Checklist signed |
| Deploy | Versioned artefact; correlation/release ID |
| Post-Release | Audit entry; Emergency post-mortem ≤72h |

---

## 3. Certification of packs vs implementation

| Activity | Allowed under governance pack alone? |
|----------|--------------------------------------|
| Author/amend certification docs | Yes (this board) |
| Implement code/schema/UI | **No** — needs Implementation Approval citing V4.4.0 |
| Emergency production fix | Yes under Emergency class + post-facto review |

---

## 4. Rejection / rewind

If any gate fails:

1. Mark ticket `governance-rejected` or `rewound`  
2. Revert unapproved code  
3. Restart at Classify or Documentation as appropriate  

---

## 5. Traceability

Every approved change stores:

- Change class  
- Approving board(s) + persons/roles  
- Artefact versions cited  
- Test evidence links  
- Release ID  
- Rollback reference  
