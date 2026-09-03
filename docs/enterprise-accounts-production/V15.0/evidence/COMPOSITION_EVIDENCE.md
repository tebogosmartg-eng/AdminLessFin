# V15.0 Composition Engine Evidence

Generated: 2026-09-03T16:16:16.532Z
Decision: READY FOR CERTIFICATION
Entity: AdminLess Composition Demo (Pty) Ltd

## Document phases
- Phase `front_matter`: Front Matter (6 sections)
- Phase `primary_statements`: Primary Financial Statements (4 sections)
- Phase `accounting_policies`: Accounting Policies (1 sections)
- Phase `notes`: Notes to the Financial Statements (17 sections)
- Phase `supplementary`: Supplementary Information (3 sections)
- Phase `approval`: Approval (1 sections)

## Accounting policies: 22 (Phase 3, not numbered notes)
## Disclosure notes: 16 (auto-numbered, no gaps)

## Note numbering
- Note 1. Basis of preparation (`DISC.BASIS`)
- Note 2. Revenue (`DISC.REVENUE`)
- Note 3. Property, plant and equipment (`DISC.PPE`)
- Note 4. Related party disclosures (`DISC.RELATED`)
- Note 5. Events after the end of the reporting period (`DISC.EVENTS`)
- Note 6. Borrowing costs (`DISC.BORROWINGCOST`)
- Note 7. Borrowings (`DISC.BORROWINGS`)
- Note 8. Financial instruments (`DISC.FININST`)
- Note 9. General information (`DISC.GENERAL`)
- Note 10. Income tax (`DISC.TAX`)
- Note 11. Inventories (`DISC.INVENTORIES`)
- Note 12. Notes to the statement of cash flows (`DISC.CASHFLOW`)
- Note 13. Share capital and equity (`DISC.SHARECAPITAL`)
- Note 14. Significant judgements and sources of estimation uncertainty (`DISC.JUDGEMENTS`)
- Note 15. Trade and other payables (`DISC.PAYABLES`)
- Note 16. Trade and other receivables (`DISC.RECEIVABLES`)

## Classification sample (SoFP)
- `sfp.ppe` → non_current_assets
- `sfp.inventories` → current_assets
- `sfp.receivables` → current_assets
- `sfp.cash` → current_assets
- `sfp.total_assets` → total
- `sfp.share_capital` → share_capital
- `sfp.retained_earnings` → retained_earnings
- `sfp.payables` → current_liabilities

## Checks
- sixPhases: PASS
- policiesSeparated: PASS
- noteNumberingContiguous: PASS
- statementsClassified: PASS
- automaticNoteRefs: PASS
- publicationParity: PASS
- pdfGenerated: PASS
- docxGenerated: PASS

PDF: 134772 bytes
DOCX: 300884 bytes

Artifacts: `AFS_V15_Composition_Demo.pdf`, `AFS_V15_Composition_Demo.docx`