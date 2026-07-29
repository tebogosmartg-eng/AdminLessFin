# Performance Report — V3.0.6

Source: `docs/certification/V3.0.4/evidence/live-e2e-evidence.json`

## Captured Timings (ms)
- Payroll payslip generation: 782
- Approval operation: 590
- Finalize/journal posting: 830
- Bank batch generation: 531
- Dashboard workspace summary fetch: 567
- Total (captured phases): 3,300

## Observations
- Slowest captured stage: finalize/journal (830 ms)
- No critical latency spikes in this run
- Missing from evidence (still): DB-level query timings and edge runtime breakdown per internal stage

Status: **VERIFIED EVIDENCE ADDED**
