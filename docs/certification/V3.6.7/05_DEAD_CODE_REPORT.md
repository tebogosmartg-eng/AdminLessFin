# 05 — Dead Code Report

**Version:** 3.6.7

## Reachability matrix

| Artifact | Referenced? | Reachable from UI? | Classification |
|----------|-------------|--------------------|----------------|
| `AuditComplianceReports.tsx` | `router.tsx` L32, L130 | Yes via route + sidebar | **Live** |
| VIP `builder.ts` | Page L15–16, compliance registry, tests | Yes | **Live** |
| VIP `renderer.ts` | Page imports `renderVipIdentityRows` | Yes | **Live** |
| VIP `validation.ts` | Page `validateVipWorkingPaper` | Yes | **Live** |
| VIP `export/*` | Page `exportVipWorkingPaperAsync` | Yes | **Live** |
| `lib/vipReport.ts` | Compliance registry, facades | Yes (registry/tests) | **Live** |
| `PayrollWorkingPaper/index.ts` | Alias barrel | Indirect | **Live alias** |
| `payroll.compliance.vip` registry | `registerComplianceReports` via `bootstrapReportingPlatform` | **Not called from App runtime** | **Registry-only** (tests/bootstrap) |
| Platform `exportReportRows` sectioned VIP options | Used by PayrollReports branding path / older facade | Not VIP page path | **Platform live; VIP page independent** |

## Orphans

**None** for the primary VIP UI/export stack.

### Soft orphan (not dead page code)

`bootstrapReportingPlatform()` / `registerComplianceReports()` — exported from `src/reporting/index.ts`, invoked in unit tests; **no production App/main call site found**. The live VIP page does **not** depend on registry bootstrap; it imports the builder/export modules directly. Classification: **registry bootstrap unused at runtime**, not dead VIP UI.

## Verdict

VIP page + builder + export are **not dead code**. They are imported, routed, and navigable.
