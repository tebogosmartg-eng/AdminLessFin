# V15.0 — Enterprise Accounts Production Composition Engine

## Decision

**READY FOR CERTIFICATION**

Evidence: `docs/enterprise-accounts-production/V15.0/evidence/`

## Mission

Transform AdminLess Fin from a financial statement generator into a professional Accounts Production platform through a canonical **Document Composition** architecture.

This release focuses exclusively on document composition and professional publication consumption of that composition.

Locked (unchanged ownership):

- Accounting Engine
- General Ledger
- Trial Balance Engine
- Framework Engine / Knowledge Repository
- Validation Engine
- Publication seal platform

## Architecture enhancements

```
DocumentModel (facts + disclosures + policies)
        ↓
Enterprise Accounts Production Composition Engine (V15.0)
        ↓
CompositionDocument (phases → sections → statements/policies/notes → components)
        ↓
CanonicalDocumentView (single prepare)
        ↓
PDF / DOCX / Preview (consume composition metadata)
```

### Canonical document hierarchy

Annual Financial Statements → Document Phase → Document Section → Statement / Schedule → Accounting Policy → Disclosure Note → Disclosure Component → Tables / Narratives / Cross References → Publication

### Document phases

| Phase | Name | Contents |
|------:|------|----------|
| 1 | Front Matter | Cover, Contents, Directors' Responsibilities, Directors' Report, Independent Auditor, Corporate Information |
| 2 | Primary Financial Statements | SoFP, SoPL/OCI, SoCE, SoCF |
| 3 | Accounting Policies | Basis / Significant policies / Judgements / Estimates (not notes) |
| 4 | Notes to the Financial Statements | Numbered disclosures, schedules, reconciliations, narratives |
| 5 | Supplementary Information | Management / detailed schedules |
| 6 | Approval | Board approval, signatures, authorisation, dates |

## Module map

| Capability | Path |
|------------|------|
| Composition types / hierarchy | `src/lib/financialStatements/composition/types.ts` |
| Document Phase Engine | `src/lib/financialStatements/composition/documentPhases.ts` |
| Accounting Policy Architecture | `src/lib/financialStatements/composition/accountingPolicies.ts` |
| Disclosure Note Architecture | `src/lib/financialStatements/composition/disclosureNotes.ts` |
| Note Numbering Engine | `src/lib/financialStatements/composition/noteNumbering.ts` (+ `document/renumber.ts`) |
| Statement Classification Engine | `src/lib/financialStatements/composition/statementClassification.ts` |
| Disclosure Linking Engine | `src/lib/financialStatements/composition/disclosureLinking.ts` |
| Document Sequencing | `src/lib/financialStatements/composition/sequencing.ts` |
| Compose entry point | `src/lib/financialStatements/composition/compose.ts` |
| Canonical integration | `src/lib/financialStatements/publication/canonicalDocumentView.ts` |
| PDF / DOCX consumption | `publication/render/statutoryPdf.ts`, `publication/afsWorkspaceDocx.ts` |

## Design rules enforced

1. **Policies ≠ notes** — policy vessels (`DISC.POLICIES`) are excluded from note numbering; policies appear once in Phase 3.
2. **Note numbering is never hardcoded** — generated from the final visible disclosure set; hidden/conditional notes renumber without gaps.
3. **Statement classification is metadata-driven** — no hardcoded account placement in renderers.
4. **Disclosure linking is automatic** — face-statement lines resolve supporting disclosures, policies, schedules, framework sections.
5. **Document sequencing is automatic** — phase → statement order → framework/disclosure priority → publication rules.
6. **Publication formatting derives from composition metadata** — spacing, page breaks, contents, running headers/footers.

## Backward compatibility

- Existing DocumentModel, Framework Content Engine, Knowledge Repository, Validation, GL/TB, and publication pack APIs remain.
- Canonical prepare remains the single Preview ≡ PDF ≡ DOCX path.
- Structure fingerprint now includes V15 composition + policy separation (intentional composition upgrade).

## Regression

See `tests/unit/efs-v15-composition-engine.test.ts` and the enterprise EFS unit suite.

## Enterprise readiness

The Composition Engine is integrated end-to-end. Accounts Production document assembly is phase-aware, policy/note-separated, automatically numbered, classification-linked, and publication-consumed.
