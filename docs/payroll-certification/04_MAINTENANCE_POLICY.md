# Payroll Export — Maintenance Policy

**Governing ADR:** [ADR-0002](../adr/ADR-0002-payroll-export-certification-architecture-freeze.md)  
**Mode:** Maintenance Only  
**Effective:** 29 July 2026

---

## Purpose

Keep Payroll Export stable in production while allowing necessary legislative, banking, security, and quality updates without architectural drift.

---

## Allowed without a new ADR

| Category | Examples |
|----------|----------|
| Legislative updates | Label/required-field changes mandated by law on payslips or remittance advice |
| Banking format changes | Additive bank formats or column order mandated by banks, still fed by `bank_rows` |
| Bug fixes | Incorrect mapping when master has values; PDF layout collisions; encoding/BOM issues |
| Security | Authz hardening, PII handling, least-privilege on Edge selects |
| Performance | Query tuning, payload size reduction without changing contracts |
| Documentation | Certification binder, runbooks, operator guides |
| Automated tests | Unit, integration, live smoke against `GENERATE_BANK_BATCH` |

---

## Prohibited without a new ADR

Do **not** redesign:

- Payslip generation workflow
- Bank export workflow
- Export architecture
- Data mapping architecture (including moving bank-row authority to the client as the primary path)

Do **not** break the `GENERATE_BANK_BATCH` → `bank_rows` contract without an accepted superseding ADR.

---

## Change control checklist

Before merging Payroll Export changes:

1. Confirm the change fits an **Allowed** category above.
2. If architectural, stop and draft a superseding ADR.
3. Prefer consuming existing `bank_rows` / document helpers over parallel mapping logic.
4. Deploy Edge changes and verify deployed version before claiming production fix.
5. Prefer a live `GENERATE_BANK_BATCH` smoke over fixture-only CSV checks for banking fields.
6. Do not change payroll calculation logic under an “export” ticket.

---

## Incident response (blank bank columns)

1. Confirm deployed `payroll` version includes `bank_rows`.
2. Call live `GENERATE_BANK_BATCH` and inspect payload (not only UI CSV).
3. Compare blanks to employee master; fix master data if null.
4. Only then investigate serializer / frontend fallback paths.

---

## Ownership

| Concern | Owner posture |
|---------|----------------|
| Export architecture | Frozen — Principal Architect / ADR process |
| Employee banking master data | Operations / HR data stewards |
| Edge deploy | Release / Payroll Release Engineer |
| Certification binder | Update evidence on material maintenance releases |

---

## Roadmap

Engineering effort after this closeout prioritises **General Ledger** and **Trial Balance**, not Payroll Export feature expansion.
