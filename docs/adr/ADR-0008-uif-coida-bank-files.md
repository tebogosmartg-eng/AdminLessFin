# ADR-0008 — UIF Declarations, COIDA Return of Earnings and Bank Payment Files

| Field | Value |
|---|---|
| Status | **Proposed** (Phase 5 of the payroll plan; owner to accept) |
| Date | 2026-10-10 |
| Related | [ADR-0002 — Payroll Export Certification](ADR-0002-payroll-export-certification-architecture-freeze.md), [ADR-0005 — SARS filing](ADR-0005-sars-payroll-filing-exports.md) |

---

## Decision

1. **Bank payment files are additive (ADR-0002 kept).**
   - The existing `GENERATE_BANK_BATCH` CSV and EFT exports and their `bank_rows` contract are unchanged.
   - A new `GENERATE_BANK_PAYMENT_FILE` builds a file on the server from the same payslips and employee master data, using a **company bank payment profile** (`company_bank_payment_profiles`).
   - Formats:
     - BankservAfrica **ACB** (180-character records 02/04/10/12/92/94, cents, account hash). FNB, Standard Bank, Absa, Nedbank and Capitec business banking import it.
     - **FNB Online Banking Enterprise** ACB variant and **CSV**.
     - **Absa BIO** CSV.
     - **Capitec** CSV.
     - A **CSV mapped** to any bank's template (column order, heading row, amount and date style).
   - Employees without a branch code get the bank's universal branch code.
   - Payments that can't be made are left out and listed. Examples: no account number, or a zero amount.
   - ACB generation numbers advance only when the user confirms the file was imported at the bank.
2. **UIF monthly declaration.**
   - The Department of Employment and Labour's **E03** file (U1 code,value layout): creator UICR, employee UIWK lines, employer UIEM trailer.
   - It is built from finalised payroll in effect:
     - gross taxable remuneration from the 3699 build-up;
     - UIF remuneration from the UIF engine;
     - the contribution from IRP5 code 4141, employee plus employer.
   - Employment status comes from the employee's new **termination reason**. A missing reason is reported as "resigned", with a warning.
   - Non-contribution reasons: 01 for under 24 hours a month, 06 for no pay.
   - The employer's **UIF reference with the Department** is validated with the Appendix A check digit; it is not the SARS U-number.
   - The file is named `<last 8 digits>.<nnn>`. A month keeps its sequence number, so re-exporting replaces the earlier file.
   - Live files are kept as `statutory_returns` of type `UIF_DECLARATION`.
   - The user emails the file to declarations@labour.gov.za. uFiling does not accept E03, so a register CSV supports capturing on uFiling by hand.
3. **COIDA Return of Earnings is a worksheet, not a file.** CF Online takes typed-in totals and an attached payroll report.
   - **Earnings:** codes 3601, 3605, 3606, 3607, 3615, 3701, 3713 and 3805 (salary, bonuses, overtime, commission, taxable allowances and free quarters). Reimbursements and non-cash fringe benefits are excluded.
   - **Cap:** each employee's earnings count up to the year's maximum: R597,328 (2024/25), R633,168 (2025/26), R668,000 (2026/27). The cap is not pro-rated.
   - **Assessment:** the larger of the minimum assessment and assessable earnings × the employer's rate.
   - **Provisional estimate:** based on a growth percentage.
   - **Exports:** a PDF and a CSV payroll report.

## Known limits and things to confirm

- **First bank file per bank and client:** banks validate against the client's own profile (user code, services, column mapping, FNB hash toggle). The first file for each bank should be imported and stopped before authorising.
- **ACB details to confirm with a bank:**
  - the entry class for salaries (default `61`, editable);
  - the record length with CR/LF;
  - the Standard Bank hash.
- **Capitec CSV:** the layout comes from a user report and is marked "verify".
- **Not built:** Nedbank's secure format (its algorithm is not public), ISO 20022, and bank account check-digit (CDV) validation (the tables are licensed).
- **COIDA earnings definition:** the treatment of intermittent overtime and of employer contributions is still under the Fund's discussion. The code list is a reasonable default, not a ruling.
- **Not tracked:** COIDA letters of good standing.
