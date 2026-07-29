# Payroll Export — Verification Report

**Verification date:** 29 July 2026  
**Verdict:** **PASS — Production Ready**

---

## 1. Root cause (pre-fix)

Deployed `payroll` **v29** `GENERATE_BANK_BATCH` returned `{ run, bank_batch, persisted }` and **omitted `bank_rows`**.

The UI fell back to `GET_RUN_DETAIL` payslips using an employee embed **without** banking columns. The CSV serializer correctly wrote blanks for null bank fields.

Archived RCA: [`evidence/ROOT_CAUSE_v29.txt`](./evidence/ROOT_CAUSE_v29.txt)

---

## 2. Deployment verification

| Check | Result |
|-------|--------|
| Deploy `payroll` Edge Function | **PASS** — version **30** |
| Deployed slug matches repository intent | **PASS** |
| Frontend calls `GENERATE_BANK_BATCH` | **PASS** (`PayrollRunDetail.handleDownloadBankFile`) |
| Prefer `bank_rows` when present | **PASS** |
| `employees.bank_branch_code` migration on remote | **PASS** |

Project: `zaulhnpohrgqqodvzhxp`  
Evidence: [`evidence/certification-evidence.json`](./evidence/certification-evidence.json)

---

## 3. Live production verification

| Item | Value |
|------|--------|
| Run ID | `f97c851d-980d-4e4a-90e4-d94bc9b173f6` |
| Pay date | `2027-01-31` |
| HTTP | `200` |
| `bank_rows` | present, count **2** |
| `persisted` | `true` |

### Row checks vs employee master

| Employee | Bank Name | Account Number | Branch Code |
|----------|-----------|----------------|-------------|
| Puba Man | ABSA — **match** | 98348233221 — **match** | null in master → blank in CSV (**correct**) |
| Tebogo Matlala | CAPITEC — **match** | 1075422556 — **match** | null in master → blank in CSV (**correct**) |

### CSV columns verified

Employee Name · Bank Name · Branch Code · Account Number · Amount · Reference · Payment Date

Artifact: [`evidence/live-bank-payment.csv`](./evidence/live-bank-payment.csv)  
Raw Edge payload: [`evidence/live-generate-bank-batch.json`](./evidence/live-generate-bank-batch.json)

**Rule applied:** No banking field may be blank when employee master contains that value. Observed blanks for branch code are attributable to null master data, not export mapping failure.

---

## 4. Regression / process notes

| Topic | Outcome |
|-------|---------|
| Offline fixture harness alone | Insufficient — must not certify without live `GENERATE_BANK_BATCH` |
| Deploy before claim “fixed” | Mandatory — local Edge changes are not production until deployed |
| Payroll calculations | Untouched (out of export scope) |

---

## 5. Certification decision

Payroll Export meets Production Ready criteria for bank payment export and certified payslip export presentation rules under ADR-0002.

**Status: CERTIFIED**
