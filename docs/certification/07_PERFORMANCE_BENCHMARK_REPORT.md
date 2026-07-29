# 7. Performance Benchmark Report

**Programme:** V3.0.1 Certification  
**Date:** 2026-07-05  
**Environment:** Node.js via `tsx`, Windows 10

---

## Benchmark Results

| Employees | Execution Time | Memory Delta | Audit Steps | Sample Net Pay | Stable |
|-----------|---------------|--------------|-------------|----------------|--------|
| 100 | 3.53 ms | 0.54 MB | 1,900 | R13,950.25 | ✅ |
| 500 | 12.52 ms | 1.60 MB | 9,500 | R13,950.25 | ✅ |
| 1,000 | 16.64 ms | 0.29 MB | 19,000 | R13,950.25 | ✅ |
| 5,000 | 52.82 ms | -3.15 MB | 95,000 | R13,950.25 | ✅ |
| 10,000 | 70.55 ms | 0.13 MB | 190,000 | R13,950.25 | ✅ |

**Per-employee average at 10,000 scale:** ~0.007 ms/employee

---

## Stability Verification

- `sampleNetPay` identical across all batch sizes (R13,950.25)
- Baseline single-employee calculation matches batch[0]
- **No mathematical differences at any batch size** ✅

---

## Concurrency

Not tested — engine is synchronous and stateless. Safe for parallel invocation per employee (no shared mutable state).

---

## Audit Generation Performance

At 10,000 employees: 190,000 audit steps generated in 70.55 ms (~0.37 μs/step).

---

## Performance Conclusion

**ACCEPTABLE** — Sub-100ms for 10,000 employees. Memory usage stable. No batch-size mathematical variance.
