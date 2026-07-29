# 03 — Time Capture / Clocking Addendum (V4.1)

**Status:** APPROVED (additive channel to V4.0 Time Engine)  
**Does not reopen:** V4.0 Draft → Submitted → Approved → Locked workflow  

---

## Principle

Clocking is a **Time Capture channel**, not a separate attendance product.

```
Clock event (in/out/break)
  → duration calculation (Time Engine)
  → Draft / Submitted time entry (task/project bound when required)
  → Supervisor approval
  → Locked operational fact
  → Payroll / Accounting consumers (read only)
```

V4.0 non-goal “attendance clock as standalone stopwatch” remains rejected. Enterprise clocking is allowed **only** when it produces the same approved facts.

---

## Capabilities

| Capability | Notes |
|------------|-------|
| Clock In / Clock Out | Required for channel |
| Breaks | Deducted from duration |
| GPS (optional) | Stored as evidence; not a payroll calc input |
| QR Code | Site / project binding aid |
| Photo Verification | Evidence ref only |
| Offline Capture | Sync creates draft entries; conflict = compensating correction |
| Supervisor Approval | Same Time Engine approval |
| Automatic Hour Calculation | Time Engine only |
| Overtime / Shift Rules | Classification flags on entry; Payroll remains calc authority |

---

## Data Structures (Additive)

- `ewm_clock_events` — raw punches  
- `ewm_clock_sessions` — open/closed sessions linking to `ewm_time_entries`  
- Optional evidence fields on time entries (location, photo_ref, qr_ref, capture_channel)

---

## Freeze Guards

- Never compute PAYE/UIF/SDL/net in clocking  
- Never post journals from clocking  
- Subcontractor clock sessions must not enter payroll adapter path  
