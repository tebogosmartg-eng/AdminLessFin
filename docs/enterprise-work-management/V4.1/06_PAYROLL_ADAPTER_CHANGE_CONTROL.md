# EWM → Payroll Adapter — Change Control Notice (V4.1 E5)

**Status:** Adapter delivered **outside** `statutoryPayrollEngine`  
**Frozen modules:** Payroll calculation engine remains untouched  

## What was delivered

- Table `ewm_payroll_input_facts` stores approved/locked time as **input facts only**
- Edge method `LIST_PAYROLL_INPUT_FACTS` for read consumption
- On `LOCK_TIME_ENTRY`, adapter upserts facts with:
  - `wage_input=true` for temporary/casual labour types
  - `status=excluded` for subcontractors/consultants and other non-payroll resource types

## Explicit non-actions

- No imports of `statutoryPayrollEngine` into EWM
- No payslip generation from EWM
- No mutation of payroll edge contracts in this release

## Future wiring (requires PAYROLL_CHANGE_CONTROL)

If product later consumes `ewm_payroll_input_facts` inside payroll run creation, open a payroll change-control ticket before touching `supabase/functions/payroll/**`.
