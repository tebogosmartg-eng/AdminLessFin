# Accounting Equation Investigation — R48,400 Variance

**Company:** `be3855e9-d11c-48a8-8c39-10e12a0ff2df` (CERT TX)  
**Date:** 2026-07-29

## Reported Symptom

Production certification reported:

```
Assets 50,600 = Liabilities 2,200 + Equity 0 + Net Income 0
Equation diff: R48,400
```

## Root Cause (Two Certification Harness Defects)

### 1. Wrong RPC field name for period activity

`get_period_activity` returns column **`activity`**, not `net_movement`.

The harness summed `net_movement ?? 0` for all P&L accounts, producing **netIncome = 0** instead of the correct **R49,000** (R51,000 income − R2,000 expenses).

### 2. Incorrect liability aggregation sign

The harness used `Math.abs(balance)` per liability account. **VAT Control** had a **debit balance of R300** on a credit-normal liability account (net VAT recoverable).

| Account | Signed balance | Harness (abs) |
|---|---|---|
| Accounts Payable | 1,900 | 1,900 |
| VAT Control | −300 | 300 |
| **Total** | **1,600** | **2,200** |

Using absolute values inflated liabilities by R600.

## Corrected Equation (Ledger-Consistent)

```
Assets:      50,600
Liabilities:  1,600  (signed sum)
Equity:           0
Net Income:  49,000  (from get_period_activity.activity)
─────────────────────
50,600 − (1,600 + 0 + 49,000) = 0  ✓
```

## Underlying Accounting Verification

| Check | Result |
|---|---|
| Trial Balance balanced | ✓ (period DR 85,200 = CR 85,200) |
| Double-entry integrity | ✓ |
| Retained Earnings | R0 (open period; P&L not yet closed — expected) |
| Hardcoded adjustment | **None applied** |

## Conclusion

The R48,400 variance was **not an accounting engine defect**. It was caused by certification harness misreading RPC response fields and mis-summing liability balances. After harness correction, the accounting equation **balances to zero** with no changes to business rules or ledger data.
