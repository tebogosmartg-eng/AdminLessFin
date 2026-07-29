# 04 — Export Framework Report

**Version:** 3.6.1

## 1. Isolation

`src/statutory/returns/exportFramework.ts` exports a frozen declaration to:

- `json`
- `csv`
- `xml`

Country exporters (`emp201/exporter.ts`, etc.) delegate to the framework — no validation or transmission logic.

## 2. Rules

- Export does not recalculate payroll.
- Pipeline blocks export when `validationResult.ok === false`.
- Export freezes the return (`immutable` + `contentHash`) before producing the artifact.

## 3. Artifact shape

```ts
StatutoryExportArtifact {
  returnId, country, returnType, format, fileName,
  contentType, payload, contentHash, exportedAt
}
```

## 4. Verdict

**CERTIFIED** — Export framework isolated from validation and transmission.
