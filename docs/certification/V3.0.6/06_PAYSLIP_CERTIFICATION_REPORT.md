# Payslip Certification Report — V3.0.6

Source run: `b0d74849-106b-4e58-9e0e-05bcbd24489a`
Payslip: `6e91a97d-e2df-4731-86ba-34cc14969159`

## Verified Fields
- Employee number: present (`3151ddc4-39bb-4b30-897b-1271eb940b3b`)
- Employee name: present (`Tebogo Matlala`)
- Company: present (company ID captured)
- Pay period: present (`2026-08-01 to 2026-08-31`)
- Gross earnings: 10,000
- Deductions: 100
- Net pay: 9,900
- Calculation snapshot: present
- Audit reference: present
- HTML generation evidence: true
- PDF generation evidence: true

## Statutory Line Visibility in Payslip Items
- PAYE: present
- UIF: present
- SDL: **not present in persisted payslip items** (`hasSdl: false`)
- Employer contributions: represented via snapshot (`hasEmployerContributions: true`), not line-item SDL in payslip list

## Conclusion
- Original governance statement "evidence incomplete" is now corrected with direct payslip detail evidence.
- However, SDL line visibility on payslip items remains limited until migration + fallback removal is completed.

Status: **VERIFIED EVIDENCE ADDED**
