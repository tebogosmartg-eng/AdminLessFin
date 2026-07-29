# 04 — Clocking Domain Certification

**Version:** 4.1.1  
**Scope:** Business objects only — no screens  

---

## 1. What is a Clock Session?

A **Clock Session** is a continuous Time Capture interval for a person-type Work Resource / Employee, bounded by clock-in and clock-out (with optional breaks), optionally bound to Project/Task, that produces a **candidate duration** for a **Time Entry**.

It is **not**:
- the approved operational fact  
- a payslip  
- a standalone attendance product without work context  

---

## 2. Formal Certificate — Clock Session

| # | Field | Certification |
|---|-------|---------------|
| 1 | Business Definition | Capture-channel session recording presence/effort start and end. |
| 2 | Business Purpose | Automate duration capture for the Time Engine. |
| 3 | Business Owner | EWM Time Capture (channel) → Time Engine owns resulting Time Entry |
| 4 | Lifecycle | `open` → `on_break` → `open` → `closed` / `cancelled` |
| 5 | State Transitions | clock_in→open; break_start→on_break; break_end→open; clock_out→closed; admin→cancelled |
| 6 | Ownership Rules | Raw punches immutable after sync; duration math on close owned by Time Engine rules |
| 7 | Relationships | Employee/Work Resource; optional Project/Task; Clock Events; Time Entry on close |
| 8 | Parent Objects | Company; optional Project/Task |
| 9 | Child Objects | Clock Events (in/out/break_start/break_end) |
| 10 | Permissions | Worker opens/closes own; supervisor may correct via policy → compensating Time Entry |
| 11 | Invariants | Closed session yields at most one primary Time Entry; subcontractor types never payroll-ready |
| 12 | Validation Rules | Cannot clock_out without open/on_break; project binding required before close if company policy demands task context |
| 13 | Published BOE Events | `work.clock_in`, `work.clock_out`, `work.break_started`, `work.break_ended` |
| 14 | Consumed Events | Roster/Shift published (optional expected window) |
| 15 | Audit Requirements | Every punch with timestamp, actor, offline flag, evidence refs |
| 16 | Reporting Requirements | Attendance exceptions, missing clock-outs, OT flags (operational) |
| 17 | AI Readiness | Advisory anomaly hints only |
| 18 | Integration Consumers | Time Entry workflow; never Payroll/GL direct |
| 19 | Deletion Rules | No delete of closed sessions; cancel open only |
| 20 | Archiving Rules | Retain with Project/period retention policy |
| 21 | Multi-company | Strict company scope |
| 22 | Multi-country | Timezone stored on events; holiday overlays via calendars |
| 23 | Future Scalability | Offline sync, multi-site QR, biometric **hooks** later without schema redesign of Time Entry |

---

## 3. Board Answers (Mandatory Questions)

| Question | Ruling |
|----------|--------|
| Can one employee have multiple sessions? | **Yes, sequentially.** At most **one** `open`/`on_break` session per employee per company at a time. Multiple **closed** sessions per day are allowed. |
| Can sessions span midnight? | **Yes.** Duration uses absolute timestamps; `entry_date` on resulting Time Entry is policy-defined (default: clock-out local date). |
| Can sessions be offline? | **Yes.** Offline punches sync as draft session/events; conflicts resolved by compensating Time Entry corrections — never silent overwrite of locked facts. |
| Can GPS be optional? | **Yes.** Optional evidence; never a payroll calculation input. |
| Can QR verification be optional? | **Yes.** Binding aid for site/project. |
| Can photo verification be optional? | **Yes.** Evidence only. |
| How are breaks represented? | Explicit `break_start` / `break_end` events; break minutes deducted from session duration. |
| How is overtime represented? | **Classification flag** on resulting Time Entry using Shift rules; **Payroll remains sole OT pay authority**. |
| What becomes the approved operational fact? | **Approved → Locked Time Entry** (not the Clock Session). |

---

## 4. Related Objects

| Object | Role |
|--------|------|
| Clock Event | Immutable punch record |
| Shift | Planned pattern for OT/expected hours classification |
| Roster | Who should work which Shift |
| Time Entry | Operational fact after approval/lock |
| Photo Evidence / GPS / QR | Optional evidence attributes |

---

## 5. Certification Result

**CLOCKING DOMAIN CERTIFIED** as a Time Capture channel subordinate to the Time Entry lifecycle.
