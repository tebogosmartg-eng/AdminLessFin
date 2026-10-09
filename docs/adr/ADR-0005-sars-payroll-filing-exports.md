# ADR-0005 — SARS Payroll Filing Exports (EMP201, ETI, e@syFile)

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-10-09 |
| Decision owner | Product owner (approved in session, 2026-10-09) |
| Related | [ADR-0002 — Payroll Export Certification & Architecture Freeze](ADR-0002-payroll-export-certification-architecture-freeze.md) |
| Specification | SARS_PAYE_BRS – PAYE Employer Reconciliation **V25.3.0** (June 2026) |

---

## Context

ADR-0002 froze the payroll export architecture after the payslip PDF and bank payment CSV were certified. It allows bug fixes, security work and legislative updates, but a redesign of the export architecture needs a new ADR.

The payroll module cannot yet produce what South African employers file with SARS:

- **No usable reconciliation file.** The EMP501/IRP5 generators produce JSON. The CSV export is a single cell of JSON, so practices would have to retype every IRP5 into e@syFile.
- **No Employment Tax Incentive (ETI).** Qualifying employers lose the incentive every month.
- **No EMP201 a practice can use.**
- **No employer reference numbers for payroll.** PAYE, SDL and UIF references were held only on the financial statements engagement.

## Decision

Payroll gains a SARS filing layer. It is **additive**: it sits beside the certified exports and changes none of them.

1. **Employer payroll profile** (`company_payroll_employer_profile`). It holds the reconciliation's employer record, codes 2010–2083. It is validated with the BRS rules: modulus 10 check digits, matching reference numbers, the SIC7 list, and the contact and address rules. It is written only through the payroll function.
2. **ETI.** Qualification and calculation follow the ETI Act as amended from 1 April 2025, and the ETI fields follow the BRS.
3. **EMP201.** A monthly declaration reconciled to finalised runs.
4. **e@syFile import file.** It holds the employer record, the IRP5/IT3(a) certificates and the trailer, laid out exactly as the BRS specifies. It is generated from finalised payslips and their stamped IRP5 codes (Phase 1), and validated against the BRS before it can be downloaded.

The SARS rules live in `src/lib/sars/` with an identical server copy in `supabase/functions/_shared/sars/`, compared by unit tests. Each data file records the BRS version it came from.

## What stays frozen (ADR-0002 guarantees kept)

- `GENERATE_BANK_BATCH` and its `bank_rows` contract are unchanged, and the Edge Function remains the source of truth for bank rows.
- The payslip PDF and bank CSV serialisers are unchanged.
- The payslip generation workflow is unchanged. Phase 2 reads finalised payslips; it does not recalculate them.
- Finalised runs, bank batch metadata and existing CSV/PDF consumers remain backward compatible.

## Consequences

- **Yearly maintenance.** SARS publishes a new BRS at least once a year. Updating the rules and the SIC7 list to a new BRS version is maintenance under this ADR. Each update must state the BRS version and pass the BRS example tests.
- **Acceptance is unproven.** No one on the team currently has e@syFile Employer access, so the export is verified against every BRS rule in automated tests. Acceptance by e@syFile itself stays **unproven** until a file has been imported. That must be recorded on release, and the first import is the acceptance test.
- **Direct submission stays out of scope.** Submitting through SARS eFiling is not part of this ADR. Users import the file into e@syFile themselves.

## Amendment (2026-10-09): the statutory returns workspace (step 2d)

Benchmarked against SAP SuccessFactors Employee Central Payroll and Sage 300 People, step 2d adds what those systems treat as standard around the returns:

- **Filed returns are records.** Filing locks a return (`statutory_returns`, one active per type and period). A correction supersedes it with a reason, and every step goes on the append-only `statutory_submission_ledger`, which only the payroll function writes to. The steps are filed, approved, file exported, submitted and replaced.
- **Maker-checker.** A filed EMP201 or EMP501 must be approved before its submission is recorded. The person who filed it cannot approve it unless the owner allows self-approval, using the same control as payroll run approval. Approvals given that way are flagged as self-approved.
- **Payments.** `statutory_return_payments` holds each payment's PRN, amount and date. A payment can be posted (Dr payroll liability, Cr bank) through the posting engine. It is never deleted: a wrong payment is voided with a reason, and its journal is reversed.
- **EMP501.**
  - The interim (March–August) and annual reconciliation compares, month by month, the EMP201s declared, the certificates and the payments recorded.
  - Filing is blocked when a month with payroll has no EMP201, or when the declared amounts differ from the certificates.
- **Certificates.**
  - IRP5 and IT3(a) certificates are issued in `payroll_tax_certificates` when the EMP501 is filed.
  - The number (BRS 3010) is the PAYE reference, the year of assessment, 08 or 02, and a 14-digit sequence. Numbers are allocated under a per-company lock and never reused.
  - A correction cancels the old certificates, links each to its replacement and issues new numbers.
  - Certificates are printed per employee, without ETI.
- **e@syFile file.**
  - The file is built from the issued certificates and checked against BRS V25.3.0 before download.
  - A test file can be produced at any time; the live file only once the EMP501 is approved.
- **Calendar.**
  - The EMP201 is due on the 7th, or the last business day before it, using `compliance_public_holidays`.
  - The EMP501 windows are 1 September – 31 October (interim) and 1 April – 31 May (annual).
  - Reminders stay with Compliance & Governance, whose evidence picker now labels a return by its period and version.

Known limits:

- Payroll posts all deductions to one liability account. The ledger therefore cannot yet be reconciled to PAYE, UIF and SDL separately, which would need a change to the posting of finalised payroll.
- Certificates for an employee who leaves before the interim period ends are issued with the interim (08) numbers. The BRS option of issuing a final (02) certificate early is not used.
- Directive-based income (lump sums) is not produced by this payroll and is therefore not written.

The bank CSV serialiser has one change under this amendment: an RFC 4180 quoting fix. Embedded quotes are doubled, and line breaks and pipes are removed from EFT fields. Rows and columns are unchanged.
