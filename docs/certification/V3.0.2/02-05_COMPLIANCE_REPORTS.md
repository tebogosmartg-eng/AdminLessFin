# 2–5. Compliance Reports (V3.0.2)

## Fringe Benefits — Seventh Schedule

**Module:** `registry/seventhSchedule.ts`  
**Benefits:** company car (3.5%/3.25%), insurance, low-interest loan, accommodation, assets  
**Tests:** `fringe_car_7th`, `fringe_loan_7th`, `fringe_insurance_7th` — 3/3 ✅

## Travel Allowance — §8(1)(b)

**Module:** `registry/travelAllowance.ts`  
**Methods:** logbook (prescribed R4.76/km), deemed 80% (no logbook), deemed 20% (mainly business)  
**Tests:** `travel_logbook`, `travel_no_logbook`, `travel_mainly_business` — 3/3 ✅

## Termination Benefits

**Module:** `registry/terminationBenefits.ts`  
**Types:** severance/retrenchment (R500k lifetime), retirement lump sum (Second Schedule), death, disability  
**Tests:** `term_exempt_*`, `term_taxable_portion`, `term_retirement_lump` — 5/5 ✅

## Audit Trail Completion

**Module:** `audit.ts` — `buildCalculationSnapshot()`, `validateAuditSnapshot()`  
**Fields:** employee_number, employee_name, company_id, payroll_run_id, command_id, correlation_id, audit_reference, calculation_timestamp, all engine outputs  
**Tests:** 16 audit cases — 16/16 ✅
