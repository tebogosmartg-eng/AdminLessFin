# South African Statutory Payroll Engine V3

**Version:** 3.0.0  
**Status:** Implemented  
**Architecture compliance:** BOE, Commands, Events, Subscribers, Workflow — unchanged

---

## 1. Statutory Payroll Engine Design

### Objective

Implement a modular, production-grade South African statutory calculation layer that is **completely separated** from payroll workflow. Each statutory component is an independent engine with a single responsibility, full audit trail, and versioned rule support.

### Separation of Concerns

| Layer | Responsibility | Path |
|-------|---------------|------|
| Payroll Workflow | Run lifecycle, approval, distribution | `src/lib/payrollWorkflow.ts` |
| Payroll Rules Engine | Sequential rule orchestration, payslip line items | `src/lib/payrollRulesEngine/` |
| **Statutory Payroll Engine** | **SA legislation calculations, audit trail** | **`src/lib/statutoryPayrollEngine/`** |
| Edge (authoritative) | Server-side generation | `supabase/functions/_shared/statutoryPayrollEngine/` |

### Independent Engines

| Engine | Responsibility | Legislation |
|--------|---------------|-------------|
| PAYE Engine | Monthly income tax | Income Tax Act §81 |
| UIF Engine | Employee/employer UIF | UI Act 4 of 2001 |
| SDL Engine | Skills development levy | SDL Act 9 of 1999 |
| Medical Tax Credit Engine | Monthly medical credits | Income Tax Act §6A |
| Retirement Deduction Engine | Section 11F limits | Income Tax Act §11F |
| Fringe Benefit Engine | Taxable benefit value | Seventh Schedule |
| Travel Allowance Engine | 80/20 taxable portion | §8(1)(b) |
| Bonus Tax Engine | Bonus added to taxable earnings | SARS aggregate method |
| Leave Encashment Engine | Taxable remuneration | Gross income definition |
| Termination Tax Engine | Severance exemption R500k | §10(1)(x) |

### Standard Calculation Context

```typescript
StatutoryCalculationContext {
  employee, period, ruleSet,
  grossEarnings, taxableEarnings,
  enabledEngines,   // per-run enable/disable
  engineConfig,     // per-engine overrides
  components?,      // optional statutory inputs
  ytd?,             // year-to-date adjustments
  companyAnnualRemuneration?  // SDL exemption
}
```

### Engine Contract

Each engine:
- Accepts `StatutoryCalculationContext`
- Returns `StatutoryEngineResult` with breakdown + audit trail
- Exposes no UI logic
- Is independently testable via `verify.ts`

---

## 2. Statutory Rules Registry

**Path:** `src/lib/statutoryPayrollEngine/registry/`

- Versioned rule sets in `taxYears.ts` — historical rules are **never overwritten**
- `resolveRuleSetForDate(payDate)` — selects rules for payroll period
- `resolveRuleSetForPayroll(payDate, dbRows)` — DB override with builtin fallback
- `mapDbRowToRuleSet(row)` — maps `payroll_tax_year_config` rows

### Supported Tax Years

| Tax Year | Rule Version | Effective |
|----------|-------------|-----------|
| 2024/2025 | 2024.1.0 | 2024-03-01 → 2025-02-28 |
| 2025/2026 | 2025.1.0 | 2025-03-01 → 2026-02-28 |

Annual updates: insert new row in `payroll_tax_year_config` + append to `taxYears.ts`. Never modify prior versions.

---

## 3. Calculation Pipeline

**Path:** `src/lib/statutoryPayrollEngine/pipeline.ts`

```
Input (gross earnings, employee, period, enabled engines)
  → Pre-tax adjustments (retirement, fringe, travel, leave, bonus)
  → Taxable earnings
  → Medical tax credits
  → PAYE
  → Termination tax (if applicable)
  → UIF (employee + employer)
  → SDL
  → Net pay
  → Journal lines
  → Payslip statutory lines
  → Aggregated audit trail
```

`mapRulesToStatutoryEngines()` bridges payroll run rule config to engine enable flags.

---

## 4. Audit Trail Specification

**Path:** `src/lib/statutoryPayrollEngine/audit.ts`

Every calculation step records:

| Field | Description |
|-------|-------------|
| `step` | Step identifier |
| `formula` | Legislative/mathematical formula |
| `inputs` | All inputs including tax year, rule version |
| `intermediate` | Optional intermediate values |
| `result` | Step result |

Stored in `payslips.calculation_snapshot` via `buildCalculationSnapshot()`.

---

## 5. Integration Points

- **Rules Engine PAYE/UIF/SDL:** `paye.ts` delegates to statutory engines
- **Payslip generation:** `generatePayslips.ts` runs pipeline for full audit snapshot
- **Run rule overrides:** `enabledEngines` respects per-run PAYE/UIF/SDL toggles
- **BOE / Commands / Events:** Unchanged

---

## 6. Optional Statutory Components

Engines default **disabled** except PAYE, UIF, SDL, medical credits. Enable via:

```json
{
  "rules": {
    "paye": { "enabled": true },
    "sdl": { "enabled": false },
    "pension": { "enabled": true }
  }
}
```

Component-specific inputs via `components` in pipeline input (bonus, termination, travel allowance, etc.).

---

## File Index

```
src/lib/statutoryPayrollEngine/
  types.ts
  utils.ts
  audit.ts
  adapter.ts
  pipeline.ts
  verify.ts
  index.ts
  registry/
    taxYears.ts
    index.ts
  engines/
    payeEngine.ts
    uifEngine.ts
    sdlEngine.ts
    medicalTaxCreditEngine.ts
    retirementDeductionEngine.ts
    fringeBenefitEngine.ts
    travelAllowanceEngine.ts
    bonusTaxEngine.ts
    leaveEncashmentEngine.ts
    terminationTaxEngine.ts
```
