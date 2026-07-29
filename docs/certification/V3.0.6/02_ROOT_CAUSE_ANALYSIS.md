# Root Cause Analysis — V3.0.6

## RCA-1 Payslip Evidence Gap
- Symptom: governance saw no payslip line evidence.
- Immediate cause: certification runner used `GET_RUN_DETAIL` payload for payslip content checks; that payload lacks `payslip_items`.
- Underlying cause: test harness data-source mismatch.
- Corrective action: runner now calls `GET_PAYSLIP_DETAIL` for field-level verification evidence.

## RCA-2 Migration Drift
- Symptom: fallback path in payslip item persistence; migration pending.
- Immediate cause: DB enum/schema mismatch not fully applied in remote.
- Underlying cause: `supabase db push` failed due remote DB connection/auth constraints.
- Corrective action: migration classified as required-before-prod; execution pending DB access credentials/connectivity.

## RCA-3 Accounting Mismatch
- Symptom: statutory employer amounts not reflected in summary/journal path.
- Immediate cause: summary derived primarily from `payslip_items`, while employer contributions were excluded from persisted items.
- Underlying cause: reliance on item-keyword aggregation rather than snapshot totals in finalize/summary path.
- Corrective action: snapshot-based employer contribution aggregation + journal posting entries added.

## RCA-4 Missing Governance Telemetry
- Symptom: no timings/subscriber/trial-balance evidence in prior pack.
- Immediate cause: runner did not emit performance metrics and did not attach trial-balance/subscriber artifacts.
- Corrective action: timings now captured; unresolved telemetry remains listed as residual governance gaps.
