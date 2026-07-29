# Payroll Export — Known Limitations

Certified does not mean feature-complete for every future bank or jurisdiction. The following limitations are accepted under Maintenance Mode.

---

## 1. Branch code depends on master data quality

`employees.bank_branch_code` is supported and exported when present.

Employees created before the column existed (or without branch captured) export a blank Branch Code. This is **correct behaviour**, not a mapping defect.

**Operational action:** maintain branch codes on employee master records.

---

## 2. Bank file formats

Primary certified format is **CSV** suitable for Excel review and generic bank upload.

Additional proprietary bank formats (e.g. bank-specific ACB/EFT variants) are **out of certification scope** until delivered as allowed maintenance (banking format changes) without redesigning the `bank_rows` authority model.

---

## 3. Emergency client fallback

If `GENERATE_BANK_BATCH` is unavailable or omits `bank_rows`, the UI may rebuild rows from run-detail payslips.

That path is weaker (embed completeness varies) and must not be used as the primary design. Operators should treat missing `bank_rows` as an Edge deployment / availability incident.

---

## 4. Payslip layout with large employer logos

When a large company logo is present, header address spacing can visually compete with the logo in PDF/harness scenarios. This is a **presentation polish** item under allowed bug-fix / UX maintenance. It does not invalidate bank export certification or calculation integrity.

---

## 5. Scope boundary

Payroll Export certification does **not** certify:

- Statutory calculation engines
- General Ledger / Trial Balance
- Financial Statements
- Financial Close

Those remain separately governed modules.
