# 04 — IRP5 Architecture Report

**Version:** 3.6  
**Return:** IRP5 / Tax Certificates (ZA)

## 1. Purpose

Build employee tax certificates for the tax year from finalized payslip `calculation_snapshot` values, labelled with SARS IRP5 source codes from the **locked** legislation repository.

## 2. Generators

| Package | Return type | Path |
|---------|-------------|------|
| `zaIrp5Package` | `IRP5` | `countries/south-africa/irp5/generator.ts` |
| `zaTaxCertificatePackage` | `TAX_CERTIFICATE` | same file (`generateTaxCertificate`) |

Tax Certificates reuse IRP5 declaration data with a distinct catalogue label for the UI tree.

## 3. Code catalogue (read-only legislation)

Resolved via `resolveLegislation` + `unwrap(pkg.irp5.*)`:

| Field | Typical code |
|-------|----------------|
| income | 3601 |
| annualPayment | 3605 |
| travelAllowance | 3701 |
| useOfMotorVehicle | 3802 |
| medicalSchemeContributions | 3810 |
| paye | 4102 |
| uifEmployee | 4141 |
| retirementFundEmployee | 4006 |
| pensionProvidentCurrent | 4001 |

If resolution fails: warning `IRP5_CODE_RESOLVE_FAILED` and package default codes — still no recalculation.

## 4. Amount mapping

Amounts come from finalized snapshots / payslip items (engine ids / keywords). The generator only **assigns codes** and aggregates per `employeeId`.

Optional `employeeId` filter for single-certificate generation.

## 5. Validations

| Code | Severity |
|------|----------|
| `IRP5_EMPLOYEE_NOT_FOUND` | error |
| `IRP5_MISSING_TAX_REFERENCE` | warning |
| `MISSING_CALCULATION_SNAPSHOT` | warning |
| `RUN_NOT_FINALIZED` | error |

## 6. Isolation

- Legislation repository not modified
- Payroll engine not invoked
- IRP5 codes consumed, not redefined in the engine

## 7. Verdict

**CERTIFIED** — IRP5 / Tax Certificate architecture maps finalized payroll onto legislation code catalogues without calculating tax.
