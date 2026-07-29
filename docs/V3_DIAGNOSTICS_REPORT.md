# AdminLess Fin V3 — Diagnostics Report

## Service

**Module:** `src/lib/platform/diagnostics.ts`  
**Entry point:** `runPlatformDiagnostics(companyId?: string)`

## Checks Performed

| Check ID | Label | Method |
|----------|-------|--------|
| `supabase_connectivity` | Supabase connectivity | `companies` table select |
| `authentication` | Authentication session | `supabase.auth.getSession()` |
| `storage` | Storage availability | `storage.listBuckets()` |
| `edge_functions` | Edge Functions (settings) | invoke `settings` GET |
| `payroll` | Payroll availability | invoke `payroll` GET_RUNS |
| `employees` | Employee Identity | invoke `employees` GET |
| `reports` | Report generation | invoke `reports` GET_INVENTORY_VALUATION |
| `subscribers` | BOE Subscribers | registry count ≥ 7 |
| `boe_commands` | BOE Command health | recent failure count from observability log |

## Status Levels

- **Healthy** — check passed
- **Warning** — degraded but operational (e.g. no session, report warning)
- **Critical** — check failed

## Overall Status

Worst-of-all-checks: any critical → Critical; any warning → Warning; else Healthy.

## Usage

```typescript
import { runPlatformDiagnostics } from '@/lib/platform/diagnostics';

const report = await runPlatformDiagnostics(activeCompany.id);
console.log(report.overall, report.checks);
```

## UI Integration

Service is ready. Recommended: add Platform Diagnostics panel to Settings page showing check status, latency, and correlation IDs.
