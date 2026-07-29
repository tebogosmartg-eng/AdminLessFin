# 6. Technical Isolation Standard

**Version:** 6.10.0

## Gate

Technical capability remains behind the existing Developer / Internal persona bridge:

```ts
isFinancialStatementsInternalPersona({ role, userEmail, userId })
// owner | admin | allowlisted member/tester (VITE_EFS_ALLOWLIST)
```

When true, the **Advanced** accordion appears on the engagement workspace.  
When false, the accountant sees only `ACCOUNTANT_NAV` tabs.

## Advanced-only capabilities

- Reporting Snapshot / Snapshot Status / content hash
- Bind / change framework pack
- New draft version, Extract & seal facts, Certify, Freeze
- Generate from snapshot
- CloseEvidence / Disclosure / Validation / Review / Publication internal panels
- Internal Publication status codes

Pipeline buttons further require `VITE_EFS_SNAPSHOT_PIPELINE`.

## Accountant surface isolation evidence

Grep of `src/pages/financialStatements/experience/` for forbidden terms  
(`snapshot`, `pipeline`, `seal`, `fingerprint`, `hash`, `framework pack`, `freeze`, `certify`, `live_gl`, `Advanced`) returns **zero UI strings**.

Activity messages on Overview are humanized via `humanizeActivityMessage`.

## Pass criteria

Standard accountant experience never exposes engineering language. Internal personas retain Advanced for diagnostics without changing certified backends.
