# ADR-0009 — Payroll in the Annual Financial Statements

| Field | Value |
|---|---|
| Status | **Proposed** (owner to accept) |
| Date | 2026-10-10 |
| Related | [ADR-0002 — Payroll Export Certification](ADR-0002-payroll-export-certification-architecture-freeze.md), [ADR-0005 — SARS filing](ADR-0005-sars-payroll-filing-exports.md) |
| Law and standards | Companies Act 71 of 2008 s30(4)–(6); IFRS for SMEs s28 (employee benefits) and s33 (related parties); IAS 19; IAS 24.17 |

---

## Context

The annual financial statements took nothing from payroll. Every payroll figure in them depended on how ledger accounts happened to be named and classified.

**What payroll posted:**
- One journal per run: gross pay to one wages account, net pay to the bank, and every deduction to one liability account chosen at each run.
- Employer UIF and SDL went into the same wages account.
- PAYE, UIF and SDL were never separated. An account-mapping table existed for that split, but no screen set it up, and it guessed the split from payslip descriptions.

**What the statements showed:**
- **Employee costs:** a list of ledger accounts, with a blank row for headcount.
- **Directors' emoluments:** not disclosed at all (Companies Act s30).
- **Key management compensation:** a template of blank rows.
- **"Operating profit is stated after…":** no note.
- **Statutory payables:** a balance sheet line with no note.

**Effect on live companies:**
- On Spaceman, PAYE and UIF were posted to accounts payable, and wages to accounts not classified as employee costs.
- Its statements had no employee costs note, and amounts owed to SARS sat inside trade creditors.

## Decision

1. **Payroll accounts are set once.**
   - Settings → Payroll → Payroll accounts maps each journal line to a ledger account:
     - salaries and wages;
     - UIF (employer) and SDL expense;
     - the bank;
     - PAYE, UIF and SDL payable;
     - pension and provident, medical aid and other deductions payable.
   - **"Set up payroll accounts"** uses the standard chart's accounts where they exist (PAYE, UIF and SDL found by tax treatment). It adds the rest, classified as the statements need them (Employee Costs, Statutory Payables, Trade and Other Payables). Which bank pays salaries is left to the user.
   - **Classification problems are advice:** an account classified elsewhere still posts, and the card says what to change. A mapping of the wrong *type* (a liability as wages) is refused.
   - **Writes go through the payroll function only.** `payroll_account_mappings` writes are revoked from clients, and the table is audited.
2. **One function builds the journal: `payroll_run_posting_lines`.** Both the finalise preview and `finalize_payroll_run_atomic` use it, so what the user sees is what posts.
   - **Splitting:** deductions and employer contributions are split by IRP5 code (4102, 4141, 4142, 4001/4003/4006, 4005, other). Older payslips without codes are matched on the description.
   - **Expense lines:** employer UIF and SDL are expensed to their own accounts.
   - **Fallback:** an unmapped role falls back to the old single liability (or wages) account. A company that maps nothing posts the same totals to the same accounts, now as labelled lines.
   - **Balance check:** if the payslip items do not add up to the payslip totals, the run posts the totals as before.
   - **Finalise:** no account choice is needed once the accounts are set. The preview names any account still missing.
3. **Payroll is sealed with the statements.**
   - **What is sealed:** locking a snapshot (`EXTRACT_FACT_SNAPSHOT`) also records `payroll` for the year and the comparative year (`_shared/efsStatementEngine/payrollFacts.ts`):
     - earnings by IRP5 code (salaries, overtime, bonuses, leave pay, commission, allowances);
     - benefits in kind;
     - employer UIF, SDL and other contributions;
     - headcount: the average over the months paid, and the number at year end;
     - each director's emoluments.
   - **Which runs count:** runs in effect only (`isRunInEffect`), taken by pay date, which is the date payroll journals post on.
   - **Hashing:** it is part of the sealed fact, so the content hash covers it.
4. **Notes stated from payroll and the ledger:**
   - **Employee costs by nature:**
     - salaries and wages, bonuses, leave pay, allowances, employer UIF, SDL and other employer contributions;
     - "Other employee costs" makes the total equal the ledger's Employee Costs, so the note still reconciles to the statement line;
     - the average and year-end number of employees.
   - **When payroll is not used:** if payroll is not sealed, or the ledger holds less than payroll recorded, the note lists the ledger accounts as before.
   - **Directors' emoluments (new, s30):** a table per year with salary, bonuses and performance payments, allowances, benefits and total for each director. A row is left for non-executive directors' fees paid outside payroll.
   - **Related parties:** key management compensation is filled from the directors' pay (short-term benefits). The relationships table and the other categories stay for the preparer.
   - **Operating profit (new):** "stated after" employee costs, directors' emoluments, depreciation and amortisation, auditor's remuneration and lease rentals.
   - **Statutory payables (new):** reconciled to the balance sheet line.
   - **Employee benefits policy:** short-term benefits, compensated absences, bonuses and statutory contributions, as the facts show them.
5. **Readiness warns** when payroll recorded more employee costs than the accounts classified as employee costs hold. This means wages were posted to an account classified elsewhere. It is advice, never a block.

6. **A payroll run is reversed on its own date** (`20261019100000_payroll_reversal_on_its_own_date.sql`).
   - **The defect:** `posting_engine_rollback` dated every reversal today.
     - On CERT TX, reversing 2027 and 2025 runs during 2026 credited R8.8 million to 2026's wages, against R9.75 million of 2026 payroll.
     - The statements then showed R0.9 million of employee costs.
   - **The fix in the engine:**
     - The engine now takes an optional reversal date. It defaults to today, so other modules are unchanged.
     - The open-period check applies to whichever date is used.
     - Reversals now also keep each line's description.
   - **The fix in payroll:** `reverse_payroll_run_atomic` passes the run's pay date while that period is open, and today once it is closed. The run records `reversal_date`.
   - **Existing journals are not changed.**
     - CERT TX's earlier test reversals still cross years. Its FY2026 statements therefore show the readiness warning and the ledger-based employee costs note.
     - Spaceman's four payroll reversals are each in the same year as their run.

## Not in scope (next)

- **Leave pay accrual:** leave balances × daily rate at year end, offered as a journal for the user to accept.
- **Reclassifying existing companies' accounts:** a one-click change, approved per company.
- **Retirement fund contributions by employers:** the payroll engine does not model them. Only employees' deductions exist, and they are posted to the fund payable.
- **Detailed Income Statement:** employee costs subheading.
